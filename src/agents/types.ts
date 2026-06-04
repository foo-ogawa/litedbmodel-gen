// Agent integration types for litedbmodel-gen LLM commands.
// Hand-written companion to src/generated/dsl/ (which is auto-generated).

// ── Task identifiers ──────────────────────────────────────────────────────────

export type TaskId =
  | "audit-litedbmodel-usage"
  | "implement-litedbmodel-feature";

// ── Configuration & option interfaces ────────────────────────────────────────

export interface AgentConfig {
  /** LLM adapter name: mock | cursor | claude | openai | gemini */
  adapter?: string;
  /** Optional model override for the selected adapter. */
  model?: string;
  /** Sampling temperature (not all adapters honour this). */
  temperature?: number;
  /** Working directory for the agentic adapter (file read/write tools). */
  cwd?: string;
  /** Custom response functions for the mock adapter, keyed by taskId. */
  mockResponses?: Record<string, (userRequest: string) => string>;
}

export interface AgentOptions {
  /** When true, return the constructed prompt without calling the LLM. */
  showPrompt?: boolean;
  /** Minimum finding severity that triggers exit code 10. */
  failOn?: "warning" | "error" | "critical";
  /** File path to write structured progress logs. */
  logFile?: string;
}

// ── Result data shapes ────────────────────────────────────────────────────────
// These mirror cli-contract.yaml#/components/schemas/* and are used for
// in-process typing; the generator-produced types in src/generated/types.ts
// serve the same purpose for the Commander layer.

export interface AgentFinding {
  id?: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  target?: string;
  location?: string;
  message: string;
  recommendation?: string;
  confidence?: number;
  evidence?: Array<{ type: string; content: string; source?: string }>;
  details?: Record<string, unknown>;
}

export interface AgentRecommendedAction {
  kind: "run_command" | "edit_file" | "review" | "confirm" | "block" | "ignore";
  title: string;
  command?: string;
  target?: string;
  rationale?: string;
}

export interface AgentResultMetadata {
  tool?: string;
  command?: string;
  version?: string;
  generatedAt?: string;
  adapter?: string;
  model?: string;
}

/** Base shape — AgentAuditResult (audit command result). */
export interface AuditResultData {
  summary: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: AgentFinding[];
  recommendedActions?: AgentRecommendedAction[];
  metadata?: AgentResultMetadata;
}

export interface FileChange {
  path: string;
  action: "created" | "updated";
  rationale?: string;
}

/** Extended shape — LitedbmodelImplementResult (implement command result). */
export interface ImplementResultData extends AuditResultData {
  changedFiles: FileChange[];
  dependencies?: string[];
  notes?: string;
}

export type AgentResultData = AuditResultData | ImplementResultData;

// ── Run result ────────────────────────────────────────────────────────────────

export interface AgentRunResult {
  taskId: TaskId;
  /** Parsed result data; null when showPrompt or status !== "success". */
  data: AgentResultData | null;
  /** Raw LLM response text. */
  raw: string;
  /** The prompt / context that was sent (or would be sent with --show-prompt). */
  prompt: string;
  showPrompt: boolean;
  status: "success" | "error" | "escalation" | "validation_error";
  errorMessage?: string;
  followUpsUsed: number;
  retriesUsed: number;
}
