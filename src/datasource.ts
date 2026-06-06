import { defineDatasource } from 'embedoc';
import { readFileSync } from 'fs';
import { tableNameToModelClass } from './naming.js';
import { parseSchema } from './parser.js';
import type { DatabaseDialect } from './types.js';

export const sqlSchema = defineDatasource({
  async create(config) {
    const filePath = config['path'] as string;
    const database = (config['database'] as DatabaseDialect) || 'PostgreSQL';

    const sql = readFileSync(filePath, 'utf-8');
    const tables = parseSchema(sql, { database });

    const records = tables.map(t => ({
      table_name: t.name,
      model_class: tableNameToModelClass(t.name),
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
