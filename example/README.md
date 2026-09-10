# litedbmodel-gen example

This example shows the result of running litedbmodel-gen with embedoc.

## Structure

```
example/
├── db/
│   └── schema.sql                    # Source DDL
├── embedoc.config.yaml               # embedoc configuration
├── .embedoc/
│   ├── datasources/index.ts          # sql_schema datasource registered
│   ├── renderers/index.ts            # litedbmodel_columns renderer registered
│   └── templates/model.hbs           # Handlebars template for new models
└── models/
    ├── User.ts                       # Generated + hand-written relations
    ├── Post.ts                       # Generated + hand-written relations
    ├── PostTag.ts                    # Generated (composite PK)
    └── Tag.ts                        # Generated
```

## How it was created

```bash
# 1. Initialize embedoc
npx embedoc init

# 2. Install litedbmodel-gen and run init
npm install -D litedbmodel-gen
npx litedbmodel-gen init

# 3. Edit embedoc.config.yaml to point to db/schema.sql

# 4. Generate model files from schema
npx embedoc generate --datasource schema

# 5. Fill in column definitions
npx embedoc build

# 6. Hand-edit: add relations, custom code outside markers
```

## Updating after schema changes

When `db/schema.sql` changes, run:

```bash
npx embedoc build
```

Only the column definitions inside `/*@embedoc:litedbmodel_columns*/` markers are updated.
Hand-written relations and exports outside the markers are preserved.

## Requirements

The generated models use `@column()` and the typed families litedbmodel 1.2 provides
(`@column.bigint()`, `@column.datetime()`, …), and declare the types litedbmodel 1.2 reads back —
`number` for an integer, `Date` for a datetime. That is **litedbmodel 1.2**. Refresh
`package-lock.json` after installing it:

```bash
npm install
npm run typecheck
```
