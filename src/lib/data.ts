import { DataType, ErrorType, OperationType } from "./types";
import { SiAnthropic, SiOpenai, SiGooglegemini } from "react-icons/si";

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
  google: { name: "Gemini", Icon: SiGooglegemini },
  openai: { name: "OpenAI", Icon: SiOpenai },
  anthropic: { name: "Anthropic", Icon: SiAnthropic },
} as const;

export const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  { id: "gpt-5.1-codex-mini", name: "GPT 5.1 Codex Mini", provider: "openai" },
  { id: "gpt-5.1-codex", name: "GPT 5.1 Codex", provider: "openai" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" },
] as const;

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
