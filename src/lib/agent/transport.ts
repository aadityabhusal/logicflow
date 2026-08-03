import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { AgentProvider } from "./types";

const PROVIDER_ROUTES: Record<AgentProvider, string> = {
  openai: "/ai/openai",
  anthropic: "/ai/anthropic",
  google: "/ai/google",
};

const PROVIDER_KEY_HEADER = "X-LogicFlow-Provider-Key";

export class AgentTransportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "cancelled"
      | "timeout"
      | "unauthorized"
      | "rate_limited"
      | "unavailable"
      | "request_failed"
  ) {
    super(message);
    this.name = "AgentTransportError";
  }
}

function getProviderProxyBase(provider: AgentProvider) {
  const apiBase = (import.meta.env.VITE_API_PROXY_URL || "/api").replace(
    /\/+$/,
    ""
  );
  return `${apiBase}${PROVIDER_ROUTES[provider]}`;
}

function toAbsoluteUrl(url: string) {
  const origin = globalThis.location?.origin || "http://localhost";
  return new URL(url, origin).href;
}

function createProviderProxyFetch(proxyBase: string, apiKey: string) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const inputUrl =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    const expectedUrl = `${toAbsoluteUrl(proxyBase).replace(/\/+$/, "")}/`;
    if (!toAbsoluteUrl(inputUrl).startsWith(expectedUrl)) {
      throw new AgentTransportError(
        "Provider request was blocked because it did not use the configured proxy",
        "request_failed"
      );
    }

    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.delete("authorization");
    headers.delete("x-api-key");
    headers.delete("x-goog-api-key");
    headers.set(PROVIDER_KEY_HEADER, apiKey);

    return fetch(input, { ...init, headers });
  };
}

export function createProviderModel(
  provider: AgentProvider,
  model: string,
  apiKey: string
) {
  const baseURL = getProviderProxyBase(provider);
  const options = {
    apiKey: "proxy",
    baseURL,
    fetch: createProviderProxyFetch(baseURL, apiKey),
  };
  switch (provider) {
    case "openai":
      return createOpenAI(options)(model);
    case "anthropic":
      return createAnthropic(options)(model);
    case "google":
      return createGoogleGenerativeAI(options)(model);
  }
}

export function toAgentTransportError(error: unknown) {
  if (error instanceof AgentTransportError) return error;
  const value = error as {
    name?: string;
    statusCode?: number;
    status?: number;
  };
  if (value?.name === "AbortError") {
    return new AgentTransportError("Request cancelled", "cancelled");
  }
  if (value?.name === "TimeoutError") {
    return new AgentTransportError("Provider request timed out", "timeout");
  }
  const status = value?.statusCode ?? value?.status;
  if (status === 401 || status === 403) {
    return new AgentTransportError(
      "Provider rejected the API key",
      "unauthorized"
    );
  }
  if (status === 429) {
    return new AgentTransportError(
      "Provider rate limit reached",
      "rate_limited"
    );
  }
  if (status && status >= 500) {
    return new AgentTransportError(
      "Provider is temporarily unavailable",
      "unavailable"
    );
  }
  return new AgentTransportError("Provider request failed", "request_failed");
}
