import { DataType, ErrorType } from "./types";

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
    type: { kind: "object", properties: { key: { kind: "undefined" } } },
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
    type: { kind: "instance", className: "Object", constructorArgs: [] },
    hideFromDropdown: true,
  },
};

export const InstanceTypes = {
  Promise: {
    name: "Promise",
    Constructor: Promise,
    constructorArgs: [
      {
        kind: "operation",
        parameters: [
          {
            name: "resolve",
            type: {
              kind: "operation",
              parameters: [{ name: "value", type: { kind: "unknown" } }],
              result: { kind: "undefined" },
            },
          },
          {
            name: "reject",
            type: {
              kind: "operation",
              parameters: [{ name: "error", type: { kind: "unknown" } }],
              result: { kind: "undefined" },
            },
          },
        ],
        result: { kind: "instance", className: "Promise", constructorArgs: [] },
      },
    ],
  },
  Date: {
    name: "Date",
    Constructor: Date,
    constructorArgs: [{ kind: "string" }],
  },
  URL: { name: "URL", Constructor: URL, constructorArgs: [{ kind: "string" }] },
  Request: {
    name: "Request",
    Constructor: Request,
    constructorArgs: [
      { kind: "string" },
      { kind: "dictionary", elementType: { kind: "unknown" } },
    ],
  },
  Response: {
    name: "Response",
    Constructor: Response,
    constructorArgs: [
      { kind: "string" },
      { kind: "dictionary", elementType: { kind: "unknown" } },
    ],
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
