import type { ColumnDef, ColumnMapping } from './types.js';

const TYPE_MAP: Record<string, ColumnMapping> = {
  // Integer types
  'int': { decorator: '@column()', tsType: 'number' },
  'int2': { decorator: '@column()', tsType: 'number' },
  'int4': { decorator: '@column()', tsType: 'number' },
  'int8': { decorator: '@column.bigint()', tsType: 'bigint' },
  'integer': { decorator: '@column()', tsType: 'number' },
  'smallint': { decorator: '@column()', tsType: 'number' },
  'mediumint': { decorator: '@column()', tsType: 'number' },
  'bigint': { decorator: '@column.bigint()', tsType: 'bigint' },
  'serial': { decorator: '@column()', tsType: 'number' },
  'bigserial': { decorator: '@column.bigint()', tsType: 'bigint' },
  'smallserial': { decorator: '@column()', tsType: 'number' },

  // Floating point / numeric
  'numeric': { decorator: '@column()', tsType: 'number' },
  'decimal': { decorator: '@column()', tsType: 'number' },
  'real': { decorator: '@column()', tsType: 'number' },
  'float': { decorator: '@column()', tsType: 'number' },
  'float4': { decorator: '@column()', tsType: 'number' },
  'float8': { decorator: '@column()', tsType: 'number' },
  'double': { decorator: '@column()', tsType: 'number' },
  'double precision': { decorator: '@column()', tsType: 'number' },
  'money': { decorator: '@column()', tsType: 'number' },

  // String types
  'varchar': { decorator: '@column()', tsType: 'string' },
  'character varying': { decorator: '@column()', tsType: 'string' },
  'char': { decorator: '@column()', tsType: 'string' },
  'character': { decorator: '@column()', tsType: 'string' },
  'text': { decorator: '@column()', tsType: 'string' },
  'tinytext': { decorator: '@column()', tsType: 'string' },
  'mediumtext': { decorator: '@column()', tsType: 'string' },
  'longtext': { decorator: '@column()', tsType: 'string' },
  'citext': { decorator: '@column()', tsType: 'string' },
  'enum': { decorator: '@column()', tsType: 'string' },

  // Boolean
  'boolean': { decorator: '@column.boolean()', tsType: 'boolean' },
  'bool': { decorator: '@column.boolean()', tsType: 'boolean' },

  // Date/time
  'timestamp': { decorator: '@column.datetime()', tsType: 'Date' },
  'timestamptz': { decorator: '@column.datetime()', tsType: 'Date' },
  'timestamp with time zone': { decorator: '@column.datetime()', tsType: 'Date' },
  'timestamp without time zone': { decorator: '@column.datetime()', tsType: 'Date' },
  'datetime': { decorator: '@column.datetime()', tsType: 'Date' },
  'date': { decorator: '@column.date()', tsType: 'Date' },

  // JSON
  'json': { decorator: '@column.json<Record<string, unknown>>()', tsType: 'Record<string, unknown>' },
  'jsonb': { decorator: '@column.json<Record<string, unknown>>()', tsType: 'Record<string, unknown>' },

  // UUID
  'uuid': { decorator: '@column.uuid()', tsType: 'string' },

  // Binary
  'bytea': { decorator: '@column()', tsType: 'unknown' },
  'blob': { decorator: '@column()', tsType: 'unknown' },
  'tinyblob': { decorator: '@column()', tsType: 'unknown' },
  'mediumblob': { decorator: '@column()', tsType: 'unknown' },
  'longblob': { decorator: '@column()', tsType: 'unknown' },
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
  'timestamp': { decorator: '@column.datetimeArray()', tsType: '(Date | null)[]' },
  'timestamptz': { decorator: '@column.datetimeArray()', tsType: '(Date | null)[]' },
};

export function mapColumnType(col: ColumnDef): ColumnMapping {
  if (col.isArray) {
    const baseType = col.sqlType.replace(/\[\]$/, '');
    const arrayMapping = ARRAY_TYPE_MAP[baseType];
    if (arrayMapping) return arrayMapping;
    return { decorator: '@column()', tsType: 'unknown[]' };
  }

  const mapping = TYPE_MAP[col.sqlType];
  if (mapping) return mapping;

  return { decorator: '@column()', tsType: 'unknown' };
}
