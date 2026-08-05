import { Button } from "@mantine/core";
import type { AgentMessage } from "@/lib/agent/types";

export function AgentProposalReview({
  proposal,
  active,
  stale,
  busy,
  recoverable,
  onReject,
  onRevise,
  onRegenerate,
}: {
  proposal: NonNullable<AgentMessage["proposal"]>;
  active: boolean;
  stale: boolean;
  busy: boolean;
  recoverable: boolean;
  onReject: () => void;
  onRevise: () => void;
  onRegenerate: () => void;
}) {
  const { review, diagnostics } = proposal;
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );

  return (
    <div className="mt-2 rounded-xs border p-2 text-sm">
      <div className="font-medium">Proposal review</div>
      {review ? (
        <dl className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
          <dt>Operation</dt>
          <dd>{review.operationName}</dd>
          <dt>Parameters</dt>
          <dd>
            {review.parameters.before} to {review.parameters.after}
          </dd>
          <dt>Statements</dt>
          <dd>
            {review.statements.before} to {review.statements.after}
          </dd>
          <dt>Operation calls</dt>
          <dd>
            {review.operationCalls.before} to {review.operationCalls.after}
          </dd>
          <dt>Return type</dt>
          <dd>
            {review.returnType.before} to {review.returnType.after}
          </dd>
          <dt>Generated syntax</dt>
          <dd>{review.generatedSyntax}</dd>
        </dl>
      ) : null}
      {errors.length > 0 ? (
        <ul className="mt-2 text-xs text-red-300">
          {errors.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
          ))}
        </ul>
      ) : null}
      {active && stale ? (
        <p
          role="alert"
          className="mt-2 border border-yellow-500/40 bg-yellow-500/10 p-1 text-xs text-yellow-100"
        >
          This proposal is stale because the project changed. Regenerate it
          against the current operation.
        </p>
      ) : null}
      {active ? (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          <Button size="compact-xs" onClick={onReject} disabled={busy}>
            Reject
          </Button>
          <Button
            size="compact-xs"
            onClick={onRevise}
            disabled={busy || !recoverable}
          >
            Revise
          </Button>
          <Button
            size="compact-xs"
            onClick={onRegenerate}
            disabled={busy || !recoverable}
          >
            Regenerate
          </Button>
          <Button
            size="compact-xs"
            disabled
            title="Apply becomes available with durable agent history in Phase 4"
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
