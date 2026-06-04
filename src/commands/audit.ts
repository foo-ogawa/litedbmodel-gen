/**
 * Handler for: litedbmodel-gen audit [target]
 *
 * Audits TypeScript source files that use litedbmodel for the eight
 * canonical ORM anti-patterns, returning structured findings.
 */

import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";

import { buildAuditContext } from "../agents/context-builder.js";
import { runAgentTask, EXIT_RUNTIME_MISSING, EXIT_ADAPTER_ERROR } from "../agents/orchestrator.js";
import {
  computeExitCode,
  formatResultText,
  formatResultJson,
  formatResultYaml,
} from "../agents/formatter.js";
import type { AgentConfig, AgentOptions } from "../agents/types.js";

// ── Option types ──────────────────────────────────────────────────────────────

export interface AuditCommandOpts {
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

export async function commandAudit(
  target: string | undefined,
  opts: AuditCommandOpts,
): Promise<void> {
  const targetPath = resolve(target ?? ".");

  // Validate target path exists.
  if (!existsSync(targetPath)) {
    const err = {
      error: "target_not_found",
      message: `Target path not found: ${targetPath}`,
      target: targetPath,
    };
    if ((opts.reportFormat ?? "json") === "json") {
      process.stderr.write(JSON.stringify(err, null, 2) + "\n");
    } else {
      process.stderr.write(`Error: target path not found: ${targetPath}\n`);
    }
    process.exit(3);
  }

  // Build context prompt (capped at 16 KB).
  const prompt = buildAuditContext({ targetPath });

  // Assemble agent configuration.
  // cwd is set to the target's parent so the agentic adapter can read files.
  const adapterName = opts.adapter ?? "mock";
  const agentConfig: AgentConfig = {
    adapter: adapterName,
    model: opts.model,
    cwd: process.cwd(),
    ...(adapterName === "mock"
      ? {
          mockResponses: {
            "audit-litedbmodel-usage": () =>
              JSON.stringify({
                summary: "Mock audit completed. No issues found.",
                riskLevel: "low",
                findings: [],
                metadata: { tool: "litedbmodel-gen", command: "audit", adapter: "mock" },
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
    result = await runAgentTask(prompt, "audit-litedbmodel-usage", agentConfig, agentOpts);
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
