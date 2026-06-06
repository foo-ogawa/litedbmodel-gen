/**
 * Agent orchestrator for litedbmodel-gen LLM commands.
 *
 * Rules enforced here:
 *  R-IMPL-001 — adapters created exclusively via agent-contracts-runtime executeTask()
 *  R-IMPL-002 — all LLM calls go through executeTask(); never adapter.send() directly
 *  R-IMPL-006 — runtime dynamic-imported for graceful degradation
 *  R-IMPL-007 — generated registries imported from src/generated/dsl/index.js
 */

import { resolvedDsl } from "../generated/dsl/dsl-data.js";
import {
  agentRegistry,
  taskRegistry,
  handoffSchemas,
} from "../generated/dsl/index.js";
import type { AgentConfig, AgentOptions, AgentRunResult, AgentResultData, TaskId } from "./types.js";

export const EXIT_RUNTIME_MISSING = 11;
export const EXIT_ADAPTER_ERROR = 12;

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
  let executeTask: (taskId: string, opts: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buildTaskPrompt: (...args: any[]) => string;

  try {
    const rt = await import("agent-contracts-runtime");
    executeTask = rt.executeTask;
    buildTaskPrompt = rt.buildTaskPrompt;
  } catch {
    throw Object.assign(
      new Error(
        "agent-contracts-runtime is not installed. " +
        "Run: npm install --save-dev agent-contracts-runtime",
      ),
      { exitCode: EXIT_RUNTIME_MISSING },
    );
  }

  // Show-prompt: build the full prompt (system + user) without calling the LLM.
  if (options.showPrompt) {
    const task = (taskRegistry as Record<string, unknown>)[taskId];
    const targetAgent = (task as { target_agent?: string })?.target_agent;
    const agent = targetAgent
      ? (agentRegistry as Record<string, unknown>)[targetAgent]
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
      { handoffSchemas },
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

  // Execute via executeTask — never call adapter methods directly (R-IMPL-002).
  const mockResponses = config.mockResponses;
  let result;
  try {
    result = await executeTask(taskId, {
      request: userRequest,
      adapter: config.adapter ?? "mock",
      model: config.model,
      dsl: resolvedDsl,
      logFile: options.logFile,
      maxFollowUps: 3,
      maxRetries: 1,
      adapterOptions: { cwd: config.cwd },
      ...(mockResponses
        ? {
            hooks: {
              beforeTask: async ({ adapter }) => {
                (adapter as { responses?: typeof mockResponses }).responses = mockResponses;
              },
            },
          }
        : {}),
    });
  } catch (err) {
    throw Object.assign(err as Error, { exitCode: EXIT_ADAPTER_ERROR });
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
