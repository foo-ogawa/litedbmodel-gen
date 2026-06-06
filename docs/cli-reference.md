# litedbmodel-gen CLI

embedoc-based model code generator for litedbmodel. Parses SQL DDL (PostgreSQL / MySQL / SQLite) and generates TypeScript column definitions that stay in sync with your schema.

**Version:** 0.2.0

## Table of Contents

- [litedbmodel-gen](#litedbmodel-gen)
  - [init](#litedbmodel-gen-init)
  - [audit](#litedbmodel-gen-audit)
  - [implement](#litedbmodel-gen-implement)
  - [insights](#litedbmodel-gen-insights)
  - [agents](#litedbmodel-gen-agents)

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
| `--show-prompt` |  | No | `false` | Output the constructed prompt without calling the LLM API. |
| `--fail-on` |  | No | `"error"` | Minimum finding severity that causes exit code 10. Findings below this threshold are still reported. |
| `--output` | -o | No |  | Write the report to a file instead of stdout. |
| `--report-format` |  | No | `"json"` | Output format for the audit report. |
| `--log-file` | -l | No |  | File path to write structured progress logs. |

#### Exit Codes

**Exit 0:** Audit completed. No findings at or above the --fail-on threshold.

- **stdout:** format=`json`

  | Property | Type | Required | Description |
  |---|---|---|---|
  | `summary` | `string` | Yes | One-paragraph summary of the audit result. |
  | `riskLevel` | `"low" \| "medium" \| "high" \| "critical"` | Yes | Overall risk level reflecting the highest-severity finding. |
  | `findings` | `object[]` | Yes |  |
  | `findings[].id` | `string` | No | Optional stable identifier for the finding. |
  | `findings[].severity` | `"info" \| "warning" \| "error" \| "critical"` | Yes |  |
  | `findings[].category` | `string` | Yes | Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE). |
  | `findings[].target` | `string` | No | Symbol, class, or function where the finding applies. |
  | `findings[].location` | `string` | No | File path and optional line reference. |
  | `findings[].message` | `string` | Yes | Human-readable description of the finding. |
  | `findings[].recommendation` | `string` | No | Actionable fix referencing the correct litedbmodel API. |
  | `findings[].confidence` | `number (min: 0, max: 1)` | No | Model confidence in the finding (0–1). |
  | `findings[].evidence` | `object[]` | No |  |
  | `findings[].evidence[].type` | `string` | Yes | Evidence category (e.g. code_snippet, log_line, metric). |
  | `findings[].evidence[].content` | `string` | Yes | The evidence body. |
  | `findings[].evidence[].source` | `string` | No | File path, URL, or identifier of the evidence source. |
  | `findings[].details` | `object` | No | Arbitrary additional structured detail. |
  | `recommendedActions` | `object[]` | No |  |
  | `recommendedActions[].kind` | `enum(6 values)` | Yes |  |
  | `recommendedActions[].title` | `string` | Yes | Short imperative label for the action. |
  | `recommendedActions[].command` | `string` | No | Shell command to run (for kind=run_command). |
  | `recommendedActions[].target` | `string` | No | File or symbol to edit/review. |
  | `recommendedActions[].rationale` | `string` | No | Why this action is recommended. |
  | `metadata` | `object` | No |  |
  | `metadata.tool` | `string` | No |  |
  | `metadata.command` | `string` | No |  |
  | `metadata.version` | `string` | No |  |
  | `metadata.generatedAt` | `string` | No |  |
  | `metadata.adapter` | `string` | No |  |
  | `metadata.model` | `string` | No |  |

  <details>
  <summary>JSON Schema</summary>

  ```json
  {
    "type": "object",
    "required": [
      "summary",
      "riskLevel",
      "findings"
    ],
    "properties": {
      "summary": {
        "type": "string",
        "description": "One-paragraph summary of the audit result."
      },
      "riskLevel": {
        "type": "string",
        "enum": [
          "low",
          "medium",
          "high",
          "critical"
        ],
        "description": "Overall risk level reflecting the highest-severity finding."
      },
      "findings": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "severity",
            "category",
            "message"
          ],
          "properties": {
            "id": {
              "type": "string",
              "description": "Optional stable identifier for the finding."
            },
            "severity": {
              "type": "string",
              "enum": [
                "info",
                "warning",
                "error",
                "critical"
              ]
            },
            "category": {
              "type": "string",
              "description": "Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE)."
            },
            "target": {
              "type": "string",
              "description": "Symbol, class, or function where the finding applies."
            },
            "location": {
              "type": "string",
              "description": "File path and optional line reference."
            },
            "message": {
              "type": "string",
              "description": "Human-readable description of the finding."
            },
            "recommendation": {
              "type": "string",
              "description": "Actionable fix referencing the correct litedbmodel API."
            },
            "confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Model confidence in the finding (0–1)."
            },
            "evidence": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "type",
                  "content"
                ],
                "properties": {
                  "type": {
                    "type": "string",
                    "description": "Evidence category (e.g. code_snippet, log_line, metric)."
                  },
                  "content": {
                    "type": "string",
                    "description": "The evidence body."
                  },
                  "source": {
                    "type": "string",
                    "description": "File path, URL, or identifier of the evidence source."
                  }
                }
              }
            },
            "details": {
              "type": "object",
              "description": "Arbitrary additional structured detail."
            }
          }
        }
      },
      "recommendedActions": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "kind",
            "title"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "run_command",
                "edit_file",
                "review",
                "confirm",
                "block",
                "ignore"
              ]
            },
            "title": {
              "type": "string",
              "description": "Short imperative label for the action."
            },
            "command": {
              "type": "string",
              "description": "Shell command to run (for kind=run_command)."
            },
            "target": {
              "type": "string",
              "description": "File or symbol to edit/review."
            },
            "rationale": {
              "type": "string",
              "description": "Why this action is recommended."
            }
          }
        }
      },
      "metadata": {
        "type": "object",
        "properties": {
          "tool": {
            "type": "string"
          },
          "command": {
            "type": "string"
          },
          "version": {
            "type": "string"
          },
          "generatedAt": {
            "type": "string"
          },
          "adapter": {
            "type": "string"
          },
          "model": {
            "type": "string"
          }
        }
      }
    }
  }
  ```

  </details>

**Exit 1:** General error (unexpected exception or I/O failure).

- **stderr:** format=`text`

**Exit 3:** Input validation failed (target path not found, no TypeScript files found at path).

- **stderr:** format=`json`

**Exit 10:** Blocking findings detected at or above the --fail-on threshold.

- **stdout:** format=`json`

  | Property | Type | Required | Description |
  |---|---|---|---|
  | `summary` | `string` | Yes | One-paragraph summary of the audit result. |
  | `riskLevel` | `"low" \| "medium" \| "high" \| "critical"` | Yes | Overall risk level reflecting the highest-severity finding. |
  | `findings` | `object[]` | Yes |  |
  | `findings[].id` | `string` | No | Optional stable identifier for the finding. |
  | `findings[].severity` | `"info" \| "warning" \| "error" \| "critical"` | Yes |  |
  | `findings[].category` | `string` | Yes | Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE). |
  | `findings[].target` | `string` | No | Symbol, class, or function where the finding applies. |
  | `findings[].location` | `string` | No | File path and optional line reference. |
  | `findings[].message` | `string` | Yes | Human-readable description of the finding. |
  | `findings[].recommendation` | `string` | No | Actionable fix referencing the correct litedbmodel API. |
  | `findings[].confidence` | `number (min: 0, max: 1)` | No | Model confidence in the finding (0–1). |
  | `findings[].evidence` | `object[]` | No |  |
  | `findings[].evidence[].type` | `string` | Yes | Evidence category (e.g. code_snippet, log_line, metric). |
  | `findings[].evidence[].content` | `string` | Yes | The evidence body. |
  | `findings[].evidence[].source` | `string` | No | File path, URL, or identifier of the evidence source. |
  | `findings[].details` | `object` | No | Arbitrary additional structured detail. |
  | `recommendedActions` | `object[]` | No |  |
  | `recommendedActions[].kind` | `enum(6 values)` | Yes |  |
  | `recommendedActions[].title` | `string` | Yes | Short imperative label for the action. |
  | `recommendedActions[].command` | `string` | No | Shell command to run (for kind=run_command). |
  | `recommendedActions[].target` | `string` | No | File or symbol to edit/review. |
  | `recommendedActions[].rationale` | `string` | No | Why this action is recommended. |
  | `metadata` | `object` | No |  |
  | `metadata.tool` | `string` | No |  |
  | `metadata.command` | `string` | No |  |
  | `metadata.version` | `string` | No |  |
  | `metadata.generatedAt` | `string` | No |  |
  | `metadata.adapter` | `string` | No |  |
  | `metadata.model` | `string` | No |  |

  <details>
  <summary>JSON Schema</summary>

  ```json
  {
    "type": "object",
    "required": [
      "summary",
      "riskLevel",
      "findings"
    ],
    "properties": {
      "summary": {
        "type": "string",
        "description": "One-paragraph summary of the audit result."
      },
      "riskLevel": {
        "type": "string",
        "enum": [
          "low",
          "medium",
          "high",
          "critical"
        ],
        "description": "Overall risk level reflecting the highest-severity finding."
      },
      "findings": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "severity",
            "category",
            "message"
          ],
          "properties": {
            "id": {
              "type": "string",
              "description": "Optional stable identifier for the finding."
            },
            "severity": {
              "type": "string",
              "enum": [
                "info",
                "warning",
                "error",
                "critical"
              ]
            },
            "category": {
              "type": "string",
              "description": "Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE)."
            },
            "target": {
              "type": "string",
              "description": "Symbol, class, or function where the finding applies."
            },
            "location": {
              "type": "string",
              "description": "File path and optional line reference."
            },
            "message": {
              "type": "string",
              "description": "Human-readable description of the finding."
            },
            "recommendation": {
              "type": "string",
              "description": "Actionable fix referencing the correct litedbmodel API."
            },
            "confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Model confidence in the finding (0–1)."
            },
            "evidence": {
              "type": "array",
              "items": {
                "type": "object",
                "required": [
                  "type",
                  "content"
                ],
                "properties": {
                  "type": {
                    "type": "string",
                    "description": "Evidence category (e.g. code_snippet, log_line, metric)."
                  },
                  "content": {
                    "type": "string",
                    "description": "The evidence body."
                  },
                  "source": {
                    "type": "string",
                    "description": "File path, URL, or identifier of the evidence source."
                  }
                }
              }
            },
            "details": {
              "type": "object",
              "description": "Arbitrary additional structured detail."
            }
          }
        }
      },
      "recommendedActions": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "kind",
            "title"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "run_command",
                "edit_file",
                "review",
                "confirm",
                "block",
                "ignore"
              ]
            },
            "title": {
              "type": "string",
              "description": "Short imperative label for the action."
            },
            "command": {
              "type": "string",
              "description": "Shell command to run (for kind=run_command)."
            },
            "target": {
              "type": "string",
              "description": "File or symbol to edit/review."
            },
            "rationale": {
              "type": "string",
              "description": "Why this action is recommended."
            }
          }
        }
      },
      "metadata": {
        "type": "object",
        "properties": {
          "tool": {
            "type": "string"
          },
          "command": {
            "type": "string"
          },
          "version": {
            "type": "string"
          },
          "generatedAt": {
            "type": "string"
          },
          "adapter": {
            "type": "string"
          },
          "model": {
            "type": "string"
          }
        }
      }
    }
  }
  ```

  </details>

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
  dsl_task: audit-litedbmodel-usage
  sideEffects: 
    - network
  sideEffectNote: Makes network calls to the configured LLM provider when adapter is not "mock". Writes to the filesystem only when --output is specified.
  safeDryRunOption: show-prompt
  expectedDurationMs: 120000
  retryableExitCodes: 
    - 1
    - 12
```

---

### implement

Implement a feature using litedbmodel best practices.

Reads the project's model definitions, then implements the described feature directly in the target source file(s), applying litedbmodel best-practice patterns: createMany for batch inserts, upsert with onConflict/onConflictUpdate for idempotent writes, forUpdate for concurrent-safe reads, and DBModel.transaction for multi-step operations. Avoids all eight common litedbmodel anti-patterns. Requires an agentic adapter (claude) that can read and write project files.

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
| `--show-prompt` |  | No | `false` | Output the constructed prompt without calling the LLM API. |
| `--fail-on` |  | No | `"error"` | Minimum finding severity that causes exit code 10. Design concerns (info/warning) are still reported at exit 0. |
| `--output` | -o | No |  | Write the report to a file instead of stdout. |
| `--report-format` |  | No | `"json"` | Output format for the implementation report. |
| `--log-file` | -l | No |  | File path to write structured progress logs. |

#### Exit Codes

**Exit 0:** Implementation written to target files successfully with no design concerns at or above the --fail-on threshold.

- **stdout:** format=`json`


  <details>
  <summary>JSON Schema</summary>

  ```json
  {
    "allOf": [
      {
        "type": "object",
        "required": [
          "summary",
          "riskLevel",
          "findings"
        ],
        "properties": {
          "summary": {
            "type": "string",
            "description": "One-paragraph summary of the audit result."
          },
          "riskLevel": {
            "type": "string",
            "enum": [
              "low",
              "medium",
              "high",
              "critical"
            ],
            "description": "Overall risk level reflecting the highest-severity finding."
          },
          "findings": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "severity",
                "category",
                "message"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Optional stable identifier for the finding."
                },
                "severity": {
                  "type": "string",
                  "enum": [
                    "info",
                    "warning",
                    "error",
                    "critical"
                  ]
                },
                "category": {
                  "type": "string",
                  "description": "Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE)."
                },
                "target": {
                  "type": "string",
                  "description": "Symbol, class, or function where the finding applies."
                },
                "location": {
                  "type": "string",
                  "description": "File path and optional line reference."
                },
                "message": {
                  "type": "string",
                  "description": "Human-readable description of the finding."
                },
                "recommendation": {
                  "type": "string",
                  "description": "Actionable fix referencing the correct litedbmodel API."
                },
                "confidence": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 1,
                  "description": "Model confidence in the finding (0–1)."
                },
                "evidence": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": [
                      "type",
                      "content"
                    ],
                    "properties": {
                      "type": {
                        "type": "string",
                        "description": "Evidence category (e.g. code_snippet, log_line, metric)."
                      },
                      "content": {
                        "type": "string",
                        "description": "The evidence body."
                      },
                      "source": {
                        "type": "string",
                        "description": "File path, URL, or identifier of the evidence source."
                      }
                    }
                  }
                },
                "details": {
                  "type": "object",
                  "description": "Arbitrary additional structured detail."
                }
              }
            }
          },
          "recommendedActions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "kind",
                "title"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "run_command",
                    "edit_file",
                    "review",
                    "confirm",
                    "block",
                    "ignore"
                  ]
                },
                "title": {
                  "type": "string",
                  "description": "Short imperative label for the action."
                },
                "command": {
                  "type": "string",
                  "description": "Shell command to run (for kind=run_command)."
                },
                "target": {
                  "type": "string",
                  "description": "File or symbol to edit/review."
                },
                "rationale": {
                  "type": "string",
                  "description": "Why this action is recommended."
                }
              }
            }
          },
          "metadata": {
            "type": "object",
            "properties": {
              "tool": {
                "type": "string"
              },
              "command": {
                "type": "string"
              },
              "version": {
                "type": "string"
              },
              "generatedAt": {
                "type": "string"
              },
              "adapter": {
                "type": "string"
              },
              "model": {
                "type": "string"
              }
            }
          }
        }
      },
      {
        "type": "object",
        "required": [
          "changedFiles"
        ],
        "properties": {
          "changedFiles": {
            "type": "array",
            "description": "Files that the agent created or modified.",
            "items": {
              "type": "object",
              "required": [
                "path",
                "action"
              ],
              "properties": {
                "path": {
                  "type": "string",
                  "description": "Relative file path that was created or modified."
                },
                "action": {
                  "type": "string",
                  "enum": [
                    "created",
                    "updated"
                  ],
                  "description": "Whether the file was newly created or updated."
                },
                "rationale": {
                  "type": "string",
                  "description": "Why this file was changed."
                }
              }
            }
          },
          "dependencies": {
            "type": "array",
            "description": "npm packages required but not yet in the project.",
            "items": {
              "type": "string"
            }
          },
          "notes": {
            "type": "string",
            "description": "Additional integration instructions."
          }
        }
      }
    ]
  }
  ```

  </details>

**Exit 1:** General error (unexpected exception or I/O failure).

- **stderr:** format=`text`

**Exit 3:** Input validation failed (missing description or unreadable model files).

- **stderr:** format=`json`

**Exit 10:** Implementation written but design concerns at or above the --fail-on threshold were detected.

- **stdout:** format=`json`


  <details>
  <summary>JSON Schema</summary>

  ```json
  {
    "allOf": [
      {
        "type": "object",
        "required": [
          "summary",
          "riskLevel",
          "findings"
        ],
        "properties": {
          "summary": {
            "type": "string",
            "description": "One-paragraph summary of the audit result."
          },
          "riskLevel": {
            "type": "string",
            "enum": [
              "low",
              "medium",
              "high",
              "critical"
            ],
            "description": "Overall risk level reflecting the highest-severity finding."
          },
          "findings": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "severity",
                "category",
                "message"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Optional stable identifier for the finding."
                },
                "severity": {
                  "type": "string",
                  "enum": [
                    "info",
                    "warning",
                    "error",
                    "critical"
                  ]
                },
                "category": {
                  "type": "string",
                  "description": "Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE)."
                },
                "target": {
                  "type": "string",
                  "description": "Symbol, class, or function where the finding applies."
                },
                "location": {
                  "type": "string",
                  "description": "File path and optional line reference."
                },
                "message": {
                  "type": "string",
                  "description": "Human-readable description of the finding."
                },
                "recommendation": {
                  "type": "string",
                  "description": "Actionable fix referencing the correct litedbmodel API."
                },
                "confidence": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 1,
                  "description": "Model confidence in the finding (0–1)."
                },
                "evidence": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": [
                      "type",
                      "content"
                    ],
                    "properties": {
                      "type": {
                        "type": "string",
                        "description": "Evidence category (e.g. code_snippet, log_line, metric)."
                      },
                      "content": {
                        "type": "string",
                        "description": "The evidence body."
                      },
                      "source": {
                        "type": "string",
                        "description": "File path, URL, or identifier of the evidence source."
                      }
                    }
                  }
                },
                "details": {
                  "type": "object",
                  "description": "Arbitrary additional structured detail."
                }
              }
            }
          },
          "recommendedActions": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "kind",
                "title"
              ],
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "run_command",
                    "edit_file",
                    "review",
                    "confirm",
                    "block",
                    "ignore"
                  ]
                },
                "title": {
                  "type": "string",
                  "description": "Short imperative label for the action."
                },
                "command": {
                  "type": "string",
                  "description": "Shell command to run (for kind=run_command)."
                },
                "target": {
                  "type": "string",
                  "description": "File or symbol to edit/review."
                },
                "rationale": {
                  "type": "string",
                  "description": "Why this action is recommended."
                }
              }
            }
          },
          "metadata": {
            "type": "object",
            "properties": {
              "tool": {
                "type": "string"
              },
              "command": {
                "type": "string"
              },
              "version": {
                "type": "string"
              },
              "generatedAt": {
                "type": "string"
              },
              "adapter": {
                "type": "string"
              },
              "model": {
                "type": "string"
              }
            }
          }
        }
      },
      {
        "type": "object",
        "required": [
          "changedFiles"
        ],
        "properties": {
          "changedFiles": {
            "type": "array",
            "description": "Files that the agent created or modified.",
            "items": {
              "type": "object",
              "required": [
                "path",
                "action"
              ],
              "properties": {
                "path": {
                  "type": "string",
                  "description": "Relative file path that was created or modified."
                },
                "action": {
                  "type": "string",
                  "enum": [
                    "created",
                    "updated"
                  ],
                  "description": "Whether the file was newly created or updated."
                },
                "rationale": {
                  "type": "string",
                  "description": "Why this file was changed."
                }
              }
            }
          },
          "dependencies": {
            "type": "array",
            "description": "npm packages required but not yet in the project.",
            "items": {
              "type": "string"
            }
          },
          "notes": {
            "type": "string",
            "description": "Additional integration instructions."
          }
        }
      }
    ]
  }
  ```

  </details>

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
  dsl_task: implement-litedbmodel-feature
  sideEffects: 
    - network
    - filesystem_write
  sideEffectNote: The agent reads project files and writes implementation code directly to the target source file(s). Uses an agentic adapter (claude) with file read/write tools.
  safeDryRunOption: show-prompt
  expectedDurationMs: 120000
  retryableExitCodes: 
    - 1
    - 12
```

