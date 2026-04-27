import {
  ConstructorType,
  DataType,
  IData,
  IStatement,
  OperationSource,
  OperationType,
} from "../types";

export type Thenable<T> = {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Thenable<TResult1 | TResult2>;
};

export type ExecutionResult = { data?: IData; shouldCacheResult?: boolean };

export type ReservedNames = {
  kind: "data-type" | "operation" | "variable" | "reserved";
  name: string;
}[];

export type Context = {
  scopeId: string;
  variables: Map<
    string,
    // TODO: Should we remove the reference property since we resolve the statement result by default?
    { data: IData; reference?: { name: string; id: string }; isEnv?: boolean }
  >;
  narrowedTypes?: Context["variables"];
  expectedType?: DataType;
  enforceExpectedType?: boolean;
  skipExecution?: { reason: string; kind: "unreachable" | "error" };
  isSync?: boolean;
  isIsolated?: boolean;
  callDepth?: number;
  maxCallDepth?: number;
  abortSignal?: AbortSignal;
  yieldCounter?: { calls: number };
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
