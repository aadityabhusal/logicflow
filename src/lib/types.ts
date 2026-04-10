export type UndefinedType = { kind: "undefined" };
export type StringType = { kind: "string" };
export type NumberType = { kind: "number" };
export type BooleanType = { kind: "boolean" };
export type ArrayType = { kind: "array"; elementType: DataType };
export type TupleType = { kind: "tuple"; elements: DataType[] };
export type ObjectType = {
  kind: "object";
  // properties is array to support LLM generation
  properties: Array<{ key: string; value: DataType }>;
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
  parameters: {
    type: DataType;
    name?: string;
    isOptional?: boolean;
    isRest?: boolean;
  }[];
  result: DataType;
};
export type ConditionType = { kind: "condition"; result: DataType };
export type UnknownType = { kind: "unknown" };
export type NeverType = { kind: "never" };
export type ReferenceType = {
  kind: "reference";
  name: string;
  isEnv?: boolean;
};
export type ErrorType = {
  kind: "error";
  errorType:
    | "reference_error"
    | "type_error"
    | "runtime_error"
    | "custom_error";
};
export type InstanceDataType = {
  kind: "instance";
  className: string;
  constructorArgs: OperationType["parameters"];
  result?: DataType;
};

export type OperationSource = {
  name: "remeda" | "wretch" | "wretchResponseChain";
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
  | ErrorType
  | InstanceDataType;

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
                  ? { entries: Array<{ key: string; value: IStatement }> }
                  : T extends DictionaryType
                    ? { entries: Array<{ key: string; value: IStatement }> }
                    : T extends OperationType
                      ? {
                          parameters: IStatement[];
                          statements: IStatement[];
                          name?: string;
                          isAsync?: boolean; // Assigned only when the 'await' operation is chained in a statement
                          source?: OperationSource;
                          instanceId?: string;
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
                            : T extends InstanceDataType
                              ? {
                                  className: string;
                                  constructorArgs: IStatement[];
                                  instanceId: string;
                                }
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
  isRest?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConstructorType = new (...args: any[]) => any;

/* UI Types */

export interface IDropdownTargetProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onChange" | "defaultValue"
> {
  onChange?: (value: string) => void;
}
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

export type EntityPath = (string | number)[];

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
      trigger?: HttpTrigger;
      tests?: TestCase[];
      documentation?: string;
    }
  | { type: "globals"; content: Record<string, IData> }
  | { type: "documentation"; content: string }
  | { type: "json"; content: Record<string, unknown> }
);

interface TestCase {
  name: string;
  description?: string;
  inputs: IData[];
  expectedOutput: IData;
  status?: "pending" | "passed" | "failed";
}

interface DependencyBase {
  namespace?: string;
  version: string;
  types?: string;
  exports: {
    name: string; // System will handle the kind of export
    importedBy: { operationName: string }[];
  }[];
}
interface Dependencies {
  npm?: (DependencyBase & { name: string })[];
  logicflow?: (DependencyBase & { projectId: string })[];
}

type VercelDeployment = { platform: "vercel" };
type NetlifyDeployment = { platform: "netlify" };
type SupabaseDeployment = { platform: "supabase" };
export type DeploymentTarget =
  | VercelDeployment
  | NetlifyDeployment
  | SupabaseDeployment;

export type DeploymentConfig = {
  envVariables: { key: string; value: string }[];
  platforms: DeploymentTarget[];
};

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
interface HttpTrigger {
  type: "http";
  path?: string;
  methods?: HttpMethod | HttpMethod[]; // If undefined, accepts all methods
  cors?: {
    origin: string | string[];
    methods?: HttpMethod[];
    allowedHeaders?: string[];
    credentials?: boolean;
  };
}

export type MapValue<T> = T extends Map<unknown, infer V> ? V : never;
