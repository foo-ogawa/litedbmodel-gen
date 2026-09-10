import { describe, it, expect } from 'vitest';
import { parseSchema } from '../src/parser';

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

describe('parseSchema - one statement it cannot read does not take the others with it', () => {
  const names = (sql: string, database: 'PostgreSQL' | 'MySQL' | 'SQLite' = 'PostgreSQL') =>
    parseSchema(sql, { database }).map((t) => t.name);

  it('keeps every table around a function whose dollar-quoted body holds `;` and `:=`', () => {
    const sql = `
      CREATE TABLE public.users (id uuid NOT NULL, name text NOT NULL);
      CREATE FUNCTION public.set_updated_at() RETURNS trigger
          LANGUAGE plpgsql
          AS $$
      BEGIN
          NEW.updated_at := now();
          RETURN NEW;
      END;
      $$;
      CREATE TABLE public.posts (id uuid NOT NULL);
    `;
    expect(names(sql)).toEqual(['users', 'posts']);
  });

  it('keeps every table around a function whose body is a quoted string or a tagged dollar quote', () => {
    expect(names(`CREATE TABLE a (id integer);
      CREATE FUNCTION f() RETURNS int LANGUAGE sql AS 'SELECT 1; SELECT 2';
      CREATE TABLE b (id integer);`)).toEqual(['a', 'b']);
    expect(names(`CREATE TABLE a (id integer);
      CREATE FUNCTION f() RETURNS void AS $body$ BEGIN PERFORM 1; END; $body$ LANGUAGE plpgsql;
      CREATE TABLE b (id integer);`)).toEqual(['a', 'b']);
  });

  it('does not split at the `;` of a pg_dump comment', () => {
    expect(names(`-- Name: users; Type: TABLE; Schema: public
      CREATE TABLE public.users (id integer);`)).toEqual(['users']);
  });

  it('throws, naming the table, when a CREATE TABLE cannot be read — never an empty result', () => {
    expect(() => parseSchema(`CREATE TABLE ok (id integer);
      CREATE TABLE broken (id integer, GARBAGE ((( );`)).toThrow(/Cannot parse the table broken/);
  });
});

describe('parseSchema - column types node-sql-parser cannot read', () => {
  it('reads the array and geometric types it rejects, keeping nullability', () => {
    const [a, b] = parseSchema(`
      CREATE TABLE a (
        id integer PRIMARY KEY,
        f boolean[] NOT NULL,
        t timestamp[],
        z timestamptz[],
        u uuid[],
        p point
      );
      CREATE TABLE b (id integer PRIMARY KEY);
    `);
    expect(b.name).toBe('b');
    expect(a.columns.map((c) => [c.name, c.sqlType, c.isArray, c.isNullable])).toEqual([
      ['id', 'integer', false, false],
      ['f', 'boolean[]', true, false],
      ['t', 'timestamp[]', true, true],
      ['z', 'timestamptz[]', true, true],
      ['u', 'uuid[]', true, true],
      ['p', 'point', false, true],
    ]);
  });

  it('keeps an ARRAY default in one column while standing in for an unreadable type', () => {
    const [t] = parseSchema(`CREATE TABLE a (id integer, f boolean[] DEFAULT ARRAY[true, false], p point);`);
    expect(t.columns.map((c) => [c.name, c.sqlType])).toEqual([
      ['id', 'integer'],
      ['f', 'boolean[]'],
      ['p', 'point'],
    ]);
  });
});

