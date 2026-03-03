import { Parser } from 'node-sql-parser';
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

  let statements: unknown[];
  try {
    const result = parser.astify(sql, { database });
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
