import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPlatformFetch,
  parseError,
  formatRelativeTime,
  prefixNpmImports,
} from "@/lib/deployment/utils";

describe("formatRelativeTime", () => {
  const now = Date.now();
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  it.each([
    [now - 30_000, "just now"],
    [now, "just now"],
    [now - MINUTE, "1m ago"],
    [now - 5 * MINUTE, "5m ago"],
    [now - HOUR, "1h ago"],
    [now - 12 * HOUR, "12h ago"],
    [now - DAY, "1d ago"],
    [now - 3 * DAY, "3d ago"],
    [now + 10_000, "just now"],
  ])("formats timestamp %i as '%s'", (timestamp, expected) => {
    expect(formatRelativeTime(timestamp)).toBe(expected);
  });
});

describe("prefixNpmImports", () => {
  it("prefixes bare npm specifiers", () => {
    const files = [
      { path: "src/ops.js", content: 'import { pipe } from "remeda";' },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toContain('from "npm:remeda"');
  });

  it("skips relative imports", () => {
    const files = [
      { path: "src/ops.js", content: 'import { foo } from "./utils";' },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toContain('from "./utils"');
  });

  it("skips already-prefixed npm imports", () => {
    const files = [
      { path: "src/ops.js", content: 'import { pipe } from "npm:remeda";' },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toContain('from "npm:remeda"');
  });

  it("handles @scoped packages", () => {
    const files = [
      {
        path: "src/ops.js",
        content: 'import { createClient } from "@supabase/supabase-js";',
      },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toContain('from "npm:@supabase/supabase-js"');
  });

  it("converts single-quoted imports to double-quoted npm prefix", () => {
    const files = [
      { path: "src/ops.js", content: "import { pipe } from 'remeda';" },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toContain('from "npm:remeda"');
  });

  it("handles multiple imports in one file", () => {
    const files = [
      {
        path: "src/ops.js",
        content:
          'import { pipe } from "remeda";\nimport wretch from "wretch";\nimport { foo } from "./local";',
      },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toContain('from "npm:remeda"');
    expect(result[0].content).toContain('from "npm:wretch"');
    expect(result[0].content).toContain('from "./local"');
  });

  it("does not match imports with extra whitespace between from and quote", () => {
    const files = [
      { path: "src/ops.js", content: 'import { pipe } from   "remeda" ;' },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toBe('import { pipe } from   "remeda" ;');
  });

  it("returns empty array for empty input", () => {
    expect(prefixNpmImports([])).toEqual([]);
  });

  it("preserves file path property", () => {
    const files = [{ path: "src/ops.js", content: 'from "remeda"' }];
    const result = prefixNpmImports(files);
    expect(result[0].path).toBe("src/ops.js");
  });

  it("leaves file with no imports unchanged", () => {
    const files = [
      { path: "src/ops.js", content: "const x = 42;\nexport default x;" },
    ];
    const result = prefixNpmImports(files);
    expect(result[0].content).toBe("const x = 42;\nexport default x;");
  });
});

describe("parseError", () => {
  it.each([
    ["extracts message field", { message: "Not found" }, 404, "Not found"],
    ["falls back to error field", { error: "Bad request" }, 400, "Bad request"],
    ["falls back to msg field", { msg: "Too large" }, 413, "Too large"],
    ["falls back to HTTP status", { details: "info" }, 422, "HTTP 422"],
    ["handles empty JSON object", {}, 418, "HTTP 418"],
  ])("%s from JSON body", async (_, body, status, expected) => {
    const response = new Response(JSON.stringify(body), { status });
    expect(await parseError(response)).toBe(expected);
  });

  it("prioritizes message over error when both present", async () => {
    const response = new Response(
      JSON.stringify({ message: "msg", error: "err" }),
      { status: 400 }
    );
    expect(await parseError(response)).toBe("msg");
  });

  it("falls back from empty string message to error field", async () => {
    const response = new Response(
      JSON.stringify({ message: "", error: "fallback" }),
      { status: 400 }
    );
    expect(await parseError(response)).toBe("fallback");
  });

  it("returns HTTP {status}: {statusText} when body is not valid JSON", async () => {
    const response = new Response("not json", {
      status: 500,
      statusText: "Internal Server Error",
    });
    expect(await parseError(response)).toBe("HTTP 500: Internal Server Error");
  });

  it("returns HTTP {status}: {statusText} when body is empty string", async () => {
    const response = new Response("", {
      status: 502,
      statusText: "Bad Gateway",
    });
    expect(await parseError(response)).toBe("HTTP 502: Bad Gateway");
  });
});

describe("createPlatformFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a function", () => {
    const fetchFn = createPlatformFetch("/api/test");
    expect(typeof fetchFn).toBe("function");
  });

  it("calls fetch with proxyBase + path", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    await fetchFn("/v1/resource", "token123");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test/v1/resource",
      expect.any(Object)
    );
  });

  it("injects Authorization: Bearer {token} header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    await fetchFn("/path", "my-token");

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      Authorization: "Bearer my-token",
    });
  });

  it("injects Content-Type: application/json when body is not FormData", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    await fetchFn("/path", "token", {
      method: "POST",
      body: JSON.stringify({ data: 1 }),
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  it("does not inject Content-Type when body is FormData", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    const formData = new FormData();
    formData.append("key", "value");
    await fetchFn("/path", "token", {
      method: "POST",
      body: formData,
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers["Content-Type"]).toBeUndefined();
  });

  it("merges custom headers from options", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    await fetchFn("/path", "token", {
      headers: { "X-Custom": "value" },
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      "X-Custom": "value",
    });
  });

  it("allows overriding default Content-Type via options", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    await fetchFn("/path", "token", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      Authorization: "Bearer token",
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  it("passes through method and body from options", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", mockFetch);

    const fetchFn = createPlatformFetch("/api/test");
    await fetchFn("/path", "token", {
      method: "DELETE",
      body: '{"id":1}',
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("DELETE");
    expect(callArgs[1].body).toBe('{"id":1}');
  });
});
