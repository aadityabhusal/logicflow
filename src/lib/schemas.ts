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
} from "./types";

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

const ObjectTypeSchema: z.ZodType<ObjectType> = z.object({
  kind: z.literal("object"),
  get properties() {
    return z.record(z.string(), DataTypeSchema);
  },
});
export const ObjectValueSchema: z.ZodType<DataValue<ObjectType>> = z.lazy(() =>
  z.map(z.string(), IStatementSchema)
);

const UnionTypeSchema: z.ZodType<UnionType> = z.object({
  kind: z.literal("union"),
  get types() {
    return z.array(DataTypeSchema);
  },
});

const OperationTypeSchema: z.ZodType<OperationType> = z.object({
  kind: z.literal("operation"),
  get parameters() {
    return z.array(
      z.object({ name: z.string().optional(), type: DataTypeSchema })
    );
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
    get result() {
      return IDataSchema.optional();
    },
    name: z.string().optional(),
  });

const ConditionTypeSchema: z.ZodType<ConditionType> = z.object({
  kind: z.literal("condition"),
  get resultType() {
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
    get result() {
      return IDataSchema.optional();
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

export const DataTypeSchema: z.ZodType<DataType> = z.union([
  UnknownTypeSchema,
  NeverTypeSchema,
  UndefinedTypeSchema,
  StringTypeSchema,
  NumberTypeSchema,
  BooleanTypeSchema,
  ArrayTypeSchema,
  ObjectTypeSchema,
  UnionTypeSchema,
  OperationTypeSchema,
  ConditionTypeSchema,
  ReferenceTypeSchema,
  ErrorTypeSchema,
]);

export const IDataSchema: z.ZodType<IData> = z
  .object({ id: z.string(), entityType: z.literal("data") })
  .and(
    // Note: We use z.union instead of z.discriminatedUnion because the discriminator (kind) is nested inside the type object.
    z.union([
      z.object({ type: UnknownTypeSchema, value: z.unknown() }),
      z.object({ type: NeverTypeSchema, value: z.never() }),
      z.object({ type: UndefinedTypeSchema, value: z.undefined() }),
      z.object({ type: StringTypeSchema, value: z.string() }),
      z.object({ type: NumberTypeSchema, value: z.number() }),
      z.object({ type: BooleanTypeSchema, value: z.boolean() }),
      z.object({ type: ArrayTypeSchema, value: ArrayValueSchema }),
      z.object({ type: ObjectTypeSchema, value: ObjectValueSchema }),
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
          ]);
        },
      }),
      z.object({ type: OperationTypeSchema, value: OperationValueSchema }),
      z.object({ type: ConditionTypeSchema, value: ConditionValueSchema }),
      z.object({ type: ReferenceTypeSchema, value: ReferenceValueSchema }),
      z.object({ type: ErrorTypeSchema, value: ErrorValueSchema }),
    ])
  );
export const IStatementSchema: z.ZodType<IStatement> = z.object({
  id: z.string(),
  entityType: z.literal("statement"),
  name: z.string().optional(),
  get data() {
    return IDataSchema;
  },
  get operations() {
    return z
      .array(IDataSchema)
      .refine((ops) => ops.every((op) => op.type.kind === "operation"), {
        message: "All operations must have type.kind === 'operation'",
      }) as z.ZodType<IData<OperationType>[]>;
  },
});

export const IDropdownItemSchema: z.ZodType<IDropdownItem> = z.object({
  label: z.string().optional(),
  secondaryLabel: z.string().optional(),
  value: z.string(),
  entityType: z.enum(["data", "operationCall"]),
  onClick: z.function().optional(),
});

// Type inference helpers to verify schemas match the original types
export type InferredDataType = z.infer<typeof DataTypeSchema>;
export type InferredIData = z.infer<typeof IDataSchema>;
export type InferredIStatement = z.infer<typeof IStatementSchema>;
export type InferredIDropdownItem = z.infer<typeof IDropdownItemSchema>;
