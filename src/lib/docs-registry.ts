import { OperationSource } from "./types";

interface DocsConfig {
  urlPattern: (operationName: string) => string;
  displayName: string;
}

export const DOCS_REGISTRY: Record<OperationSource["name"], DocsConfig> = {
  remeda: {
    urlPattern: (name) => `https://remedajs.com/docs#${name}`,
    displayName: "Remeda",
  },
  wretch: {
    urlPattern: (name) =>
      `https://elbywan.github.io/wretch/api/interfaces/index.Wretch.html#${name.toLowerCase()}`,
    displayName: "Wretch",
  },
  wretchResponseChain: {
    urlPattern: (name) =>
      `https://elbywan.github.io/wretch/api/interfaces/index.WretchResponseChain.html#${name.toLowerCase()}`,
    displayName: "WretchResponseChain",
  },
};

export function getDocsUrl(source?: OperationSource, operationName?: string) {
  if (!source || !operationName) return undefined;
  const config = DOCS_REGISTRY[source.name];
  if (!config) return undefined;
  return config.urlPattern(operationName);
}
