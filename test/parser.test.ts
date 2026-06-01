import { describe, it, expect } from 'vitest';
import { parseSchema, stripCheckConstraints } from '../src/parser';

describe('parseSchema - PostgreSQL', () => {
  it('parses a basic CREATE TABLE', () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('users');
    expect(tables[0].columns).toHaveLength(5);

    const [id, name, email, isActive, createdAt] = tables[0].columns;

    expect(id.name).toBe('id');
    expect(id.sqlType).toBe('serial');
    expect(id.isPrimaryKey).toBe(true);
    expect(id.isNullable).toBe(false);

    expect(name.name).toBe('name');
    expect(name.sqlType).toBe('varchar');
    expect(name.isNullable).toBe(false);

    expect(email.name).toBe('email');
    expect(email.sqlType).toBe('text');
    expect(email.isNullable).toBe(true);

    expect(isActive.name).toBe('is_active');
    expect(isActive.sqlType).toBe('boolean');

    expect(createdAt.name).toBe('created_at');
    expect(createdAt.sqlType).toBe('timestamp');
    expect(createdAt.isNullable).toBe(false);
  });

  it('detects table-level PRIMARY KEY constraint', () => {
    const sql = `
      CREATE TABLE post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at TIMESTAMP,
        PRIMARY KEY (post_id, tag_id)
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    const [postId, tagId, createdAt] = tables[0].columns;

    expect(postId.isPrimaryKey).toBe(true);
    expect(tagId.isPrimaryKey).toBe(true);
    expect(createdAt.isPrimaryKey).toBe(false);
  });

  it('parses PostgreSQL-specific types', () => {
    const sql = `
      CREATE TABLE items (
        id UUID PRIMARY KEY,
        metadata JSONB,
        settings JSON,
        tags TEXT[],
        scores INTEGER[],
        amount NUMERIC(10, 2),
        big_id BIGSERIAL NOT NULL
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    const cols = tables[0].columns;

    expect(cols[0].sqlType).toBe('uuid');
    expect(cols[0].isPrimaryKey).toBe(true);

    expect(cols[1].sqlType).toBe('jsonb');
    expect(cols[2].sqlType).toBe('json');

    expect(cols[3].sqlType).toBe('text[]');
    expect(cols[3].isArray).toBe(true);

    expect(cols[4].sqlType).toBe('integer[]');
    expect(cols[4].isArray).toBe(true);

    expect(cols[5].sqlType).toBe('numeric');

    expect(cols[6].sqlType).toBe('bigserial');
  });

  it('parses multiple tables', () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(2);
    expect(tables[0].name).toBe('users');
    expect(tables[1].name).toBe('posts');
  });

  it('ignores non-CREATE TABLE statements', () => {
    const sql = `
      CREATE INDEX idx_users_email ON users (email);
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT
      );
      CREATE SEQUENCE user_id_seq;
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('users');
  });

  it('returns empty array for invalid SQL', () => {
    const tables = parseSchema('NOT VALID SQL', { database: 'PostgreSQL' });
    expect(tables).toEqual([]);
  });
});

describe('parseSchema - MySQL', () => {
  it('parses MySQL CREATE TABLE with AUTO_INCREMENT', () => {
    const sql = `
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        is_admin TINYINT(1) DEFAULT 0,
        created_at DATETIME NOT NULL
      );
    `;
    const tables = parseSchema(sql, { database: 'MySQL' });
    expect(tables).toHaveLength(1);
    const cols = tables[0].columns;

    expect(cols[0].name).toBe('id');
    expect(cols[0].isPrimaryKey).toBe(true);

    expect(cols[3].name).toBe('is_admin');
    expect(cols[3].sqlType).toBe('boolean');

    expect(cols[4].name).toBe('created_at');
    expect(cols[4].sqlType).toBe('datetime');
  });
});

describe('parseSchema - SQLite', () => {
  it('parses SQLite CREATE TABLE', () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        balance REAL,
        data BLOB
      );
    `;
    const tables = parseSchema(sql, { database: 'SQLite' });
    expect(tables).toHaveLength(1);
    const cols = tables[0].columns;

    expect(cols[0].name).toBe('id');
    expect(cols[0].sqlType).toBe('integer');
    expect(cols[0].isPrimaryKey).toBe(true);

    expect(cols[1].sqlType).toBe('text');
    expect(cols[2].sqlType).toBe('real');
    expect(cols[3].sqlType).toBe('blob');
  });
});

describe('parseSchema - defaults to PostgreSQL', () => {
  it('defaults to PostgreSQL when no database specified', () => {
    const sql = `CREATE TABLE t (id SERIAL PRIMARY KEY);`;
    const tables = parseSchema(sql);
    expect(tables).toHaveLength(1);
  });
});

