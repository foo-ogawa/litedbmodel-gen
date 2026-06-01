import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import type { DatabaseDialect, TableDef, ColumnDef } from './types.js';

interface ParseSchemaOptions {
  database?: DatabaseDialect;
}

export function parseSchema(
  sql: string,
  options?: ParseSchemaOptions,
): TableDef[] {
  const database = options?.database || 'PostgreSQL';
  const parser = new Parser();

  const sanitized = stripCheckConstraints(sql);

  let statements: unknown[];
  try {
    const result = parser.astify(sanitized, { database });
    statements = Array.isArray(result) ? result : [result];
  } catch {
    return [];
  }

  const tables: TableDef[] = [];

  for (const stmt of statements) {
    const s = stmt as Record<string, unknown>;
    if (s['type'] !== 'create' || s['keyword'] !== 'table') continue;

    const tableName = extractTableName(s);
    if (!tableName) continue;

    const createDefs = s['create_definitions'] as unknown[] | null;
    if (!createDefs) continue;

    const pkColumns = extractTableLevelPrimaryKeys(createDefs);
    const columns = extractColumns(createDefs, pkColumns, database);

    tables.push({ name: tableName, columns });
  }

  return tables;
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
 * Removes CHECK constraint clauses from SQL before parsing.
 * node-sql-parser cannot handle PostgreSQL-specific operators (e.g. ~ ~* !~ !~*)
 * inside CHECK expressions, and CHECK constraints are irrelevant for model generation.
 */
export function stripCheckConstraints(sql: string): string {
  const pattern =
    /(?:CONSTRAINT\s+(?:"[^"]+"|[^\s(]+)\s+)?CHECK\s*\(/gi;

  const ranges: [number, number][] = [];
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    let start = match.index;

    // Balance parentheses from the opening (
    let depth = 1;
    let pos = start + match[0].length;
    let inStr = false;

    while (pos < sql.length && depth > 0) {
      const ch = sql[pos];
      if (inStr) {
        if (ch === "'" && sql[pos + 1] === "'") {
          pos += 2;
          continue;
        }
        if (ch === "'") inStr = false;
      } else {
        if (ch === "'") inStr = true;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      pos++;
    }

    let end = pos;

    // Absorb surrounding comma to keep valid SQL
    let lb = start - 1;
    while (lb >= 0 && /\s/.test(sql[lb])) lb--;

    if (lb >= 0 && sql[lb] === ',') {
      start = lb;
    } else {
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
