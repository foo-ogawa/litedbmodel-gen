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

function buildDecorator(col: ColumnDef, baseDecorator: string): string {
  if (!col.isPrimaryKey) return baseDecorator;

  // @column.uuid() supports { primaryKey: true } options
  if (baseDecorator.startsWith('@column.uuid(')) {
    return '@column.uuid({ primaryKey: true })';
  }

  // For all other types, use @column({ primaryKey: true })
  // litedbmodel auto-infers number/string/boolean/Date/bigint from TS types
  return '@column({ primaryKey: true })';
}
