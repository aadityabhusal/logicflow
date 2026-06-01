import {
  ConstructorType,
  DataType,
  IData,
  IStatement,
  OperationSource,
  OperationType,
  PackageNamespace,
  ProjectFile,
} from "../types";
import {
  DebugFrame,
  DebugFlowStep,
  DebugLocation,
  DebugPauseReason,
  DebugRunConfig,
} from "../debugger/types";

export type Thenable<T> = {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Thenable<TResult1 | TResult2>;
};

export type ExecutionResult = { data?: IData; shouldCacheResult?: boolean };

export type ExecutionScheduler = { steps: number; deadline: number };

export type ReservedNames = {
  kind: "data-type" | "operation" | "variable" | "reserved";
  name: string;
}[];

export type Variable = {
  data: IData;
  reference?: { name: string; id: string };
  isEnv?: boolean;
};

export type DebuggerController = {
  resetFlow: () => void;
  beforeData: (data: IData, context: Context) => void;
  exitData: () => void;
  beforeOperationCall: (
    operation: IData<OperationType>,
    context: Context,
    input: IData
  ) => void;
  afterOperationCall: (
    operation: IData<OperationType>,
    context: Context,
    result?: IData
  ) => void;
  enterFrame: (frame: Omit<DebugFrame, "id"> & { id?: string }) => string;
  exitFrame: (frameId: string) => void;
  registerContext: (entityId: string, context: Context) => void;
  maybePauseOnError: (result: IData, context: Context) => void;
  suppressBreakpoints: <T>(fn: () => T) => T;
  getFlowSteps: () => DebugFlowStep[];
};

export type ContextProps = {
  scopeId: string;
  variables: Map<string, Variable>;
  packageAliases: Record<string, string>;
  narrowedTypes?: Map<string, Variable>;
  expectedType?: DataType;
  enforceExpectedType?: boolean;
  skipExecution?: { reason: string; kind: "unreachable" | "error" };
  isSync?: boolean;
  isIsolated?: boolean;
  // Partial debug snapshots may include ancestor scopes before child scopes run.
  isPartial?: boolean;
  callDepth?: number;
  maxCallDepth?: number; // Added in Context and not global constant for testing configuration
  operationCache?: Map<string, IData>;
  _memoCacheKey?: string;
  controlFlowState?: { returned?: IData };
  debugger?: DebuggerController;
  debugFrame?: Omit<DebugFrame, "id" | "scopeId"> & {
    id?: string;
  };
  debugMissingParamIndexes?: Set<number>;
};

export type Context = ContextProps & {
  isCancelled?: () => boolean;
  getResult: (id: string) => ExecutionResult | undefined;
  getInstance: (
    id: string
  ) => { instance: InstanceType<ConstructorType>; type: DataType } | undefined;
  getContext: (id: string) => Context;
  setContext: (id: string, context: Context) => void;
  setResult: (id: string, result: Partial<ExecutionResult>) => void;
  setInstance: (
    id: string,
    data: { instance: InstanceType<ConstructorType>; type: DataType }
  ) => void;
  // execute functions are here to avoid circular dependency in operation.ts and built-in-operations.ts
  executeStatement: (
    statement: IStatement,
    contextWithOps: Context
  ) => Promise<IData>;
  executeStatementSync: (
    ...args: Parameters<Context["executeStatement"]>
  ) => IData;
  executeOperation: (
    operation: OperationListItem,
    data: IData,
    parameters: IStatement[],
    contextWithOps: Context
  ) => Promise<IData>;
  executeOperationSync: (
    ...args: Parameters<Context["executeOperation"]>
  ) => IData;
};

export type OperationListItem = {
  id?: string;
  name: string;
  parameters:
    | ((data: IData) => OperationType["parameters"])
    | OperationType["parameters"];
  shouldCacheResult?: boolean;
  narrowType?:
    | ((...args: [Context, ...IData[]]) => DataType | undefined)
    | DataType;
  source?: OperationSource;
  expectedType?: DataType | ((data: IData) => DataType);
} & (
  | { handler: (...args: [Context, ...IData[]]) => Thenable<IData> | IData }
  | {
      lazyHandler: (
        ...args: [Context, IData, ...IStatement[]]
      ) => Thenable<IData> | IData;
    }
  | { statements: IStatement[] }
);

/* Worker Types */
export type WorkerContext = Omit<
  ContextProps,
  | "variables"
  | "narrowedTypes"
  | "operationCache"
  | "_memoCacheKey"
  | "debugger"
  | "debugFrame"
  | "debugMissingParamIndexes"
> & {
  variables: [string, Variable][];
  narrowedTypes?: [string, Variable][];
};

export type ExecutionWorkerRunRequest = {
  type: "run";
  runId: string;
  operation: IData<OperationType>;
  files: ProjectFile[];
  packages?: PackageNamespace[];
  envVariables: { key: string; value: string }[];
  cachedResults: [string, ExecutionResult][];
  expectedType?: DataType;
  enforceExpectedType?: boolean;
  debug?: DebugRunConfig;
};

export type ExecutionWorkerRequest =
  | ExecutionWorkerRunRequest
  | { type: "cancel" }
  | { type: "reset" };

export type ExecutionWorkerCompletedResponse = {
  type: "completed";
  runId: string;
  results: [string, ExecutionResult][];
  workerContexts: [string, WorkerContext][];
  flowSteps: DebugFlowStep[];
};

export type ExecutionWorkerPausedResponse = {
  type: "debug-paused";
  runId: string;
  reason: DebugPauseReason;
  location: DebugLocation;
  callStack: DebugFrame[];
  flowSteps: DebugFlowStep[];
  results: [string, ExecutionResult][];
  workerContexts: [string, WorkerContext][];
};

export type ExecutionWorkerResponse =
  | ExecutionWorkerCompletedResponse
  | ExecutionWorkerPausedResponse
  | { type: "error"; runId: string; error: string }
  | { type: "cancelled"; runId: string };