---

### insights

Export SQL schema → model file edges as ExternalInsight JSON.

Reads embedoc.config.yaml datasources and maps each SQL DDL table to its generated model file for agent-contracts-analyzer integration.

**Usage:**

```
litedbmodel-gen insights --format json
```
```
litedbmodel-gen insights --format json --project-root .
```
```
litedbmodel-gen insights --format json --config embedoc.config.yaml
```

#### Options

| Option | Aliases | Required | Default | Description |
|---|---|---|---|---|
| `--format` | -f | No | `"json"` | Output format (json only). |
| `--project-root` |  | No | `"."` | Project root directory containing embedoc.config.yaml. |
| `--config` | -c | No |  | Path to embedoc.config.yaml. |

#### Exit Codes

**Exit 0:** ExternalInsight JSON emitted to stdout.

- **stdout:** format=`json`

**Exit 1:** Export failed (config not found, unreadable SQL, or internal error).

- **stderr:** format=`text`

#### Extensions

```yaml
x-agent: 
  riskLevel: low
  requiresConfirmation: false
  idempotent: true
  sideEffects: 

```

---

### agents

Output the full resolved agent DSL as structured data.

Outputs the complete resolved agent-contracts DSL (agents, tasks, workflows, handoff_types) embedded in this CLI binary. Useful for debugging, external tooling integration, and DSL inspection.

