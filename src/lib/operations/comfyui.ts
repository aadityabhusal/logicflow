import * as comfyuiSDK from "@saintno/comfyui-sdk";
import { IData, DataType } from "@/lib/types";
import {
  createDataFromRawValue,
  getRawValueFromData,
  isObject,
  createRuntimeError,
} from "@/lib/utils";
import { InstanceTypeConfig } from "@/lib/packages/registry";
import type { OperationListItem } from "@/lib/execution/types";

const TString: DataType = { kind: "string" };
const TNumber: DataType = { kind: "number" };
const TBoolean: DataType = { kind: "boolean" };
const TUnknown: DataType = { kind: "unknown" };
const TDict: DataType = { kind: "dictionary", elementType: TUnknown };
const TObject: DataType = { kind: "object", properties: [] };
const TStringArray: DataType = { kind: "array", elementType: TString };
const TImageInfo: DataType = {
  kind: "object",
  properties: [
    { key: "filename", value: TString },
    { key: "subfolder", value: TString },
    { key: "type", value: TString },
  ],
};

const ApiType: DataType = {
  kind: "instance",
  className: "comfyui.ComfyApi",
  constructorArgs: [],
};

const PoolType: DataType = {
  kind: "instance",
  className: "comfyui.ComfyPool",
  constructorArgs: [],
};

const PromptBuilderType: DataType = {
  kind: "instance",
  className: "comfyui.PromptBuilder",
  constructorArgs: [],
};

const CallWrapperType: DataType = {
  kind: "instance",
  className: "comfyui.CallWrapper",
  constructorArgs: [],
};

const WorkflowBuilderType: DataType = {
  kind: "instance",
  className: "comfyui.WorkflowBuilder",
  constructorArgs: [],
};

const PromiseType: DataType = {
  kind: "instance",
  className: "Promise",
  constructorArgs: [],
  result: TUnknown,
};

function callMethod(target: object, path: string, args: unknown[]) {
  const segments = path.split(".");
  let receiver = target;

  for (const segment of segments.slice(0, -1)) {
    const next = (receiver as Record<string, unknown>)[segment];
    if (!isObject(next)) throw new Error(`ComfyUI member "${path}" not found`);
    receiver = next;
  }

  const methodName = segments[segments.length - 1];
  const member = (receiver as Record<string, unknown>)[methodName];
  if (typeof member === "function") return member.apply(receiver, args);
  throw new Error(`ComfyUI member "${path}" not found`);
}

type MethodOperationSpec = Omit<
  OperationListItem,
  "handler" | "parameters" | "source"
> & {
  inputType: DataType;
  sourceName: string;
  parameters?: OperationListItem["parameters"];
  resultType?: DataType;
};

function getParameters(
  parameters: OperationListItem["parameters"] | undefined,
  data: IData
) {
  if (!parameters) return [];
  return typeof parameters === "function" ? parameters(data) : parameters;
}

