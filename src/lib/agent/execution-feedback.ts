import type { AgentExecutionOutcome } from "../execution/controller";
import type { IData, OperationType, Project } from "../types";
import type { AgentExecutionFeedback } from "./types";

const MAX_DEPTH = 4;
const MAX_COLLECTION = 20;
const MAX_STRING = 500;
const MAX_ERRORS = 10;
const MAX_BYTES = 8_000;

export function getAgentExecutionSecrets(
  project: Project,
  providerKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
  }
) {
  return [
    ...Object.values(providerKeys),
    ...(project.deployment?.envVariables.map(({ value }) => value) ?? []),
    ...(project.deployment?.platforms.map(
      ({ credentials }) => credentials?.token
    ) ?? []),
  ].filter((value): value is string => !!value);
}

function createSanitizer(secrets: string[]) {
  const state = { truncated: false };
  const seen = new WeakSet<object>();
  const redact = (value: string) =>
    secrets.reduce(
      (content, secret) => content.replaceAll(secret, "[REDACTED]"),
      value
    );

  const sanitize = (value: unknown, depth = 0): unknown => {
    if (typeof value === "string") {
      const redacted = redact(value);
      if (redacted.length <= MAX_STRING) return redacted;
      state.truncated = true;
      return `${redacted.slice(0, MAX_STRING)}...`;
    }
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number"
    )
      return value;
    if (typeof value === "undefined") return "[undefined]";
    if (typeof value === "bigint") return `[bigint:${value.toString()}]`;
    if (typeof value === "function") return "[function]";
    if (typeof value === "symbol") return "[symbol]";
    if (depth >= MAX_DEPTH) {
      state.truncated = true;
      return "[truncated]";
    }
    if (seen.has(value)) {
      state.truncated = true;
      return "[circular]";
    }
    if (value instanceof Error) return sanitize(value.message, depth + 1);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      state.truncated = true;
      return `[binary:${value.byteLength} bytes]`;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? "[invalid date]"
        : value.toISOString();
    }
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION) state.truncated = true;
      return value
        .slice(0, MAX_COLLECTION)
        .map((item) => sanitize(item, depth + 1));
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_COLLECTION) state.truncated = true;
    return Object.fromEntries(
      entries
        .slice(0, MAX_COLLECTION)
        .map(([key, item]) => [redact(key), sanitize(item, depth + 1)])
    );
  };

  return { sanitize, state };
}

export function createAgentExecutionFeedback({
  outcome,
  operation,
  secrets,
}: {
  outcome: AgentExecutionOutcome;
  operation?: IData<OperationType>;
  secrets: string[];
}): AgentExecutionFeedback {
  if (outcome.status === "not_run") {
    return { status: "not_run", errors: [], truncated: false };
  }
  if (outcome.status === "cancelled") {
    return {
      status: "cancelled",
      reason: outcome.reason,
      errors: [],
      truncated: false,
    };
  }
  const sanitizer = createSanitizer(secrets);
  if (outcome.status === "failed") {
    return {
      status: "failed",
      errors: [{ message: String(sanitizer.sanitize(outcome.error)) }],
      truncated: sanitizer.state.truncated,
    };
  }

  const errors: AgentExecutionFeedback["errors"] = [];
  for (const { data } of outcome.results.values()) {
    if (data?.type.kind !== "error") continue;
    if (errors.length === MAX_ERRORS) {
      sanitizer.state.truncated = true;
      break;
    }
    errors.push({
      type: data.type.errorType,
      message: String(
        sanitizer.sanitize((data.value as { reason: string }).reason)
      ),
    });
  }
  const finalData = [...(operation?.value.statements ?? [])]
    .reverse()
    .map(({ id }) => outcome.results.get(id)?.data)
    .find(Boolean);
  const resultPreview = finalData
    ? sanitizer.sanitize(finalData.value)
    : undefined;
  const feedback: AgentExecutionFeedback = {
    status: errors.length ? "failed" : "succeeded",
    resultType: finalData ? { kind: finalData.type.kind } : undefined,
    resultPreview,
    errors,
    truncated: sanitizer.state.truncated,
  };
  const byteLength = () =>
    new TextEncoder().encode(JSON.stringify(feedback)).byteLength;
  if (byteLength() > MAX_BYTES) {
    feedback.resultPreview = "[truncated]";
    feedback.truncated = true;
  }
  while (byteLength() > MAX_BYTES && feedback.errors.length > 1) {
    feedback.errors.pop();
  }
  return feedback;
}
