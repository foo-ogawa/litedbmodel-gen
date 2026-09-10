import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import type { DatabaseDialect, TableDef, ColumnDef } from './types.js';

interface ParseSchemaOptions {
  database?: DatabaseDialect;
}

type SqlParser = InstanceType<typeof Parser>;

/**
 * A column type node-sql-parser cannot read, stood in for by a quoted placeholder while the
 * statement is parsed and put back afterwards — in the shape the parser gives the types it can read.
 */
interface StandInType {
  dataType: string;
  length: number | undefined;
  isArray: boolean;
}

const STAND_IN = /^"__LMG_T(\d+)__"$/;

export function parseSchema(
  sql: string,
  options?: ParseSchemaOptions,
): TableDef[] {
  const database = options?.database || 'PostgreSQL';
  const parser = new Parser();

  const tables: TableDef[] = [];

  // Each statement is parsed on its own, and only CREATE TABLE reaches the parser. Given the whole
  // file at once, node-sql-parser splits a dollar-quoted function body at its inner `;`, and any one
  // statement it cannot read fails the call for every table in the file.
  for (const statement of splitStatements(sql, database)) {
    if (!isCreateTable(statement, database)) continue;

    // A table node-sql-parser reads as written is parsed as written. Only a table it cannot read has
    // its unreadable column types stood in for, so no table that parses today is ever rewritten.
    const stripped = stripCheckConstraints(statement, database);
    const standIns: StandInType[] = [];
    let s: Record<string, unknown>;
    try {
      s = parseTable(parser, database, stripped);
    } catch {
      try {
        const readable = standInUnreadableTypes(quoteBracketedNames(stripped, database), parser, database, standIns);
        s = parseTable(parser, database, readable);
      } catch (error) {
        // A table that cannot be read is an error, never an empty result: a model generated from it
        // would silently lose every column.
        throw new Error(
          `Cannot parse the table ${tableNameOf(statement, database)}: ${(error as Error).message.split('\n')[0]}`,
        );
      }
    }
    if (s['type'] !== 'create' || s['keyword'] !== 'table') continue;

    const tableName = extractTableName(s);
    if (!tableName) continue;

    const createDefs = s['create_definitions'] as unknown[] | null;
    if (!createDefs) continue;

    restoreStandInTypes(createDefs, standIns);

    const pkColumns = extractTableLevelPrimaryKeys(createDefs);
    const columns = extractColumns(createDefs, pkColumns, database);

    tables.push({ name: tableName, columns });
  }

  return tables;
}

function parseTable(parser: SqlParser, database: DatabaseDialect, statement: string): Record<string, unknown> {
  const result: unknown = parser.astify(statement, { database });
  return (Array.isArray(result) ? result[0] : result) as Record<string, unknown>;
}

function extractTableName(stmt: Record<string, unknown>): string | null {
  const table = stmt['table'];
  if (!table) return null;

  if (Array.isArray(table)) {
    const first = table[0] as Record<string, unknown> | undefined;
    return (first?.['table'] as string) ?? null;
  }
  return (table as Record<string, unknown>)['table'] as string ?? null;
}

function extractTableLevelPrimaryKeys(defs: unknown[]): Set<string> {
  const pkColumns = new Set<string>();

  for (const def of defs) {
    const d = def as Record<string, unknown>;
    if (d['resource'] !== 'constraint') continue;

    const constraintType = String(d['constraint_type'] || '').toLowerCase();
    if (constraintType !== 'primary key') continue;

    const definition = d['definition'] as unknown[];
    if (!definition) continue;

    for (const col of definition) {
      const c = col as Record<string, unknown>;
      const colName = extractColumnName(c);
      if (colName) pkColumns.add(colName);
    }
  }

  return pkColumns;
}

