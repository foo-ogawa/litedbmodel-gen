import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import type { DatabaseDialect, TableDef, ColumnDef } from './types.js';

interface ParseSchemaOptions {
  database?: DatabaseDialect;
}

type SqlParser = InstanceType<typeof Parser>;

/** A column type as node-sql-parser reads it. */
interface ColumnType {
  dataType: string;
  length: number | undefined;
  isArray: boolean;
}

/** A top-level token of a statement, as written. */
interface Token {
  text: string;
  start: number;
  end: number;
}

/**
 * Reads the tables a schema defines. Each CREATE TABLE is read here, by its dialect's lexical rules:
 * the table's name and each column's name, NOT NULL and PRIMARY KEY. node-sql-parser reads only each
 * column's type, the name the type mapping is keyed on. Its grammar falls short of every database's —
 * it rejects names they accept bare (`at`, `json`, `session` in PostgreSQL, which pg_dump writes
 * unquoted), column options (`GENERATED ALWAYS AS IDENTITY`, a DEFAULT cast to a schema-qualified
 * type) and types (`boolean[]`, `point`) — so no table is ever handed to it whole.
 */
export function parseSchema(
  sql: string,
  options?: ParseSchemaOptions,
): TableDef[] {
  const database = options?.database || 'PostgreSQL';
  const parser = new Parser();

  const tables: TableDef[] = [];
  for (const statement of splitStatements(sql, database)) {
    const table = readTable(statement, parser, database);
    if (table) tables.push(table);
  }
  return tables;
}

const NAME = String.raw`(?:"(?:[^"]|"")*"|\`(?:[^\`]|\`\`)*\`|\[[^\]]*\]|[\w$]+)`;
const CREATE_TABLE = new RegExp(
  String.raw`^CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${NAME}(?:\s*\.\s*${NAME})*)`,
  'i',
);

/**
 * Words that open a table constraint rather than a column. Each is reserved in its dialect, so a column
 * of that name is always quoted — except PostgreSQL's EXCLUDE, a constraint only before USING or its
 * element list (`exclude boolean` is a column).
 */
const TABLE_CONSTRAINT: Record<DatabaseDialect, ReadonlySet<string>> = {
  PostgreSQL: new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'EXCLUDE', 'LIKE']),
  MySQL: new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL', 'LIKE']),
  SQLite: new Set(['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK']),
};

