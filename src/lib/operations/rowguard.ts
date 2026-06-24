import * as Rg from "rowguard";
import type {
  ColumnBuilder as IColumnBuilder,
  ConditionChain as IConditionChain,
  PolicyBuilder as IPolicyBuilder,
  SubqueryBuilder as ISubqueryBuilder,
  PolicyOperation,
  SessionVariableType,
} from "rowguard";
import { IData, DataType, InstanceDataType, OperationType } from "../types";
import {
  createDataFromRawValue,
  getRawValueFromData,
  createRuntimeError,
} from "../utils";
import { Context, OperationListItem } from "../execution/types";
import { InstanceTypeConfig } from "@/lib/packages/registry";
import { createData } from "../utils";

// Placeholder constructor for structural Rowguard types that have no real
// runtime class (Condition, ContextValue are TypeScript structural interfaces).
// Required by the InstanceTypeConfig registry; not used at runtime.
class RowguardStructuralConditionPlaceholder {}

const ColumnBuilderType: DataType = {
  kind: "instance",
  className: "rowguard.ColumnBuilder",
  constructorArgs: [],
};

const ConditionChainType: DataType = {
  kind: "instance",
  className: "rowguard.ConditionChain",
  constructorArgs: [],
};

const PolicyBuilderType: DataType = {
  kind: "instance",
  className: "rowguard.PolicyBuilder",
  constructorArgs: [],
};

const SubqueryBuilderType: DataType = {
  kind: "instance",
  className: "rowguard.SubqueryBuilder",
  constructorArgs: [],
};

const ConditionType: DataType = {
  kind: "instance",
  className: "rowguard.Condition",
  constructorArgs: [],
};

const ContextValueType: DataType = {
  kind: "instance",
  className: "rowguard.ContextValue",
  constructorArgs: [],
};

const conditionInputType = (): DataType => ({
  kind: "union",
  // Rowguard condition input (ConditionChain | Condition | ContextValue)
  types: [ConditionChainType, ConditionType, ContextValueType],
});

// Wraps a structural Rowguard object (e.g. Condition, ContextValue)
// as a LogicFlow instance so it is not treated as a generic object/dictionary.
function createRowguardInstanceData(
  value: unknown,
  instanceType: InstanceDataType,
  context: Context
) {
  const data = createData({ type: instanceType });
  context.setInstance(data.value.instanceId, {
    instance: value,
    type: data.type,
  });
  return data;
}

// ─── Handler factories ────────────────────────────────────────────

type RowguardFnKey = keyof typeof Rg;

function createRowguardHandler(operationName: RowguardFnKey) {
  return (context: Context, ...args: IData[]): IData => {
    const rawArgs = args.map((arg) => getRawValueFromData(arg, context));
    const result = (Rg[operationName] as (...a: unknown[]) => unknown)(
      ...rawArgs
    );
    return createDataFromRawValue(result, context);
  };
}

