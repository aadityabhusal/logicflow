import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const showReloadNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/reload-prompt", () => ({
  showReloadNotification: showReloadNotificationMock,
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
    showReloadNotificationMock.mockClear();
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
    expect(showReloadNotificationMock).toHaveBeenCalledTimes(1);
    expect(showReloadNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Some app assets failed to load",
      })
    );
  });

  it("dedupes subsequent chunk-load rejections", () => {
    dispatchUnhandledRejection(new Error("Importing a module script failed."));
    dispatchUnhandledRejection(new Error("Loading chunk 5 failed."));
    expect(showReloadNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("ignores non-chunk errors", () => {
    dispatchUnhandledRejection(new Error("Some unrelated runtime error"));
    expect(showReloadNotificationMock).not.toHaveBeenCalled();
  });

  it("handles string rejections", () => {
    dispatchUnhandledRejection("error loading dynamically imported module");
    expect(showReloadNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("handles object-shaped chunk errors", () => {
    dispatchUnhandledRejection({
      message: "ChunkLoadError: Loading chunk app failed.",
    });

    expect(showReloadNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("shows a notification for a chunk-load error event", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: new Error("Loading chunk 12 failed."),
      })
    );
    expect(showReloadNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("uses the error event message when no error object is present", () => {
    window.dispatchEvent(
      new ErrorEvent("error", { message: "ChunkLoadError: app.js" })
    );

    expect(showReloadNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("removes listeners during cleanup", () => {
    cleanup?.();
    cleanup = undefined;

    dispatchUnhandledRejection(new Error("Loading chunk 5 failed."));

    expect(showReloadNotificationMock).not.toHaveBeenCalled();
  });
});
