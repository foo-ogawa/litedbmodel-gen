import { describe, it, expect } from 'vitest';
import { mapColumnType } from '../src/type-mapper';
import { generateColumnCode } from '../src/code-generator';
import type { ColumnDef } from '../src/types';

function col(overrides: Partial<ColumnDef>): ColumnDef {
  return {
    name: 'test',
    sqlType: 'text',
    isPrimaryKey: false,
    isNullable: true,
    isArray: false,
    ...overrides,
  };
}

describe('mapColumnType', () => {
  describe('integer types', () => {
    it.each([
      ['integer'],
      ['int'],
      ['int4'],
      ['smallint'],
      ['mediumint'],
      ['serial'],
    ])('%s → bigint', (sqlType) => {
      // behavior-contracts has ONE integer type (`int` = a JS bigint, checked i64), so a SMALLINT and
      // a BIGINT read back the same way.
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.bigint()');
      expect(result.tsType).toBe('bigint');
    });
  });

  describe('bigint types', () => {
    // Every integer width is behavior-contracts' one `int` — a JS bigint on the TS plane.
    it.each(['bigint', 'int8', 'bigserial'])('%s → bigint', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.bigint()');
      expect(result.tsType).toBe('bigint');
    });
  });

  describe('fixed-precision decimals', () => {
    // The spec maps DECIMAL / NUMERIC / MONEY to a string "精度保持のため": a JS number rounds past
    // 2^53, and `NUMERIC(38,10)` read through `@column.number()` comes back destroyed (measured on
    // live PostgreSQL and MySQL). Floats are inexact by definition and stay numbers.
    it.each(['numeric', 'decimal', 'money'])('%s → exact decimal string', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.text()');
      expect(result.tsType).toBe('string');
    });

    it.each(['real', 'float', 'float4', 'float8', 'double', 'double precision'])('%s → number', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.number()');
      expect(result.tsType).toBe('number');
    });
  });

  describe('string types', () => {
    it.each(['varchar', 'text', 'char', 'character varying'])('%s → string', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.text()');
      expect(result.tsType).toBe('string');
    });
  });

  describe('boolean', () => {
    it.each(['boolean', 'bool'])('%s → boolean', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.boolean()');
      expect(result.tsType).toBe('boolean');
    });
  });

  describe('datetime types', () => {
    // A datetime reads back as the COLUMN's own textual form, never a TZ-shifted JS Date.
    it.each(['timestamp', 'timestamptz', 'datetime'])('%s → string', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.datetime()');
      expect(result.tsType).toBe('string');
    });
  });

  describe('date', () => {
    it("date → @column.date() / 'YYYY-MM-DD' string", () => {
      const result = mapColumnType(col({ sqlType: 'date' }));
      expect(result.decorator).toBe('@column.date()');
      expect(result.tsType).toBe('string');
    });
  });

  describe('JSON types', () => {
    it.each(['json', 'jsonb'])('%s → json', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.json<Record<string, unknown>>()');
      expect(result.tsType).toBe('Record<string, unknown>');
    });
  });

  describe('UUID', () => {
    it('uuid → @column.uuid()', () => {
      const result = mapColumnType(col({ sqlType: 'uuid' }));
      expect(result.decorator).toBe('@column.uuid()');
      expect(result.tsType).toBe('string');
    });
  });

  describe('array types', () => {
    it('text[] → @column.stringArray()', () => {
      const result = mapColumnType(col({ sqlType: 'text[]', isArray: true }));
      expect(result.decorator).toBe('@column.stringArray()');
      expect(result.tsType).toBe('string[]');
    });

    it('integer[] → @column.intArray()', () => {
      const result = mapColumnType(col({ sqlType: 'integer[]', isArray: true }));
      expect(result.decorator).toBe('@column.intArray()');
      expect(result.tsType).toBe('number[]');
    });

    it('boolean[] → @column.booleanArray()', () => {
      const result = mapColumnType(col({ sqlType: 'boolean[]', isArray: true }));
      expect(result.decorator).toBe('@column.booleanArray()');
      expect(result.tsType).toBe('(boolean | null)[]');
    });

    it('numeric[] → @column.numericArray()', () => {
      const result = mapColumnType(col({ sqlType: 'numeric[]', isArray: true }));
      expect(result.decorator).toBe('@column.numericArray()');
      expect(result.tsType).toBe('(number | null)[]');
    });

    it('timestamp[] → @column.datetimeArray() / (string | null)[]', () => {
      // Element-wise the same TZ-attached string the scalar datetime family returns.
      const result = mapColumnType(col({ sqlType: 'timestamp[]', isArray: true }));
      expect(result.decorator).toBe('@column.datetimeArray()');
      expect(result.tsType).toBe('(string | null)[]');
    });
  });

  describe('binary and unrecognized types', () => {
    // litedbmodel has no bare `@column()`: a column must DECLARE its family, and `passthrough` is the
    // declaration for "no cast exists — the driver's value comes through unchanged".
    it.each(['bytea', 'blob', 'longblob'])('%s → @column.passthrough()', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.passthrough()');
      expect(result.tsType).toBe('unknown');
    });

    it('returns @column.passthrough() / unknown for unrecognized types', () => {
      const result = mapColumnType(col({ sqlType: 'geometry' }));
      expect(result.decorator).toBe('@column.passthrough()');
      expect(result.tsType).toBe('unknown');
    });

    it('a nullable passthrough column is not spelled `unknown | null`', () => {
      // `unknown` already admits null; the suffix would say the same type twice.
      const line = generateColumnCode({
        name: 't',
        columns: [{ name: 'bin', sqlType: 'bytea', isPrimaryKey: false, isNullable: true, isArray: false }],
      } as never);
      expect(line).toBe('  @column.passthrough() bin?: unknown;');
    });

    it('returns @column.passthrough() / unknown[] for an unrecognized array type', () => {
      const result = mapColumnType(col({ sqlType: 'geometry[]', isArray: true }));
      expect(result.decorator).toBe('@column.passthrough()');
      expect(result.tsType).toBe('unknown[]');
    });
  });
});
