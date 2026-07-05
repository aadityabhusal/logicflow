import { afterEach, describe, expect, it, vi } from "vitest";
import { fetch } from "./operations/runtime";
import { installDevProxyFetch } from "./dev-proxy-fetch";

describe("dev proxy fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the dev proxy from the fetch operation through global fetch", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    fetch("https://api.example.com/users");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy?url=https%3A%2F%2Fapi.example.com%2Fusers",
      undefined
    );
  });

  it("uses the dev proxy from direct global fetch calls", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    globalThis.fetch("https://api.example.com/users");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy?url=https%3A%2F%2Fapi.example.com%2Fusers",
      undefined
    );
  });

  it("leaves same-origin direct global fetch calls unchanged", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    globalThis.fetch(`${window.location.origin}/api/users`);

    expect(mockFetch).toHaveBeenCalledWith(
      `${window.location.origin}/api/users`,
      undefined
    );
  });

  it("proxies URL inputs and forwards init unchanged", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    const init = { cache: "no-store" } as const;
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    globalThis.fetch(new URL("https://api.example.com/users"), init);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy?url=https%3A%2F%2Fapi.example.com%2Fusers",
      init
    );
  });

  it("proxies Request inputs without dropping method, headers, or body", async () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    globalThis.fetch(
      new Request("https://api.example.com/users", {
        method: "POST",
        headers: { "X-Test": "yes" },
        body: "payload",
      })
    );

    const calls = mockFetch.mock.calls as unknown as [[Request]];
    const proxiedRequest = calls[0][0];
    expect(proxiedRequest).toBeInstanceOf(Request);
    expect(proxiedRequest.url).toBe(
      `${window.location.origin}/api/proxy?url=https%3A%2F%2Fapi.example.com%2Fusers`
    );
    expect(proxiedRequest.method).toBe("POST");
    expect(proxiedRequest.headers.get("X-Test")).toBe("yes");
    expect(await proxiedRequest.text()).toBe("payload");
  });

  it("does not proxy non-http URLs", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    globalThis.fetch("mailto:test@example.com");

    expect(mockFetch).toHaveBeenCalledWith(
      "mailto:test@example.com",
      undefined
    );
  });

  it("does not wrap fetch more than once", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);

    installDevProxyFetch();
    installDevProxyFetch();

    globalThis.fetch("https://api.example.com/users");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy?url=https%3A%2F%2Fapi.example.com%2Fusers",
      undefined
    );
  });
});
