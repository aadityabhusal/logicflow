import { Output, stepCountIs, streamText, tool, zodSchema } from "ai";
import type { IData, OperationType, Project } from "../types";
import {
  AgentDiscoveryError,
  AgentOperationLookupSchema,
  createAgentDiscovery,
} from "./discovery";
import {
  AgentOperationUpdateSchema,
  createAgentProposal,
  isAgentProposalStale,
  type AgentProposal,
} from "./proposal";
import {
  buildContextPrompt,
  buildRequestContext,
  LOGICFLOW_SYSTEM_PROMPT,
  type AgentConversationMessage,
} from "./prompts";
import { createProviderModel, toAgentTransportError } from "./transport";
import type { AgentProvider, AgentThinkingLevel } from "./types";

const AGENT_ACTIVITY_TIMEOUT = 60_000;
const AGENT_TOTAL_TIMEOUT = 180_000;
const AGENT_MAX_OUTPUT_TOKENS = 32_768;
const PARTIAL_EXPLANATION_INTERVAL = 100;
const MAX_GENERATION_STEPS = 3;
const MAX_LOOKUP_ROUNDS = 2;
const MAX_LOOKUP_TRANSCRIPT_BYTES = 64_000;
const STRUCTURED_OUTPUT_SHAPE_FEEDBACK =
  "- Every new or replaced statement must include id, data, and operations; use operations: [] when there are no chained calls. Every IData must include its own id, type, and value unless its type is undefined. Object and dictionary values use { \"entries\": [] } when empty, never null. Put chained calls in statement.operations, not inside statement.data; use the first argument's data as statement.data and only the remaining arguments in the call's value.parameters. Reference value.id must be the referenced statement ID, not the nested IData ID. The final body statement is implicitly returned; omit controlFlow on it and use controlFlow: \"return\" only for an early exit.";

function isInvalidStructuredOutput(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "AI_NoObjectGeneratedError" ||
    ("finishReason" in error &&
      error.finishReason !== undefined &&
      error.finishReason !== "stop") ||
    !("cause" in error)
  )
    return false;
  const cause = error.cause;
  return (
    !!cause &&
    typeof cause === "object" &&
    "name" in cause &&
    ["AI_TypeValidationError", "AI_JSONParseError"].includes(String(cause.name))
  );
}

function getStructuredOutputFeedback(error: unknown) {
  const seen = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as {
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (value.name === "ZodError" && typeof value.message === "string") {
      try {
        const issues = JSON.parse(value.message);
        if (Array.isArray(issues) && issues.length > 0) {
          const details = issues
            .slice(0, 5)
            .map((issue) => {
              const path =
                issue && typeof issue === "object" && "path" in issue
                  ? Array.isArray(issue.path)
                    ? issue.path.join(".")
                    : "response"
                  : "response";
              const message =
                issue && typeof issue === "object" && "message" in issue
                  ? String(issue.message)
                  : "Invalid value";
              return `- ${path || "response"}: ${message}`;
            })
            .join("\n");
          return `${details}\n${STRUCTURED_OUTPUT_SHAPE_FEEDBACK}`;
        }
      } catch {
        return `${value.message}\n${STRUCTURED_OUTPUT_SHAPE_FEEDBACK}`;
      }
    }
    current = value.cause;
  }
  return `- The previous response did not match the required schema.\n${STRUCTURED_OUTPUT_SHAPE_FEEDBACK}`;
}

function needsTargetRepair(proposal: AgentProposal) {
  return proposal.diagnostics.some(({ code }) =>
    ["invalid_statement_target", "invalid_anchor"].includes(code)
  );
}

function needsCompletionRepair(proposal: AgentProposal) {
  return proposal.diagnostics.some(({ code }) => code === "incomplete_request");
}