function extractColumnName(ref: Record<string, unknown>): string | null {
  const col = ref['column'];
  if (typeof col === 'string') return col;
  if (col && typeof col === 'object') {
    return (col as Record<string, unknown>)['expr']
      ? String(((col as Record<string, unknown>)['expr'] as Record<string, unknown>)['value'])
      : null;
  }
  return null;
}

function extractColumns(
  defs: unknown[],
  pkColumns: Set<string>,
  database: DatabaseDialect,
): ColumnDef[] {
  const columns: ColumnDef[] = [];

  for (const def of defs) {
    const d = def as Record<string, unknown>;
    if (d['resource'] !== 'column') continue;

    const colRef = d['column'] as Record<string, unknown>;
    const name = extractColumnName(colRef);
    if (!name) continue;

    const definition = d['definition'] as Record<string, unknown>;
    const rawDataType = String(definition?.['dataType'] || '').toUpperCase();
    const length = definition?.['length'] as number | undefined;
    const arrayObj = definition?.['array'];

    // Arrays are represented in two ways by node-sql-parser:
    // 1. dataType ends with "[]" (e.g. "TEXT[]")
    // 2. array property is an object with dimension (e.g. INTEGER[])
    const isArrayFromSuffix = rawDataType.endsWith('[]');
    const isArrayFromProp = !!arrayObj;
    const isArray = isArrayFromSuffix || isArrayFromProp;

    const dataType = isArrayFromSuffix ? rawDataType.slice(0, -2) : rawDataType;
    const sqlType = normalizeSqlType(dataType, length, isArray, database);

    const isPrimaryKey =
      pkColumns.has(name) ||
      d['primary_key'] === 'primary key' ||
      d['primary'] === 'key' ||
      d['primary'] === 'primary key';

    const nullable = d['nullable'] as Record<string, unknown> | undefined;
    const isNullable = isPrimaryKey
      ? false
      : nullable?.['type'] !== 'not null';

    columns.push({ name, sqlType, isPrimaryKey, isNullable, isArray });
  }

  return columns;
}

function normalizeSqlType(
  dataType: string,
  length: number | undefined,
  isArray: boolean,
  database: DatabaseDialect,
): string {
  let base = dataType.toLowerCase();

  if (database === 'MySQL' && base === 'tinyint' && length === 1) {
    base = 'boolean';
  }

  if (isArray) {
    return `${base}[]`;
  }

  return base;
}


/**
 * The index just past the string, quoted identifier, dollar-quoted body or comment that starts at
 * `i`, or `i` itself when none does. Every scan over SQL text in this file goes through here, so a
 * `;`, `,` or parenthesis inside any of them is never mistaken for structure. The rules are the
 * dialect's: MySQL has `#` comments, backslash escapes and backquoted names; SQLite has backquoted and
 * bracketed names; only PostgreSQL has dollar quotes and nested block comments.
 */
function skipQuotedOrComment(sql: string, i: number, database: DatabaseDialect): number {
  const comment = commentEnd(sql, i, database);
  if (comment > i) return comment;

  const ch = sql[i];

  if (ch === "'" || ch === '"' || ch === '`') {
    // Every quote honours its own character doubled. MySQL strings also honour backslash escapes, and
    // so does a PostgreSQL E'…' string.
    const escapes =
      (database === 'MySQL' && ch !== '`') ||
      (ch === "'" && /[eE]/.test(sql[i - 1] ?? '') && !/[\w$]/.test(sql[i - 2] ?? ''));
    let j = i + 1;
    while (j < sql.length) {
      if (escapes && sql[j] === '\\') {
        j += 2;
      } else if (sql[j] === ch) {
        if (sql[j + 1] === ch) j += 2;
        else return j + 1;
      } else {
        j++;
      }
    }
    return j;
  }

  if (ch === '[' && database === 'SQLite') {
    const close = sql.indexOf(']', i + 1);
    return close === -1 ? sql.length : close + 1;
  }

  if (ch === '$' && database === 'PostgreSQL' && !/[\w$]/.test(sql[i - 1] ?? '')) {
    // $$…$$ or $tag$…$tag$. A `$1` is a positional parameter, not a quote.
    const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))?.[0];
    if (tag) {
      const close = sql.indexOf(tag, i + tag.length);
      return close === -1 ? sql.length : close + tag.length;
    }
  }

  return i;
}

