import { IData, OperationType } from "../types";
import { OperationListItem } from "../execution/types";
import { createOperationHandler, FunctionKeys, getObjectParam } from "./remeda";
import * as _ from "./runtime";
import { resolveUnionType } from "../utils";

const pathParam: OperationType["parameters"][number] = {
  type: {
    kind: "array",
    elementType: resolveUnionType([{ kind: "string" }, { kind: "number" }]),
  },
};

const updaterParam: OperationType["parameters"][number] = {
  type: {
    kind: "operation",
    parameters: [{ type: { kind: "unknown" } }],
    result: { kind: "unknown" },
  },
};

const arrayParam: OperationType["parameters"][number] = {
  type: { kind: "array", elementType: { kind: "unknown" } },
};

const numberParam: OperationType["parameters"][number] = {
  type: { kind: "number" },
};

const unknownParam: OperationType["parameters"][number] = {
  type: { kind: "unknown" },
};

function getContainerParam(): OperationType["parameters"][number] {
  return {
    type: resolveUnionType([
      { kind: "object", properties: [] },
      { kind: "dictionary", elementType: { kind: "unknown" } },
      { kind: "array", elementType: { kind: "unknown" } },
      { kind: "tuple", elements: [{ kind: "unknown" }] },
    ]),
  };
}

const sameType = (data: IData) => data.type;

const immerOperationList: (Omit<OperationListItem, "handler" | "source"> & {
  name: FunctionKeys<typeof _>;
})[] = [
  {
    name: "setIn",
    parameters: [getContainerParam(), pathParam, unknownParam],
    expectedType: sameType,
  },
  {
    name: "updateIn",
    parameters: [getContainerParam(), pathParam, updaterParam],
    expectedType: sameType,
  },
  {
    name: "removeIn",
    parameters: [getContainerParam(), pathParam],
    expectedType: sameType,
  },
  {
    name: "setKey",
    parameters: (data) => [
      getObjectParam(data),
      { type: { kind: "string" } },
      unknownParam,
    ],
    expectedType: sameType,
  },
  {
    name: "updateKey",
    parameters: (data) => [
      getObjectParam(data),
      { type: { kind: "string" } },
      updaterParam,
    ],
    expectedType: sameType,
  },
  {
    name: "removeKey",
    parameters: (data) => [getObjectParam(data), { type: { kind: "string" } }],
    expectedType: sameType,
  },
  {
    name: "replaceAt",
    parameters: [arrayParam, numberParam, unknownParam],
    expectedType: sameType,
  },
  {
    name: "updateAt",
    parameters: [arrayParam, numberParam, updaterParam],
    expectedType: sameType,
  },
  {
    name: "insertAt",
    parameters: [arrayParam, numberParam, unknownParam],
    expectedType: sameType,
  },
  {
    name: "removeAt",
    parameters: [arrayParam, numberParam],
    expectedType: sameType,
  },
];

export const immerOperations: OperationListItem[] = immerOperationList.map(
  (operation) => ({
    ...operation,
    source: { name: "immer" },
    handler: createOperationHandler(_, operation.name, operation.expectedType),
  })
);
