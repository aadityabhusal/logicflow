function proxyUrl(url: string): string {
  try {
    const target = new URL(url, globalThis.location.href);
    const isHttp = target.protocol === "http:" || target.protocol === "https:";
    if (!isHttp || target.origin === globalThis.location.origin) return url;
    return `/api/proxy?url=${encodeURIComponent(target.href)}`;
  } catch {
    return url;
  }
}

const devProxyFetchMarker = "__logicflowDevProxyFetch";

type DevProxyFetch = typeof globalThis.fetch & {
  [devProxyFetchMarker]?: true;
};

function proxyFetchInput(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") return proxyUrl(input);
  if (input instanceof URL) return proxyUrl(input.href);

  if (typeof Request !== "undefined" && input instanceof Request) {
    const url = proxyUrl(input.url);
    if (url === input.url) return input;
    return new Request(new URL(url, globalThis.location.href), input);
  }

  return input;
}

export function installDevProxyFetch() {
  if (
    !import.meta.env?.DEV ||
    globalThis.location === undefined ||
    typeof globalThis.fetch !== "function"
  ) {
    return;
  }

  const currentFetch = globalThis.fetch as DevProxyFetch;
  if (currentFetch[devProxyFetchMarker]) return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  const proxyFetch: typeof globalThis.fetch = (input, init) =>
    originalFetch(proxyFetchInput(input), init);
  (proxyFetch as DevProxyFetch)[devProxyFetchMarker] = true;
  globalThis.fetch = proxyFetch;
}

installDevProxyFetch();