function createMethodOperation({
  inputType,
  sourceName,
  parameters,
  resultType,
  ...operation
}: MethodOperationSpec): OperationListItem {
  return {
    ...operation,
    expectedType: resultType,
    parameters: (data) => [
      { type: inputType },
      ...getParameters(parameters, data),
    ],
    source: {
      name: sourceName,
      callStyle: "method",
    },
    handler: (context, data: IData, ...args: IData[]) => {
      const instance = getRawValueFromData(data, context);
      if (!isObject(instance)) {
        return createRuntimeError("ComfyUI instance not found");
      }

      try {
        const rawArgs = args.map((arg) => getRawValueFromData(arg, context));
        const result = callMethod(instance, operation.name, rawArgs);

        if (result instanceof Promise) {
          return createDataFromRawValue(result, {
            ...context,
            expectedType: {
              ...PromiseType,
              result: resultType ?? TUnknown,
            } as DataType,
          });
        }

        return createDataFromRawValue(result, {
          ...context,
          expectedType: resultType,
        });
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  };
}

const apiMethodSpecs: MethodOperationSpec[] = [
  {
    name: "init",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: ApiType,
    parameters: [
      { type: TNumber, name: "maxTries", isOptional: true },
      { type: TNumber, name: "delayTime", isOptional: true },
    ],
  },
  { name: "waitForReady", inputType: ApiType, sourceName: "comfyuiApi" },
  { name: "destroy", inputType: ApiType, sourceName: "comfyuiApi" },
  { name: "ping", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "pollStatus",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TNumber, name: "timeout", isOptional: true }],
  },
  { name: "getQueue", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "getHistories",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TNumber, name: "maxItems", isOptional: true }],
  },
  {
    name: "getHistory",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "promptId" }],
  },
  { name: "getSystemStats", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "getExtensions",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
  },
  {
    name: "getEmbeddings",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
  },
  {
    name: "getCheckpoints",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
  },
  {
    name: "getLoras",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
  },
  {
    name: "getNodeDefs",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "nodeName", isOptional: true }],
  },
  { name: "getSettings", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "getSetting",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "id" }],
  },
  {
    name: "storeSettings",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TDict, name: "settings" }],
  },
  {
    name: "storeSetting",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TString, name: "id" },
      { type: TUnknown, name: "value" },
    ],
  },
  {
    name: "uploadImage",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TUnknown, name: "file" },
      { type: TString, name: "fileName" },
      { type: TDict, name: "config", isOptional: true },
    ],
  },
  {
    name: "uploadMask",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TUnknown, name: "file" },
      { type: TImageInfo, name: "originalRef" },
    ],
  },
  {
    name: "getPathImage",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TImageInfo, name: "imageInfo" }],
    resultType: TString,
  },
  {
    name: "getImage",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TImageInfo, name: "imageInfo" }],
  },
  { name: "interrupt", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "queuePrompt",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TNumber, name: "number", isOptional: true },
      { type: TObject, name: "workflow" },
    ],
  },
  {
    name: "appendPrompt",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TObject, name: "workflow" }],
  },
  {
    name: "freeMemory",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TBoolean, name: "unloadModels" },
      { type: TBoolean, name: "freeMemory" },
    ],
  },
  { name: "getFeatures", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "getModels",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
    parameters: [{ type: TString, name: "folder" }],
  },
  { name: "getModelFolders", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "getModelFiles",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "folder" }],
  },
  {
    name: "getUserData",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "file" }],
  },
  {
    name: "storeUserData",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TString, name: "file" },
      { type: TUnknown, name: "data" },
      { type: TDict, name: "options", isOptional: true },
    ],
  },
  {
    name: "deleteUserData",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "file" }],
  },
  {
    name: "moveUserData",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TString, name: "source" },
      { type: TString, name: "dest" },
      { type: TDict, name: "options", isOptional: true },
    ],
  },
  {
    name: "listUserData",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
    parameters: [
      { type: TString, name: "dir" },
      { type: TBoolean, name: "recurse", isOptional: true },
      { type: TBoolean, name: "split", isOptional: true },
    ],
  },
  {
    name: "listUserDataV2",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "dir" }],
  },
  {
    name: "clearHistory",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TDict, name: "options" }],
  },
  {
    name: "manageQueue",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TDict, name: "options" }],
  },
  {
    name: "getWorkflowTemplates",
    inputType: ApiType,
    sourceName: "comfyuiApi",
  },
  {
    name: "getViewMetadata",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [
      { type: TString, name: "folder" },
      { type: TString, name: "filename" },
    ],
  },
  { name: "getUserConfig", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "createUser",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TString, name: "username" }],
  },
  { name: "getSamplerInfo", inputType: ApiType, sourceName: "comfyuiApi" },
  {
    name: "getModelTypes",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    resultType: TStringArray,
  },
  {
    name: "reconnectWs",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TBoolean, name: "triggerEvent", isOptional: true }],
  },
  {
    name: "getTerminalLogs",
    inputType: ApiType,
    sourceName: "comfyuiApi",
  },
  {
    name: "setTerminalSubscription",
    inputType: ApiType,
    sourceName: "comfyuiApi",
    parameters: [{ type: TBoolean, name: "subscribe" }],
  },
];

const promptBuilderSpecs: MethodOperationSpec[] = [
  {
    name: "clone",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
  },
  {
    name: "bypass",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [{ type: TUnknown, name: "nodeOrNodes" }],
  },
  {
    name: "reinstate",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [{ type: TUnknown, name: "nodeOrNodes" }],
  },
  {
    name: "setRawInputNode",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "input" },
      { type: TUnknown, name: "key" },
    ],
  },
  {
    name: "appendRawInputNode",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "input" },
      { type: TUnknown, name: "key" },
    ],
  },
  {
    name: "setRawOutputNode",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "output" },
      { type: TString, name: "key" },
    ],
  },
  {
    name: "inputRaw",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "key" },
      { type: TUnknown, name: "value" },
      { type: TString, name: "encodeOs", isOptional: true },
    ],
  },
  {
    name: "input",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "key" },
      { type: TUnknown, name: "value" },
      { type: TString, name: "encodeOs", isOptional: true },
    ],
  },
  {
    name: "setInputNode",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "input" },
      { type: TUnknown, name: "key" },
    ],
  },
  {
    name: "appendInputNode",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "input" },
      { type: TUnknown, name: "key" },
    ],
  },
  {
    name: "setOutputNode",
    inputType: PromptBuilderType,
    sourceName: "comfyuiPromptBuilder",
    resultType: PromptBuilderType,
    parameters: [
      { type: TString, name: "output" },
      { type: TString, name: "key" },
    ],
  },
];