describe('parseSchema - each dialect splits and names tables by its own rules', () => {
  it('MySQL: mysqldump backquoted names', () => {
    const [t] = parseSchema(
      "CREATE TABLE `users` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `name` varchar(255) NOT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB;",
      { database: 'MySQL' },
    );
    expect(t.name).toBe('users');
    expect(t.columns.map((c) => c.name)).toEqual(['id', 'name']);
  });

  it('MySQL: a `#` comment and a backslash-escaped quote do not end a statement at their `;`', () => {
    expect(parseSchema("# users; main table\nCREATE TABLE users (id int);", { database: 'MySQL' })).toHaveLength(1);
    expect(
      parseSchema("CREATE TABLE a (s varchar(10) DEFAULT 'it\\'s; x');\nCREATE TABLE b (id int);", { database: 'MySQL' }),
    ).toHaveLength(2);
  });

  it('MySQL and SQLite: a `;` inside a backquoted name does not end the statement', () => {
    expect(parseSchema('CREATE TABLE `odd;name` (id int);\nCREATE TABLE b (id int);', { database: 'MySQL' }).map((t) => t.name))
      .toEqual(['odd;name', 'b']);
    expect(parseSchema('CREATE TABLE `odd;name` (id INTEGER);\nCREATE TABLE b (id INTEGER);', { database: 'SQLite' }).map((t) => t.name))
      .toEqual(['odd;name', 'b']);
  });

  it('SQLite: backquoted and bracketed names', () => {
    expect(parseSchema('CREATE TABLE `users` (`id` INTEGER PRIMARY KEY);', { database: 'SQLite' })[0].name).toBe('users');
    const [t] = parseSchema('CREATE TABLE [users] ([id] INTEGER PRIMARY KEY, [first name] TEXT NOT NULL);', { database: 'SQLite' });
    expect(t.name).toBe('users');
    expect(t.columns.map((c) => [c.name, c.sqlType, c.isNullable])).toEqual([
      ['id', 'integer', false],
      ['first name', 'text', false],
    ]);
  });

  it('PostgreSQL: an ARRAY default does not split its column', () => {
    const [t] = parseSchema('CREATE TABLE a (id integer, xs integer[] DEFAULT ARRAY[1,2], y text);');
    expect(t.columns.map((c) => c.name)).toEqual(['id', 'xs', 'y']);
  });
});

