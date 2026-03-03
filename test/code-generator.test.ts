import { describe, it, expect } from 'vitest';
import { generateColumnCode } from '../src/code-generator';
import type { TableDef } from '../src/types';

describe('generateColumnCode', () => {
  it('generates column definitions for a basic table', () => {
    const table: TableDef = {
      name: 'users',
      columns: [
        { name: 'id', sqlType: 'integer', isPrimaryKey: true, isNullable: false, isArray: false },
        { name: 'name', sqlType: 'varchar', isPrimaryKey: false, isNullable: false, isArray: false },
        { name: 'email', sqlType: 'text', isPrimaryKey: false, isNullable: true, isArray: false },
        { name: 'is_active', sqlType: 'boolean', isPrimaryKey: false, isNullable: true, isArray: false },
        { name: 'created_at', sqlType: 'timestamp', isPrimaryKey: false, isNullable: false, isArray: false },
      ],
    };

    const result = generateColumnCode(table);
    const lines = result.split('\n');

    expect(lines[0]).toBe('  @column({ primaryKey: true }) id?: number;');
    expect(lines[1]).toBe('  @column() name?: string;');
    expect(lines[2]).toBe('  @column() email?: string | null;');
    expect(lines[3]).toBe('  @column.boolean() is_active?: boolean | null;');
    expect(lines[4]).toBe('  @column.datetime() created_at?: Date;');
  });

  it('generates UUID primary key', () => {
    const table: TableDef = {
      name: 'items',
      columns: [
        { name: 'id', sqlType: 'uuid', isPrimaryKey: true, isNullable: false, isArray: false },
      ],
    };

    const result = generateColumnCode(table);
    expect(result).toBe('  @column.uuid({ primaryKey: true }) id?: string;');
  });

  it('generates composite primary keys', () => {
    const table: TableDef = {
      name: 'post_tags',
      columns: [
        { name: 'post_id', sqlType: 'integer', isPrimaryKey: true, isNullable: false, isArray: false },
        { name: 'tag_id', sqlType: 'integer', isPrimaryKey: true, isNullable: false, isArray: false },
        { name: 'created_at', sqlType: 'timestamp', isPrimaryKey: false, isNullable: true, isArray: false },
      ],
    };

    const result = generateColumnCode(table);
    const lines = result.split('\n');

    expect(lines[0]).toBe('  @column({ primaryKey: true }) post_id?: number;');
    expect(lines[1]).toBe('  @column({ primaryKey: true }) tag_id?: number;');
    expect(lines[2]).toBe('  @column.datetime() created_at?: Date | null;');
  });

  it('generates array types', () => {
    const table: TableDef = {
      name: 'docs',
      columns: [
        { name: 'tags', sqlType: 'text[]', isPrimaryKey: false, isNullable: true, isArray: true },
        { name: 'scores', sqlType: 'integer[]', isPrimaryKey: false, isNullable: true, isArray: true },
      ],
    };

    const result = generateColumnCode(table);
    const lines = result.split('\n');

    expect(lines[0]).toBe('  @column.stringArray() tags?: string[] | null;');
    expect(lines[1]).toBe('  @column.intArray() scores?: number[] | null;');
  });

  it('generates JSON and bigint types', () => {
    const table: TableDef = {
      name: 'records',
      columns: [
        { name: 'metadata', sqlType: 'jsonb', isPrimaryKey: false, isNullable: true, isArray: false },
        { name: 'big_id', sqlType: 'bigint', isPrimaryKey: false, isNullable: false, isArray: false },
      ],
    };

    const result = generateColumnCode(table);
    const lines = result.split('\n');

    expect(lines[0]).toBe('  @column.json<Record<string, unknown>>() metadata?: Record<string, unknown> | null;');
    expect(lines[1]).toBe('  @column.bigint() big_id?: bigint;');
  });
});
