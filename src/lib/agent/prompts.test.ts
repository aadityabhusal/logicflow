import { describe, expect, it } from "vitest";
import {
  AGENT_SYSTEM_PROMPT_VERSION,
  buildContextPrompt,
  LOGICFLOW_SYSTEM_PROMPT,
} from "./prompts";

describe("agent prompts", () => {
  it("defines the bounded native update flow", () => {
    expect(AGENT_SYSTEM_PROMPT_VERSION).toBe("18");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("AgentOperationUpdate");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("lookup_operations at most once");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("one batch");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("read-only");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("selected operation");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain('package "builtin"');
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("short descriptive phrase");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain(
      "operations needed inside callbacks or predicates"
    );
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain(
      "Every new or replaced statement"
    );
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("operations: []");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain(
      "referenced declaration's statement id"
    );
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain(
      "Operation calls are never statement.data"
    );
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("only the remaining arguments");
    for (const action of [
      "insert_statement",
      "replace_statement",
      "delete_statement",
      "move_statement",
    ]) {
      expect(LOGICFLOW_SYSTEM_PROMPT).toContain(action);
    }
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("propose_changes");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("inspect_context");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("repair");
  });

  it("includes authoritative context and a prior native update for revisions", () => {
    const priorUpdate = {
      explanation: "First draft",
      enablePackages: [],
      changes: [],
    };
    const prompt = buildContextPrompt(
      "Revise it",
      { selectedOperation: { id: "selected" } },
      priorUpdate
    );

    expect(prompt).toContain("Authoritative Current Context");
    expect(prompt).toContain('"id":"selected"');
    expect(prompt).toContain("Prior Native Update For Revision");
    expect(prompt).toContain('"explanation":"First draft"');
    expect(prompt).toContain("one complete AgentOperationUpdate");
  });

  it("does not embed operation or package catalogs", () => {
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("getLength");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("wretch");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("API key");
  });
});