describe('parseSchema - a table node-sql-parser rejects is read like any other', () => {
  const columns = (sql: string, database: 'PostgreSQL' | 'MySQL' | 'SQLite' = 'PostgreSQL') =>
    parseSchema(sql, { database })[0].columns.map((c) => [c.name, c.sqlType, c.isPrimaryKey, c.isNullable]);

  it('PostgreSQL: names it accepts bare, as pg_dump writes them', () => {
    const [t] = parseSchema('CREATE TABLE public.session (id integer PRIMARY KEY, at timestamp NOT NULL, json jsonb, MyCol text);');
    expect(t.name).toBe('session');
    expect(t.columns.map((c) => [c.name, c.sqlType, c.isNullable])).toEqual([
      ['id', 'integer', false],
      ['at', 'timestamp', false],
      ['json', 'jsonb', true],
      ['MyCol', 'text', true],
    ]);
  });

  it('PostgreSQL: column options — identity, a DEFAULT cast to a schema-qualified type, a generated column, COLLATE', () => {
    expect(
      columns(`CREATE TABLE public.accounts (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        mood public.mood DEFAULT 'ok'::public.mood NOT NULL,
        amount numeric(20,4) DEFAULT 0 NOT NULL,
        total numeric GENERATED ALWAYS AS (amount * 2) STORED,
        nick character varying(64) COLLATE pg_catalog."C"
      );`),
    ).toEqual([
      ['id', 'bigint', true, false],
      ['mood', 'public.mood', false, false],
      ['amount', 'numeric', false, false],
      ['total', 'numeric', false, true],
      ['nick', 'character varying', false, true],
    ]);
  });

  it('reads NOT NULL wherever it stands among the options, and only there', () => {
    expect(
      columns(`CREATE TABLE t (
        a varchar(24) NOT NULL UNIQUE DEFAULT '',
        b text CHECK (b IS NOT NULL),
        c text DEFAULT 'NOT NULL',
        d text -- NOT NULL
      );`).map(([name, , , nullable]) => [name, nullable]),
    ).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
      ['d', true],
    ]);
  });

  it('reads a column list with comments between its columns', () => {
    expect(
      columns(`CREATE TABLE all_types (
        id SERIAL PRIMARY KEY,
        -- Array types
        int_array INTEGER[],
        bool_array BOOLEAN[] /* nullable */ ,
        ts_array TIMESTAMP[] NOT NULL
      );`),
    ).toEqual([
      ['id', 'serial', true, false],
      ['int_array', 'integer[]', false, true],
      ['bool_array', 'boolean[]', false, true],
      ['ts_array', 'timestamp[]', false, false],
    ]);
    expect(columns('CREATE TABLE t ([b c] TEXT, /* note */ UNIQUE ([b c]));', 'SQLite')).toEqual([['b c', 'text', false, true]]);
  });

  it('PostgreSQL: an array of a type spelled out, as pg_dump writes it, reads as an array of that type', () => {
    expect(
      columns('CREATE TABLE t (a timestamp with time zone[], b timestamp without time zone[] NOT NULL);'),
    ).toEqual([
      ['a', 'timestamp[]', false, true],
      ['b', 'timestamp[]', false, false],
    ]);
  });

  it('PostgreSQL: EXCLUDE opens a constraint only before USING or its element list', () => {
    expect(columns('CREATE TABLE t (id integer, exclude boolean, EXCLUDE USING gist (id WITH =));')).toEqual([
      ['id', 'integer', false, true],
      ['exclude', 'boolean', false, true],
    ]);
  });

  it('keeps a table-level PRIMARY KEY after a column-level CHECK', () => {
    expect(
      columns("CREATE TABLE t (id integer, email text CHECK (email ~* '^x$'), CONSTRAINT t_pkey PRIMARY KEY (id));")
        .map(([name, , pk]) => [name, pk]),
    ).toEqual([
      ['id', true],
      ['email', false],
    ]);
  });

  it('MySQL: a bare KEY in a column is its PRIMARY KEY; KEY, INDEX and FULLTEXT items are indexes', () => {
    expect(
      columns(
        `CREATE TABLE \`t\` (
          \`id\` int NOT NULL KEY,
          \`key\` varchar(255) UNIQUE KEY,
          \`desc\` text,
          KEY \`idx\` (\`desc\`(10)),
          INDEX i (\`key\`),
          UNIQUE KEY \`u\` (\`key\`),
          FULLTEXT KEY \`f\` (\`desc\`)
        ) ENGINE=InnoDB;`,
        'MySQL',
      ),
    ).toEqual([
      ['id', 'int', true, false],
      ['key', 'varchar', false, true],
      ['desc', 'text', false, true],
    ]);
  });

  it('SQLite: a bare name it accepts and a column with no type', () => {
    const [t] = parseSchema('CREATE TABLE session (id INTEGER PRIMARY KEY AUTOINCREMENT, data, value TEXT NOT NULL);', {
      database: 'SQLite',
    });
    expect(t.name).toBe('session');
    expect(t.columns.map((c) => [c.name, c.sqlType, c.isNullable])).toEqual([
      ['id', 'integer', false],
      ['data', '', true],
      ['value', 'text', false],
    ]);
  });

  it('reads every table of a pg_dump schema and skips what is not a table', () => {
    const tables = parseSchema(`
      SET client_encoding = 'UTF8';
      CREATE TYPE public.mood AS ENUM ('sad', 'ok');
      CREATE DOMAIN public.posint AS integer CHECK (VALUE > 0);
      CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at := now(); -- the ; here must not split
        RETURN NEW;
      END;
      $$;
      CREATE TABLE public.orders (
          id integer DEFAULT nextval('public.orders_id_seq'::regclass) NOT NULL,
          status text DEFAULT 'new'::text NOT NULL,
          at timestamp with time zone,
          CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['new'::text, 'paid'::text]))),
          CONSTRAINT orders_pkey PRIMARY KEY (id)
      );
      CREATE UNLOGGED TABLE public.cache (k text PRIMARY KEY, v bytea);
      CREATE TABLE public.events (id bigint NOT NULL, happened_on date NOT NULL) PARTITION BY RANGE (happened_on);
      CREATE TABLE public.events_2026 PARTITION OF public.events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
      CREATE INDEX orders_at_idx ON public.orders USING btree (at);
      COMMENT ON TABLE public.orders IS 'orders; one row per purchase';
    `);
    expect(tables.map((t) => t.name)).toEqual(['orders', 'cache', 'events']);
    expect(tables[0].columns.map((c) => [c.name, c.isPrimaryKey, c.isNullable])).toEqual([
      ['id', true, false],
      ['status', false, false],
      ['at', false, true],
    ]);
  });

  it('throws, naming the table, when its columns come from another table', () => {
    expect(() => parseSchema('CREATE TABLE c (LIKE p INCLUDING ALL, x int);')).toThrow(/Cannot parse the table c: LIKE/);
    expect(() => parseSchema('CREATE TABLE c (x int) INHERITS (p);')).toThrow(/Cannot parse the table c: INHERITS/);
    expect(() => parseSchema('CREATE TABLE c (LIKE p);', { database: 'MySQL' })).toThrow(/Cannot parse the table c: LIKE/);
  });

  it('throws on a MySQL dump read as PostgreSQL rather than taking its indexes for columns', () => {
    expect(() => parseSchema('CREATE TABLE `t` (\n  `id` int NOT NULL,\n  KEY `idx` (`id`)\n) ENGINE=InnoDB;')).toThrow(
      /Cannot parse the table `t`: '`' does not start a column name in PostgreSQL/,
    );
  });
});
