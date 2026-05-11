import {
  ConstructorType,
  DataType,
  IData,
  IStatement,
  OperationSource,
  OperationType,
  ProjectFile,
} from "../types";

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

export type ContextProps = {
  scopeId: string;
  variables: Map<string, Variable>;
  narrowedTypes?: Map<string, Variable>;
  expectedType?: DataType;
  enforceExpectedType?: boolean;
  skipExecution?: { reason: string; kind: "unreachable" | "error" };
  isSync?: boolean;
  isIsolated?: boolean;
  callDepth?: number;
  maxCallDepth?: number; // Added in Context and not global constant for testing configuration
  operationCache?: Map<string, IData>;
  _memoCacheKey?: string;
  controlFlowState?: { returned?: IData };
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
  "variables" | "narrowedTypes" | "operationCache" | "_memoCacheKey"
> & {
  variables: [string, Variable][];
  narrowedTypes?: [string, Variable][];
};

export type ExecutionWorkerRunRequest = {
  type: "run";
  runId: string;
  operation: IData<OperationType>;
  files: ProjectFile[];
  envVariables: { key: string; value: string }[];
  cachedResults: [string, ExecutionResult][];
  expectedType?: DataType;
  enforceExpectedType?: boolean;
};

export type ExecutionWorkerRequest =
  | ExecutionWorkerRunRequest
  | { type: "cancel" }
  | { type: "reset" };

export type ExecutionWorkerResponse = {
  runId: string;
  results: [string, ExecutionResult][];
  workerContexts: [string, WorkerContext][];
  error?: string;
  cancelled?: boolean;
};