/** The index just past the comment that starts at `i`, or `i` itself when none does. */
function commentEnd(sql: string, i: number, database: DatabaseDialect): number {
  const ch = sql[i];
  const next = sql[i + 1];

  if ((ch === '-' && next === '-') || (ch === '#' && database === 'MySQL')) {
    const newline = sql.indexOf('\n', i);
    return newline === -1 ? sql.length : newline + 1;
  }

  if (ch === '/' && next === '*' && database !== 'PostgreSQL') {
    const close = sql.indexOf('*/', i + 2);
    return close === -1 ? sql.length : close + 2;
  }

  if (ch === '/' && next === '*') {
    // PostgreSQL nests block comments.
    let depth = 1;
    let j = i + 2;
    while (j < sql.length && depth > 0) {
      if (sql[j] === '/' && sql[j + 1] === '*') {
        depth++;
        j += 2;
      } else if (sql[j] === '*' && sql[j + 1] === '/') {
        depth--;
        j += 2;
      } else {
        j++;
      }
    }
    return j;
  }

  return i;
}

/**
 * Splits a schema into statements at each `;` that is not inside a string, a quoted identifier, a
 * dollar-quoted body or a comment — a function body is full of them, and a pg_dump comment
 * (`-- Name: users; Type: TABLE`) carries one too.
 */
export function splitStatements(sql: string, database: DatabaseDialect = 'PostgreSQL'): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;

  while (i < sql.length) {
    const skipped = skipQuotedOrComment(sql, i, database);
    if (skipped > i) {
      i = skipped;
    } else if (sql[i] === ';') {
      statements.push(sql.slice(start, i + 1));
      start = ++i;
    } else {
      i++;
    }
  }

  if (sql.slice(start).trim()) statements.push(sql.slice(start));
  return statements;
}

/** The statement with its leading whitespace and comments removed. */
function withoutLeadingComments(statement: string, database: DatabaseDialect): string {
  let i = 0;
  for (;;) {
    while (i < statement.length && /\s/.test(statement[i])) i++;
    const end = commentEnd(statement, i, database);
    if (end === i) return statement.slice(i);
    i = end;
  }
}

const NAME = String.raw`(?:"(?:[^"]|"")*"|\`(?:[^\`]|\`\`)*\`|\[[^\]]*\]|[\w$]+)`;
const CREATE_TABLE = new RegExp(
  String.raw`^CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${NAME}(?:\s*\.\s*${NAME})*)`,
  'i',
);

function isCreateTable(statement: string, database: DatabaseDialect): boolean {
  return CREATE_TABLE.test(withoutLeadingComments(statement, database));
}

function tableNameOf(statement: string, database: DatabaseDialect): string {
  return CREATE_TABLE.exec(withoutLeadingComments(statement, database))?.[1] ?? '(unnamed)';
}

/** Where the column list of a CREATE TABLE opens and closes, or null when it has none. */
function columnList(statement: string, database: DatabaseDialect): [number, number] | null {
  const body = withoutLeadingComments(statement, database);
  const match = CREATE_TABLE.exec(body);
  if (!match) return null;

  let open = statement.length - body.length + match[0].length;
  while (open < statement.length && /\s/.test(statement[open])) open++;
  if (statement[open] !== '(') return null; // CREATE TABLE … AS / PARTITION OF / OF type

  let depth = 0;
  let i = open;
  while (i < statement.length) {
    const skipped = skipQuotedOrComment(statement, i, database);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    if (statement[i] === '(') depth++;
    else if (statement[i] === ')' && --depth === 0) return [open, i];
    i++;
  }
  return null;
}

