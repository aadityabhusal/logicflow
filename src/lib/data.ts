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
  object: {
    type: { kind: "object", properties: { key: { kind: "undefined" } } },
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
      resultType: { kind: "union", types: [{ kind: "undefined" }] },
    },
    hideFromDropdown: true,
  },
  reference: {
    type: { kind: "reference", dataType: { kind: "undefined" } },
    hideFromDropdown: true,
  },
  error: {
    type: { kind: "error", errorType: "custom_error" },
    // hideFromDropdown: true,
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
