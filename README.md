# litedbmodel-gen

[embedoc](https://www.npmjs.com/package/embedoc)-based model code generator for [litedbmodel](https://www.npmjs.com/package/litedbmodel). Parses SQL DDL (PostgreSQL / MySQL / SQLite) and generates TypeScript column definitions that stay in sync with your schema.

## How It Works

litedbmodel-gen provides two embedoc plugins:

1. **Custom Datasource** (`sql_schema`) — reads and parses a `schema.sql` file into structured table definitions
2. **Renderer** (`litedbmodel_columns`) — generates `@column()` decorator code from the datasource

Using embedoc's in-place marker system, only the column definitions inside markers are auto-updated. Hand-written code (relations, custom methods, exports) outside the markers is preserved.

```typescript
@model('users')
class UserModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="users"*/
  @column({ primaryKey: true }) id?: number;
  @column() name?: string;
  @column() email?: string | null;
  @column.boolean() is_active?: boolean | null;
  @column.datetime() created_at?: Date;
  @column.datetime() updated_at?: Date;
  /*@embedoc:end*/

  // Hand-written — not touched by embedoc
  @hasMany(() => [User.id, Post.user_id])
  declare posts: Promise<Post[]>;
}

export const User = UserModel.asModel();
export type User = InstanceType<typeof User>;
```

## Quick Start

### 1. Initialize embedoc in your project

```bash
npx embedoc init
```

### 2. Install litedbmodel-gen

```bash
npm install -D litedbmodel-gen
```

### 3. Run the init command

```bash
npx litedbmodel-gen init
```

This automatically:
- Copies the Handlebars template to `.embedoc/templates/model.hbs`
- Registers the `sql_schema` datasource in `.embedoc/datasources/index.ts`
- Registers the `litedbmodel_columns` renderer in `.embedoc/renderers/index.ts`
- Adds a `schema` datasource config to `embedoc.config.yaml`
- Adds `./models/**/*.ts` to the build targets

If your config file is not at the default `embedoc.config.yaml`:

```bash
npx litedbmodel-gen init path/to/embedoc.config.yaml
```

### 4. Edit the config

Open `embedoc.config.yaml` and set the schema path and database dialect:

```yaml
datasources:
  schema:
    type: sql_schema
    path: "./db/schema.sql"       # your DDL file
    database: PostgreSQL           # PostgreSQL | MySQL | SQLite
    generators:
      - output_path: "./models/{model_class}.ts"
        template: model.hbs
        overwrite: false
```

### 5. Generate and build

```bash
# Create model files for each table
npx embedoc generate --datasource schema

# Fill in column definitions
npx embedoc build

# Or use watch mode for ongoing sync
npx embedoc watch
```

## Workflow

```
schema.sql changes
      |
      v
embedoc build / watch
      |
      +-- existing models/*.ts
      |     column definitions inside markers are updated
      |     relations and exports are preserved
      |
      +-- new tables
            embedoc generate --datasource schema
            creates new model files from template
            embedoc build fills in column definitions
```

## Supported SQL Types

### Common (all dialects)

| SQL Type | Decorator | TypeScript Type |
|----------|-----------|-----------------|
| `INTEGER`, `INT`, `SMALLINT`, `SERIAL` | `@column()` | `number` |
| `BIGINT`, `BIGSERIAL` | `@column.bigint()` | `bigint` |
| `NUMERIC`, `DECIMAL`, `REAL`, `FLOAT`, `DOUBLE PRECISION` | `@column()` | `number` |
| `VARCHAR`, `TEXT`, `CHAR` | `@column()` | `string` |
| `BOOLEAN` | `@column.boolean()` | `boolean` |
| `TIMESTAMP`, `TIMESTAMPTZ`, `DATETIME` | `@column.datetime()` | `Date` |
| `DATE` | `@column.date()` | `Date` |
| `JSON`, `JSONB` | `@column.json<Record<string, unknown>>()` | `Record<string, unknown>` |
| `UUID` | `@column.uuid()` | `string` |

### PostgreSQL Arrays

| SQL Type | Decorator | TypeScript Type |
|----------|-----------|-----------------|
| `TEXT[]` | `@column.stringArray()` | `string[]` |
| `INTEGER[]` | `@column.intArray()` | `number[]` |
| `NUMERIC[]` | `@column.numericArray()` | `(number \| null)[]` |
| `BOOLEAN[]` | `@column.booleanArray()` | `(boolean \| null)[]` |
| `TIMESTAMP[]` | `@column.datetimeArray()` | `(Date \| null)[]` |

### MySQL-specific

| SQL Type | Decorator | TypeScript Type |
|----------|-----------|-----------------|
| `TINYINT(1)` | `@column.boolean()` | `boolean` |

### Primary Keys

Columns with `PRIMARY KEY` constraints use `@column({ primaryKey: true })`. For UUID primary keys: `@column.uuid({ primaryKey: true })`. Composite primary keys are supported.

## Marker Syntax

Inside your model class:

```typescript
/*@embedoc:litedbmodel_columns table="TABLE_NAME"*/
// auto-generated column definitions
/*@embedoc:end*/
```

If your datasource is not named `schema`, specify it:

```typescript
/*@embedoc:litedbmodel_columns table="users" datasource="my_schema"*/
```

## CLI

```bash
# Initialize litedbmodel-gen in an embedoc project
npx litedbmodel-gen init [config-path]
```

## API

The package also exports lower-level utilities:

```typescript
import {
  sqlSchema,            // embedoc custom datasource
  litedbmodelColumns,   // embedoc renderer
  parseSchema,          // SQL DDL parser
  generateColumnCode,   // code generator
  mapColumnType,        // single column type mapper
} from 'litedbmodel-gen';
```

### `parseSchema(sql, options?)`

Parses SQL DDL and returns table definitions.

```typescript
const tables = parseSchema(sql, { database: 'PostgreSQL' });
// Returns: TableDef[] = [{ name: string, columns: ColumnDef[] }]
```

## Requirements

- Node.js 18+
- embedoc >= 0.11.0

## License

MIT
