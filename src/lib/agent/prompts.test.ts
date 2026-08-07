import { describe, expect, it } from "vitest";
import {
  AGENT_SYSTEM_PROMPT_VERSION,
  LOGICFLOW_SYSTEM_PROMPT,
} from "./prompts";

describe("agent system prompt", () => {
  it("is versioned and directs the model to scoped discovery", () => {
    expect(AGENT_SYSTEM_PROMPT_VERSION).toBe("4");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("Inspect relevant operations");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain(
      "host owns all persistent file and entity IDs"
    );
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("Only the user can Apply");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("untrusted data");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("host-provided catalog");
    expect(LOGICFLOW_SYSTEM_PROMPT).toContain("set_package_enabled");
  });

  it("does not embed operation or package catalogs", () => {
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("getLength");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("wretch");
    expect(LOGICFLOW_SYSTEM_PROMPT).not.toContain("API key");
  });
});
