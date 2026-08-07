import { Button } from "@mantine/core";
import type { AgentMessage } from "@/lib/agent/types";

export function AgentProposalReview({
  proposal,
  diagnosticFileNames,
  active,
  stale,
  busy,
  recoverable,
  onApply,
  onReject,
  onRevise,
  onRegenerate,
}: {
  proposal: NonNullable<AgentMessage["proposal"]>;
  diagnosticFileNames?: (string | undefined)[];
  active: boolean;
  stale: boolean;
  busy: boolean;
  recoverable: boolean;
  onApply: () => void;
  onReject: () => void;
  onRevise: () => void;
  onRegenerate: () => void;
}) {
  const { review, diagnostics } = proposal;
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );

  const renderChanges = (changes: {
    parameters: { before: number; after: number };
    statements: { before: number; after: number };
    operationCalls: { before: number; after: number };
    returnType: { before: string; after: string };
    generatedSyntax?: "valid" | "invalid";
  }) => (
    <dl className="grid grid-cols-2 gap-x-2 text-xs">
      <dt>Parameters</dt>
      <dd>
        {changes.parameters.before} to {changes.parameters.after}
      </dd>
      <dt>Statements</dt>
      <dd>
        {changes.statements.before} to {changes.statements.after}
      </dd>
      <dt>Operation calls</dt>
      <dd>
        {changes.operationCalls.before} to {changes.operationCalls.after}
      </dd>
      <dt>Return type</dt>
      <dd>
        {changes.returnType.before} to {changes.returnType.after}
      </dd>
      <dt>Generated syntax</dt>
      <dd>{changes.generatedSyntax ?? "not applicable"}</dd>
    </dl>
  );

  return (
    <div className="mt-2 rounded-xs border p-2 text-sm">
      <div className="font-medium">Proposal review</div>
      {review?.files ? (
        review.files.length > 0 ? (
          <section className="mt-2">
            <h3 className="text-xs font-medium">Affected operations</h3>
            <ul className="mt-1 space-y-2">
              {review.files.map((file, index) => (
                <li key={`${file.change}-${file.operationName}-${index}`}>
                  <div className="text-xs font-medium capitalize">
                    {file.change} {file.operationName}
                  </div>
                  {renderChanges(file)}
                </li>
              ))}
            </ul>
          </section>
        ) : null
      ) : review ? (
        <section className="mt-1">
          <h3 className="text-xs font-medium">Operation</h3>
          <div className="text-xs">{review.operationName}</div>
          {renderChanges(review)}
        </section>
      ) : null}
      {review?.packages &&
      (review.packages.enabled.length > 0 ||
        review.packages.disabled.length > 0) ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Supported packages</h3>
          <dl className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
            {review.packages.enabled.length > 0 ? (
              <>
                <dt>Enabled</dt>
                <dd>{review.packages.enabled.join(", ")}</dd>
              </>
            ) : null}
            {review.packages.disabled.length > 0 ? (
              <>
                <dt>Disabled</dt>
                <dd>{review.packages.disabled.join(", ")}</dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}
      {diagnostics.length > 0 ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Diagnostics</h3>
          <ul className="mt-1 text-xs">
            {diagnostics.map((diagnostic, index) => (
              <li
                key={`${diagnostic.code}-${index}`}
                className={
                  diagnostic.severity === "error"
                    ? "text-red-300"
                    : "text-yellow-100"
                }
              >
                {diagnosticFileNames?.[index]
                  ? `Operation ${diagnosticFileNames[index]}: `
                  : diagnostic.packageName
                    ? `Package ${diagnostic.packageName}: `
                    : ""}
                {diagnostic.message}
              </li>
            ))}
          </ul>
        </section>
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
            onClick={onApply}
            disabled={
              busy || stale || !recoverable || !review || errors.length > 0
            }
          >
            Apply
          </Button>
        </div>
      ) : null}
      {!active && proposal.applicationId ? (
        <p className="mt-2 text-xs text-dimmed">Applied previously</p>
      ) : null}
    </div>
  );
}