**Usage:**

```
litedbmodel-gen agents [--format]
```

#### Options

| Option | Aliases | Required | Default | Description |
|---|---|---|---|---|
| `--format` | -F | No | `"yaml"` | Output format. |

#### Exit Codes

**Exit 0:** DSL output successfully.

- **stdout:** format=`text`

**Exit 1:** Failed to load embedded DSL.

- **stderr:** format=`text`

#### Extensions

```yaml
x-agent: 
  riskLevel: low
  requiresConfirmation: false
  idempotent: true
  sideEffects: 

```

---

---

## Schemas

### AgentEvidence

Type: `object`

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | Yes | Evidence category (e.g. code_snippet, log_line, metric). |
| `content` | `string` | Yes | The evidence body. |
| `source` | `string` | No | File path, URL, or identifier of the evidence source. |

<details>
<summary>JSON Schema</summary>

```json
{
  "type": "object",
  "required": [
    "type",
    "content"
  ],
  "properties": {
    "type": {
      "type": "string",
      "description": "Evidence category (e.g. code_snippet, log_line, metric)."
    },
    "content": {
      "type": "string",
      "description": "The evidence body."
    },
    "source": {
      "type": "string",
      "description": "File path, URL, or identifier of the evidence source."
    }
  }
}
```

</details>