const callWrapperSpecs: MethodOperationSpec[] = [
  {
    name: "onPreview",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [{ type: TUnknown }, { type: TString, isOptional: true }],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  {
    name: "onPending",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [{ type: TString, isOptional: true }],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  {
    name: "onStart",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [{ type: TString, isOptional: true }],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  {
    name: "onOutput",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [
            { type: TString },
            { type: TUnknown },
            { type: TString, isOptional: true },
          ],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  {
    name: "onFinished",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [{ type: TUnknown }, { type: TString, isOptional: true }],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  {
    name: "onFailed",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [
            { type: { kind: "error", errorType: "custom_error" } },
            { type: TString, isOptional: true },
          ],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  {
    name: "onProgress",
    inputType: CallWrapperType,
    sourceName: "comfyuiCallWrapper",
    resultType: CallWrapperType,
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [{ type: TUnknown }, { type: TString, isOptional: true }],
          result: TUnknown,
        },
        name: "callback",
      },
    ],
  },
  { name: "run", inputType: CallWrapperType, sourceName: "comfyuiCallWrapper" },
];

const poolSpecs: MethodOperationSpec[] = [
  {
    name: "addClient",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    parameters: [{ type: ApiType, name: "client" }],
  },
  {
    name: "removeClient",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    parameters: [{ type: ApiType, name: "client" }],
  },
  {
    name: "removeClientByIndex",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    parameters: [{ type: TNumber, name: "index" }],
  },
  {
    name: "changeMode",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    parameters: [{ type: TNumber, name: "mode" }],
  },
  {
    name: "pick",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    resultType: ApiType,
    parameters: [{ type: TNumber, name: "idx", isOptional: true }],
  },
  {
    name: "pickById",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    resultType: ApiType,
    parameters: [{ type: TString, name: "id" }],
  },
  {
    name: "run",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    parameters: [
      {
        type: {
          kind: "operation",
          parameters: [{ type: ApiType }, { type: TNumber, isOptional: true }],
          result: TUnknown,
        },
        name: "job",
      },
      { type: TNumber, name: "weight", isOptional: true },
      { type: TDict, name: "clientFilter", isOptional: true },
    ],
  },
  {
    name: "batch",
    inputType: PoolType,
    sourceName: "comfyuiPool",
    parameters: [
      {
        type: {
          kind: "array",
          elementType: {
            kind: "operation",
            parameters: [
              { type: ApiType },
              { type: TNumber, isOptional: true },
            ],
            result: TUnknown,
          },
        },
        name: "jobs",
      },
      { type: TNumber, name: "weight", isOptional: true },
      { type: TDict, name: "clientFilter", isOptional: true },
    ],
  },
  {
    name: "destroy",
    inputType: PoolType,
    sourceName: "comfyuiPool",
  },
];

const workflowBuilderSpecs: MethodOperationSpec[] = [
  {
    name: "build",
    inputType: WorkflowBuilderType,
    sourceName: "comfyuiWorkflowBuilder",
    resultType: PromptBuilderType,
    parameters: [{ type: TDict, name: "config", isOptional: true }],
  },
];

export const operations: OperationListItem[] = [
  ...apiMethodSpecs.map(createMethodOperation),
  ...promptBuilderSpecs.map(createMethodOperation),
  ...callWrapperSpecs.map(createMethodOperation),
  ...poolSpecs.map(createMethodOperation),
  ...workflowBuilderSpecs.map(createMethodOperation),
];

export const instanceTypes: Record<string, InstanceTypeConfig> = {
  "comfyui.ComfyApi": {
    name: "comfyui.ComfyApi",
    Constructor: comfyuiSDK.ComfyApi,
    constructorArgs: [
      { type: TString, name: "host" },
      { type: TString, name: "clientId", isOptional: true },
      { type: TDict, name: "opts", isOptional: true },
    ],
    importInfo: { packageName: "comfyui" },
  },
  "comfyui.ComfyPool": {
    name: "comfyui.ComfyPool",
    Constructor: comfyuiSDK.ComfyPool,
    constructorArgs: [
      { type: { kind: "array", elementType: ApiType }, name: "clients" },
      { type: TNumber, name: "mode", isOptional: true },
      { type: TDict, name: "opts", isOptional: true },
    ],
    importInfo: { packageName: "comfyui" },
  },
  "comfyui.PromptBuilder": {
    name: "comfyui.PromptBuilder",
    Constructor: comfyuiSDK.PromptBuilder,
    constructorArgs: [
      { type: TDict, name: "workflow" },
      { type: TStringArray, name: "inputKeys" },
      { type: TStringArray, name: "outputKeys" },
    ],
    importInfo: { packageName: "comfyui" },
  },
  "comfyui.CallWrapper": {
    name: "comfyui.CallWrapper",
    Constructor: comfyuiSDK.CallWrapper,
    constructorArgs: [
      { type: ApiType, name: "client" },
      { type: PromptBuilderType, name: "workflow" },
    ],
    importInfo: { packageName: "comfyui" },
  },
  "comfyui.WorkflowBuilder": {
    name: "comfyui.WorkflowBuilder",
    Constructor: comfyuiSDK.WorkflowBuilder,
    constructorArgs: [],
    importInfo: { packageName: "comfyui" },
  },
};

export default { operations, instanceTypes };
