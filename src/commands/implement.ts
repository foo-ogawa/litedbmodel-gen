/**
 * Handler for: litedbmodel-gen implement <description>
 *
 * Generates TypeScript implementation code for a litedbmodel-based feature,
 * reading model definitions and SQL schema as context. Proactively applies
 * all litedbmodel best-practice patterns to avoid the eight anti-patterns.
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

import { buildImplementContext } from "../agents/context-builder.js";
import { runAgentTask, EXIT_RUNTIME_MISSING, EXIT_ADAPTER_ERROR } from "../agents/orchestrator.js";
import {
  computeExitCode,
  formatResultText,
  formatResultJson,
  formatResultYaml,
} from "../agents/formatter.js";
import type { AgentConfig, AgentOptions } from "../agents/types.js";

// ── Option types ──────────────────────────────────────────────────────────────

export interface ImplementCommandOpts {
  /** Target source file(s) to create or edit */
  target?: string;
  /** Glob pattern for model definition files (default: "models/\*\*\/*.ts") */
  models?: string;
  /** LLM adapter name (default: "mock") */
  adapter?: string;
  /** Model override for the selected adapter */
  model?: string;
  /** Return prompt without calling the LLM */
  showPrompt?: boolean;
  /** Minimum severity that causes exit 10 */
  failOn?: "warning" | "error" | "critical";
  /** Write report to file instead of stdout */
  output?: string;
  /** Output format: json | text | yaml (default: "json") */
  reportFormat?: "json" | "text" | "yaml";
  /** File path to write structured progress logs */
  logFile?: string;
}

// ── Command handler ───────────────────────────────────────────────────────────

export async function commandImplement(
  description: string | undefined,
  opts: ImplementCommandOpts,
): Promise<void> {
  // Validate required description argument.
  if (!description || description.trim().length === 0) {
    const err = {
      error: "missing_description",
      message:
        "A feature description is required. " +
        'Example: litedbmodel-gen implement "Sync order items from API"',
    };
    process.stderr.write(JSON.stringify(err, null, 2) + "\n");
    process.exit(3);
  }

  const cwd = process.cwd();

  // Build context prompt.
  const prompt = buildImplementContext({
    description: description.trim(),
    modelsGlob: opts.models ?? "models/**/*.ts",
    targetPath: opts.target,
    cwd,
  });

  // Assemble agent configuration.
  // cwd is passed so the agentic adapter (claude/cursor) operates
  // in the user's project directory and can read/write files directly.
  const adapterName = opts.adapter ?? "mock";
  const agentConfig: AgentConfig = {
    adapter: adapterName,
    model: opts.model,
    cwd,
    ...(adapterName === "mock"
      ? {
          mockResponses: {
            "implement-litedbmodel-feature": () =>
              JSON.stringify({
                summary: "Mock implementation completed.",
                riskLevel: "low",
                findings: [],
                changedFiles: opts.target
                  ? [{ path: opts.target, action: "updated", rationale: "Mock implementation" }]
                  : [],
                metadata: { tool: "litedbmodel-gen", command: "implement", adapter: "mock" },
              }),
          },
        }
      : {}),
  };

  const agentOpts: AgentOptions = {
    showPrompt: opts.showPrompt ?? false,
    failOn: opts.failOn ?? "error",
    logFile: opts.logFile,
  };

  // Run the agent task.
  let result;
  try {
    result = await runAgentTask(
      prompt,
      "implement-litedbmodel-feature",
      agentConfig,
      agentOpts,
    );
  } catch (err: unknown) {
    const e = err as { exitCode?: number; message?: string };
    const exitCode = e.exitCode ?? 1;

    if (exitCode === EXIT_RUNTIME_MISSING || exitCode === EXIT_ADAPTER_ERROR) {
      const payload = { error: "agent_error", exitCode, message: e.message ?? String(err) };
      process.stderr.write(JSON.stringify(payload, null, 2) + "\n");
      process.exit(exitCode);
    }

    process.stderr.write(`Error: ${e.message ?? String(err)}\n`);
    process.exit(1);
  }

  // Format output.
  const fmt = opts.reportFormat ?? "json";
  let output: string;
  if (fmt === "text") {
    output = formatResultText(result);
  } else if (fmt === "yaml") {
    output = formatResultYaml(result);
  } else {
    output = formatResultJson(result);
  }

  // Write to file or stdout.
  if (opts.output) {
    const outPath = resolve(opts.output);
    writeFileSync(outPath, output + "\n", "utf-8");
    process.stderr.write(`Report written to: ${outPath}\n`);
  } else {
    process.stdout.write(output + "\n");
  }

  process.exit(computeExitCode(result, agentOpts));
}
