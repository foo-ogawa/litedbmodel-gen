import { defineEmbed } from 'embedoc';
import { generateColumnCode } from './code-generator.js';
import type { ColumnDef } from './types.js';

export const litedbmodelColumns = defineEmbed({
  dependsOn: [],

  async render(ctx) {
    const tableName = ctx.params['table'];
    if (!tableName) {
      return { content: '// Error: table parameter is required' };
    }

    const dsName = ctx.params['datasource'] || 'schema';
    const ds = ctx.datasources[dsName];
    if (!ds) {
      return { content: `// Error: datasource "${dsName}" not found` };
    }

    const records = await ds.getAll();
    const tableRecord = records.find(
      (r: Record<string, unknown>) => r['table_name'] === tableName,
    );

    if (!tableRecord) {
      return { content: `// Table "${tableName}" not found in datasource "${dsName}"` };
    }

    return {
      content: generateColumnCode({
        name: tableName,
        columns: tableRecord['columns'] as ColumnDef[],
      }),
    };
  },
});
