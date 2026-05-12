import * as Rg from "rowguard";
import type {
  ColumnBuilder as IColumnBuilder,
  ConditionChain as IConditionChain,
  PolicyBuilder as IPolicyBuilder,
  SubqueryBuilder as ISubqueryBuilder,
  PolicyOperation,
  SessionVariableType,
} from "rowguard";
import { IData, DataType, InstanceDataType } from "../types";
import { createDataFromRawValue, getRawValueFromData } from "../utils";
import { createRuntimeError } from "./built-in";
import { Context, OperationListItem } from "../execution/types";

const { TypedColumnBuilder } = Rg;

const ColumnBuilderType: DataType = {
  kind: "instance",
  className: "ColumnBuilder",
  constructorArgs: [],
};

const ConditionChainType: DataType = {
  kind: "instance",
  className: "ConditionChain",
  constructorArgs: [],
};

const PolicyBuilderType: DataType = {
  kind: "instance",
  className: "PolicyBuilder",
  constructorArgs: [],
};

const SubqueryBuilderType: DataType = {
  kind: "instance",
  className: "SubqueryBuilder",
  constructorArgs: [],
};

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
  parameters: OperationListItem["parameters"] = []
): OperationListItem {
  const instType = instanceType as InstanceDataType;
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
        return createDataFromRawValue(result, context);
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

const AuthType: DataType = {
  kind: "instance",
  className: "Auth",
  constructorArgs: [],
};

const SessionType: DataType = {
  kind: "instance",
  className: "Session",
  constructorArgs: [],
};

// ─── auth + session standalone (property access) ──────────────────

const authOp: OperationListItem = {
  name: "auth",
  parameters: [],
  source: { name: "rowguard" as const },
  handler: (context: Context) => createDataFromRawValue(Rg.auth, context),
};

const sessionOp: OperationListItem = {
  name: "session",
  parameters: [],
  source: { name: "rowguard" as const },
  handler: (context: Context) => createDataFromRawValue(Rg.session, context),
};

// ─── Auth builder methods ─────────────────────────────────────────

const authMethods: OperationListItem[] = [
  createNoParamBuilderOp("uid", AuthType, (instance: typeof Rg.auth) =>
    instance.uid()
  ),
];

const authOperations: OperationListItem[] = authMethods.map((op) => ({
  ...op,
  source: { name: "rowguardAuthBuilder" as const },
}));

// ─── Session builder methods ──────────────────────────────────────

const sessionMethods: OperationListItem[] = [
  createBuilderOperation(
    "get",
    SessionType,
    (instance: typeof Rg.session, context, key, type) =>
      instance.get(
        getRawValueFromData(key, context) as string,
        (type
          ? (getRawValueFromData(type, context) as SessionVariableType)
          : "text") as SessionVariableType
      ),
    [
      { type: { kind: "string" }, name: "key" },
      {
        type: { kind: "string" },
        name: "type",
        isOptional: true,
      },
    ]
  ),
];

const sessionOperations: OperationListItem[] = sessionMethods.map((op) => ({
  ...op,
  source: { name: "rowguardSessionBuilder" as const },
}));

// ─── qualifiedColumn (table, column) ───────────────────────────────

const qualifiedColumnOp: OperationListItem = {
  name: "qualifiedColumn",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    { type: { kind: "string" }, name: "column" },
  ],
  source: { name: "rowguard" as const },
  handler: (_context: Context, tableData: IData, columnData: IData) => {
    const table = getRawValueFromData(tableData, _context) as string;
    const column = getRawValueFromData(columnData, _context) as string;
    return createDataFromRawValue(
      new TypedColumnBuilder(table, column),
      _context
    );
  },
};

// ─── Policy template operations ───────────────────────────────────

const policiesUserOwnedOp: OperationListItem = {
  name: "policiesUserOwned",
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
  handler: (
    context: Context,
    tableData: IData,
    opsData?: IData,
    colData?: IData
  ) => {
    const table = getRawValueFromData(tableData, context) as string;
    const operations = opsData
      ? (getRawValueFromData(opsData, context) as string | string[])
      : undefined;
    const userIdColumn = colData
      ? (getRawValueFromData(colData, context) as string)
      : undefined;
    const args: unknown[] = [table];
    if (operations !== undefined) args.push(operations);
    if (userIdColumn !== undefined) args.push(userIdColumn);
    const result = (Rg.policies.userOwned as (...a: unknown[]) => unknown)(
      ...args
    );
    return createDataFromRawValue(result, context);
  },
};

