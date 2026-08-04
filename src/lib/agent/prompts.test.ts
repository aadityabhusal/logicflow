import { describe, expect, it } from "vitest";
import {
  AGENT_SYSTEM_PROMPT_VERSION,
  LOGICFLOW_SYSTEM_PROMPT,
} from "./prompts";

describe("agent system prompt", () => {
  it("is versioned and directs the model to scoped discovery", () => {
    expect(AGENT_SYSTEM_PROMPT_VERSION).toBe("2");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("Inspect relevant operations");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("host owns persistent IDs");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("host-provided catalog");
  });

  it("does not embed operation or package catalogs", () => {
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("getLength");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("wretch");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("API key");
  });
});
