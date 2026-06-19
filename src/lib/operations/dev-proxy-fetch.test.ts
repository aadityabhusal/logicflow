import { describe, expect, it, vi } from "vitest";
import { fetch } from "./runtime";
import { installDevProxyFetch } from "./dev-proxy-fetch";

describe("dev proxy fetch", () => {
  it("uses the dev proxy from the fetch operation through global fetch", () => {
    const mockFetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", mockFetch);
    installDevProxyFetch();

    fetch("https://api.example.com/users");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy?url=https%3A%2F%2Fapi.example.com%2Fusers",
      undefined
    );

    vi.unstubAllGlobals();
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

    vi.unstubAllGlobals();
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

    vi.unstubAllGlobals();
  });
});