const policiesTenantIsolationOp: OperationListItem = {
  name: "policiesTenantIsolation",
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
  handler: (
    context: Context,
    tableData: IData,
    tcData?: IData,
    skData?: IData
  ) => {
    const table = getRawValueFromData(tableData, context) as string;
    const tenantColumn = tcData
      ? (getRawValueFromData(tcData, context) as string)
      : undefined;
    const sessionKey = skData
      ? (getRawValueFromData(skData, context) as string)
      : undefined;
    const args: unknown[] = [table];
    if (tenantColumn !== undefined) args.push(tenantColumn);
    if (sessionKey !== undefined) args.push(sessionKey);
    const result = (
      Rg.policies.tenantIsolation as (...a: unknown[]) => unknown
    )(...args);
    return createDataFromRawValue(result, context);
  },
};

const policiesPublicAccessOp: OperationListItem = {
  name: "policiesPublicAccess",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    {
      type: { kind: "string" },
      name: "visibilityColumn",
      isOptional: true,
    },
  ],
  source: { name: "rowguard" as const },
  handler: (context: Context, tableData: IData, vcData?: IData) => {
    const table = getRawValueFromData(tableData, context) as string;
    const visibilityColumn = vcData
      ? (getRawValueFromData(vcData, context) as string)
      : undefined;
    const args: unknown[] = [table];
    if (visibilityColumn !== undefined) args.push(visibilityColumn);
    const result = (Rg.policies.publicAccess as (...a: unknown[]) => unknown)(
      ...args
    );
    return createDataFromRawValue(result, context);
  },
};

const policiesRoleAccessOp: OperationListItem = {
  name: "policiesRoleAccess",
  parameters: [
    { type: { kind: "string" }, name: "table" },
    { type: { kind: "string" }, name: "role" },
    { type: { kind: "unknown" }, name: "operations", isOptional: true },
  ],
  source: { name: "rowguard" as const },
  handler: (
    context: Context,
    tableData: IData,
    roleData: IData,
    opsData?: IData
  ) => {
    const table = getRawValueFromData(tableData, context) as string;
    const role = getRawValueFromData(roleData, context) as string;
    const operations = opsData
      ? (getRawValueFromData(opsData, context) as string | string[])
      : undefined;
    const args: unknown[] = [table, role];
    if (operations !== undefined) args.push(operations);
    const result = (Rg.policies.roleAccess as (...a: unknown[]) => unknown)(
      ...args
    );
    return createDataFromRawValue(result, context);
  },
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
    [{ type: ConditionChainType, name: "other" }]
  ),
  createBuilderOperation<IConditionChain>(
    "or",
    ConditionChainType,
    (instance, context, other) =>
      instance.or(getRawValueFromData(other, context) as IConditionChain),
    [{ type: ConditionChainType, name: "other" }]
  ),
  createNoParamBuilderOp<IConditionChain>(
    "toCondition",
    ConditionChainType,
    (instance) => instance.toCondition()
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
    [{ type: ConditionChainType, name: "condition" }]
  ),
  createBuilderOperation<IPolicyBuilder>(
    "withCheck",
    PolicyBuilderType,
    (instance, context, condition) =>
      instance.withCheck(
        getRawValueFromData(condition, context) as IConditionChain
      ),
    [{ type: ConditionChainType, name: "condition" }]
  ),
  createBuilderOperation<IPolicyBuilder>(
    "allow",
    PolicyBuilderType,
    (instance, context, condition) =>
      instance.allow(
        getRawValueFromData(condition, context) as IConditionChain
      ),
    [{ type: ConditionChainType, name: "condition" }]
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
    [{ type: ConditionChainType, name: "condition" }]
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
      { type: ConditionChainType, name: "on" },
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

export const rowguardOperations: OperationListItem[] = [
  ...standaloneOperations,
  authOp,
  sessionOp,
  qualifiedColumnOp,
  policiesUserOwnedOp,
  policiesTenantIsolationOp,
  policiesPublicAccessOp,
  policiesRoleAccessOp,
  ...columnBuilderOperations,
  ...conditionChainOperations,
  ...policyBuilderOperations,
  ...subqueryBuilderOperations,
  ...authOperations,
  ...sessionOperations,
];
