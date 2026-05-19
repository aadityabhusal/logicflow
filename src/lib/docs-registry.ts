import { OperationSource } from "./types";
import { getActualOperationName } from "./utils";

interface DocsConfig {
  urlPattern: (operationName: string) => string;
  displayName: string;
  useRawName?: boolean;
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
  faker: {
    urlPattern: (name) => {
      const withoutPrefix =
        name.indexOf(".") !== -1 ? name.slice(name.indexOf(".") + 1) : name;
      const parts = withoutPrefix.split(".");
      const module = parts[0];
      const method = parts[parts.length - 1].toLowerCase();
      return `https://fakerjs.dev/api/${module}.html#${method}`;
    },
    displayName: "Faker",
    useRawName: true,
  },
  dateFns: {
    urlPattern: (name) => {
      const fnName = name.includes(".")
        ? name.slice(name.indexOf(".") + 1)
        : name;
      return `https://date-fns.org/v4.1.0/docs/${fnName}`;
    },
    displayName: "date-fns",
    useRawName: true,
  },
  ffmpeg: {
    urlPattern: (name) => {
      const fnName = name.includes(".")
        ? name.slice(name.indexOf(".") + 1)
        : name;
      return `https://github.com/aadityabhusal/logicflow/blob/main/docs/ffmpeg-package.md#${fnName.toLowerCase()}`;
    },
    displayName: "FFmpeg",
    useRawName: true,
  },
};

export function getDocsUrl(source?: OperationSource, operationName?: string) {
  if (!source || !operationName) return undefined;
  const config = DOCS_REGISTRY[source.name];
  if (!config) return undefined;
  const name = config.useRawName
    ? operationName
    : getActualOperationName(operationName).toLowerCase();
  return config.urlPattern(name);
}
