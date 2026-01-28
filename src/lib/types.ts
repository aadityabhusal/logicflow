export type UndefinedType = { kind: "undefined" };
export type StringType = { kind: "string" };
export type NumberType = { kind: "number" };
export type BooleanType = { kind: "boolean" };
export type ArrayType = { kind: "array"; elementType: DataType };
export type TupleType = { kind: "tuple"; elements: DataType[] };
export type ObjectType = {
  kind: "object";
  properties: { [key: string]: DataType };
  required?: string[];
};
export type DictionaryType = { kind: "dictionary"; elementType: DataType };
export type UnionType = {
  kind: "union";
  types: DataType[];
  activeIndex?: number;
};
export type OperationType = {
  kind: "operation";
  parameters: { type: DataType; name?: string; isOptional?: boolean }[];
  result: DataType;
};
export type ConditionType = { kind: "condition"; result: DataType };
export type UnknownType = { kind: "unknown" };
export type NeverType = { kind: "never" };
export type ReferenceType = {
  kind: "reference";
  // referenceType: "variable" | "env";
  dataType: DataType;
};
export type ErrorType = {
  kind: "error";
  errorType:
    | "reference_error"
    | "type_error"
    | "runtime_error"
    | "custom_error";
};

export type DataType =
  | UnknownType
  | NeverType
  | UndefinedType
  | StringType
  | NumberType
  | BooleanType
  | ArrayType
  | TupleType
  | ObjectType
  | DictionaryType
  | UnionType
  | OperationType
  | ConditionType
  | ReferenceType
  | ErrorType;

type BaseDataValue<T extends DataType> = T extends UnknownType
  ? unknown
  : T extends NeverType
  ? never
  : T extends UndefinedType
  ? undefined
  : T extends StringType
  ? string
  : T extends NumberType
  ? number
  : T extends BooleanType
  ? boolean
  : T extends ArrayType
  ? IStatement[]
  : T extends TupleType
  ? IStatement[]
  : T extends ObjectType
  ? Map<keyof T["properties"] & string, IStatement>
  : T extends DictionaryType
  ? Map<string, IStatement>
  : T extends OperationType
  ? {
      parameters: IStatement[];
      statements: IStatement[];
      name?: string; // for operations calls
    }
  : T extends ConditionType
  ? {
      condition: IStatement;
      true: IStatement;
      false: IStatement;
    }
  : T extends ReferenceType
  ? { name: string; id: string }
  : T extends ErrorType
  ? { reason: string }
  : never;

export type DataValue<T extends DataType> = T extends UnionType & {
  types: infer U extends DataType[];
}
  ? BaseDataValue<U[number]>
  : BaseDataValue<T>;

export interface IData<T extends DataType = DataType> {
  id: string;
  type: T;
  value: DataValue<T>;
}

export interface IStatement {
  id: string;
  data: IData;
  operations: IData<OperationType>[];
  name?: string;
  isOptional?: boolean;
}

/* UI Types */

export interface IDropdownItem {
  label?: string;
  value: string;
  secondaryLabel?: string;
  type?: DataType;
  entityType: "data" | "operationCall";
  onClick?: () => void;
}

export type NavigationEntity = {
  id: string;
  depth: number;
  operationId: string;
  statementIndex: number;
  statementId?: string;
};

export type NavigationDirection = "left" | "right" | "up" | "down";
export type NavigationModifier = "alt" | "mod";
export type INavigation = {
  id?: string;
  direction?: NavigationDirection;
  modifier?: NavigationModifier;
  disable?: boolean;
};

/* Context and Execution */

export type ExecutionResult = { data?: IData; isPending?: boolean };
export type Context = {
  variables: Map<
    string,
    { data: IData; reference?: { name: string; id: string } }
  >;
  reservedNames?: Set<{
    kind: "data-type" | "operation" | "variable";
    name: string;
  }>;
  narrowedTypes?: Context["variables"];
  expectedType?: DataType;
  enforceExpectedType?: boolean;
  skipExecution?: { reason: string; kind: "unreachable" | "error" };
  getResult: (entityId: string) => ExecutionResult | undefined;
  setResult?: (entityId: string, result: IData) => void; // Only for async execution of operation calls inside an operation definition
  setPending?: (id: string, isPending: boolean) => void;
  fileId?: string;
};

export type OperationListItem = {
  name: string;
  parameters:
    | ((data: IData) => OperationType["parameters"])
    | OperationType["parameters"];
  isManual?: boolean;
} & ( // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { handler: (...args: [Context, ...IData<any>[]]) => Promise<IData> | IData }
  | {
      lazyHandler: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...args: [Context, IData<any>, ...IStatement[]]
      ) => Promise<IData> | IData;
    }
  | { statements: IStatement[] }
);

/* Project Types */

export interface Project {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt?: number;
  files: ProjectFile[];
  description?: string;
  userId?: string;
  dependencies?: Dependencies;
  deployment?: DeploymentConfig;
  repository?: { url: string; currentBranch?: string; lastCommit?: string };
}

export type ProjectFile = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
} & (
  | {
      type: "operation";
      content: { type: OperationType; value: DataValue<OperationType> };
      tests?: TestCase[];
      documentation?: string;
    }
  | { type: "globals"; content: Record<string, IData> }
  | { type: "documentation"; content: string }
  | { type: "json"; content: Record<string, unknown> }
);

export interface TestCase {
  name: string;
  description?: string;
  inputs: IData[];
  expectedOutput: IData;
  status?: "pending" | "passed" | "failed";
}

export interface DependencyBase {
  namespace?: string;
  version: string;
  types?: string;
  exports: {
    name: string; // System will handle the kind of export
    importedBy: { operationName: string }[];
  }[];
}
export interface Dependencies {
  npm?: (DependencyBase & { name: string })[];
  logicflow?: (DependencyBase & { projectId: string })[];
}

export type DeploymentConfig = {
  trigger: (HttpTrigger | CronTrigger)[]; // TODO: trigger should be the entrypoint file with 'request' as a parameter
  runtime: {
    type: "node" | "deno" | "edge";
    version: string;
    language: "typescript";
    target: "ES2019" | "ES2020" | "ES2021" | "ES2022" | "ESNext";
    timeout?: number;
    memory?: number;
    regions?: string[];
  };
  build: {
    outDir: string;
    tsconfig: Record<string, unknown>;
    include?: string[];
    exclude?: string[];
  };
  environmentVariables: { key: string; required: boolean }[];
  ciCd?: Record<string, unknown>;
} & (
  | { platform: "vercel" }
  | { platform: "netlify" }
  | { platform: "cloudflare"; compatibility_flags?: string[] }
  | {
      platform: "supabase";
      permissions?: { read?: string[]; write?: string[]; env?: string[] };
      verify_jwt: boolean;
    }
);

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export interface HttpTrigger {
  type: "http";
  path: string;
  methods?: HttpMethod | HttpMethod[]; // If undefined, accepts all methods
  cors?: {
    origin: string | string[];
    methods?: HttpMethod[];
    allowedHeaders?: string[];
    credentials?: boolean;
  };
}

export interface CronTrigger {
  type: "cron";
  schedule: string; // Cron expression
  timezone?: string;
}

export type SetItem<T> = T extends Set<infer U> ? U : never;
