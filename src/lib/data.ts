import { DataType, ErrorType, OperationType } from "./types";
import { SiAnthropic, SiOpenai } from "react-icons/si";
import type { AgentThinkingLevel } from "./agent/types";

export const DataTypes: {
  [K in DataType["kind"]]: {
    type: Extract<DataType, { kind: K }>;
    hideFromDropdown?: boolean;
  };
} = {
  unknown: {
    type: { kind: "unknown" },
    hideFromDropdown: true,
  },
  never: {
    type: { kind: "never" },
    hideFromDropdown: true,
  },
  undefined: {
    type: { kind: "undefined" },
  },
  string: {
    type: { kind: "string" },
  },
  number: {
    type: { kind: "number" },
  },
  boolean: {
    type: { kind: "boolean" },
  },
  array: {
    type: { kind: "array", elementType: { kind: "unknown" } },
  },
  tuple: {
    type: { kind: "tuple", elements: [{ kind: "unknown" }] },
  },
  object: {
    type: {
      kind: "object",
      properties: [{ key: "key", value: { kind: "unknown" } }],
    },
  },
  dictionary: {
    type: { kind: "dictionary", elementType: { kind: "unknown" } },
  },
  union: {
    type: { kind: "union", types: [{ kind: "unknown" }] },
  },
  operation: {
    type: {
      kind: "operation",
      parameters: [],
      result: { kind: "unknown" },
    },
  },
  condition: {
    type: {
      kind: "condition",
      result: { kind: "union", types: [{ kind: "unknown" }] },
    },
  },
  reference: {
    type: { kind: "reference", name: "" },
    hideFromDropdown: true,
  },
  error: {
    type: { kind: "error", errorType: "custom_error" },
  },
  instance: {
    type: {
      kind: "instance",
      className: "Date",
      constructorArgs: [{ type: { kind: "string" } }],
    },
    hideFromDropdown: true,
  },
};

export function getPromiseArgsType(resolveType?: OperationType["parameters"]) {
  return [
    {
      type: {
        kind: "operation",
        parameters: [
          {
            name: "resolve",
            type: {
              kind: "operation",
              parameters: resolveType ?? [
                { name: "value", type: { kind: "unknown" } },
              ],
              result: { kind: "unknown" },
            },
          },
          {
            name: "reject",
            type: {
              kind: "operation",
              parameters: [{ name: "reason", type: { kind: "unknown" } }],
              result: { kind: "unknown" },
            },
            isOptional: true,
          },
        ],
        result: {
          kind: "instance",
          className: "Promise",
          constructorArgs: [],
        },
      },
    },
  ] as OperationType["parameters"];
}

export const ErrorTypesData: {
  [K in ErrorType["errorType"]]: { name: string };
} = {
  reference_error: { name: "Reference Error" },
  type_error: { name: "Type Error" },
  runtime_error: { name: "Runtime Error" },
  custom_error: { name: "Error" },
};

export const MAX_SCREEN_WIDTH = 767;

export const LLM_PROVIDERS = {
  openai: { name: "OpenAI", Icon: SiOpenai },
  anthropic: { name: "Anthropic", Icon: SiAnthropic },
} as const;

export const AVAILABLE_MODELS = [
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "openai" },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai" },
  { id: "claude-fable-5", name: "Claude Fable 5", provider: "anthropic" },
  { id: "claude-opus-5", name: "Claude Opus 5", provider: "anthropic" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic" },
] as const;

export const AGENT_THINKING_LEVELS: {
  value: AgentThinkingLevel;
  label: string;
}[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
  { value: "max", label: "Max" },
];

export const OBJECT_TYPES: DataType["kind"][] = [
  "array",
  "tuple",
  "dictionary",
  "object",
  "error",
  "instance",
];

export const RESERVED_KEYWORDS = [
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "let",
  "static",
  "yield",
  "await",
  "enum",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "arguments",
  "async",
  "eval",
  "arg", // pipe callback first arg
];

export const PLATFORMS = {
  vercel: {
    label: "Vercel",
    token: {
      label: "Vercel API token",
      url: "https://vercel.com/account/tokens",
    },
  },
  supabase: {
    label: "Supabase",
    token: {
      label: "Supabase access token",
      url: "https://supabase.com/dashboard/account/tokens",
    },
    projectId: {
      label: "Project reference",
      url: "https://supabase.com/dashboard",
    },
  },
};

export const MAX_CALL_DEPTH = 2500;