### AgentFinding

Type: `object`

| Property | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | No | Optional stable identifier for the finding. |
| `severity` | `"info" \| "warning" \| "error" \| "critical"` | Yes |  |
| `category` | `string` | Yes | Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE). |
| `target` | `string` | No | Symbol, class, or function where the finding applies. |
| `location` | `string` | No | File path and optional line reference. |
| `message` | `string` | Yes | Human-readable description of the finding. |
| `recommendation` | `string` | No | Actionable fix referencing the correct litedbmodel API. |
| `confidence` | `number (min: 0, max: 1)` | No | Model confidence in the finding (0–1). |
| `evidence` | `object[]` | No |  |
| `evidence[].type` | `string` | Yes | Evidence category (e.g. code_snippet, log_line, metric). |
| `evidence[].content` | `string` | Yes | The evidence body. |
| `evidence[].source` | `string` | No | File path, URL, or identifier of the evidence source. |
| `details` | `object` | No | Arbitrary additional structured detail. |

<details>
<summary>JSON Schema</summary>

```json
{
  "type": "object",
  "required": [
    "severity",
    "category",
    "message"
  ],
  "properties": {
    "id": {
      "type": "string",
      "description": "Optional stable identifier for the finding."
    },
    "severity": {
      "type": "string",
      "enum": [
        "info",
        "warning",
        "error",
        "critical"
      ]
    },
    "category": {
      "type": "string",
      "description": "Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE)."
    },
    "target": {
      "type": "string",
      "description": "Symbol, class, or function where the finding applies."
    },
    "location": {
      "type": "string",
      "description": "File path and optional line reference."
    },
    "message": {
      "type": "string",
      "description": "Human-readable description of the finding."
    },
    "recommendation": {
      "type": "string",
      "description": "Actionable fix referencing the correct litedbmodel API."
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Model confidence in the finding (0–1)."
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "type",
          "content"
        ],
        "properties": {
          "type": {
            "type": "string",
            "description": "Evidence category (e.g. code_snippet, log_line, metric)."
          },
          "content": {
            "type": "string",
            "description": "The evidence body."
          },
          "source": {
            "type": "string",
            "description": "File path, URL, or identifier of the evidence source."
          }
        }
      }
    },
    "details": {
      "type": "object",
      "description": "Arbitrary additional structured detail."
    }
  }
}
```

