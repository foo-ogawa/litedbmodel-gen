/**
 * Output formatters for litedbmodel-gen LLM command results.
 *
 * Provides:
 *  - computeExitCode()  — maps findings to the standard exit code set
 *  - formatResultText() — human-readable text with severity icons
 *  - formatResultJson() — structured JSON (default report format)
 *  - formatResultYaml() — YAML (uses js-yaml, already a project dependency)
 */

import yaml from "js-yaml";
import type { AgentRunResult, AgentFinding, ImplementResultData, AgentOptions } from "./types.js";

// ── Exit code mapping ─────────────────────────────────────────────────────────

const SEVERITY_ORDER = ["info", "warning", "error", "critical"] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

function severityIndex(s: string): number {
  const idx = SEVERITY_ORDER.indexOf(s as Severity);
  return idx === -1 ? 0 : idx;
}

/**
 * Compute the process exit code from a completed AgentRunResult.
 *
 * Exit codes (standard LLM command convention):
 *  0  — success, no findings at or above --fail-on threshold
 *  1  — general error / escalation / validation failure
 *  10 — blocking findings detected at or above --fail-on threshold
 */
export function computeExitCode(result: AgentRunResult, options: AgentOptions): number {
  if (result.dryRun) return 0;

  if (result.status === "error" || result.status === "escalation" || result.status === "validation_error") {
    return 1;
  }

  if (result.status !== "success" || !result.data) return 1;

  const threshold = severityIndex(options.failOn ?? "error");
  const hasBlocking = result.data.findings.some(
    (f: AgentFinding) => severityIndex(f.severity) >= threshold,
  );

  return hasBlocking ? 10 : 0;
}

// ── Severity icons ────────────────────────────────────────────────────────────

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical": return "✖";
    case "error":    return "✖";
    case "warning":  return "⚠";
    case "info":     return "ℹ";
    default:         return "·";
  }
}

// ── Text formatter ────────────────────────────────────────────────────────────

export function formatResultText(result: AgentRunResult): string {
  if (result.dryRun) {
    return `[DRY RUN — prompt only, LLM was not called]\n\n${result.prompt}`;
  }

  if (result.status !== "success" || !result.data) {
    return (
      `litedbmodel-gen agent error\n` +
      `Status  : ${result.status}\n` +
      `Message : ${result.errorMessage ?? "unknown error"}\n`
    );
  }

  const data = result.data;
  const lines: string[] = [];

  lines.push(`Summary   : ${data.summary}`);
  lines.push(`Risk level: ${data.riskLevel.toUpperCase()}`);

  // Findings
  if (data.findings.length === 0) {
    lines.push("\n✔  No issues found.");
  } else {
    lines.push(`\nFindings (${data.findings.length}):\n`);
    for (const f of data.findings) {
      const icon = severityIcon(f.severity);
      lines.push(`  ${icon} [${f.severity.toUpperCase()}] ${f.category}${f.target ? ` — ${f.target}` : ""}`);
      if (f.location)       lines.push(`       Location      : ${f.location}`);
      lines.push(`       Message       : ${f.message}`);
      if (f.recommendation) lines.push(`       Recommendation: ${f.recommendation}`);
      if (f.confidence !== undefined) {
        lines.push(`       Confidence    : ${Math.round(f.confidence * 100)}%`);
      }
    }
  }

  // Recommended actions
  if (data.recommendedActions && data.recommendedActions.length > 0) {
    lines.push(`\nRecommended Actions:\n`);
    for (const action of data.recommendedActions) {
      lines.push(`  → [${action.kind}] ${action.title}`);
      if (action.command) lines.push(`       $ ${action.command}`);
      if (action.target)  lines.push(`       Target: ${action.target}`);
      if (action.rationale) lines.push(`       ${action.rationale}`);
    }
  }

  // Changed files (implement command only)
  if (isImplementResult(data)) {
    if (data.changedFiles.length > 0) {
      lines.push(`\nChanged Files (${data.changedFiles.length}):\n`);
      for (const file of data.changedFiles) {
        lines.push(`  [${file.action.toUpperCase()}] ${file.path}`);
        if (file.rationale) lines.push(`         ${file.rationale}`);
      }
    }
    if (data.dependencies && data.dependencies.length > 0) {
      lines.push(`\nRequired dependencies:\n  npm install ${data.dependencies.join(" ")}`);
    }
    if (data.notes) {
      lines.push(`\nNotes:\n  ${data.notes}`);
    }
  }

  // Metadata
  if (data.metadata) {
    const m = data.metadata;
    lines.push(
      `\nGenerated at ${m.generatedAt ?? "—"} by ${m.tool ?? "litedbmodel-gen"} ` +
      `(adapter: ${m.adapter ?? "—"}, model: ${m.model ?? "—"})`,
    );
  }

  return lines.join("\n");
}

// ── JSON formatter ────────────────────────────────────────────────────────────

export function formatResultJson(result: AgentRunResult): string {
  if (result.dryRun) {
    return JSON.stringify({ dryRun: true, prompt: result.prompt }, null, 2);
  }
  return JSON.stringify(result.data, null, 2);
}

// ── YAML formatter ────────────────────────────────────────────────────────────

export function formatResultYaml(result: AgentRunResult): string {
  if (result.dryRun) {
    return yaml.dump({ dryRun: true, prompt: result.prompt });
  }
  return yaml.dump(result.data, { lineWidth: 120 });
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isImplementResult(data: AgentRunResult["data"]): data is ImplementResultData {
  return (
    data !== null &&
    typeof data === "object" &&
    "changedFiles" in data &&
    Array.isArray(data.changedFiles)
  );
}