function createBuilderOperation<T>(
  name: string,
  instanceType: DataType,
  method: (instance: T, context: Context, ...args: IData[]) => unknown,
  parameters: OperationListItem["parameters"] = [],
  wrapResult?: (value: unknown, context: Context) => IData
): OperationListItem {
  const instType = instanceType as InstanceDataType;
  const wrap = wrapResult ?? createDataFromRawValue;
  return {
    name,
    parameters: (data) => [
      { type: instanceType },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    handler: (context, data: IData, ...args: IData[]) => {
      const instance = getRawValueFromData(data, context) as T;
      if (!instance)
        return createRuntimeError(`${instType.className} instance not found`);
      try {
        const result = method(instance, context, ...args);
        return wrap(result, context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  };
}

// Shorthand for builder methods with no extra params (only the instance)
function createNoParamBuilderOp<T>(
  name: string,
  instanceType: DataType,
  method: (instance: T) => unknown
): OperationListItem {
  return createBuilderOperation<T>(
    name,
    instanceType,
    (instance) => method(instance),
    []
  );
}

// ─── Standalone operations ────────────────────────────────────────

type StandaloneDef = Omit<OperationListItem, "handler" | "source"> & {
  name: RowguardFnKey;
};

const standaloneDefs: StandaloneDef[] = [
  {
    name: "column",
    parameters: [{ type: { kind: "string" }, name: "columnName" }],
  },
  {
    name: "policy",
    parameters: [{ type: { kind: "string" }, name: "name", isOptional: true }],
  },
  {
    name: "from",
    parameters: [
      { type: { kind: "string" }, name: "table" },
      { type: { kind: "string" }, name: "alias", isOptional: true },
    ],
  },
  {
    name: "hasRole",
    parameters: [
      { type: { kind: "string" }, name: "role" },
      {
        type: { kind: "string" },
        name: "userRolesTable",
        isOptional: true,
      },
    ],
  },
  { name: "alwaysTrue", parameters: [] },
  {
    name: "call",
    parameters: [
      { type: { kind: "string" }, name: "functionName" },
      {
        type: { kind: "array", elementType: { kind: "unknown" } },
        name: "args",
      },
    ],
  },
  { name: "currentUser", parameters: [] },
  {
    name: "sql",
    parameters: [{ type: { kind: "string" }, name: "expression" }],
  },
  {
    name: "createPolicyGroup",
    parameters: [
      { type: { kind: "string" }, name: "name" },
      {
        type: { kind: "array", elementType: { kind: "unknown" } },
        name: "policies",
      },
      {
        type: { kind: "string" },
        name: "description",
        isOptional: true,
      },
    ],
  },
  {
    name: "policyGroupToSQL",
    parameters: [
      { type: { kind: "unknown" }, name: "group" },
      { type: { kind: "unknown" }, name: "options", isOptional: true },
    ],
  },
];

const standaloneOperations: OperationListItem[] = standaloneDefs.map((def) => ({
  ...def,
  source: { name: "rowguard" as const },
  handler: createRowguardHandler(def.name),
}));

// ─── Direct auth + session operations ──────────────────────────────

const authUidOp: OperationListItem = {
  name: "auth.uid",
  parameters: [],
  source: { name: "rowguard" },
  handler: (_context: Context) =>
    createRowguardInstanceData(Rg.auth.uid(), ContextValueType, _context),
};

const sessionGetOp: OperationListItem = {
  name: "session.get",
  parameters: [
    { type: { kind: "string" }, name: "key" },
    {
      type: { kind: "string" },
      name: "type",
      isOptional: true,
    },
  ],
  source: { name: "rowguard" },
  handler: (_context: Context, keyData: IData, typeData?: IData) => {
    const key = getRawValueFromData(keyData, _context) as string;
    const type = typeData
      ? (getRawValueFromData(typeData, _context) as SessionVariableType)
      : "text";
    return createRowguardInstanceData(
      Rg.session.get(key, type),
      ContextValueType,
      _context
    );
  },
};

// ─── Nested package path handler ───────────────────────────────────

function createNestedHandler(pathSegments: string[]) {
  return (context: Context, ...args: IData[]): IData => {
    const rawArgs = args
      .map((arg) => getRawValueFromData(arg, context))
      .filter((val) => val !== undefined);
    let target: unknown = Rg;
    for (const segment of pathSegments.slice(0, -1)) {
      target = (target as Record<string, unknown>)[segment];
    }
    const methodName = pathSegments[pathSegments.length - 1];
    const result = (
      (target as Record<string, unknown>)[methodName] as (
        ...a: unknown[]
      ) => unknown
    )(...rawArgs);
    return createDataFromRawValue(result, context);
  };
}

// ─── Policy template operations ───────────────────────────────────

const policiesUserOwnedOp: OperationListItem = {
  name: "policies.userOwned",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    { type: { kind: "unknown" }, name: "operations", isOptional: true },
    {
      type: { kind: "string" },
      name: "userIdColumn",
      isOptional: true,
    },
  ],
  source: { name: "rowguard" as const },
  handler: createNestedHandler(["policies", "userOwned"]),
};

const policiesTenantIsolationOp: OperationListItem = {
  name: "policies.tenantIsolation",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    {
      type: { kind: "string" },
      name: "tenantColumn",
      isOptional: true,
    },
    {
      type: { kind: "string" },
      name: "sessionKey",
      isOptional: true,
    },
  ],
  source: { name: "rowguard" as const },
  handler: createNestedHandler(["policies", "tenantIsolation"]),
};

const policiesPublicAccessOp: OperationListItem = {
  name: "policies.publicAccess",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    {
      type: { kind: "string" },
      name: "visibilityColumn",
      isOptional: true,
    },
  ],
  source: { name: "rowguard" as const },
  handler: createNestedHandler(["policies", "publicAccess"]),
};

const policiesRoleAccessOp: OperationListItem = {
  name: "policies.roleAccess",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    { type: { kind: "string" }, name: "role" },
    { type: { kind: "unknown" }, name: "operations", isOptional: true },
  ],
  source: { name: "rowguard" as const },
  handler: createNestedHandler(["policies", "roleAccess"]),
};

// ─── ColumnBuilder instance methods ────────────────────────────────

