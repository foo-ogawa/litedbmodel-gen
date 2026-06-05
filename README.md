# litedbmodel-gen

[![npm version](https://img.shields.io/npm/v/litedbmodel-gen.svg)](https://www.npmjs.com/package/litedbmodel-gen)

Code generator and LLM-powered development assistant for [litedbmodel](https://www.npmjs.com/package/litedbmodel).

- **Generate** — Parse SQL DDL and generate type-safe model definitions that stay in sync with your schema
- **Implement** — Describe a feature and get AI-generated code that follows litedbmodel best practices
- **Audit** — Scan existing code for common litedbmodel anti-patterns and get actionable fixes

## Quick Start

```bash
npm install -D litedbmodel-gen embedoc
npx embedoc init && npx litedbmodel-gen init

# Generate model definitions from schema.sql
npx embedoc generate --datasource schema
npx embedoc build

# Implement a feature using litedbmodel best practices
npx litedbmodel-gen implement \
  "Add a syncNutrientSummary function in src/services/meal.service.ts that:
   - Takes userId and mealDate as arguments
   - Finds all Meal records for the user+date, groups by meal_type
   - Aggregates nutrients per meal_type
   - Upserts into MealNutrientSummary (unique on user_id, meal_date, meal_type)
   - Deletes orphan summaries for meal_types that no longer have meals
   - Wraps everything in a transaction with row locking" \
  --target src/services/meal.service.ts \
  --models "src/models/**/*.ts" --adapter claude

# Audit existing code for anti-patterns
npx litedbmodel-gen audit src/services/ --adapter claude
```

---

## LLM-Powered Commands

litedbmodel-gen includes two LLM-powered commands that understand the litedbmodel API and enforce correct usage patterns. These commands are backed by [agent-contracts-runtime](https://www.npmjs.com/package/agent-contracts-runtime) and require an LLM adapter (`--adapter claude`, `openai`, or `gemini`).

### Why

AI coding assistants frequently produce incorrect litedbmodel code. Common mistakes include:

| Anti-Pattern | What the AI does | What it should do |
|---|---|---|
| **LOOP_CREATE** | `for (...) { Model.create(...) }` | `Model.createMany(rows)` |
| **DELETE_REINSERT** | Delete all, then re-insert in a loop | `createMany` with `onConflict` + `onConflictUpdate` (upsert) |
| **MISSING_IDEMPOTENCY** | Bare `create()` that throws on duplicates | `create({ onConflict, onConflictIgnore: true })` |
| **N_PLUS_ONE** | `find`/`findOne` inside a loop | Batch fetch with `find` using IN conditions |
| **MISSING_LOCK** | Read-then-write without locking | `findOne(..., { forUpdate: true })` inside `DBModel.transaction()` |
| **OVER_DELETE** | `delete` with overly broad conditions | Pinpoint delete targeting only the intended rows |
| **UNIQUE_MISSING** | `onConflict` without a UNIQUE constraint in the DB | Add UNIQUE constraint via migration |
| **AGGREGATE_SKIP** | Insert raw data without aggregation | Group-by in application code, then upsert |

The `implement` and `audit` commands have deep knowledge of the litedbmodel API and proactively avoid these patterns.

### `litedbmodel-gen implement <description>`

Implements the described feature directly in your project files using an agentic LLM adapter. The agent reads your model definitions to understand available models, then reads and edits the target source file(s).

The `<description>` argument should specify **what function to write, where to put it, and the business logic** — the more concrete, the better. Use `--target` to specify the source file to create or edit.

```bash
npx litedbmodel-gen implement \
  "Add a processOrderItems function that:
   - Takes an orderId and an array of {productId, quantity, unitPrice}
   - Upserts into OrderItem using (order_id, product_id) as conflict key
   - Deletes OrderItem rows for productIds not in the input array
   - Returns the updated order items
   - Wraps all writes in a transaction" \
  --target src/services/order.service.ts \
  --models "src/models/**/*.ts" \
  --adapter claude

# Preview the full prompt without calling the LLM
npx litedbmodel-gen implement "Add bulk user import" \
  --target src/services/user.service.ts --show-prompt

# Write result to a file
npx litedbmodel-gen implement "..." --target src/services/foo.ts --adapter claude -o result.json
```

| Option | Default | Description |
|--------|---------|-------------|
| `--target <path>` | — | Target source file to create or edit |
| `--models <glob>` | `models/**/*.ts` | Glob pattern for model definition files |
| `--adapter <name>` | `mock` | LLM adapter: `claude`, `openai`, `gemini`, `mock` |
| `--model <name>` | — | Model name override for the adapter |
| `--show-prompt` | `false` | Output the prompt without calling the LLM |
| `--report-format` | `json` | Output format: `json`, `text`, `yaml` |
| `--output <path>` | — | Write result to file instead of stdout |
| `--fail-on` | `error` | Minimum severity that causes exit code 10 |
| `--log-file, -l` | — | File path to write structured progress logs |

### `litedbmodel-gen audit [target]`

Scans TypeScript source files for the eight anti-patterns listed above. Returns structured findings with severity ratings and remediation guidance referencing the correct litedbmodel API.

```bash
# Audit a directory
npx litedbmodel-gen audit src/services/ --adapter claude

# Audit a single file with strict mode
npx litedbmodel-gen audit src/services/meal.service.ts \
  --adapter claude --fail-on warning

# Output as text
npx litedbmodel-gen audit src/ --adapter claude --report-format text
```

| Option | Default | Description |
|--------|---------|-------------|
| `--adapter <name>` | `mock` | LLM adapter: `claude`, `openai`, `gemini`, `mock` |
| `--model <name>` | — | Model name override for the adapter |
| `--show-prompt` | `false` | Output the prompt without calling the LLM |
| `--report-format` | `json` | Output format: `json`, `text`, `yaml` |
| `--output <path>` | — | Write result to file instead of stdout |
| `--fail-on` | `error` | Minimum severity that causes exit code 10 |
| `--log-file, -l` | — | File path to write structured progress logs |

### Utility Commands

| Command | Description |
|---------|-------------|
| `litedbmodel-gen extract` | Output the embedded CLI contract specification (YAML) for external tooling |
| `litedbmodel-gen agents` | List registered DSL agents, tasks, and workflows |

### Recommended Workflow

```
schema.sql  ──>  embedoc generate + build  ──>  models/*.ts
                                                    │
                              ┌─────────────────────┘
                              v
                    implement (new feature)
                              │
                              v
                      hand-written code
                              │
                              v
                     audit (verify quality)
                              │
                     ┌────────┴────────┐
                     v                 v
                  clean            findings
                                       │
                                       v
                                fix and re-audit
```

1. **Generate models** from `schema.sql` using embedoc
2. **Implement** — describe the feature and get code that uses litedbmodel correctly
3. **Write** — integrate the generated code into your project
4. **Audit** — scan for anti-patterns in the result (or any existing code)
5. **Fix and re-audit** until clean

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (no findings above `--fail-on` threshold) |
| `1` | General error |
| `3` | Input validation failed |
| `10` | Findings at or above `--fail-on` threshold |
| `11` | `agent-contracts-runtime` not installed |
| `12` | Adapter initialization failed (missing API key) |

### Environment Variables

| Variable | Adapter |
|----------|---------|
| `ANTHROPIC_API_KEY` | `claude` |
| `OPENAI_API_KEY` | `openai` |
| `GEMINI_API_KEY` | `gemini` |

---

## Code Generation

litedbmodel-gen provides two [embedoc](https://www.npmjs.com/package/embedoc) plugins for generating model column definitions from SQL DDL:

1. **Datasource** (`sql_schema`) — reads and parses a `schema.sql` file into structured table definitions
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

### Setup

#### 1. Initialize embedoc and litedbmodel-gen

```bash
npx embedoc init
npm install -D litedbmodel-gen
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

#### 2. Edit the config

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

#### 3. Generate and build

```bash
# Create model files for each table
npx embedoc generate --datasource schema

# Fill in column definitions
npx embedoc build

# Or use watch mode for ongoing sync
npx embedoc watch
```

### Supported SQL Types

#### Common (all dialects)

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

#### PostgreSQL Arrays

| SQL Type | Decorator | TypeScript Type |
|----------|-----------|-----------------|
| `TEXT[]` | `@column.stringArray()` | `string[]` |
| `INTEGER[]` | `@column.intArray()` | `number[]` |
| `NUMERIC[]` | `@column.numericArray()` | `(number \| null)[]` |
| `BOOLEAN[]` | `@column.booleanArray()` | `(boolean \| null)[]` |
| `TIMESTAMP[]` | `@column.datetimeArray()` | `(Date \| null)[]` |

#### MySQL-specific

| SQL Type | Decorator | TypeScript Type |
|----------|-----------|-----------------|
| `TINYINT(1)` | `@column.boolean()` | `boolean` |

#### Primary Keys

Columns with `PRIMARY KEY` constraints use `@column({ primaryKey: true })`. For UUID primary keys: `@column.uuid({ primaryKey: true })`. Composite primary keys are supported.

### Marker Syntax

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

## CLI Reference

**[Full CLI Reference](./docs/cli-reference.md)** | **[CLI Contract](./cli-contract.yaml)**

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
- agent-contracts-runtime >= 0.32.0 (for `implement` and `audit` commands)

## License

MIT
