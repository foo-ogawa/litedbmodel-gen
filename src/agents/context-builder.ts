/**
 * Context builders for litedbmodel-gen LLM commands.
 *
 * These functions build the user-side prompt only. The system message
 * (agent role, API reference, rules, anti-pattern definitions) is
 * defined in the DSL (dsl/agents/*.yaml) and injected by the runtime
 * via buildTaskPrompt / runTask.
 */

// ── audit context builder ─────────────────────────────────────────────────────

/** Options passed from the `audit` command handler. */
export interface AuditContextInput {
  targetPath: string;
}

/**
 * Build the audit user prompt.
 *
 * Instructs the agent to read project files using its tools and audit
 * each litedbmodel usage against the anti-pattern categories defined
 * in the DSL system message.
 */
export function buildAuditContext(input: AuditContextInput): string {
  return [
    "# litedbmodel Code Audit Request",
    `## Target\n\nRead all TypeScript source files at \`${input.targetPath}\` using your file tools. Find every file that imports or uses litedbmodel models, and audit each usage against the eight anti-pattern categories defined in your instructions.`,
  ].join("\n\n");
}

// ── implement context builder ─────────────────────────────────────────────────

/** Options passed from the `implement` command handler. */
export interface ImplementContextInput {
  description: string;
  modelsGlob: string;
  targetPath?: string;
  cwd: string;
}

/**
 * Build the implement user prompt.
 *
 * Instructs the agent to read model definitions, then read and edit
 * the target source file. The agent operates in the project's cwd
 * via the agentic adapter's file tools.
 */
export function buildImplementContext(input: ImplementContextInput): string {
  const lines: string[] = [];

  lines.push("# litedbmodel Implementation Request");
  lines.push("");
  lines.push(`## Feature Description\n\n${input.description}`);
  lines.push("");
  lines.push("## Parameters");
  lines.push("");
  lines.push(`- **Models glob**: \`${input.modelsGlob}\``);
  if (input.targetPath) {
    lines.push(`- **Target file**: \`${input.targetPath}\``);
  }

  return lines.join("\n");
}
