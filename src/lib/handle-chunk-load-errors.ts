import { showReloadNotification } from "@/lib/reload-prompt";

const CHUNK_ERROR_PATTERN =
  /dynamically imported module|importing a module script|loading chunk/i;

let notified = false;

function isChunkLoadError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return CHUNK_ERROR_PATTERN.test(message);
}

function notifyIfChunkLoadError(reason: unknown) {
  if (notified || !isChunkLoadError(reason)) return;
  notified = true;
  showReloadNotification({ title: "Some app assets failed to load" });
}

export function registerChunkLoadErrorHandler() {
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    notifyIfChunkLoadError(event.reason);
  const onError = (event: ErrorEvent) => {
    notifyIfChunkLoadError(event.error ?? event.message);
  };
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("error", onError);
  return () => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("error", onError);
  };
}
