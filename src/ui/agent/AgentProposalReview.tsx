import { Button } from "@mantine/core";
import { FaCheck, FaCircleExclamation } from "react-icons/fa6";
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
      className="mt-2 min-w-0 overflow-hidden rounded-xs border border-border bg-dropdown-default/50 text-sm wrap-anywhere"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {!active && applicationStatus === "applied" ? (
            <FaCheck aria-hidden="true" className="shrink-0 text-green-400" />
          ) : null}
          <h2 id={titleId} className="truncate font-medium">
            {active ? "Proposal review" : "Update summary"}
          </h2>
        </div>
        {!active && applicationStatus ? (
          <span className="shrink-0 text-xs text-dimmed">
            {applicationStatus === "applied"
              ? "Applied"
              : applicationStatus === "undone"
                ? "Undone"
                : "History unavailable"}
          </span>
        ) : null}
      </div>
      <div className="space-y-3 px-3 py-2.5">
        {review ? (
          <div>
            <h3 className="text-[11px] font-medium tracking-wide text-dimmed uppercase">
              Operation
            </h3>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-white">
                {review.operationName}
              </span>
              <span className="text-xs text-dimmed">
                {active ? "Will be updated" : "Updated"}
              </span>
            </div>
            {review.files.length > 0 ? (
              <p className="mt-1 text-xs leading-4 text-dimmed">
                Dependent operation calls {active ? "will stay" : "were kept"}{" "}
                compatible automatically.
              </p>
            ) : null}
          </div>
        ) : null}
        {review?.actions.length ? (
          <section className="border-t border-border/70 pt-2.5">
            <h3 className="text-[11px] font-medium tracking-wide text-dimmed uppercase">
              Changes
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs">
              {review.actions.map((action, index) => (
                <li
                  key={`${action.kind}-${action.statementId ?? index}`}
                  className="flex gap-2 before:mt-1.5 before:size-1 before:shrink-0 before:rounded-full before:bg-gray-500"
                >
                  {describeAction(action)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {review?.packages &&
        (review.packages.enabled.length > 0 ||
          review.packages.disabled.length > 0) ? (
          <section className="border-t border-border/70 pt-2.5">
            <h3 className="text-[11px] font-medium tracking-wide text-dimmed uppercase">
              Packages
            </h3>
            <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {review.packages.enabled.length > 0
                ? review.packages.enabled.map((packageName) => (
                    <li
                      key={`enabled-${packageName}`}
                      className="rounded-xs bg-green-400/10 px-1.5 py-0.5 text-green-300"
                    >
                      + {packageName}
                    </li>
                  ))
                : null}
              {review.packages.disabled.length > 0
                ? review.packages.disabled.map((packageName) => (
                    <li
                      key={`disabled-${packageName}`}
                      className="rounded-xs bg-red-400/10 px-1.5 py-0.5 text-red-300"
                    >
                      - {packageName}
                    </li>
                  ))
                : null}
            </ul>
          </section>
        ) : null}
        {diagnostics.length > 0 ? (
          <section className="border-t border-border/70 pt-2.5">
            <h3 className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-dimmed uppercase">
              <FaCircleExclamation aria-hidden="true" /> Diagnostics
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs leading-4">
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
            className="border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-100"
          >
            This proposal is stale because the project changed. Regenerate it
            against the current operation.
          </p>
        ) : null}
        {active && actionStatus ? (
          <p id={actionStatusId} className="text-xs text-dimmed">
            {actionStatus}
          </p>
        ) : null}
        {active ? (
          <div className="flex flex-wrap justify-end gap-1 border-t border-border/70 pt-2.5">
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
      </div>
    </section>
  );
}