</details>

### AgentRecommendedAction

Type: `object`

| Property | Type | Required | Description |
|---|---|---|---|
| `kind` | `enum(6 values)` | Yes |  |
| `title` | `string` | Yes | Short imperative label for the action. |
| `command` | `string` | No | Shell command to run (for kind=run_command). |
| `target` | `string` | No | File or symbol to edit/review. |
| `rationale` | `string` | No | Why this action is recommended. |

<details>
<summary>JSON Schema</summary>

```json
{
  "type": "object",
  "required": [
    "kind",
    "title"
  ],
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "run_command",
        "edit_file",
        "review",
        "confirm",
        "block",
        "ignore"
      ]
    },
    "title": {
      "type": "string",
      "description": "Short imperative label for the action."
    },
    "command": {
      "type": "string",
      "description": "Shell command to run (for kind=run_command)."
    },
    "target": {
      "type": "string",
      "description": "File or symbol to edit/review."
    },
    "rationale": {
      "type": "string",
      "description": "Why this action is recommended."
    }
  }
}
```

</details>

### AgentAuditResult

Type: `object`

| Property | Type | Required | Description |
|---|---|---|---|
| `summary` | `string` | Yes | One-paragraph summary of the audit result. |
| `riskLevel` | `"low" \| "medium" \| "high" \| "critical"` | Yes | Overall risk level reflecting the highest-severity finding. |
| `findings` | `object[]` | Yes |  |
| `findings[].id` | `string` | No | Optional stable identifier for the finding. |
| `findings[].severity` | `"info" \| "warning" \| "error" \| "critical"` | Yes |  |
| `findings[].category` | `string` | Yes | Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE). |
| `findings[].target` | `string` | No | Symbol, class, or function where the finding applies. |
| `findings[].location` | `string` | No | File path and optional line reference. |
| `findings[].message` | `string` | Yes | Human-readable description of the finding. |
| `findings[].recommendation` | `string` | No | Actionable fix referencing the correct litedbmodel API. |
| `findings[].confidence` | `number (min: 0, max: 1)` | No | Model confidence in the finding (0–1). |
| `findings[].evidence` | `object[]` | No |  |
| `findings[].evidence[].type` | `string` | Yes | Evidence category (e.g. code_snippet, log_line, metric). |
| `findings[].evidence[].content` | `string` | Yes | The evidence body. |
| `findings[].evidence[].source` | `string` | No | File path, URL, or identifier of the evidence source. |
| `findings[].details` | `object` | No | Arbitrary additional structured detail. |
| `recommendedActions` | `object[]` | No |  |
| `recommendedActions[].kind` | `enum(6 values)` | Yes |  |
| `recommendedActions[].title` | `string` | Yes | Short imperative label for the action. |
| `recommendedActions[].command` | `string` | No | Shell command to run (for kind=run_command). |
| `recommendedActions[].target` | `string` | No | File or symbol to edit/review. |
| `recommendedActions[].rationale` | `string` | No | Why this action is recommended. |
| `metadata` | `object` | No |  |
| `metadata.tool` | `string` | No |  |
| `metadata.command` | `string` | No |  |
| `metadata.version` | `string` | No |  |
| `metadata.generatedAt` | `string` | No |  |
| `metadata.adapter` | `string` | No |  |
| `metadata.model` | `string` | No |  |

