import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const showMock = vi.hoisted(() => vi.fn());

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: showMock,
    clean: vi.fn(),
    update: vi.fn(),
    hide: vi.fn(),
  },
}));

vi.mock("@mantine/core", () => ({
  Button: () => null,
}));

function dispatchUnhandledRejection(reason: unknown) {
  const event = new Event("unhandledrejection") as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason, configurable: true });
  window.dispatchEvent(event);
}

describe("registerChunkLoadErrorHandler", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    showMock.mockClear();
    const mod = await import("@/lib/handle-chunk-load-errors");
    cleanup = mod.registerChunkLoadErrorHandler();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("shows a reload notification for a chunk-load rejection", () => {
    dispatchUnhandledRejection(
      new Error("Failed to fetch dynamically imported module: /assets/x.js")
    );
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Some app assets failed to load",
        autoClose: false,
      })
    );
  });

  it("dedupes subsequent chunk-load rejections", () => {
    dispatchUnhandledRejection(new Error("Importing a module script failed."));
    dispatchUnhandledRejection(new Error("Loading chunk 5 failed."));
    expect(showMock).toHaveBeenCalledTimes(1);
  });

  it("ignores non-chunk errors", () => {
    dispatchUnhandledRejection(new Error("Some unrelated runtime error"));
    expect(showMock).not.toHaveBeenCalled();
  });

  it("handles string rejections", () => {
    dispatchUnhandledRejection("error loading dynamically imported module");
    expect(showMock).toHaveBeenCalledTimes(1);
  });

  it("shows a notification for a chunk-load error event", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error("Loading chunk 12 failed."),
      })
    );
    expect(showMock).toHaveBeenCalledTimes(1);
  });
});
