import type { ColumnDef, ColumnMapping } from './types.js';

/**
 * SQL type → the `@column.*` family that DECLARES it, and the TS type that family reads back.
 *
 * The `tsType` here is the value `find()` returns, not the shape of the SQL column: litedbmodel reads
 * `BIGINT` as an exact decimal STRING (a JS number rounds past 2^53, a JS `bigint` throws in
 * `JSON.stringify`) and a date/timestamp as the column's own textual STRING (never a TZ-shifted
 * `Date`). Generating `Date` / `bigint` here is what made generated models disagree with the values
 * they received (litedbmodel#286).
 *
 * Every entry names a family. litedbmodel has no bare `@column()`: it inferred the type from
 * `emitDecoratorMetadata`, which esbuild (tsx / vite / vitest) never emits and standard decorators do
 * not have, so it produced untyped columns wherever that metadata was missing.
 */
const TYPE_MAP: Record<string, ColumnMapping> = {
  // Integer types
  'int': { decorator: '@column.number()', tsType: 'number' },
  'int2': { decorator: '@column.number()', tsType: 'number' },
  'int4': { decorator: '@column.number()', tsType: 'number' },
  'int8': { decorator: '@column.bigint()', tsType: 'string' },
  'integer': { decorator: '@column.number()', tsType: 'number' },
  'smallint': { decorator: '@column.number()', tsType: 'number' },
  'mediumint': { decorator: '@column.number()', tsType: 'number' },
  'bigint': { decorator: '@column.bigint()', tsType: 'string' },
  'serial': { decorator: '@column.number()', tsType: 'number' },
  'bigserial': { decorator: '@column.bigint()', tsType: 'string' },
  'smallserial': { decorator: '@column.number()', tsType: 'number' },

  // Fixed-precision decimals read back as their EXACT decimal STRING: a JS number rounds past 2^53,
  // and `NUMERIC(38,10)` is measurably destroyed by it (spec: DECIMAL / NUMERIC / MONEY → string).
  'numeric': { decorator: '@column.text()', tsType: 'string' },
  'decimal': { decorator: '@column.text()', tsType: 'string' },

  // Floating point — inexact by definition, so a JS number loses nothing the column had
  'real': { decorator: '@column.number()', tsType: 'number' },
  'float': { decorator: '@column.number()', tsType: 'number' },
  'float4': { decorator: '@column.number()', tsType: 'number' },
  'float8': { decorator: '@column.number()', tsType: 'number' },
  'double': { decorator: '@column.number()', tsType: 'number' },
  'double precision': { decorator: '@column.number()', tsType: 'number' },
  'money': { decorator: '@column.text()', tsType: 'string' },

  // String types
  'varchar': { decorator: '@column.text()', tsType: 'string' },
  'character varying': { decorator: '@column.text()', tsType: 'string' },
  'char': { decorator: '@column.text()', tsType: 'string' },
  'character': { decorator: '@column.text()', tsType: 'string' },
  'text': { decorator: '@column.text()', tsType: 'string' },
  'tinytext': { decorator: '@column.text()', tsType: 'string' },
  'mediumtext': { decorator: '@column.text()', tsType: 'string' },
  'longtext': { decorator: '@column.text()', tsType: 'string' },
  'citext': { decorator: '@column.text()', tsType: 'string' },
  'enum': { decorator: '@column.text()', tsType: 'string' },

  // Boolean
  'boolean': { decorator: '@column.boolean()', tsType: 'boolean' },
  'bool': { decorator: '@column.boolean()', tsType: 'boolean' },

  // Date/time — read back as the column's own textual form, never a JS Date
  'timestamp': { decorator: '@column.datetime()', tsType: 'string' },
  'timestamptz': { decorator: '@column.datetime()', tsType: 'string' },
  'timestamp with time zone': { decorator: '@column.datetime()', tsType: 'string' },
  'timestamp without time zone': { decorator: '@column.datetime()', tsType: 'string' },
  'datetime': { decorator: '@column.datetime()', tsType: 'string' },
  'date': { decorator: '@column.date()', tsType: 'string' },

  // JSON
  'json': { decorator: '@column.json<Record<string, unknown>>()', tsType: 'Record<string, unknown>' },
  'jsonb': { decorator: '@column.json<Record<string, unknown>>()', tsType: 'Record<string, unknown>' },

  // UUID
  'uuid': { decorator: '@column.uuid()', tsType: 'string' },

  // Binary — no cast exists for it; the driver's value (a Buffer) is passed through
  'bytea': { decorator: '@column.passthrough()', tsType: 'unknown' },
  'blob': { decorator: '@column.passthrough()', tsType: 'unknown' },
  'tinyblob': { decorator: '@column.passthrough()', tsType: 'unknown' },
  'mediumblob': { decorator: '@column.passthrough()', tsType: 'unknown' },
  'longblob': { decorator: '@column.passthrough()', tsType: 'unknown' },
};

const ARRAY_TYPE_MAP: Record<string, ColumnMapping> = {
  'text': { decorator: '@column.stringArray()', tsType: 'string[]' },
  'varchar': { decorator: '@column.stringArray()', tsType: 'string[]' },
  'character varying': { decorator: '@column.stringArray()', tsType: 'string[]' },
  'char': { decorator: '@column.stringArray()', tsType: 'string[]' },
  'int': { decorator: '@column.intArray()', tsType: 'number[]' },
  'int4': { decorator: '@column.intArray()', tsType: 'number[]' },
  'integer': { decorator: '@column.intArray()', tsType: 'number[]' },
  'smallint': { decorator: '@column.intArray()', tsType: 'number[]' },
  'numeric': { decorator: '@column.numericArray()', tsType: '(number | null)[]' },
  'decimal': { decorator: '@column.numericArray()', tsType: '(number | null)[]' },
  'real': { decorator: '@column.numericArray()', tsType: '(number | null)[]' },
  'float': { decorator: '@column.numericArray()', tsType: '(number | null)[]' },
  'double precision': { decorator: '@column.numericArray()', tsType: '(number | null)[]' },
  'boolean': { decorator: '@column.booleanArray()', tsType: '(boolean | null)[]' },
  'bool': { decorator: '@column.booleanArray()', tsType: '(boolean | null)[]' },
  'timestamp': { decorator: '@column.datetimeArray()', tsType: '(string | null)[]' },
  'timestamptz': { decorator: '@column.datetimeArray()', tsType: '(string | null)[]' },
};

export function mapColumnType(col: ColumnDef): ColumnMapping {
  if (col.isArray) {
    const baseType = col.sqlType.replace(/\[\]$/, '');
    const arrayMapping = ARRAY_TYPE_MAP[baseType];
    if (arrayMapping) return arrayMapping;
    return { decorator: '@column.passthrough()', tsType: 'unknown[]' };
  }

  const mapping = TYPE_MAP[col.sqlType];
  if (mapping) return mapping;

  return { decorator: '@column.passthrough()', tsType: 'unknown' };
}
