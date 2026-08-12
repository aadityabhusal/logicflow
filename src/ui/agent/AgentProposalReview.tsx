import { Button } from "@mantine/core";
import type { AgentMessage } from "@/lib/agent/types";
import type { AgentApplicationStatus } from "@/lib/agent/history";

export function AgentProposalReview({
  proposal,
  diagnosticFileNames,
  active,
  stale,
  busy,
  recoverable,
  applicationStatus,
  onApply,
  onReject,
  onRevise,
  onRegenerate,
  onUndo,
  onRedo,
}: {
  proposal: NonNullable<AgentMessage["proposal"]>;
  diagnosticFileNames?: (string | undefined)[];
  active: boolean;
  stale: boolean;
  busy: boolean;
  recoverable: boolean;
  applicationStatus?: AgentApplicationStatus;
  onApply: () => void;
  onReject: () => void;
  onRevise: () => void;
  onRegenerate: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { review, diagnostics } = proposal;
  const titleId = `proposal-${proposal.id}-title`;
  const staleId = `proposal-${proposal.id}-stale`;
  const actionStatusId = `proposal-${proposal.id}-action-status`;
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const actionStatus = !recoverable
    ? "Proposal actions are unavailable because the source operation no longer exists."
    : errors.length > 0
      ? "Apply is unavailable until proposal errors are resolved."
      : undefined;

  const renderChanges = (changes: {
    parameters: { before: number; after: number };
    statements: { before: number; after: number };
    operationCalls: { before: number; after: number };
    returnType: { before: string; after: string };
    generatedSyntax?: "valid" | "invalid";
  }) => (
    <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 text-xs">
      <dt>Parameters</dt>
      <dd className="min-w-0 wrap-anywhere">
        {changes.parameters.before} to {changes.parameters.after}
      </dd>
      <dt>Statements</dt>
      <dd className="min-w-0 wrap-anywhere">
        {changes.statements.before} to {changes.statements.after}
      </dd>
      <dt>Operation calls</dt>
      <dd className="min-w-0 wrap-anywhere">
        {changes.operationCalls.before} to {changes.operationCalls.after}
      </dd>
      <dt>Return type</dt>
      <dd className="min-w-0 wrap-anywhere">
        {changes.returnType.before} to {changes.returnType.after}
      </dd>
      <dt>Generated syntax</dt>
      <dd className="min-w-0 wrap-anywhere">
        {changes.generatedSyntax ?? "not applicable"}
      </dd>
    </dl>
  );

  return (
    <section
      aria-labelledby={titleId}
      className="mt-2 min-w-0 rounded-xs border p-2 text-sm wrap-anywhere"
    >
      <h2 id={titleId} className="font-medium">
        Proposal review
      </h2>
      {review?.actions.length ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Requested changes</h3>
          <ul className="mt-1 text-xs">
            {review.actions.map((action, index) => (
              <li key={`${action.kind}-${action.statementId ?? index}`}>
                {action.kind === "insert_statement" && "Insert"}
                {action.kind === "replace_statement" && "Replace"}
                {action.kind === "delete_statement" && "Delete"}
                {action.kind === "move_statement" && "Move"}{" "}
                {action.statementName ?? "statement"} in{" "}
                {action.container === "parameters" ? "Parameters" : "Body"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {review ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Selected operation</h3>
          <div className="text-xs">{review.operationName}</div>
          {renderChanges(review)}
        </section>
      ) : null}
      {review?.files.length ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Propagated caller changes</h3>
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
      ) : null}
      {review?.packages &&
      (review.packages.enabled.length > 0 ||
        review.packages.disabled.length > 0) ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Packages</h3>
          <dl className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 text-xs">
            {review.packages.enabled.length > 0 ? (
              <>
                <dt>Enabled</dt>
                <dd className="min-w-0 wrap-anywhere">
                  {review.packages.enabled.join(", ")}
                </dd>
              </>
            ) : null}
            {review.packages.disabled.length > 0 ? (
              <>
                <dt>Disabled</dt>
                <dd className="min-w-0 wrap-anywhere">
                  {review.packages.disabled.join(", ")}
                </dd>
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
                <span className="font-medium capitalize">
                  {diagnostic.severity}:{" "}
                </span>
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
          id={staleId}
          role="alert"
          className="mt-2 border border-yellow-500/40 bg-yellow-500/10 p-1 text-xs text-yellow-100"
        >
          This proposal is stale because the project changed. Regenerate it
          against the current operation.
        </p>
      ) : null}
      {active && actionStatus ? (
        <p id={actionStatusId} className="mt-2 text-xs text-dimmed">
          {actionStatus}
        </p>
      ) : null}
      {active ? (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          <Button
            size="compact-xs"
            className="min-h-9"
            onClick={onReject}
            disabled={busy}
          >
            Reject
          </Button>
          <Button
            size="compact-xs"
            className="min-h-9"
            onClick={onRevise}
            disabled={busy || !recoverable}
            aria-describedby={!recoverable ? actionStatusId : undefined}
          >
            Revise
          </Button>
          <Button
            size="compact-xs"
            className="min-h-9"
            onClick={onRegenerate}
            disabled={busy || !recoverable}
            aria-describedby={!recoverable ? actionStatusId : undefined}
          >
            Regenerate
          </Button>
          <Button
            size="compact-xs"
            className="min-h-9"
            onClick={onApply}
            aria-describedby={
              stale ? staleId : actionStatus ? actionStatusId : undefined
            }
            disabled={
              busy || stale || !recoverable || !review || errors.length > 0
            }
          >
            Apply
          </Button>
        </div>
      ) : null}
      {!active && proposal.applicationId && applicationStatus ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-dimmed">
          <span>
            {applicationStatus === "applied"
              ? "Applied"
              : applicationStatus === "undone"
                ? "Undone"
                : "History unavailable"}
          </span>
          {applicationStatus !== "unavailable" ? (
            <Button
              size="compact-xs"
              className="min-h-9"
              disabled={busy}
              onClick={applicationStatus === "applied" ? onUndo : onRedo}
            >
              {applicationStatus === "applied" ? "Undo" : "Redo"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
