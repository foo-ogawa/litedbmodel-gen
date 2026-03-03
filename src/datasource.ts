import { defineDatasource } from 'embedoc';
import { readFileSync } from 'fs';
import { parseSchema } from './parser.js';
import type { DatabaseDialect } from './types.js';

function toPascalCase(snakeCase: string): string {
  return snakeCase
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function singularize(name: string): string {
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
  if (name.endsWith('ses') || name.endsWith('xes') || name.endsWith('zes')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}

export const sqlSchema = defineDatasource({
  async create(config) {
    const filePath = config['path'] as string;
    const database = (config['database'] as DatabaseDialect) || 'PostgreSQL';

    const sql = readFileSync(filePath, 'utf-8');
    const tables = parseSchema(sql, { database });

    const records = tables.map(t => ({
      table_name: t.name,
      model_class: toPascalCase(singularize(t.name)),
      columns: t.columns,
    }));

    return {
      type: 'sql_schema' as const,
      async query(_sql: string, params?: unknown[]) {
        if (params?.[0]) {
          return records.filter(r => r.table_name === params[0]);
        }
        return records;
      },
      async getAll() {
        return records;
      },
      async close() {},
    };
  },
});