/** Words that end a column's type by opening one of its constraints or options. */
const COLUMN_OPTION_COMMON = ['CONSTRAINT', 'NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'UNIQUE', 'CHECK', 'REFERENCES', 'COLLATE', 'GENERATED'];
const COLUMN_OPTION: Record<DatabaseDialect, ReadonlySet<string>> = {
  PostgreSQL: new Set([...COLUMN_OPTION_COMMON, 'STORAGE', 'COMPRESSION']),
  MySQL: new Set([
    ...COLUMN_OPTION_COMMON, 'AS', 'KEY', 'AUTO_INCREMENT', 'ON', 'VISIBLE', 'INVISIBLE', 'COMMENT',
    'COLUMN_FORMAT', 'ENGINE_ATTRIBUTE', 'SECONDARY_ENGINE_ATTRIBUTE', 'STORAGE', 'SRID',
  ]),
  SQLite: new Set([...COLUMN_OPTION_COMMON, 'AS']),
};

/** The SERIAL types, which the database makes NOT NULL (PostgreSQL's family, and MySQL's SERIAL). */
const SERIAL = /^(?:SMALL|BIG)?SERIAL[248]?$/i;

/**
 * The table a CREATE TABLE defines, or null for any other statement and for a partition, which is part
 * of its parent table.
 */
function readTable(statement: string, parser: SqlParser, database: DatabaseDialect): TableDef | null {
  const body = withoutLeadingComments(statement, database);
  const match = CREATE_TABLE.exec(body);
  if (!match) return null;

  // A table that cannot be read is an error, never a table with fewer columns: a model generated from
  // it would silently lose them.
  const fail = (reason: string): never => {
    throw new Error(`Cannot parse the table ${match[1]}: ${reason}`);
  };

  let open = match[0].length;
  while (open < body.length && /\s/.test(body[open])) open++;
  if (body[open] !== '(') {
    if (words(tokens(body, open, body.length, database)).slice(0, 2).join(' ') === 'PARTITION OF') return null;
    fail('its columns are not listed in it');
  }
  const close = groupEnd(body, open, database);
  if (close === -1) fail('its column list is not closed');
  if (words(tokens(body, close, body.length, database)).includes('INHERITS')) {
    fail('INHERITS takes columns from another table');
  }

  const primaryKey = new Set<string>();
  const columns: { name: string; type: ColumnType; notNull: boolean; primaryKey: boolean }[] = [];

  for (const item of splitAtCommas(tokens(body, open + 1, close - 1, database))) {
    if (item.length === 0) continue;
    const itemWords = words(item);

    if (
      TABLE_CONSTRAINT[database].has(itemWords[0]) &&
      (itemWords[0] !== 'EXCLUDE' || itemWords[1] === 'USING' || item[1]?.text[0] === '(')
    ) {
      if (itemWords[0] === 'LIKE') fail('LIKE takes columns from another table');
      const key = itemWords.findIndex((word, i) => word === 'PRIMARY' && itemWords[i + 1] === 'KEY');
      const list = key === -1 ? undefined : item.slice(key + 2).find((token) => token.text[0] === '(');
      if (list) {
        for (const part of splitAtCommas(tokens(body, list.start + 1, list.end - 1, database))) {
          if (part.length) primaryKey.add(unquote(part[0].text));
        }
      }
      continue;
    }

    if (!/^[\w$]/.test(item[0].text) && !NAME_QUOTES[database].includes(item[0].text[0])) {
      fail(`'${item[0].text}' does not start a column name in ${database}`);
    }
    let typeEnd = item.findIndex((token, i) => i > 0 && COLUMN_OPTION[database].has(itemWords[i]));
    if (typeEnd === -1) typeEnd = item.length;
    const options = itemWords.slice(typeEnd);

    const type = readType(parser, database, body, item.slice(1, typeEnd));

    columns.push({
      name: unquote(item[0].text),
      type,
      // The database also makes an identity column, a SERIAL one and (MySQL) an AUTO_INCREMENT one NOT NULL.
      notNull:
        options.some((word, i) => (word === 'NULL' && options[i - 1] === 'NOT') || (word === 'IDENTITY' && options[i - 1] === 'AS')) ||
        options.includes('AUTO_INCREMENT') ||
        (database !== 'SQLite' && SERIAL.test(type.dataType)),
      // MySQL also takes a bare KEY in a column for its PRIMARY KEY.
      primaryKey: options.some(
        (word, i) => word === 'KEY' && (options[i - 1] === 'PRIMARY' || (database === 'MySQL' && options[i - 1] !== 'UNIQUE')),
      ),
    });
  }

  const tableName = tokens(match[1], 0, match[1].length, database).filter((token) => token.text !== '.').at(-1)!;
  return {
    name: unquote(tableName.text),
    columns: columns.map((column): ColumnDef => {
      const isPrimaryKey = column.primaryKey || primaryKey.has(column.name);
      const { dataType, length, isArray } = column.type;
      return {
        name: column.name,
        sqlType: normalizeSqlType(dataType, length, isArray, database),
        isPrimaryKey,
        isNullable: !isPrimaryKey && !column.notNull,
        isArray,
      };
    }),
  };
}

/**
 * node-sql-parser's reading of a column type. An array type it rejects (`boolean[]`) is read through its
 * element type, so it normalizes exactly as an array of a type it accepts; a type it does not know
 * (`point`, `public.citext`) keeps its own name, without its length or precision. A column with no type
 * (SQLite allows one) has an empty one.
 */
function readType(parser: SqlParser, database: DatabaseDialect, sql: string, type: Token[]): ColumnType {
  if (type.length === 0) return { dataType: '', length: undefined, isArray: false };
  const read = parseType(parser, database, sql.slice(type[0].start, type[type.length - 1].end));
  if (read) return read;

  let element = type.length;
  while (element > 1 && type[element - 1].text[0] === '[') element--;
  const isArray = element < type.length;
  const readElement = isArray ? parseType(parser, database, sql.slice(type[0].start, type[element - 1].end)) : null;
  if (readElement) return { ...readElement, isArray };

  const name = type
    .slice(0, element)
    .filter((token) => token.text[0] !== '(')
    .map((token) => token.text)
    .join(' ')
    .replace(/ ?\. ?/g, '.');
  return { dataType: name.toUpperCase(), length: undefined, isArray };
}

function parseType(parser: SqlParser, database: DatabaseDialect, type: string): ColumnType | null {
  try {
    const result: unknown = parser.astify(`CREATE TABLE lmg_probe (c ${type});`, { database });
    const stmt = (Array.isArray(result) ? result[0] : result) as Record<string, unknown>;
    const def = (stmt['create_definitions'] as Record<string, unknown>[])[0]['definition'] as Record<string, unknown>;
    // node-sql-parser gives an array type either as a `[]` suffix (TEXT[]) or as an `array` property (INTEGER[]).
    const dataType = String(def['dataType'] ?? '');
    const suffixed = dataType.endsWith('[]');
    return {
      dataType: suffixed ? dataType.slice(0, -2) : dataType,
      length: def['length'] as number | undefined,
      isArray: suffixed || !!def['array'],
    };
  } catch {
    return null;
  }
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

/** A name without its quotes, a doubled quote inside it read as one; a bare name as written. */
function unquote(name: string): string {
  const quote = name[0];
  if (quote === '"' || quote === '`') return name.slice(1, -1).split(quote + quote).join(quote);
  if (quote === '[') return name.slice(1, -1);
  return name;
}

/** Each token's text in upper case, so a bare keyword compares equal whatever case it is written in. */
function words(list: Token[]): string[] {
  return list.map((token) => token.text.toUpperCase());
}

/**
 * The tokens between `from` and `to`: each word, quoted name and string, each parenthesized or
 * bracketed group as one token, and each other character. Comments are skipped. Only the top level is
 * tokenized, so `CHECK (x IS NOT NULL)`, `DEFAULT 'NOT NULL'` and `-- NOT NULL` never read as NOT NULL.
 */
function tokens(sql: string, from: number, to: number, database: DatabaseDialect): Token[] {
  const list: Token[] = [];
  let i = from;

  while (i < to) {
    if (/\s/.test(sql[i])) {
      i++;
      continue;
    }
    const comment = commentEnd(sql, i, database);
    if (comment > i) {
      i = comment;
      continue;
    }

    let end = skipQuotedOrComment(sql, i, database);
    if (end === i) {
      if (/[\w$]/.test(sql[i])) {
        while (end < to && /[\w$]/.test(sql[end])) end++;
      } else if (sql[i] === '(' || sql[i] === '[') {
        end = groupEnd(sql, i, database);
        if (end === -1) end = to;
      } else {
        end = i + 1;
      }
    }
    end = Math.min(end, to);
    list.push({ text: sql.slice(i, end), start: i, end });
    i = end;
  }
  return list;
}

/** The tokens split into the items a top-level comma separates. */
function splitAtCommas(list: Token[]): Token[][] {
  const items: Token[][] = [[]];
  for (const token of list) {
    if (token.text === ',') items.push([]);
    else items[items.length - 1].push(token);
  }
  return items;
}

/**
 * The index just past the parenthesis or bracket that closes the one at `open`, or -1 when none does.
 * Brackets nest like parentheses: `DEFAULT ARRAY[1, 2]` is one group.
 */
function groupEnd(sql: string, open: number, database: DatabaseDialect): number {
  let depth = 0;
  let i = open;
  while (i < sql.length) {
    const skipped = skipQuotedOrComment(sql, i, database);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    if (sql[i] === '(' || sql[i] === '[') depth++;
    else if ((sql[i] === ')' || sql[i] === ']') && --depth === 0) return i + 1;
    i++;
  }
  return -1;
}

/** The characters that quote a name in each dialect. */
const NAME_QUOTES: Record<DatabaseDialect, string> = { PostgreSQL: '"', MySQL: '"`', SQLite: '"`[' };

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

  if (ch === "'" || (ch !== '[' && NAME_QUOTES[database].includes(ch))) {
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

  if (ch === '[' && NAME_QUOTES[database].includes(ch)) {
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
function splitStatements(sql: string, database: DatabaseDialect): string[] {
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