/** The `[start, end)` ranges of the comma-separated items inside the column list. */
function columnListItems(
  statement: string,
  [open, close]: [number, number],
  database: DatabaseDialect,
): [number, number][] {
  const items: [number, number][] = [];
  let depth = 0;
  let start = open + 1;
  let i = start;

  while (i < close) {
    const skipped = skipQuotedOrComment(statement, i, database);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    // Brackets nest like parentheses: `DEFAULT ARRAY[1, 2]` is one item.
    if (statement[i] === '(' || statement[i] === '[') depth++;
    else if (statement[i] === ')' || statement[i] === ']') depth--;
    else if (statement[i] === ',' && depth === 0) {
      items.push([start, i]);
      start = i + 1;
    }
    i++;
  }

  items.push([start, close]);
  return items;
}

const TABLE_CONSTRAINT = /^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE|LIKE)\b/i;
const COLUMN_CONSTRAINT = /^\s+(?:NOT|NULL|DEFAULT|PRIMARY|REFERENCES|UNIQUE|CHECK|CONSTRAINT|COLLATE|GENERATED)\b/i;

/** Where the type of the column defined by `[from, to)` starts and ends, or null for a table constraint. */
function columnTypeRange(
  statement: string,
  from: number,
  to: number,
  database: DatabaseDialect,
): [number, number] | null {
  let i = from;
  while (i < to && /\s/.test(statement[i])) i++;
  if (TABLE_CONSTRAINT.test(statement.slice(i, to))) return null;

  const quoted = skipQuotedOrComment(statement, i, database);
  if (quoted > i) i = quoted;
  else while (i < to && /[\w$]/.test(statement[i])) i++;
  while (i < to && /\s/.test(statement[i])) i++;

  const start = i;
  let depth = 0;
  let end = to;
  while (i < to) {
    const skipped = skipQuotedOrComment(statement, i, database);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    if (statement[i] === '(' || statement[i] === '[') depth++;
    else if (statement[i] === ')' || statement[i] === ']') depth--;
    else if (depth === 0 && COLUMN_CONSTRAINT.test(statement.slice(i, to))) {
      end = i;
      break;
    }
    i++;
  }

  while (end > start && /\s/.test(statement[end - 1])) end--;
  return end > start ? [start, end] : null;
}

/** node-sql-parser's reading of a column type, or null when it cannot read it. */
function readType(parser: SqlParser, database: DatabaseDialect, type: string): StandInType | null {
  try {
    const result: unknown = parser.astify(`CREATE TABLE lmg_probe (c ${type});`, { database });
    const stmt = (Array.isArray(result) ? result[0] : result) as Record<string, unknown>;
    const def = (stmt['create_definitions'] as Record<string, unknown>[])[0]['definition'] as Record<string, unknown>;
    return {
      dataType: String(def['dataType']),
      length: def['length'] as number | undefined,
      isArray: !!def['array'] || String(def['dataType']).endsWith('[]'),
    };
  } catch {
    return null;
  }
}

/**
 * Replaces each column type node-sql-parser cannot read with a quoted placeholder it can, recording
 * what the type was. An array reads its element type through the parser, so it normalizes exactly as
 * an array of a type the parser does read; a type the parser does not know at all keeps its own name.
 */
function standInUnreadableTypes(
  statement: string,
  parser: SqlParser,
  database: DatabaseDialect,
  standIns: StandInType[],
): string {
  const list = columnList(statement, database);
  if (!list) return statement;

  const edits: [number, number, string][] = [];
  for (const [from, to] of columnListItems(statement, list, database)) {
    const range = columnTypeRange(statement, from, to, database);
    if (!range) continue;

    const type = statement.slice(range[0], range[1]);
    if (readType(parser, database, type)) continue;

    const element = type.replace(/(?:\s*\[\s*\d*\s*\])+$/, '');
    const isArray = element !== type;
    const read = readType(parser, database, element);
    standIns.push({
      dataType: read ? read.dataType : element.replace(/\s*\(.*\)\s*$/, '').replace(/\s+/g, ' ').toUpperCase(),
      length: read?.length,
      isArray,
    });
    edits.push([range[0], range[1], `"__lmg_t${standIns.length - 1}__"`]);
  }

  let result = statement;
  for (const [start, end, placeholder] of edits.reverse()) {
    result = result.slice(0, start) + placeholder + result.slice(end);
  }
  return result;
}

