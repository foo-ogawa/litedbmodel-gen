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
 * Carry the column's OPTIONS into the family the type mapping picked.
 *
 * A primary key used to be emitted as a bare `@column({ primaryKey: true })`, discarding the family
 * and leaving litedbmodel to infer the type from `emitDecoratorMetadata` — metadata esbuild (tsx /
 * vite / vitest) never emits and standard decorators do not have, so a PK of any type came back
 * uncast (litedbmodel#286). Every family takes the same `ColumnOptions` the bare form did, so the
 * options go INTO the family instead.
 */
function buildDecorator(col: ColumnDef, baseDecorator: string): string {
  if (!col.isPrimaryKey) return baseDecorator;
  return baseDecorator.replace(/\(\)$/, '({ primaryKey: true })');
}
