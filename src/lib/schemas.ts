import * as z from "zod";
import type {
  DataType,
  UndefinedType,
  StringType,
  NumberType,
  BooleanType,
  ArrayType,
  ObjectType,
  UnionType,
  OperationType,
  ConditionType,
  IData,
  IStatement,
  IDropdownItem,
  UnknownType,
  NeverType,
  ReferenceType,
  DataValue,
  ErrorType,
  TupleType,
  DictionaryType,
  InstanceDataType,
} from "./types";
import { DataTypes } from "./data";

/**
 * Note: Zod schemas are derived from types because the type relations are complex and some not possible to express in Zod.
 */

const UnknownTypeSchema: z.ZodType<UnknownType> = z.object({
  kind: z.literal("unknown"),
});

const NeverTypeSchema: z.ZodType<NeverType> = z.object({
  kind: z.literal("never"),
});

const UndefinedTypeSchema: z.ZodType<UndefinedType> = z.object({
  kind: z.literal("undefined"),
});

const StringTypeSchema: z.ZodType<StringType> = z.object({
  kind: z.literal("string"),
});

const NumberTypeSchema: z.ZodType<NumberType> = z.object({
  kind: z.literal("number"),
});

const BooleanTypeSchema: z.ZodType<BooleanType> = z.object({
  kind: z.literal("boolean"),
});

const ArrayTypeSchema: z.ZodType<ArrayType> = z.object({
  kind: z.literal("array"),
  get elementType() {
    return DataTypeSchema;
  },
});
export const ArrayValueSchema: z.ZodType<DataValue<ArrayType>> = z.lazy(() =>
  z.array(IStatementSchema)
);

export const TupleTypeSchema: z.ZodType<TupleType> = z.object({
  kind: z.literal("tuple"),
  get elements() {
    return z.array(DataTypeSchema);
  },
});

const ObjectTypeSchema: z.ZodType<ObjectType> = z.object({
  kind: z.literal("object"),
  get properties() {
    return z.record(z.string(), DataTypeSchema);
  },
  required: z.array(z.string()).optional(),
});
export const ObjectValueSchema: z.ZodType<DataValue<ObjectType>> = z.lazy(() =>
  z.map(z.string(), IStatementSchema)
);

export const DictionaryTypeSchema: z.ZodType<DictionaryType> = z.object({
  kind: z.literal("dictionary"),
  get elementType() {
    return DataTypeSchema;
  },
});

const UnionTypeSchema: z.ZodType<UnionType> = z.object({
  kind: z.literal("union"),
  get types() {
    return z.array(DataTypeSchema);
  },
});

const ParameterSchema: z.ZodType<OperationType["parameters"][number]> =
  z.object({
    name: z.string().optional(),
    get type() {
      return DataTypeSchema;
    },
    isOptional: z.boolean().optional(),
  });

const OperationTypeSchema: z.ZodType<OperationType> = z.object({
  kind: z.literal("operation"),
  get parameters() {
    return z.array(ParameterSchema);
  },
  get result() {
    return DataTypeSchema;
  },
});
export const OperationValueSchema: z.ZodType<DataValue<OperationType>> =
  z.object({
    get statements() {
      return z.array(IStatementSchema);
    },
    get parameters() {
      return z.array(IStatementSchema);
    },
    name: z.string().optional(),
  });

const ConditionTypeSchema: z.ZodType<ConditionType> = z.object({
  kind: z.literal("condition"),
  get result() {
    return DataTypeSchema;
  },
});
export const ConditionValueSchema: z.ZodType<DataValue<ConditionType>> =
  z.object({
    get condition() {
      return IStatementSchema;
    },
    get true() {
      return IStatementSchema;
    },
    get false() {
      return IStatementSchema;
    },
  });

const ReferenceTypeSchema: z.ZodType<ReferenceType> = z.object({
  kind: z.literal("reference"),
  // referenceType: z.enum(["variable", "env"]),
  get dataType() {
    return DataTypeSchema;
  },
});
export const ReferenceValueSchema: z.ZodType<DataValue<ReferenceType>> =
  z.object({
    name: z.string(),
    id: z.string(),
  });

const ErrorTypeSchema: z.ZodType<ErrorType> = z.object({
  kind: z.literal("error"),
  errorType: z.enum([
    "reference_error",
    "type_error",
    "runtime_error",
    "custom_error",
  ]),
});
export const ErrorValueSchema: z.ZodType<DataValue<ErrorType>> = z.object({
  reason: z.string(),
});

const InstanceTypeSchema: z.ZodType<InstanceDataType> = z.object({
  kind: z.literal("instance"),
  className: z.string(),
  get constructorArgs() {
    return z.array(ParameterSchema);
  },
});

