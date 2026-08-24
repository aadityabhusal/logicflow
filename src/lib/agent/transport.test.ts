import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenAI: vi.fn((_options: unknown) => vi.fn()),
  createAnthropic: vi.fn((_options: unknown) => vi.fn()),
}));

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic,
}));

import {
  AgentTransportError,
  createProviderModel,
  toAgentTransportError,
} from "./transport";

const PROVIDER_KEY_HEADER = "X-LogicFlow-Provider-Key";

function getProviderOptions(provider: "openai" | "anthropic") {
  createProviderModel(provider, "model", "secret-key");
  const factory = {
    openai: mocks.createOpenAI,
    anthropic: mocks.createAnthropic,
  }[provider];
  return factory.mock.calls[0][0] as {
    baseURL: string;
    fetch: typeof fetch;
  };
}

describe("agent provider transport", () => {
  const originalProxyUrl = import.meta.env.VITE_API_PROXY_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete import.meta.env.VITE_API_PROXY_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalProxyUrl) {
      import.meta.env.VITE_API_PROXY_URL = originalProxyUrl;
    } else {
      delete import.meta.env.VITE_API_PROXY_URL;
    }
  });

  it.each([
    ["openai", "/api/ai/openai"],
    ["anthropic", "/api/ai/anthropic"],
  ] as const)("uses the fixed %s proxy route", (provider, expected) => {
    expect(getProviderOptions(provider).baseURL).toBe(expected);
  });

  it("uses the configured proxy base without a trailing slash", () => {
    import.meta.env.VITE_API_PROXY_URL = "https://proxy.example.com/v1/";

    expect(getProviderOptions("openai").baseURL).toBe(
      "https://proxy.example.com/v1/ai/openai"
    );
  });

  it.each([
    ["openai", "authorization"],
    ["anthropic", "x-api-key"],
  ] as const)(
    "replaces %s native credentials with the dedicated header",
    async (provider, nativeHeader) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response());
      vi.stubGlobal("fetch", fetchMock);
      const { baseURL, fetch: providerFetch } = getProviderOptions(provider);

      await providerFetch(`${baseURL}/request`, {
        method: "POST",
        headers: {
          [nativeHeader]: "native-secret",
          "Content-Type": "application/json",
        },
      });

      const headers = fetchMock.mock.calls[0][1].headers as Headers;
      expect(headers.get(PROVIDER_KEY_HEADER)).toBe("secret-key");
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-api-key")).toBeNull();
      expect(headers.get("x-goog-api-key")).toBeNull();
      expect(headers.get("content-type")).toBe("application/json");
    }
  );

  it("blocks requests outside the selected provider route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetch: providerFetch } = getProviderOptions("openai");

    await expect(
      providerFetch("https://api.openai.com/v1/responses")
    ).rejects.toMatchObject({ code: "request_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes cancellation without exposing the original error", () => {
    const error = toAgentTransportError(
      new DOMException("secret detail", "AbortError")
    );

    expect(error).toEqual(
      new AgentTransportError("Request cancelled", "cancelled")
    );
    expect(error.message).not.toContain("secret");
  });

  it("normalizes non-DOM abort errors", () => {
    expect(toAgentTransportError({ name: "AbortError" }).code).toBe(
      "cancelled"
    );
  });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [408, "timeout"],
    [504, "timeout"],
    [503, "unavailable"],
    [400, "request_failed"],
  ] as const)("normalizes HTTP %i errors", (statusCode, code) => {
    expect(toAgentTransportError({ statusCode }).code).toBe(code);
  });

  it("normalizes timeouts", () => {
    expect(toAgentTransportError({ name: "TimeoutError" })).toEqual(
      new AgentTransportError("Provider request timed out", "timeout")
    );
  });

  it("normalizes wrapped provider errors", () => {
    expect(
      toAgentTransportError({
        name: "NoOutputGeneratedError",
        cause: { lastError: { statusCode: 429 } },
      })
    ).toEqual(
      new AgentTransportError("Provider rate limit reached", "rate_limited")
    );
    expect(toAgentTransportError({ cause: { name: "TimeoutError" } })).toEqual(
      new AgentTransportError("Provider request timed out", "timeout")
    );
  });

  it("reports step exhaustion instead of a provider failure", () => {
    expect(
      toAgentTransportError({
        name: "AI_NoObjectGeneratedError",
        finishReason: "tool-calls",
      })
    ).toEqual(
      new AgentTransportError(
        "Agent reached its step limit before completing the proposal. Please retry",
        "request_failed"
      )
    );
  });

  it("reports output that reaches the safe token limit", () => {
    expect(
      toAgentTransportError({
        name: "AI_NoObjectGeneratedError",
        finishReason: "length",
        cause: { name: "AI_TypeValidationError" },
      })
    ).toEqual(
      new AgentTransportError(
        "Provider response exceeded the safe output limit. Please shorten the request",
        "request_failed"
      )
    );
  });

  it("reports invalid structured output instead of a provider failure", () => {
    expect(
      toAgentTransportError({
        name: "AI_NoObjectGeneratedError",
        finishReason: "stop",
      })
    ).toEqual(
      new AgentTransportError(
        "Provider returned an invalid proposal. Please retry",
        "request_failed"
      )
    );
  });
});