describe('parseSchema - CHECK constraints', () => {
  it('parses table with regex CHECK constraint (~ operator)', () => {
    const sql = `
      CREATE TABLE meals (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        salt_g TEXT NOT NULL,
        CONSTRAINT meals_salt_g_format_check CHECK ((salt_g ~ '^\\d+(\\.\\d+)?$'::text))
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('meals');
    expect(tables[0].columns).toHaveLength(3);
    expect(tables[0].columns.map(c => c.name)).toEqual(['id', 'name', 'salt_g']);
  });

  it('parses table with multiple CHECK constraints', () => {
    const sql = `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        price NUMERIC NOT NULL,
        code TEXT NOT NULL,
        CONSTRAINT products_price_positive CHECK ((price > 0)),
        CONSTRAINT products_code_format CHECK ((code ~ '^[A-Z]{3}-\\d+$'::text))
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toHaveLength(3);
    expect(tables[0].columns.map(c => c.name)).toEqual(['id', 'price', 'code']);
  });

  it('parses pg_dump-style schema with CHECK constraints across multiple tables', () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL
      );

      CREATE TABLE meals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        salt_g TEXT NOT NULL,
        sugar_g TEXT NOT NULL,
        CONSTRAINT meals_salt_g_format_check CHECK ((salt_g ~ '^\\d+(\\.\\d+)?$'::text)),
        CONSTRAINT meals_sugar_g_format_check CHECK ((sugar_g ~ '^\\d+(\\.\\d+)?$'::text))
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(2);
    expect(tables[0].name).toBe('users');
    expect(tables[1].name).toBe('meals');
    expect(tables[1].columns).toHaveLength(4);
  });

  it('handles CHECK with negated regex operators (!~ and !~*)', () => {
    const sql = `
      CREATE TABLE items (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        CONSTRAINT items_code_no_spaces CHECK ((code !~ '\\s'))
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toHaveLength(2);
  });

  it('handles CHECK constraint without CONSTRAINT keyword', () => {
    const sql = `
      CREATE TABLE t (
        id SERIAL PRIMARY KEY,
        val INTEGER NOT NULL,
        CHECK ((val > 0))
      );
    `;
    const tables = parseSchema(sql, { database: 'PostgreSQL' });
    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toHaveLength(2);
  });
});

describe('stripCheckConstraints', () => {
  it('returns sql unchanged when no CHECK constraints', () => {
    const sql = `CREATE TABLE t (id SERIAL PRIMARY KEY, name TEXT);`;
    expect(stripCheckConstraints(sql)).toBe(sql);
  });

  it('strips named CHECK at end of definition list', () => {
    const sql = [
      'CREATE TABLE t (',
      '  id SERIAL PRIMARY KEY,',
      '  val TEXT NOT NULL,',
      "  CONSTRAINT chk CHECK ((val ~ '^\\d+$'::text))",
      ');',
    ].join('\n');
    const result = stripCheckConstraints(sql);
    expect(result).not.toContain('CHECK');
    expect(result).not.toContain('CONSTRAINT');
    expect(result).toContain('id SERIAL PRIMARY KEY');
    expect(result).toContain('val TEXT NOT NULL');
  });

  it('strips CHECK in middle of definition list', () => {
    const sql = [
      'CREATE TABLE t (',
      "  CONSTRAINT chk CHECK ((val ~ '^\\d+$'::text)),",
      '  id SERIAL PRIMARY KEY,',
      '  val TEXT NOT NULL',
      ');',
    ].join('\n');
    const result = stripCheckConstraints(sql);
    expect(result).not.toContain('CHECK');
    expect(result).toContain('id SERIAL PRIMARY KEY');
    expect(result).toContain('val TEXT NOT NULL');
  });

  it('strips multiple CHECK constraints', () => {
    const sql = [
      'CREATE TABLE t (',
      '  id SERIAL PRIMARY KEY,',
      '  a TEXT NOT NULL,',
      '  b TEXT NOT NULL,',
      "  CONSTRAINT chk_a CHECK ((a ~ '^\\d+$'::text)),",
      "  CONSTRAINT chk_b CHECK ((b ~ '^\\d+$'::text))",
      ');',
    ].join('\n');
    const result = stripCheckConstraints(sql);
    expect(result).not.toContain('CHECK');
    expect(result).toContain('id SERIAL PRIMARY KEY');
    expect(result).toContain('a TEXT NOT NULL');
    expect(result).toContain('b TEXT NOT NULL');
  });

  it('handles CHECK with escaped single quotes in expression', () => {
    const sql = `CREATE TABLE t (
  id SERIAL PRIMARY KEY,
  val TEXT NOT NULL,
  CONSTRAINT chk CHECK ((val <> 'it''s'))
);`;
    const result = stripCheckConstraints(sql);
    expect(result).not.toContain('CHECK');
    expect(result).toContain('val TEXT NOT NULL');
  });

  it('handles CHECK with quoted constraint name', () => {
    const sql = `CREATE TABLE t (
  id SERIAL PRIMARY KEY,
  val INTEGER NOT NULL,
  CONSTRAINT "my-check" CHECK ((val > 0))
);`;
    const result = stripCheckConstraints(sql);
    expect(result).not.toContain('CHECK');
    expect(result).not.toContain('my-check');
  });
});
