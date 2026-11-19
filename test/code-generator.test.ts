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

    expect(lines[0]).toBe('  @column.bigint({ primaryKey: true }) id?: bigint;');
    expect(lines[1]).toBe('  @column.text() name?: string;');
    expect(lines[2]).toBe('  @column.text() email?: string | null;');
    expect(lines[3]).toBe('  @column.boolean() is_active?: boolean | null;');
    expect(lines[4]).toBe('  @column.datetime() created_at?: string;');
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

    expect(lines[0]).toBe('  @column.bigint({ primaryKey: true }) post_id?: bigint;');
    expect(lines[1]).toBe('  @column.bigint({ primaryKey: true }) tag_id?: bigint;');
    expect(lines[2]).toBe('  @column.datetime() created_at?: string | null;');
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

    expect(lines[0]).toBe('  @column.json<unknown>() metadata?: unknown;');
    expect(lines[1]).toBe('  @column.bigint() big_id?: bigint;');
  });

  it('writes a column name that is not an identifier as a string literal property', () => {
    const table: TableDef = {
      name: 'odd',
      columns: [
        { name: 'first name', sqlType: 'text', isPrimaryKey: false, isNullable: true, isArray: false },
        { name: 'order-id', sqlType: 'integer', isPrimaryKey: false, isNullable: false, isArray: false },
        { name: '1st', sqlType: 'text', isPrimaryKey: false, isNullable: false, isArray: false },
        { name: 'x; static { globalThis.probe = 1 } y', sqlType: 'text', isPrimaryKey: false, isNullable: false, isArray: false },
        { name: 'a"b\\c', sqlType: 'text', isPrimaryKey: false, isNullable: false, isArray: false },
        { name: 'ユーザー名', sqlType: 'text', isPrimaryKey: false, isNullable: false, isArray: false },
      ],
    };

    const lines = generateColumnCode(table).split('\n');

    expect(lines[0]).toBe('  @column.text() "first name"?: string | null;');
    expect(lines[1]).toBe('  @column.bigint() "order-id"?: bigint;');
    expect(lines[2]).toBe('  @column.text() "1st"?: string;');
    expect(lines[3]).toBe('  @column.text() "x; static { globalThis.probe = 1 } y"?: string;');
    expect(lines[4]).toBe('  @column.text() "a\\"b\\\\c"?: string;');
    expect(lines[5]).toBe('  @column.text() ユーザー名?: string;');
  });
});
