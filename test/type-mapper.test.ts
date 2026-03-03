import { describe, it, expect } from 'vitest';
import { mapColumnType } from '../src/type-mapper';
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
      ['integer', 'number'],
      ['int', 'number'],
      ['int4', 'number'],
      ['smallint', 'number'],
      ['mediumint', 'number'],
      ['serial', 'number'],
    ])('%s → number', (sqlType, tsType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column()');
      expect(result.tsType).toBe(tsType);
    });
  });

  describe('bigint types', () => {
    it.each(['bigint', 'int8', 'bigserial'])('%s → bigint', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.bigint()');
      expect(result.tsType).toBe('bigint');
    });
  });

  describe('string types', () => {
    it.each(['varchar', 'text', 'char', 'character varying'])('%s → string', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column()');
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
    it.each(['timestamp', 'timestamptz', 'datetime'])('%s → Date', (sqlType) => {
      const result = mapColumnType(col({ sqlType }));
      expect(result.decorator).toBe('@column.datetime()');
      expect(result.tsType).toBe('Date');
    });
  });

  describe('date', () => {
    it('date → @column.date()', () => {
      const result = mapColumnType(col({ sqlType: 'date' }));
      expect(result.decorator).toBe('@column.date()');
      expect(result.tsType).toBe('Date');
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

    it('timestamp[] → @column.datetimeArray()', () => {
      const result = mapColumnType(col({ sqlType: 'timestamp[]', isArray: true }));
      expect(result.decorator).toBe('@column.datetimeArray()');
      expect(result.tsType).toBe('(Date | null)[]');
    });
  });

  describe('unknown types', () => {
    it('returns @column() / unknown for unrecognized types', () => {
      const result = mapColumnType(col({ sqlType: 'geometry' }));
      expect(result.decorator).toBe('@column()');
      expect(result.tsType).toBe('unknown');
    });
  });
});
