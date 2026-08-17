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

const AGENT_STEP_TIMEOUT = 60_000;
const MAX_GENERATION_STEPS = 2;
const STRUCTURED_OUTPUT_SHAPE_FEEDBACK =
  "- Every new or replaced statement must include id, data, and operations; use operations: [] when there are no chained calls. Every IData must include its own id, type, and value unless its type is undefined. Put chained calls in statement.operations, not inside statement.data; use the first argument's data as statement.data and only the remaining arguments in the call's value.parameters. Reference value.id must be the referenced statement ID, not the nested IData ID. The final body statement is implicitly returned; omit controlFlow on it and use controlFlow: \"return\" only for an early exit.";

function isInvalidStructuredOutput(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "AI_NoObjectGeneratedError" ||
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

  onProgress?.("Reading project context");
  const discovery = await createAgentDiscovery(project, operation.id);
  const contextSnapshot = discovery.buildContextSnapshot();
  let lookupUsed = false;
  const tools = {
    lookup_operations: tool({
      description:
        "Look up exact operation descriptors only when required information is absent from the context. Submit all queries in this one read-only call, including operations needed inside callbacks or predicates.",
      inputSchema: AgentOperationLookupSchema,
      execute: async (input) => {
        if (lookupUsed) {
          return {
            error: {
              code: "lookup_limit_reached",
              message: "Only one batched operation lookup is allowed",
            },
          };
        }
        lookupUsed = true;
        onProgress?.("Checking operation details");
        try {
          return await discovery.lookupOperations(input);
        } catch (error) {
          if (error instanceof AgentDiscoveryError) {
            return { error: { code: error.code, message: error.message } };
          }
          throw error;
        }
      },
    }),
  };
  try {
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
      let streamError: unknown;
      lookupUsed = false;
      onProgress?.(
        feedback ? "Refining the proposal" : "Preparing an implementation"
      );
      try {
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
          prepareStep: ({ instructions }) =>
            lookupUsed
              ? {
                  activeTools: [],
                  toolChoice: "none" as const,
                  instructions: `${instructions}\n\nThe one allowed lookup is complete. Return the final structured update now without calling another tool.`,
                }
              : undefined,
          system: LOGICFLOW_SYSTEM_PROMPT,
          prompt: feedback ? `${prompt}\n\n${feedback}` : prompt,
          abortSignal,
          timeout: { stepMs: AGENT_STEP_TIMEOUT },
          maxRetries: 0,
          onError: ({ error }) => {
            streamError = error;
          },
        });
        for await (const partial of result.partialOutputStream) {
          if (partial.explanation) onPartialExplanation?.(partial.explanation);
        }
        return await result.output;
      } catch (error) {
        throw streamError ?? error;
      }
    };
    const generateWithSchemaRetry = async (feedback?: string) => {
      try {
        return await generate(feedback);
      } catch (error) {
        if (!isInvalidStructuredOutput(error)) throw error;
        return await generate(
          `${feedback ? `${feedback}\n\n` : ""}The previous response did not match the required schema. Validation details:\n${getStructuredOutputFeedback(error)}\nReturn only a complete schema-valid AgentOperationUpdate.`
        );
      }
    };
    let response = await generateWithSchemaRetry();
    if (!response.changes.length && !response.enablePackages.length)
      return { response, proposal: undefined };
    let proposal = await createAgentProposal({
      project,
      fileId: operation.id,
      sourcePrompt: userPrompt,
      update: response,
      ...(requestContext ? { requestContext } : {}),
    });
    if (needsTargetRepair(proposal) || needsCompletionRepair(proposal)) {
      onProgress?.(
        needsTargetRepair(proposal)
          ? "Refining statement targets"
          : "Completing requested logic"
      );
      response = await generateWithSchemaRetry(
        getProposalRepairFeedback(proposal)
      );
      if (!response.changes.length && !response.enablePackages.length)
        return { response, proposal: undefined };
      proposal = await createAgentProposal({
        project,
        fileId: operation.id,
        sourcePrompt: userPrompt,
        update: response,
        ...(requestContext ? { requestContext } : {}),
      });
    }
    return { response, proposal };
  } catch (error) {
    throw toAgentTransportError(error);
  }
}
