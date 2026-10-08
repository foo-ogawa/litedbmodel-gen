import type { TableDef, ColumnDef } from './types.js';
import { mapColumnType } from './type-mapper.js';

export function generateColumnCode(table: TableDef): string {
  const lines = table.columns.map(col => formatColumnLine(col));
  return lines.join('\n');
}

function formatColumnLine(col: ColumnDef): string {
  const mapping = mapColumnType(col);
  const decorator = buildDecorator(col, mapping.decorator);
  const nullSuffix = col.isNullable && !col.isPrimaryKey ? ' | null' : '';
  return `  ${decorator} ${col.name}?: ${mapping.tsType}${nullSuffix};`;
}

/**
 * Carry the column's OPTIONS into the decorator the type mapping picked: every `@column.*` family
 * takes the same `ColumnOptions` the bare `@column()` does, so a primary key keeps its type conversion.
 */
function buildDecorator(col: ColumnDef, baseDecorator: string): string {
  if (!col.isPrimaryKey) return baseDecorator;
  return baseDecorator.replace(/\(\)$/, '({ primaryKey: true })');
}
