# litedbmodel-gen CLI

embedoc-based model code generator for litedbmodel. Parses SQL DDL (PostgreSQL / MySQL / SQLite) and generates TypeScript column definitions that stay in sync with your schema.

**Version:** 0.1.2

## Table of Contents

- [litedbmodel-gen](#litedbmodel-gen)
  - [init](#litedbmodel-gen-init)

---

## litedbmodel-gen

embedoc-based model code generator for litedbmodel.

### Global Options

| Option | Aliases | Required | Default | Description |
|---|---|---|---|---|
| `--version` | -V | No |  | Print version and exit. |
| `--help` | -h | No |  | Show help and exit. |

### init

Set up litedbmodel-gen in an embedoc project.

Registers the sql_schema datasource, litedbmodel_columns renderer, and model.hbs template into an existing embedoc project. Copies the starter Handlebars template, updates .embedoc/renderers/index.ts and .embedoc/datasources/index.ts, and adds a schema datasource entry to embedoc.config.yaml.

**Usage:**

```
litedbmodel-gen init
```
```
litedbmodel-gen init path/to/embedoc.config.yaml
```

#### Arguments

| Name | Required | Description |
|---|---|---|
| `config` | No | Path to embedoc.config.yaml. Defaults to embedoc.config.yaml in the current directory. |

#### Exit Codes

**Exit 0:** litedbmodel-gen set up successfully. Template copied, renderers/datasources registered, and embedoc config updated.

- **stdout:** format=`text`

- **Generated files:**
  - `.embedoc/templates/model.hbs` (text/x-handlebars-template) *(optional)*

**Exit 1:** Setup failed. The embedoc config file was not found or a file operation failed.

- **stderr:** format=`text`

#### Extensions

```yaml
x-agent: 
  riskLevel: low
  requiresConfirmation: false
  idempotent: true
  sideEffects: 
    - file_write
  recommendedBeforeUse: 
    - Run "npx embedoc init" first to create embedoc.config.yaml.
```

---
