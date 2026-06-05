/**
 * Agent orchestrator for litedbmodel-gen LLM commands.
 *
 * Rules enforced here:
 *  R-IMPL-001 — adapters imported exclusively from agent-contracts-runtime/adapters/*
 *  R-IMPL-002 — all LLM calls go through runTask(); never adapter.send() directly
 *  R-IMPL-006 — runtime dynamic-imported as a single string variable for graceful degradation
 *  R-IMPL-007 — generated registries imported from src/generated/dsl/index.js
 */

import { resolve } from "node:path";
import { resolvedDsl } from "../generated/dsl/dsl-data.js";
import type { AgentConfig, AgentOptions, AgentRunResult, AgentResultData, TaskId } from "./types.js";

export const EXIT_RUNTIME_MISSING = 11;
export const EXIT_ADAPTER_ERROR = 12;

// Single variable — enables graceful degradation (R-IMPL-006).
const PKG = "agent-contracts-runtime";

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Dynamically import the adapter from agent-contracts-runtime/adapters/*.
 * Never create adapter classes directly (R-IMPL-001).
 */
async function createAdapter(
  adapterName: string,
  config: AgentConfig,
): Promise<unknown> {
  const name = adapterName.toLowerCase();

  try {
    switch (name) {
      case "mock": {
        const m = await import(`${PKG}/adapters/mock`);
        return new m.MockAdapter({
          defaultLatencyMs: 0,
          responses: config.mockResponses ?? {},
        });
      }

      case "claude": {
        const m = await import(`${PKG}/adapters/claude-agent-sdk`);
        return new m.ClaudeAgentSdkAdapter({
          ...(config.model ? { model: config.model } : {}),
          ...(config.cwd ? { cwd: config.cwd } : {}),
        });
      }

      case "openai": {
        const m = await import(`${PKG}/adapters/openai-agents-sdk`);
        return new m.OpenAIAgentsSdkAdapter({
          ...(config.model ? { model: config.model } : {}),
        });
      }

      case "gemini": {
        const m = await import(`${PKG}/adapters/adk-sdk`);
        return new m.AdkSdkAdapter({
          apiKey: process.env["GEMINI_API_KEY"],
          ...(config.model ? { model: config.model } : {}),
        });
      }

      default:
        throw Object.assign(
          new Error(`Unknown adapter: "${adapterName}". Valid values: mock, claude, openai, gemini`),
          { exitCode: EXIT_ADAPTER_ERROR },
        );
    }
  } catch (err: unknown) {
    const e = err as { exitCode?: number; message?: string };
    if (e.exitCode === EXIT_ADAPTER_ERROR) throw err;
    // SDK not installed or API key missing
    throw Object.assign(
      new Error(
        `Failed to initialise adapter "${adapterName}": ${e.message ?? String(err)}. ` +
        `Ensure the SDK package is installed and the required API key is set.`,
      ),
      { exitCode: EXIT_ADAPTER_ERROR },
    );
  }
}

// ── DSL context loader ────────────────────────────────────────────────────────

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Execute a litedbmodel-gen agent task.
 *
 * @param userRequest  The full context prompt built by context-builder.ts.
 * @param taskId       One of the two task identifiers in the DSL.
 * @param config       Adapter / model configuration.
 * @param options      showPrompt flag and failOn threshold (used by formatter).
 */
export async function runAgentTask(
  userRequest: string,
  taskId: TaskId,
  config: AgentConfig,
  options: AgentOptions,
): Promise<AgentRunResult> {
  // Dynamic import of agent-contracts-runtime (R-IMPL-006).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runTask: (...args: any[]) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buildTaskPrompt: (...args: any[]) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loadDslContext: (opts: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createProgressSink: (opts: any) => any;

  try {
    const rt = await import(PKG);
    runTask = rt.runTask;
    buildTaskPrompt = rt.buildTaskPrompt;
    loadDslContext = rt.loadDslContext;
    createProgressSink = rt.createProgressSink;
  } catch {
    throw Object.assign(
      new Error(
        "agent-contracts-runtime is not installed. " +
        "Run: npm install --save-dev agent-contracts-runtime",
      ),
      { exitCode: EXIT_RUNTIME_MISSING },
    );
  }

  // Load DSL registries via loadDslContext (R-IMPL-007).
  const ctx = await loadDslContext({
    embeddedDsl: resolvedDsl,
    requiredEntities: {
      tasks: ["audit-litedbmodel-usage", "implement-litedbmodel-feature"],
    },
  });
  const registries = ctx.registries;

  // Show-prompt: build the full prompt (system + user) without calling the LLM.
  if (options.showPrompt) {
    const task = (registries.taskRegistry as Record<string, unknown>)[taskId];
    const targetAgent = (task as { target_agent?: string })?.target_agent;
    const agent = targetAgent
      ? (registries.agentRegistry as Record<string, unknown>)[targetAgent]
      : undefined;

    if (!task || !agent) {
      throw Object.assign(
        new Error(
          `DSL registry missing task "${taskId}" or its target agent. ` +
          `Run: npx agent-runtime generate`,
        ),
        { exitCode: 1 },
      );
    }

    const fullPrompt = buildTaskPrompt(
      agent,
      task,
      { user_request: userRequest },
      { handoffSchemas: registries.handoffSchemas },
    );
    return {
      taskId,
      data: null,
      raw: "",
      prompt: fullPrompt,
      showPrompt: true,
      status: "success",
      followUpsUsed: 0,
      retriesUsed: 0,
    };
  }

  // Create adapter (R-IMPL-001).
  const adapter = await createAdapter(config.adapter ?? "mock", config);

  // Create progress sink for structured logging.
  const progressSink = options.logFile
    ? createProgressSink({ stderr: true, file: resolve(options.logFile), naming: "single" })
    : createProgressSink({ stderr: true });

  // Execute via runTask — never call adapter methods directly (R-IMPL-002).
  let result;
  try {
    result = await runTask(
      adapter,
      taskId,
      { user_request: userRequest },
      {
        maxFollowUps: 3,
        maxRetries: 1,
        progressOutput: progressSink,
        ...registries,
      },
    );
  } finally {
    progressSink.close();
  }

  const { outcome, follow_ups_used, retries_used } = result;

  // Map TaskOutcome → AgentRunResult.
  if (outcome.data !== undefined) {
    // success
    return {
      taskId,
      data: outcome.data as AgentResultData,
      raw: outcome.raw ?? "",
      prompt: userRequest,
      showPrompt: false,
      status: "success",
      followUpsUsed: follow_ups_used,
      retriesUsed: retries_used,
    };
  }

  if (Array.isArray(outcome.errors)) {
    // validation_error
    return {
      taskId,
      data: null,
      raw: outcome.raw ?? "",
      prompt: userRequest,
      showPrompt: false,
      status: "validation_error",
      errorMessage: outcome.errors.join("; "),
      followUpsUsed: follow_ups_used,
      retriesUsed: retries_used,
    };
  }

  if (typeof outcome.reason === "string") {
    // escalation
    return {
      taskId,
      data: null,
      raw: outcome.raw ?? "",
      prompt: userRequest,
      showPrompt: false,
      status: "escalation",
      errorMessage: outcome.reason,
      followUpsUsed: follow_ups_used,
      retriesUsed: retries_used,
    };
  }

  // error
  return {
    taskId,
    data: null,
    raw: "",
    prompt: userRequest,
    showPrompt: false,
    status: "error",
    errorMessage: typeof outcome.message === "string" ? outcome.message : "Unknown agent error",
    followUpsUsed: follow_ups_used,
    retriesUsed: retries_used,
  };
}