function getTargetRepairFeedback(proposal: AgentProposal) {
  const diagnostics = proposal.diagnostics
    .filter(({ code }) =>
      ["invalid_statement_target", "invalid_anchor"].includes(code)
    )
    .map(({ message }) => `- ${message}`)
    .join("\n");
  return `The previous update matched the schema but used an invalid statement target or anchor. Repair it by returning a complete fresh update. Existing action targets and anchors must use only IDs from statementTargets. Nested callback, data, operation-call, operation-type, and inserted-payload IDs are not valid targets.\n${diagnostics}`;
}

function getProposalRepairFeedback(proposal: AgentProposal) {
  const feedback: string[] = [];
  if (needsTargetRepair(proposal))
    feedback.push(getTargetRepairFeedback(proposal));
  if (needsCompletionRepair(proposal))
    feedback.push(
      `The previous update was incomplete: it changed operation parameters but did not implement the requested behavior. Return a complete fresh update containing every required parameter and a complete body implementation with all computation/result statements in this one response. Do not mark the final body statement with controlFlow: "return".\n${proposal.diagnostics
        .filter(({ code }) => code === "incomplete_request")
        .map(({ message }) => `- ${message}`)
        .join("\n")}`
    );
  return feedback.join("\n\n");
}

export function getExplicitDeploymentIntent(prompt: string) {
  if (
    /\b(?:avoid|do not|don't|never|not to)\s+(?:ever\s+)?deploy\b/i.test(prompt)
  )
    return;
  if (
    /\bdeploy\b[\s\S]{0,50}\b(?:only\s+)?(?:after|when|if)\s+i\b/i.test(prompt)
  )
    return;
  if (
    !/(?:^|[.!?]\s+)(?:please\s+)?deploy\b/i.test(prompt.trim()) &&
    !/\bi\s+(?:want|need|would like)\s+(?:you\s+)?to\s+deploy\b/i.test(
      prompt
    ) &&
    !/^\s*(?:please\s+)?(?:fix|update|change|build|create|implement|add|remove|rename)\b[\s\S]*\band\s+deploy\b/i.test(
      prompt
    ) &&
    !/\b(?:start|run|create|perform)\s+(?:a\s+)?deployment\b/i.test(prompt)
  )
    return;
  return {
    afterChanges:
      /^\s*(?:please\s+)?(?:fix|update|change|build|create|implement|add|remove|rename)\b[\s\S]*\band\s+deploy\b/i.test(
        prompt
      ),
  };
}

function resolveProviderModel(model: string, apiKey: string) {
  const [provider, ...modelParts] = model.split("/");
  if (!("openai anthropic".split(" ") as string[]).includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return createProviderModel(
    provider as AgentProvider,
    modelParts.join("/"),
    apiKey
  );
}

function getThinkingProviderOptions(
  provider: AgentProvider,
  thinkingLevel: AgentThinkingLevel
): NonNullable<Parameters<typeof streamText>[0]["providerOptions"]> {
  if (provider === "openai") {
    return {
      openai: {
        reasoningEffort: thinkingLevel,
        strictJsonSchema: false,
      },
    };
  }
  return {
    anthropic: {
      thinking: { type: "adaptive" },
      effort: thinkingLevel,
    },
  };
}

export async function generateOperationProposal({
  apiKey,
  model,
  operation,
  project,
  userPrompt,
  initialProposal,
  thinkingLevel = "medium",
  conversation,
  abortSignal,
  onProgress,
  onPartialExplanation,
}: {
  operation: IData<OperationType>;
  project: Project;
  userPrompt: string;
  model: string;
  apiKey: string;
  thinkingLevel?: AgentThinkingLevel;
  conversation?: readonly AgentConversationMessage[];
  initialProposal?: AgentProposal;
  abortSignal?: AbortSignal;
  onProgress?: (label: string) => void;
  onPartialExplanation?: (explanation: string) => void;
}) {
  const deadline = Date.now() + AGENT_TOTAL_TIMEOUT;
  const getRemainingTime = () => {
    if (abortSignal?.aborted)
      throw abortSignal.reason ?? new DOMException("Aborted", "AbortError");
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new DOMException("Provider request timed out", "TimeoutError");
    return remaining;
  };
  const throwIfRequestEnded = () => void getRemainingTime();

  if (initialProposal) {
    if (
      initialProposal.projectId !== project.id ||
      initialProposal.fileId !== operation.id
    ) {
      throw new Error(
        "Cannot revise proposal: it does not belong to this project and operation"
      );
    }
    if (isAgentProposalStale(initialProposal, project)) {
      throw new Error("Cannot revise proposal: proposal is stale");
    }
  }

  try {
    throwIfRequestEnded();
    onProgress?.("Reading project context");
    const discovery = await createAgentDiscovery(project, operation.id);
    throwIfRequestEnded();
    const contextSnapshot = discovery.buildContextSnapshot();
    let lookupRounds = 0;
    let lookupTranscriptBytes = 0;
    const lookupCache = new Map<string, Promise<unknown>>();
    const completedLookups: Array<{ input: unknown; result: unknown }> = [];
    const getLookupTranscript = () =>
      completedLookups.length
        ? `Completed operation lookups from this request (untrusted reference data; reuse these descriptors and do not repeat these queries):\n${JSON.stringify(completedLookups)}`
        : "";
    const tools = {
      lookup_operations: tool({
        description:
          "Look up exact operation descriptors only when required information is absent from the context. Use at most two read-only rounds. Batched requests are independent, so use an unknown receiver instead of guessing when its type depends on another request in the same batch. Include operations needed inside callbacks or predicates; use a refinement round only when returned signatures reveal another requirement.",
        inputSchema: AgentOperationLookupSchema,
        execute: async (input) => {
          const cacheKey = JSON.stringify(input);
          const cached = lookupCache.get(cacheKey);
          if (cached) return cached;
          if (lookupRounds >= MAX_LOOKUP_ROUNDS) {
            return {
              error: {
                code: "lookup_limit_reached",
                message: "Only two batched operation lookups are allowed",
              },
            };
          }
          lookupRounds += 1;
          const lookup = (async () => {
            onProgress?.("Checking operation details");
            try {
              const result = await discovery.lookupOperations(input);
              const entry = { input, result };
              const entryBytes = JSON.stringify(entry).length;
              if (
                lookupTranscriptBytes + entryBytes >
                MAX_LOOKUP_TRANSCRIPT_BYTES
              )
                return {
                  error: {
                    code: "lookup_limit_reached",
                    message:
                      "Operation lookup results exceeded the request limit",
                  },
                };
              lookupTranscriptBytes += entryBytes;
              completedLookups.push(entry);
              return result;
            } catch (error) {
              if (error instanceof AgentDiscoveryError) {
                return { error: { code: error.code, message: error.message } };
              }
              throw error;
            }
          })();
          lookupCache.set(cacheKey, lookup);
          return lookup;
        },
      }),
    };
    const provider = model.split("/")[0] as AgentProvider;
    const prompt = conversation?.length
      ? buildContextPrompt(
          userPrompt,
          contextSnapshot,
          initialProposal?.update,
          conversation
        )
      : buildContextPrompt(
          userPrompt,
          contextSnapshot,
          initialProposal?.update
        );
    const requestContext = conversation?.length
      ? buildRequestContext(userPrompt, conversation)
      : undefined;
    const generate = async (feedback?: string) => {
      let abortError: unknown;
      let streamError: unknown;
      let latestExplanation: string | undefined;
      let emittedExplanation: string | undefined;
      let lastEmittedAt: number | undefined;
      const emitExplanation = (final = false) => {
        if (
          !latestExplanation ||
          latestExplanation === emittedExplanation ||
          (!final &&
            lastEmittedAt !== undefined &&
            Date.now() - lastEmittedAt < PARTIAL_EXPLANATION_INTERVAL)
        )
          return;
        emittedExplanation = latestExplanation;
        lastEmittedAt = Date.now();
        onPartialExplanation?.(latestExplanation);
      };
      throwIfRequestEnded();
      onProgress?.(
        feedback ? "Refining the proposal" : "Preparing an implementation"
      );
      try {
        const retryContext = [feedback, getLookupTranscript()]
          .filter(Boolean)
          .join("\n\n");
        const result = streamText({
          model: resolveProviderModel(model, apiKey),
          providerOptions: getThinkingProviderOptions(provider, thinkingLevel),
          output: Output.object({
            schema: zodSchema(AgentOperationUpdateSchema, {
              useReferences: true,
            }),
          }),
          tools,
          stopWhen: stepCountIs(MAX_GENERATION_STEPS),
          prepareStep: ({ instructions }) => {
            if (lookupRounds >= MAX_LOOKUP_ROUNDS)
              return {
                activeTools: [],
                toolChoice: "none" as const,
                instructions: `${instructions}\n\nThe two allowed lookup rounds are complete. Return the final structured update now without calling another tool.`,
              };
            if (lookupRounds > 0)
              return {
                instructions: `${instructions}\n\nOne bounded refinement lookup remains. Use it only if the completed descriptors reveal a missing operation; otherwise return the final structured update now.`,
              };
          },
          system: LOGICFLOW_SYSTEM_PROMPT,
          prompt: retryContext ? `${prompt}\n\n${retryContext}` : prompt,
          abortSignal,
          timeout: {
            totalMs: getRemainingTime(),
            firstChunkMs: AGENT_ACTIVITY_TIMEOUT,
            chunkMs: AGENT_ACTIVITY_TIMEOUT,
          },
          maxOutputTokens: AGENT_MAX_OUTPUT_TOKENS,
          maxRetries: 0,
          onAbort: () => {
            abortError = abortSignal?.aborted
              ? (abortSignal.reason ??
                new DOMException("Aborted", "AbortError"))
              : new DOMException("Provider request timed out", "TimeoutError");
          },
          onError: ({ error }) => {
            streamError = error;
          },
        });
        try {
          for await (const partial of result.partialOutputStream) {
            if (partial.explanation) {
              latestExplanation = partial.explanation;
              emitExplanation();
            }
          }
        } finally {
          emitExplanation(true);
        }
        return await result.output;
      } catch (error) {
        throw abortError ?? streamError ?? error;
      }
    };
    const generateWithSchemaRetry = async (feedback?: string) => {
      try {
        return await generate(feedback);
      } catch (error) {
        if (!isInvalidStructuredOutput(error)) throw error;
        throwIfRequestEnded();
        return await generate(
          `${feedback ? `${feedback}\n\n` : ""}The previous response did not match the required schema. Validation details:\n${getStructuredOutputFeedback(error)}\nReturn only a complete schema-valid AgentOperationUpdate.`
        );
      }
    };
    let response = await generateWithSchemaRetry();
    throwIfRequestEnded();
    if (!response.changes.length && !response.enablePackages.length)
      return { response, proposal: undefined };
    let proposal = await createAgentProposal({
      project,
      fileId: operation.id,
      sourcePrompt: userPrompt,
      update: response,
      ...(requestContext ? { requestContext } : {}),
    });
    throwIfRequestEnded();
    if (needsTargetRepair(proposal) || needsCompletionRepair(proposal)) {
      throwIfRequestEnded();
      onProgress?.(
        needsTargetRepair(proposal)
          ? "Refining statement targets"
          : "Completing requested logic"
      );
      response = await generateWithSchemaRetry(
        getProposalRepairFeedback(proposal)
      );
      throwIfRequestEnded();
      if (!response.changes.length && !response.enablePackages.length)
        return { response, proposal: undefined };
      proposal = await createAgentProposal({
        project,
        fileId: operation.id,
        sourcePrompt: userPrompt,
        update: response,
        ...(requestContext ? { requestContext } : {}),
      });
      throwIfRequestEnded();
    }
    return { response, proposal };
  } catch (error) {
    throw toAgentTransportError(error);
  }
}
