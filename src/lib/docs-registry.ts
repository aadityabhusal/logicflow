import { OperationSource } from "./types";
import { getActualOperationName } from "./utils";

interface DocsConfig {
  urlPattern: (operationName: string) => string;
  displayName: string;
  useRawName?: boolean;
}

const supabaseModifierOperations = [
  "limit",
  "range",
  "order",
  "single",
  "maybeSingle",
  "csv",
  "geojson",
  "explain",
  "throwOnError",
  "stripNulls",
  "rollback",
  "maxAffected",
  "retry",
  "setHeader",
  "abortSignal",
];

const supabaseFilterOperations = [
  "containedBy",
  "contains",
  "eq",
  "filter",
  "gt",
  "gte",
  "ilike",
  "ilikeAllOf",
  "ilikeAnyOf",
  "in",
  "is",
  "like",
  "likeAllOf",
  "likeAnyOf",
  "lt",
  "lte",
  "match",
  "neq",
  "not",
  "or",
  "overlaps",
  "rangeAdjacent",
  "rangeGt",
  "rangeGte",
  "rangeLt",
  "rangeLte",
  "textSearch",
];

export const DOCS_REGISTRY: Record<string, DocsConfig> = {
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
  rowguard: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/modules.html#${name.toLowerCase()}`,
    displayName: "Rowguard",
  },
  rowguardColumnBuilder: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/ColumnBuilder.html#${name.toLowerCase()}`,
    displayName: "Rowguard ColumnBuilder",
  },
  rowguardConditionChain: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/ConditionChain.html#${name.toLowerCase()}`,
    displayName: "Rowguard ConditionChain",
  },
  rowguardPolicyBuilder: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/PolicyBuilder.html#${name.toLowerCase()}`,
    displayName: "Rowguard PolicyBuilder",
  },
  rowguardSubqueryBuilder: {
    urlPattern: (name) =>
      `https://supabase-community.github.io/rowguard/classes/SubqueryBuilder.html#${name.toLowerCase()}`,
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
      return `https://github.com/aadityabhusal/logicflow/blob/main/docs/ffmpeg-package.md#${fnName}`;
    },
    displayName: "FFmpeg",
    useRawName: true,
  },
  supabase: {
    urlPattern: (name) =>
      `https://supabase.com/docs/reference/javascript/${name.toLowerCase()}`,
    displayName: "Supabase",
  },
  supabaseClient: {
    urlPattern: (name) =>
      `https://supabase.com/docs/reference/javascript/${name.toLowerCase()}`,
    displayName: "Supabase Client",
  },
  supabaseQueryBuilder: {
    urlPattern: (name) =>
      `https://supabase.com/docs/reference/javascript/${name.toLowerCase()}`,
    displayName: "Supabase QueryBuilder",
  },
  supabaseBuilder: {
    urlPattern: (name) => {
      const normalizedName = name.toLowerCase();
      return supabaseFilterOperations.includes(name)
        ? `https://supabase.com/docs/reference/javascript/using-filters-${normalizedName}`
        : supabaseModifierOperations.includes(name)
          ? `https://supabase.com/docs/reference/javascript/using-modifiers-${normalizedName}`
          : `https://supabase.com/docs/reference/javascript/${normalizedName}`;
    },
    displayName: "Supabase Builder",
  },
  supabaseFunctions: {
    urlPattern: (name) =>
      `https://supabase.com/docs/reference/javascript/${name.toLowerCase()}`,
    displayName: "Supabase Functions",
  },
  comfyuiApi: {
    urlPattern: () => `https://github.com/tctien342/comfyui-sdk#comfyapi`,
    displayName: "ComfyUI API",
  },
  comfyuiPool: {
    urlPattern: () => `https://github.com/tctien342/comfyui-sdk#comfypool`,
    displayName: "ComfyUI Pool",
  },
  comfyuiPromptBuilder: {
    urlPattern: () => `https://github.com/tctien342/comfyui-sdk#promptbuilder`,
    displayName: "ComfyUI PromptBuilder",
  },
  comfyuiCallWrapper: {
    urlPattern: () => `https://github.com/tctien342/comfyui-sdk#callwrapper`,
    displayName: "ComfyUI CallWrapper",
  },
};

export function getDocsUrl(source?: OperationSource, operationName?: string) {
  if (!source || !operationName) return undefined;
  const config = DOCS_REGISTRY[source.name];
  if (!config) return undefined;
  const name = config.useRawName
    ? operationName
    : getActualOperationName(operationName);
  return config.urlPattern(name);
}
