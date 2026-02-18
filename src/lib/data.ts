import { DataType, ErrorType, OperationType } from "./types";
import wretch from "wretch";
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
    type: { kind: "array", elementType: { kind: "undefined" } },
  },
  tuple: {
    type: { kind: "tuple", elements: [{ kind: "undefined" }] },
  },
  object: {
    type: {
      kind: "object",
      properties: [{ key: "key", value: { kind: "undefined" } }],
    },
  },
  dictionary: {
    type: { kind: "dictionary", elementType: { kind: "undefined" } },
  },
  union: {
    type: { kind: "union", types: [{ kind: "undefined" }] },
  },
  operation: {
    type: {
      kind: "operation",
      parameters: [],
      result: { kind: "undefined" },
    },
  },
  condition: {
    type: {
      kind: "condition",
      result: { kind: "union", types: [{ kind: "undefined" }] },
    },
    hideFromDropdown: true,
  },
  reference: {
    type: { kind: "reference", dataType: { kind: "undefined" } },
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

export function getPromiseArgsType(
  resolveType?: OperationType["parameters"],
  rejectType?: OperationType["parameters"]
) {
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
              result: { kind: "undefined" },
            },
          },
          {
            name: "reject",
            type: {
              kind: "operation",
              parameters: rejectType ?? [
                { name: "reason", type: { kind: "unknown" } },
              ],
              result: { kind: "undefined" },
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

type InstanceTypeConfig<
  K extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends new (...args: any[]) => any = new (...args: any[]) => any
> = {
  readonly name: K;
  readonly Constructor: C;
  readonly constructorArgs: OperationType["parameters"];
  readonly hideFromDropdown?: boolean;
};

export const InstanceTypes: { [K in string]: InstanceTypeConfig<K> } = {
  Promise: {
    name: "Promise",
    Constructor: Promise,
    constructorArgs: getPromiseArgsType(),
  },
  Date: {
    name: "Date",
    Constructor: Date,
    constructorArgs: [
      { type: { kind: "string" }, isOptional: true },
    ] as OperationType["parameters"],
  },
  URL: {
    name: "URL",
    Constructor: URL,
    constructorArgs: [
      { type: { kind: "string" } },
    ] as OperationType["parameters"],
  },
  Response: {
    name: "Response",
    Constructor: Response,
    constructorArgs: [
      { type: { kind: "unknown" }, isOptional: true },
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        isOptional: true,
      },
    ] as OperationType["parameters"],
  },
  Wretch: {
    name: "Wretch",
    Constructor: function (...args: Parameters<typeof wretch>) {
      return wretch(...args);
    } as unknown as new (...args: Parameters<typeof wretch>) => ReturnType<
      typeof wretch
    >,
    constructorArgs: [
      { type: { kind: "string" } },
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        isOptional: true,
      },
    ] as OperationType["parameters"],
  },
  WretchResponseChain: {
    name: "WretchResponseChain",
    Constructor: class WretchResponseChain {} as unknown as new (
      ...args: unknown[]
    ) => unknown,
    constructorArgs: [],
    hideFromDropdown: true,
  },
};

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