<details>
<summary>JSON Schema</summary>

```json
{
  "type": "object",
  "required": [
    "summary",
    "riskLevel",
    "findings"
  ],
  "properties": {
    "summary": {
      "type": "string",
      "description": "One-paragraph summary of the audit result."
    },
    "riskLevel": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ],
      "description": "Overall risk level reflecting the highest-severity finding."
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "severity",
          "category",
          "message"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "Optional stable identifier for the finding."
          },
          "severity": {
            "type": "string",
            "enum": [
              "info",
              "warning",
              "error",
              "critical"
            ]
          },
          "category": {
            "type": "string",
            "description": "Domain-specific vocabulary label (e.g. LOOP_CREATE, N_PLUS_ONE)."
          },
          "target": {
            "type": "string",
            "description": "Symbol, class, or function where the finding applies."
          },
          "location": {
            "type": "string",
            "description": "File path and optional line reference."
          },
          "message": {
            "type": "string",
            "description": "Human-readable description of the finding."
          },
          "recommendation": {
            "type": "string",
            "description": "Actionable fix referencing the correct litedbmodel API."
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Model confidence in the finding (0–1)."
          },
          "evidence": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "type",
                "content"
              ],
              "properties": {
                "type": {
                  "type": "string",
                  "description": "Evidence category (e.g. code_snippet, log_line, metric)."
                },
                "content": {
                  "type": "string",
                  "description": "The evidence body."
                },
                "source": {
                  "type": "string",
                  "description": "File path, URL, or identifier of the evidence source."
                }
              }
            }
          },
          "details": {
            "type": "object",
            "description": "Arbitrary additional structured detail."
          }
        }
      }
    },
    "recommendedActions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "kind",
          "title"
        ],
        "properties": {
          "kind": {
            "type": "string",
            "enum": [
              "run_command",
              "edit_file",
              "review",
              "confirm",
              "block",
              "ignore"
            ]
          },
          "title": {
            "type": "string",
            "description": "Short imperative label for the action."
          },
          "command": {
            "type": "string",
            "description": "Shell command to run (for kind=run_command)."
          },
          "target": {
            "type": "string",
            "description": "File or symbol to edit/review."
          },
          "rationale": {
            "type": "string",
            "description": "Why this action is recommended."
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "tool": {
          "type": "string"
        },
        "command": {
          "type": "string"
        },
        "version": {
          "type": "string"
        },
        "generatedAt": {
          "type": "string"
        },
        "adapter": {
          "type": "string"
        },
        "model": {
          "type": "string"
        }
      }
    }
  }
}
```

</details>

### FileChange

Type: `object`

| Property | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Relative file path that was created or modified. |
| `action` | `"created" \| "updated"` | Yes | Whether the file was newly created or updated. |
| `rationale` | `string` | No | Why this file was changed. |

<details>
<summary>JSON Schema</summary>

```json
{
  "type": "object",
  "required": [
    "path",
    "action"
  ],
  "properties": {
    "path": {
      "type": "string",
      "description": "Relative file path that was created or modified."
    },
    "action": {
      "type": "string",
      "enum": [
        "created",
        "updated"
      ],
      "description": "Whether the file was newly created or updated."
    },
    "rationale": {
      "type": "string",
      "description": "Why this file was changed."
    }
  }
}
```

</details>

### LitedbmodelImplementResult

