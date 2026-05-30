# litedbmodel-gen CLI

embedoc-based model code generator for litedbmodel. Parses SQL DDL (PostgreSQL / MySQL / SQLite) and generates TypeScript column definitions that stay in sync with your schema.

**Version:** 0.2.0

## Table of Contents

- [litedbmodel-gen](#litedbmodel-gen)
  - [init](#litedbmodel-gen-init)
  - [audit](#litedbmodel-gen-audit)
  - [implement](#litedbmodel-gen-implement)

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

**Exit 1:** Setup failed due to an unexpected file operation error.

- **stderr:** format=`text`

**Exit 3:** Input validation failed. The specified embedoc.config.yaml path was not found. Run "npx embedoc init" first.

- **stderr:** format=`json`

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

### audit

Audit litedbmodel usage code for common anti-patterns.

Scans TypeScript source files that import or use litedbmodel models, detecting anti-patterns such as loop-insert (use createMany), delete-then-reinsert (use upsert), N+1 queries, missing idempotency guards, missing UNIQUE constraints for onConflict, over-broad deletes, and missing forUpdate in concurrent-write paths. Returns structured findings with severity ratings and remediation guidance referencing the correct litedbmodel API.

**Usage:**

```
litedbmodel-gen audit
```
```
litedbmodel-gen audit src/
```
```
litedbmodel-gen audit src/services/user-service.ts --fail-on warning --report-format text
```

#### Arguments

| Name | Required | Description |
|---|---|---|
| `target` | No | File or directory path to audit. Defaults to the current working directory. |

#### Options

| Option | Aliases | Required | Default | Description |
|---|---|---|---|---|
| `--adapter` |  | No | `"mock"` | LLM adapter to use for the audit. |
| `--model` |  | No |  | Model name override for the selected adapter. |
| `--dry-run` |  | No | `false` | Output the constructed prompt without calling the LLM. |
| `--fail-on` |  | No | `"error"` | Minimum finding severity that causes exit code 10. Findings below this threshold are still reported. |
| `--output` | -o | No |  | Write the report to a file instead of stdout. |
| `--report-format` |  | No | `"json"` | Output format for the audit report. |

#### Exit Codes

**Exit 0:** Audit completed. No findings at or above the --fail-on threshold.

- **stdout:** format=`json`

**Exit 1:** General error (unexpected exception or I/O failure).

- **stderr:** format=`text`

**Exit 3:** Input validation failed (target path not found, no TypeScript files found at path).

- **stderr:** format=`json`

**Exit 10:** Blocking findings detected at or above the --fail-on threshold.

- **stdout:** format=`json`

**Exit 11:** agent-contracts-runtime package is not installed.

- **stderr:** format=`json`

**Exit 12:** Adapter initialization failed (missing API key or invalid configuration).

- **stderr:** format=`json`

#### Extensions

```yaml
x-agent: 
  riskLevel: low
  requiresConfirmation: false
  idempotent: true
  sideEffects: 
    - network
  sideEffectNote: Makes network calls to the configured LLM provider when adapter is not "mock". Writes to the filesystem only when --output is specified.
  safeDryRunOption: dry-run
  expectedDurationMs: 120000
  retryableExitCodes: 
    - 1
    - 12
```

---

### implement

Implement a feature using litedbmodel best practices.

Reads the project's model definitions, then implements the described feature directly in the target source file(s), applying litedbmodel best-practice patterns: createMany for batch inserts, upsert with onConflict/onConflictUpdate for idempotent writes, forUpdate for concurrent-safe reads, and DBModel.transaction for multi-step operations. Avoids all eight common litedbmodel anti-patterns. Requires an agentic adapter (claude/cursor) that can read and write project files.

**Usage:**

```
litedbmodel-gen implement "Add syncNutrientSummary in src/services/meal.service.ts" --target src/services/meal.service.ts --models "src/models/**/*.ts" --adapter claude
```
```
litedbmodel-gen implement "Add bulk upsert for order items" --target src/services/order.service.ts --adapter claude
```

#### Arguments

| Name | Required | Description |
|---|---|---|
| `description` | Yes | Natural-language description of the feature to implement. Should specify the function name, target file, and business logic. |

#### Options

| Option | Aliases | Required | Default | Description |
|---|---|---|---|---|
| `--target` | -t | No |  | Target source file(s) to create or edit. The agent reads these files to understand existing code and writes the implementation to them. |
| `--models` |  | No | `"models/**/*.ts"` | Glob pattern for model definition files. The agent reads these to understand available models, columns, and relations. |
| `--adapter` |  | No | `"mock"` | LLM adapter to use for code generation. |
| `--model` |  | No |  | Model name override for the selected adapter. |
| `--dry-run` |  | No | `false` | Output the constructed prompt without calling the LLM. |
| `--fail-on` |  | No | `"error"` | Minimum finding severity that causes exit code 10. Design concerns (info/warning) are still reported at exit 0. |
| `--output` | -o | No |  | Write the report to a file instead of stdout. |
| `--report-format` |  | No | `"json"` | Output format for the implementation report. |

#### Exit Codes

**Exit 0:** Implementation written to target files successfully with no design concerns at or above the --fail-on threshold.

- **stdout:** format=`json`

**Exit 1:** General error (unexpected exception or I/O failure).

- **stderr:** format=`text`

**Exit 3:** Input validation failed (missing description or unreadable model files).

- **stderr:** format=`json`

**Exit 10:** Implementation written but design concerns at or above the --fail-on threshold were detected.

- **stdout:** format=`json`

**Exit 11:** agent-contracts-runtime package is not installed.

- **stderr:** format=`json`

**Exit 12:** Adapter initialization failed (missing API key or invalid configuration).

- **stderr:** format=`json`

#### Extensions

```yaml
x-agent: 
  riskLevel: high
  requiresConfirmation: true
  idempotent: false
  sideEffects: 
    - network
    - filesystem_write
  sideEffectNote: The agent reads project files and writes implementation code directly to the target source file(s). Uses an agentic adapter (claude/cursor) with file read/write tools.
  safeDryRunOption: dry-run
  expectedDurationMs: 120000
  retryableExitCodes: 
    - 1
    - 12
```

---