/**
 * SQLite's `[name]` as the `"name"` it means: node-sql-parser's SQLite grammar reads the second and
 * not the first. Brackets are only ever a name in SQLite, which has no array types.
 */
function quoteBracketedNames(statement: string, database: DatabaseDialect): string {
  if (database !== 'SQLite') return statement;

  let result = '';
  let i = 0;
  while (i < statement.length) {
    if (statement[i] === '[') {
      const close = statement.indexOf(']', i + 1);
      if (close === -1) return result + statement.slice(i);
      result += `"${statement.slice(i + 1, close).replace(/"/g, '""')}"`;
      i = close + 1;
      continue;
    }
    const skipped = skipQuotedOrComment(statement, i, database);
    const end = skipped > i ? skipped : i + 1;
    result += statement.slice(i, end);
    i = end;
  }
  return result;
}

/** Puts each placeholder's recorded type back into the parsed column definitions. */
function restoreStandInTypes(defs: unknown[], standIns: StandInType[]): void {
  for (const def of defs) {
    const definition = (def as Record<string, unknown>)['definition'] as Record<string, unknown> | undefined;
    if (!definition) continue;

    const match = STAND_IN.exec(String(definition['dataType'] ?? '').toUpperCase());
    if (!match) continue;

    const standIn = standIns[Number(match[1])];
    definition['dataType'] = standIn.dataType;
    definition['length'] = standIn.length;
    definition['array'] = standIn.isArray ? { dimension: 1 } : undefined;
  }
}

/**
 * Removes CHECK constraint clauses from SQL before parsing.
 * node-sql-parser cannot handle PostgreSQL-specific operators (e.g. ~ ~* !~ !~*)
 * inside CHECK expressions, and CHECK constraints are irrelevant for model generation.
 */
export function stripCheckConstraints(sql: string, database: DatabaseDialect = 'PostgreSQL'): string {
  const pattern =
    /(?:CONSTRAINT\s+(?:"[^"]+"|[^\s(]+)\s+)?CHECK\s*\(/gi;

  const ranges: [number, number][] = [];
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    let start = match.index;

    // Balance parentheses from the opening (
    let depth = 1;
    let pos = start + match[0].length;

    while (pos < sql.length && depth > 0) {
      const skipped = skipQuotedOrComment(sql, pos, database);
      if (skipped > pos) {
        pos = skipped;
        continue;
      }
      if (sql[pos] === '(') depth++;
      else if (sql[pos] === ')') depth--;
      pos++;
    }

    let end = pos;

    // A table-level CHECK is an item of its own, so one comma goes with it to keep the list valid.
    // A column-level CHECK sits inside its column's item: the comma after it separates that column
    // from the next item, and taking it would fuse the two.
    let lb = start - 1;
    while (lb >= 0 && /\s/.test(sql[lb])) lb--;

    if (lb >= 0 && sql[lb] === ',') {
      start = lb;
    } else if (lb >= 0 && sql[lb] === '(') {
      let tf = end;
      while (tf < sql.length && /\s/.test(sql[tf])) tf++;
      if (tf < sql.length && sql[tf] === ',') {
        end = tf + 1;
      }
    }

    ranges.push([start, end]);
    pattern.lastIndex = end;
  }

  if (ranges.length === 0) return sql;

  let result = '';
  let lastEnd = 0;
  for (const [s, e] of ranges) {
    result += sql.slice(lastEnd, s);
    lastEnd = e;
  }
  result += sql.slice(lastEnd);

  return result;
}
