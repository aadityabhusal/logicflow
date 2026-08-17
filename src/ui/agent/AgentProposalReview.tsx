import { Button } from "@mantine/core";
import type { AgentMessage } from "@/lib/agent/types";
import type { AgentApplicationStatus } from "@/lib/agent/history";
import type { AgentProposalReviewAction } from "@/lib/agent/proposal";

function describeAction(action: AgentProposalReviewAction) {
  const verb =
    action.kind === "insert_statement"
      ? "Insert"
      : action.kind === "replace_statement"
        ? "Replace"
        : action.kind === "delete_statement"
          ? "Delete"
          : "Move";
  return `${verb} ${action.statementName ?? "statement"} in ${
    action.container === "parameters" ? "Parameters" : "Body"
  }`;
}

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

  return (
    <section
      aria-labelledby={titleId}
      className="mt-2 min-w-0 rounded-xs border p-2 text-sm wrap-anywhere"
    >
      <h2 id={titleId} className="font-medium">
        {active ? "Proposal review" : "Update summary"}
      </h2>
      {review ? (
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          <span className="rounded-full border border-border px-2 py-0.5">
            {active ? "1 operation to change" : "1 operation changed"}
          </span>
          {review.packages.enabled.length > 0 ? (
            <span className="rounded-full border border-border px-2 py-0.5">
              {review.packages.enabled.length} package
              {review.packages.enabled.length === 1 ? "" : "s"} enabled
            </span>
          ) : null}
        </div>
      ) : null}
      {review?.actions.length ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Requested changes</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {review.actions.map((action, index) => (
              <li key={`${action.kind}-${action.statementId ?? index}`}>
                {describeAction(action)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {review ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Operations</h3>
          {review.files.length > 0 ? (
            <p className="mt-1 text-xs text-dimmed">
              Dependent operation calls {active ? "will be" : "were"}{" "}
              synchronized automatically to stay compatible with this change.
            </p>
          ) : null}
          <ul className="mt-1 space-y-1 text-xs">
            <li className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-medium">{review.operationName}</span>
              <span className="text-dimmed">Direct change</span>
            </li>
          </ul>
        </section>
      ) : null}
      {review?.packages &&
      (review.packages.enabled.length > 0 ||
        review.packages.disabled.length > 0) ? (
        <section className="mt-2">
          <h3 className="text-xs font-medium">Packages</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {review.packages.enabled.length > 0
              ? review.packages.enabled.map((packageName) => (
                  <li key={`enabled-${packageName}`}>Enable {packageName}</li>
                ))
              : null}
            {review.packages.disabled.length > 0
              ? review.packages.disabled.map((packageName) => (
                  <li key={`disabled-${packageName}`}>Disable {packageName}</li>
                ))
              : null}
          </ul>
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