const columnBuilderMethods: OperationListItem[] = [
  createBuilderOperation<IColumnBuilder>(
    "eq",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.eq as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "neq",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.neq as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "gt",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.gt as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "gte",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.gte as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "lt",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.lt as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "lte",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.lte as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "like",
    ColumnBuilderType,
    (instance, context, pattern) =>
      instance.like(getRawValueFromData(pattern, context) as string),
    [{ type: { kind: "string" }, name: "pattern" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "ilike",
    ColumnBuilderType,
    (instance, context, pattern) =>
      instance.ilike(getRawValueFromData(pattern, context) as string),
    [{ type: { kind: "string" }, name: "pattern" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "in",
    ColumnBuilderType,
    (instance, context, values) =>
      (instance.in as (v: unknown) => IConditionChain)(
        getRawValueFromData(values, context)
      ),
    [{ type: { kind: "unknown" }, name: "values" }]
  ),
  createBuilderOperation<IColumnBuilder>(
    "contains",
    ColumnBuilderType,
    (instance, context, value) =>
      (instance.contains as (v: unknown) => IConditionChain)(
        getRawValueFromData(value, context)
      ),
    [{ type: { kind: "unknown" }, name: "value" }]
  ),
  createNoParamBuilderOp<IColumnBuilder>(
    "isNull",
    ColumnBuilderType,
    (instance) => instance.isNull()
  ),
  createNoParamBuilderOp<IColumnBuilder>(
    "isNotNull",
    ColumnBuilderType,
    (instance) => instance.isNotNull()
  ),
  createNoParamBuilderOp<IColumnBuilder>(
    "isOwner",
    ColumnBuilderType,
    (instance) => instance.isOwner()
  ),
  createNoParamBuilderOp<IColumnBuilder>(
    "isPublic",
    ColumnBuilderType,
    (instance) => instance.isPublic()
  ),
  createBuilderOperation<IColumnBuilder>(
    "belongsToTenant",
    ColumnBuilderType,
    (instance, context, sessionKey) =>
      instance.belongsToTenant(
        sessionKey
          ? (getRawValueFromData(sessionKey, context) as string)
          : undefined
      ),
    [
      {
        type: { kind: "string" },
        name: "sessionKey",
        isOptional: true,
      },
    ]
  ),
  createBuilderOperation<IColumnBuilder>(
    "isMemberOf",
    ColumnBuilderType,
    (instance, context, joinTable, foreignKey, localKey) =>
      instance.isMemberOf(
        getRawValueFromData(joinTable, context) as string,
        getRawValueFromData(foreignKey, context) as string,
        localKey
          ? (getRawValueFromData(localKey, context) as string)
          : undefined
      ),
    [
      { type: { kind: "string" }, name: "joinTable" },
      { type: { kind: "string" }, name: "foreignKey" },
      {
        type: { kind: "string" },
        name: "localKey",
        isOptional: true,
      },
    ]
  ),
  createBuilderOperation<IColumnBuilder>(
    "userBelongsTo",
    ColumnBuilderType,
    (instance, context, membershipTable, membershipColumn) =>
      instance.userBelongsTo(
        getRawValueFromData(membershipTable, context) as string,
        membershipColumn
          ? (getRawValueFromData(membershipColumn, context) as string)
          : undefined
      ),
    [
      { type: { kind: "string" }, name: "membershipTable" },
      {
        type: { kind: "string" },
        name: "membershipColumn",
        isOptional: true,
      },
    ]
  ),
  createBuilderOperation<IColumnBuilder>(
    "releasedBefore",
    ColumnBuilderType,
    (instance, context, referenceDate) =>
      instance.releasedBefore(
        referenceDate
          ? (getRawValueFromData(referenceDate, context) as Date)
          : undefined
      ),
    [
      {
        type: { kind: "unknown" },
        name: "referenceDate",
        isOptional: true,
      },
    ]
  ),
];

const columnBuilderOperations: OperationListItem[] = columnBuilderMethods.map(
  (op) => ({
    ...op,
    source: { name: "rowguardColumnBuilder" as const },
  })
);

// ─── ConditionChain instance methods ───────────────────────────────

const conditionChainMethods: OperationListItem[] = [
  createBuilderOperation<IConditionChain>(
    "and",
    ConditionChainType,
    (instance, context, other) =>
      instance.and(getRawValueFromData(other, context) as IConditionChain),
    [{ type: conditionInputType(), name: "other" }]
  ),
  createBuilderOperation<IConditionChain>(
    "or",
    ConditionChainType,
    (instance, context, other) =>
      instance.or(getRawValueFromData(other, context) as IConditionChain),
    [{ type: conditionInputType(), name: "other" }]
  ),
  createBuilderOperation<IConditionChain>(
    "toCondition",
    ConditionChainType,
    (instance) => instance.toCondition(),
    [],
    (value, context) =>
      createRowguardInstanceData(value, ConditionType, context)
  ),
  createNoParamBuilderOp<IConditionChain>(
    "toSQL",
    ConditionChainType,
    (instance) => instance.toSQL()
  ),
];

const conditionChainOperations: OperationListItem[] = conditionChainMethods.map(
  (op) => ({
    ...op,
    source: { name: "rowguardConditionChain" as const },
  })
);

// ─── Condition + ContextValue instance methods ──────────────────────

const structuralConditionOperations: OperationListItem[] = [
  createNoParamBuilderOp<{ toSQL(): string }>(
    "toSQL",
    ConditionType,
    (instance) => instance.toSQL()
  ),
  createNoParamBuilderOp<{ toSQL(): string }>(
    "toSQL",
    ContextValueType,
    (instance) => instance.toSQL()
  ),
].map((op) => ({ ...op, source: { name: "rowguardCondition" as const } }));

// ─── PolicyBuilder instance methods ────────────────────────────────

const policyBuilderMethods: OperationListItem[] = [
  createBuilderOperation<IPolicyBuilder>(
    "on",
    PolicyBuilderType,
    (instance, context, table) =>
      instance.on(getRawValueFromData(table, context) as string),
    [{ type: { kind: "string" }, name: "table" }]
  ),
  createBuilderOperation<IPolicyBuilder>(
    "for",
    PolicyBuilderType,
    (instance, context, operation) =>
      instance.for(getRawValueFromData(operation, context) as PolicyOperation),
    [{ type: { kind: "string" }, name: "operation" }]
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "read",
    PolicyBuilderType,
    (instance) => instance.read()
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "write",
    PolicyBuilderType,
    (instance) => instance.write()
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "update",
    PolicyBuilderType,
    (instance) => instance.update()
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "delete",
    PolicyBuilderType,
    (instance) => instance.delete()
  ),
  createNoParamBuilderOp<IPolicyBuilder>("all", PolicyBuilderType, (instance) =>
    instance.all()
  ),
  createBuilderOperation<IPolicyBuilder>(
    "to",
    PolicyBuilderType,
    (instance, context, role) =>
      instance.to(getRawValueFromData(role, context) as string),
    [{ type: { kind: "string" }, name: "role" }]
  ),
  createBuilderOperation<IPolicyBuilder>(
    "when",
    PolicyBuilderType,
    (instance, context, condition) =>
      instance.when(getRawValueFromData(condition, context) as IConditionChain),
    [{ type: conditionInputType(), name: "condition" }]
  ),
  createBuilderOperation<IPolicyBuilder>(
    "withCheck",
    PolicyBuilderType,
    (instance, context, condition) =>
      instance.withCheck(
        getRawValueFromData(condition, context) as IConditionChain
      ),
    [{ type: conditionInputType(), name: "condition" }]
  ),
  createBuilderOperation<IPolicyBuilder>(
    "allow",
    PolicyBuilderType,
    (instance, context, condition) =>
      instance.allow(
        getRawValueFromData(condition, context) as IConditionChain
      ),
    [{ type: conditionInputType(), name: "condition" }]
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "restrictive",
    PolicyBuilderType,
    (instance) => instance.restrictive()
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "permissive",
    PolicyBuilderType,
    (instance) => instance.permissive()
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "requireAll",
    PolicyBuilderType,
    (instance) => instance.requireAll()
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "allowAny",
    PolicyBuilderType,
    (instance) => instance.allowAny()
  ),
  createBuilderOperation<IPolicyBuilder>(
    "description",
    PolicyBuilderType,
    (instance, context, text) =>
      instance.description(getRawValueFromData(text, context) as string),
    [{ type: { kind: "string" }, name: "text" }]
  ),
  createNoParamBuilderOp<IPolicyBuilder>(
    "toDefinition",
    PolicyBuilderType,
    (instance) => instance.toDefinition()
  ),
  createBuilderOperation<IPolicyBuilder>(
    "toSQL",
    PolicyBuilderType,
    (instance, context, options) =>
      instance.toSQL(
        options
          ? (getRawValueFromData(options, context) as Record<string, unknown>)
          : undefined
      ),
    [{ type: { kind: "unknown" }, name: "options", isOptional: true }]
  ),
];

const policyBuilderOperations: OperationListItem[] = policyBuilderMethods.map(
  (op) => ({
    ...op,
    source: { name: "rowguardPolicyBuilder" as const },
  })
);

// ─── SubqueryBuilder instance methods ──────────────────────────────

const subqueryBuilderMethods: OperationListItem[] = [
  createBuilderOperation<ISubqueryBuilder>(
    "select",
    SubqueryBuilderType,
    (instance, context, columns) =>
      instance.select(
        getRawValueFromData(columns, context) as string | string[]
      ),
    [{ type: { kind: "unknown" }, name: "columns" }]
  ),
  createBuilderOperation<ISubqueryBuilder>(
    "where",
    SubqueryBuilderType,
    (instance, context, condition) =>
      instance.where(
        getRawValueFromData(condition, context) as IConditionChain
      ),
    [{ type: conditionInputType(), name: "condition" }]
  ),
  createBuilderOperation<ISubqueryBuilder>(
    "join",
    SubqueryBuilderType,
    (instance, context, table, on, type, alias) =>
      instance.join(
        getRawValueFromData(table, context) as string,
        getRawValueFromData(on, context) as IConditionChain,
        type
          ? (getRawValueFromData(type, context) as
              | "inner"
              | "left"
              | "right"
              | "full")
          : undefined,
        alias ? (getRawValueFromData(alias, context) as string) : undefined
      ),
    [
      { type: { kind: "string" }, name: "table" },
      { type: conditionInputType(), name: "on" },
      {
        type: { kind: "string" },
        name: "type",
        isOptional: true,
      },
      {
        type: { kind: "string" },
        name: "alias",
        isOptional: true,
      },
    ]
  ),
  createNoParamBuilderOp<ISubqueryBuilder>(
    "toSubquery",
    SubqueryBuilderType,
    (instance) => instance.toSubquery()
  ),
];

const subqueryBuilderOperations: OperationListItem[] =
  subqueryBuilderMethods.map((op) => ({
    ...op,
    source: { name: "rowguardSubqueryBuilder" as const },
  }));

// ─── Final export ──────────────────────────────────────────────────

export const operations: OperationListItem[] = [
  ...standaloneOperations,
  authUidOp,
  sessionGetOp,
  policiesUserOwnedOp,
  policiesTenantIsolationOp,
  policiesPublicAccessOp,
  policiesRoleAccessOp,
  ...columnBuilderOperations,
  ...conditionChainOperations,
  ...structuralConditionOperations,
  ...policyBuilderOperations,
  ...subqueryBuilderOperations,
];

export const instanceTypes: Record<string, InstanceTypeConfig> = {
  "rowguard.ColumnBuilder": {
    name: "rowguard.ColumnBuilder",
    Constructor: Rg.ColumnBuilder,
    constructorArgs: [
      { type: { kind: "string" } },
    ] as OperationType["parameters"],
    importInfo: { packageName: "rowguard" },
    docsUrl:
      "https://supabase-community.github.io/rowguard/classes/ColumnBuilder.html",
  },
  "rowguard.ConditionChain": {
    name: "rowguard.ConditionChain",
    Constructor: Rg.ConditionChain,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "rowguard" },
    docsUrl:
      "https://supabase-community.github.io/rowguard/classes/ConditionChain.html",
  },
  "rowguard.PolicyBuilder": {
    name: "rowguard.PolicyBuilder",
    Constructor: Rg.PolicyBuilder,
    constructorArgs: [
      { type: { kind: "string" }, isOptional: true },
    ] as OperationType["parameters"],
    importInfo: { packageName: "rowguard" },
    docsUrl:
      "https://supabase-community.github.io/rowguard/classes/PolicyBuilder.html",
  },
  "rowguard.SubqueryBuilder": {
    name: "rowguard.SubqueryBuilder",
    Constructor: Rg.SubqueryBuilder,
    constructorArgs: [
      { type: { kind: "string" } },
      { type: { kind: "string" }, isOptional: true },
    ] as OperationType["parameters"],
    importInfo: { packageName: "rowguard" },
    docsUrl:
      "https://supabase-community.github.io/rowguard/classes/SubqueryBuilder.html",
  },
  "rowguard.SQLExpression": {
    name: "rowguard.SQLExpression",
    Constructor: Rg.SQLExpression,
    constructorArgs: [
      { type: { kind: "string" } },
    ] as OperationType["parameters"],
    hideFromDropdown: true,
    importInfo: { packageName: "rowguard" },
  },
  "rowguard.Condition": {
    name: "rowguard.Condition",
    Constructor: RowguardStructuralConditionPlaceholder,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "rowguard" },
  },
  "rowguard.ContextValue": {
    name: "rowguard.ContextValue",
    Constructor: RowguardStructuralConditionPlaceholder,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "rowguard" },
  },
};

export default { operations, instanceTypes };