export const InstanceValueSchema = z.object({
  className: z.string(),
  get constructorArgs() {
    return z.array(IStatementSchema);
  },
});

export const DataTypeSchema: z.ZodType<DataType> = z.union([
  UnknownTypeSchema,
  NeverTypeSchema,
  UndefinedTypeSchema,
  StringTypeSchema,
  NumberTypeSchema,
  BooleanTypeSchema,
  ArrayTypeSchema,
  TupleTypeSchema,
  ObjectTypeSchema,
  DictionaryTypeSchema,
  UnionTypeSchema,
  OperationTypeSchema,
  ConditionTypeSchema,
  ReferenceTypeSchema,
  ErrorTypeSchema,
  InstanceTypeSchema,
]);

export const IDataSchema: z.ZodType<IData> = z.object({ id: z.string() }).and(
  // Note: We use z.union instead of z.discriminatedUnion because the discriminator (kind) is nested inside the type object.
  z.union([
    z.object({ type: UnknownTypeSchema, value: z.unknown() }),
    z.object({ type: NeverTypeSchema, value: z.never() }),
    z.object({ type: UndefinedTypeSchema, value: z.undefined() }),
    z.object({ type: StringTypeSchema, value: z.string() }),
    z.object({ type: NumberTypeSchema, value: z.number() }),
    z.object({ type: BooleanTypeSchema, value: z.boolean() }),
    z.object({ type: ArrayTypeSchema, value: ArrayValueSchema }),
    z.object({ type: TupleTypeSchema, value: ArrayValueSchema }),
    z.object({ type: ObjectTypeSchema, value: ObjectValueSchema }),
    z.object({ type: DictionaryTypeSchema, value: ObjectValueSchema }),
    z.object({
      type: UnionTypeSchema,
      get value() {
        return z.union([
          z.undefined(),
          z.string(),
          z.number(),
          z.boolean(),
          ArrayValueSchema,
          ObjectValueSchema,
          OperationValueSchema,
          ConditionValueSchema,
          ReferenceValueSchema,
          ErrorValueSchema,
          InstanceValueSchema,
        ]);
      },
    }),
    z.object({ type: OperationTypeSchema, value: OperationValueSchema }),
    z.object({ type: ConditionTypeSchema, value: ConditionValueSchema }),
    z.object({ type: ReferenceTypeSchema, value: ReferenceValueSchema }),
    z.object({ type: ErrorTypeSchema, value: ErrorValueSchema }),
    z.object({ type: InstanceTypeSchema, value: InstanceValueSchema }),
  ])
);
export const IStatementSchema: z.ZodType<IStatement> = z.object({
  id: z.string(),
  name: z.string().optional(),
  isOptional: z.boolean().optional(),
  get data() {
    return IDataSchema;
  },
  get operations() {
    return z.array(
      z.object({
        id: z.string(),
        type: OperationTypeSchema,
        value: OperationValueSchema,
      })
    );
  },
});

export const IDropdownItemSchema: z.ZodType<IDropdownItem> = z.object({
  label: z.string().optional(),
  secondaryLabel: z.string().optional(),
  value: z.string(),
  entityType: z.enum(["data", "operationCall"]),
  onClick: z.function().optional(),
});

export const AgentChangeSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  targetType: z.enum(["statement", "data", "operation", "parameter"]),
  targetId: z.string(),
  parentId: z.string().optional(),
  position: z.number().optional(),
  changes: z
    .object({
      // TODO: is having only data type's kind enough here, also make this a union of data type properties
      dataType: z
        .enum(Object.keys(DataTypes).filter((key) => key !== "condition"))
        .optional(),
      value: z
        .union([z.string(), z.number(), z.boolean(), z.null()])
        .optional(),
      name: z.string().nullable().optional(),
      isOptional: z.boolean().optional(),
      operationName: z.string().optional(),
      referenceName: z.string().optional(),
      referenceId: z.string().optional(),
      key: z.string().optional(),
      className: z.string().optional(),
    })
    .optional(),
});

export const AgentResponseSchema = z.object({
  changes: z.array(AgentChangeSchema),
  explanation: z.string().optional(),
});

// Type inference helpers to verify schemas match the original types
export type InferredDataType = z.infer<typeof DataTypeSchema>;
export type InferredIData = z.infer<typeof IDataSchema>;
export type InferredIStatement = z.infer<typeof IStatementSchema>;
export type InferredIDropdownItem = z.infer<typeof IDropdownItemSchema>;

export type AgentChange = z.infer<typeof AgentChangeSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
