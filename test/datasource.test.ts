import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { sqlSchema } from '../src/datasource';

const TMP_DIR = join(import.meta.dirname!, '__tmp_datasource_test__');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('sqlSchema datasource', () => {
  it('creates a datasource from a PostgreSQL schema file', async () => {
    const schemaPath = join(TMP_DIR, 'pg_schema.sql');
    writeFileSync(schemaPath, `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email TEXT
      );
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL
      );
    `);

    const ds = await sqlSchema.create({
      type: 'sql_schema',
      path: schemaPath,
      database: 'PostgreSQL',
    });

    const all = await ds.getAll();
    expect(all).toHaveLength(2);

    const users = all[0] as Record<string, unknown>;
    expect(users['table_name']).toBe('users');
    expect(users['model_class']).toBe('User');
    expect(Array.isArray(users['columns'])).toBe(true);

    const posts = all[1] as Record<string, unknown>;
    expect(posts['table_name']).toBe('posts');
    expect(posts['model_class']).toBe('Post');
  });

  it('filters by table name with query()', async () => {
    const schemaPath = join(TMP_DIR, 'pg_query.sql');
    writeFileSync(schemaPath, `
      CREATE TABLE users (id SERIAL PRIMARY KEY);
      CREATE TABLE posts (id SERIAL PRIMARY KEY);
    `);

    const ds = await sqlSchema.create({
      type: 'sql_schema',
      path: schemaPath,
      database: 'PostgreSQL',
    });

    const result = await ds.query('', ['users']);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>)['table_name']).toBe('users');
  });

  it('generates PascalCase model_class with singularization', async () => {
    const schemaPath = join(TMP_DIR, 'singular.sql');
    writeFileSync(schemaPath, `
      CREATE TABLE user_profiles (id SERIAL PRIMARY KEY);
      CREATE TABLE categories (id SERIAL PRIMARY KEY);
      CREATE TABLE post_tags (id SERIAL PRIMARY KEY);
    `);

    const ds = await sqlSchema.create({
      type: 'sql_schema',
      path: schemaPath,
      database: 'PostgreSQL',
    });

    const all = await ds.getAll();
    expect((all[0] as Record<string, unknown>)['model_class']).toBe('UserProfile');
    expect((all[1] as Record<string, unknown>)['model_class']).toBe('Category');
    expect((all[2] as Record<string, unknown>)['model_class']).toBe('PostTag');
  });

  it('works with MySQL dialect', async () => {
    const schemaPath = join(TMP_DIR, 'mysql_schema.sql');
    writeFileSync(schemaPath, `
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_admin TINYINT(1) DEFAULT 0
      );
    `);

    const ds = await sqlSchema.create({
      type: 'sql_schema',
      path: schemaPath,
      database: 'MySQL',
    });

    const all = await ds.getAll();
    expect(all).toHaveLength(1);
    const cols = (all[0] as Record<string, unknown>)['columns'] as Array<Record<string, unknown>>;
    expect(cols[2]['sqlType']).toBe('boolean');
  });
});
