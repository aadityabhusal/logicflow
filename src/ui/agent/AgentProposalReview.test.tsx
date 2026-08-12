import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@/lib/agent/types";
import { AgentProposalReview } from "./AgentProposalReview";

const proposal: NonNullable<AgentMessage["proposal"]> = {
  id: "proposal-1",
  diagnostics: [],
  review: {
    operationName: "formatMessage",
    actions: [],
    files: [
      {
        change: "update",
        operationName: "renderMessage",
        parameters: { before: 0, after: 1 },
        statements: { before: 0, after: 2 },
        operationCalls: { before: 0, after: 1 },
        returnType: { before: "undefined", after: "string" },
        generatedSyntax: "valid",
      },
    ],
    packages: { enabled: [], disabled: [] },
    parameters: { before: 0, after: 1 },
    statements: { before: 0, after: 2 },
    operationCalls: { before: 0, after: 1 },
    returnType: { before: "undefined", after: "string" },
    generatedSyntax: "valid" as const,
  },
};

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterAll(() => vi.unstubAllGlobals());

function renderReview(overrides?: {
  active?: boolean;
  stale?: boolean;
  busy?: boolean;
  recoverable?: boolean;
  applicationStatus?: "applied" | "undone" | "unavailable";
  proposal?: NonNullable<AgentMessage["proposal"]>;
  diagnosticFileNames?: (string | undefined)[];
}) {
  const actions = {
    onApply: vi.fn(),
    onReject: vi.fn(),
    onRevise: vi.fn(),
    onRegenerate: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  };
  render(
    <MantineProvider>
      <AgentProposalReview
        proposal={overrides?.proposal ?? proposal}
        active={overrides?.active ?? true}
        stale={overrides?.stale ?? false}
        busy={overrides?.busy ?? false}
        recoverable={overrides?.recoverable ?? true}
        applicationStatus={overrides?.applicationStatus}
        diagnosticFileNames={overrides?.diagnosticFileNames}
        {...actions}
      />
    </MantineProvider>,
  );
  return actions;
}

describe("AgentProposalReview", () => {
  it("renders the native operation review and enables Apply", () => {
    const actions = renderReview();

    expect(
      screen.getByRole("region", { name: "Proposal review" }),
    ).toBeDefined();
    expect(screen.getByText("formatMessage")).toBeDefined();
    expect(screen.getAllByText("undefined to string")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(actions.onApply).toHaveBeenCalledOnce();
  });

  it("renders multi-file and supported package changes without IDs", () => {
    renderReview({
      proposal: {
        id: "proposal-2",
        diagnostics: [
          {
            code: "invalid_call",
            severity: "warning",
            message: "Check the updated call",
            repairable: true,
            fileId: "private-file-id",
          },
          {
            code: "package_warning",
            severity: "warning",
            message: "Review package usage",
            repairable: true,
            packageName: "wretch",
          },
        ],
        review: {
          ...proposal.review!,
          files: [
            {
              change: "update",
              operationName: "newFormatter",
              parameters: { before: 0, after: 1 },
              statements: { before: 0, after: 1 },
              operationCalls: { before: 0, after: 0 },
              returnType: { before: "undefined", after: "string" },
              generatedSyntax: "valid",
            },
            {
              change: "update",
              operationName: "formatMessage",
              parameters: { before: 0, after: 1 },
              statements: { before: 1, after: 2 },
              operationCalls: { before: 0, after: 1 },
              returnType: { before: "string", after: "string" },
              generatedSyntax: "valid",
            },
            {
              change: "update",
              operationName: "oldFormatter",
              parameters: { before: 1, after: 0 },
              statements: { before: 2, after: 0 },
              operationCalls: { before: 1, after: 0 },
              returnType: { before: "string", after: "undefined" },
              generatedSyntax: "valid",
            },
          ],
          packages: { enabled: ["wretch"], disabled: [] },
        },
      },
      diagnosticFileNames: ["formatMessage", undefined],
    });

    expect(
      screen.getByRole("heading", { name: "Propagated caller changes" }),
    ).toBeDefined();
    expect(screen.getByText("update newFormatter")).toBeDefined();
    expect(screen.getByText("formatMessage")).toBeDefined();
    expect(screen.getByText("update oldFormatter")).toBeDefined();
    expect(screen.getByText("wretch")).toBeDefined();
    expect(screen.getByText(/Operation formatMessage:/)).toBeDefined();
    expect(screen.getByText(/Package wretch:/)).toBeDefined();
    expect(screen.getAllByText(/warning:/i)).toHaveLength(2);
    expect(screen.queryByText(/private-file-id/)).toBeNull();
  });

  it("renders generic native action summaries with container labels", () => {
    renderReview({
      proposal: {
        ...proposal,
        review: {
          ...proposal.review!,
          actions: [
            {
              kind: "insert_statement",
              container: "parameters",
              statementName: "input",
            },
            {
              kind: "replace_statement",
              container: "body",
              statementName: "formatted",
            },
            {
              kind: "delete_statement",
              container: "body",
              statementName: "obsolete",
            },
            {
              kind: "move_statement",
              container: "parameters",
              statementName: "suffix",
            },
          ],
        },
      },
    });

    expect(screen.getByText("Insert input in Parameters")).toBeDefined();
    expect(screen.getByText("Replace formatted in Body")).toBeDefined();
    expect(screen.getByText("Delete obsolete in Body")).toBeDefined();
    expect(screen.getByText("Move suffix in Parameters")).toBeDefined();
  });

  it("supports reject, revise, and regenerate without applying", () => {
    const actions = renderReview();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(actions.onReject).toHaveBeenCalledOnce();
    expect(actions.onRevise).toHaveBeenCalledOnce();
    expect(actions.onRegenerate).toHaveBeenCalledOnce();
  });

  it("shows an accessible stale warning", () => {
    renderReview({ stale: true });

    expect(screen.getByRole("alert").textContent).toContain("stale");
  });

  it("disables proposal actions during a run", () => {
    renderReview({ busy: true });

    for (const name of ["Reject", "Revise", "Regenerate", "Apply"]) {
      expect(
        screen.getByRole("button", { name }).hasAttribute("disabled"),
      ).toBe(true);
    }
  });

  it("disables Apply for stale proposals", () => {
    renderReview({ stale: true });
    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("disables Apply but keeps Revise enabled when a diagnostic is repairable", () => {
    renderReview({
      proposal: {
        ...proposal,
        diagnostics: [
          {
            code: "invalid_operation",
            severity: "error",
            message: "The operation is invalid",
            repairable: true,
          },
        ],
      },
    });

    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Revise" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByText(/Apply is unavailable/)).toBeDefined();
  });

  it("disables Apply when the proposal anchor is not recoverable", () => {
    renderReview({ recoverable: false });

    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(/source operation no longer exists/)).toBeDefined();
  });

  it("shows inline undo and redo for applied proposal turns", () => {
    const appliedActions = renderReview({
      active: false,
      applicationStatus: "applied",
      proposal: { ...proposal, applicationId: "application-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(appliedActions.onUndo).toHaveBeenCalledOnce();

    const undoneActions = renderReview({
      active: false,
      applicationStatus: "undone",
      proposal: { ...proposal, applicationId: "application-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(undoneActions.onRedo).toHaveBeenCalledOnce();
  });

  it("does not offer an action when application history is unavailable", () => {
    renderReview({
      active: false,
      applicationStatus: "unavailable",
      proposal: { ...proposal, applicationId: "application-1" },
    });

    expect(screen.getByText("History unavailable")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Undo|Redo/ })).toBeNull();
  });
});
