import { OperationSource } from "./types";
import { getActualOperationName } from "./utils";

interface DocsConfig {
  urlPattern: (operationName: string) => string;
  displayName: string;
}

export const DOCS_REGISTRY: Record<string, DocsConfig> = {
  remeda: {
    urlPattern: (name) => `https://remedajs.com/docs#${name}`,
    displayName: "Remeda",
  },
  wretch: {
    urlPattern: (name) =>
      `https://elbywan.github.io/wretch/api/interfaces/index.Wretch.html#${name}`,
    displayName: "Wretch",
  },
  wretchResponseChain: {
    urlPattern: (name) =>
      `https://elbywan.github.io/wretch/api/interfaces/index.WretchResponseChain.html#${name}`,
    displayName: "WretchResponseChain",
  },
  rowguard: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/modules.html#${name}`,
    displayName: "Rowguard",
  },
  rowguardColumnBuilder: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/ColumnBuilder.html#${name}`,
    displayName: "Rowguard ColumnBuilder",
  },
  rowguardConditionChain: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/ConditionChain.html#${name}`,
    displayName: "Rowguard ConditionChain",
  },
  rowguardPolicyBuilder: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/PolicyBuilder.html#${name}`,
    displayName: "Rowguard PolicyBuilder",
  },
  rowguardSubqueryBuilder: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/SubqueryBuilder.html#${name}`,
    displayName: "Rowguard SubqueryBuilder",
  },
};

export function getDocsUrl(source?: OperationSource, operationName?: string) {
  if (!source || !operationName) return undefined;
  const config = DOCS_REGISTRY[source.name];
  if (!config) return undefined;
  return config.urlPattern(getActualOperationName(operationName).toLowerCase());
}
