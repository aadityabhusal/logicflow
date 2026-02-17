import * as z from "zod";

const UndefinedTypeSchema = z.object({ kind: z.literal("undefined") });
const StringTypeSchema = z.object({ kind: z.literal("string") });
const NumberTypeSchema = z.object({ kind: z.literal("number") });
const BooleanTypeSchema = z.object({ kind: z.literal("boolean") });

const ArrayTypeSchema = z.object({
  kind: z.literal("array"),
  get elementType() {
    return DataTypeSchema;
  },
});
const ArrayValueSchema = z.lazy(() => z.array(IStatementSchema));

const TupleTypeSchema = z.object({
  kind: z.literal("tuple"),
  get elements() {
    return z.array(DataTypeSchema);
  },
});

const ObjectTypeSchema = z.object({
  kind: z.literal("object"),
  get properties() {
    return z.array(z.object({ key: z.string(), value: DataTypeSchema }));
  },
  required: z.array(z.string()).nullable(),
});

// Used record instead of map because serialized data don't have a map
const ObjectValueSchema = z.lazy(() =>
  z.object({
    entries: z.array(z.object({ key: z.string(), value: IStatementSchema })),
  })
);

const DictionaryTypeSchema = z.object({
  kind: z.literal("dictionary"),
  get elementType() {
    return DataTypeSchema;
  },
});

const UnionTypeSchema = z.object({
  kind: z.literal("union"),
  activeIndex: z.number().nullable(),
  get types() {
    return z.array(DataTypeSchema);
  },
});

const ParameterSchema = z.object({
  name: z.string().nullable(),
  get type() {
    return DataTypeSchema;
  },
  isOptional: z.boolean().nullable(),
});

const OperationTypeSchema = z.object({
  kind: z.literal("operation"),
  get parameters() {
    return z.array(ParameterSchema);
  },
  get result() {
    return DataTypeSchema;
  },
});
export const OperationValueSchema = z.object({
  get statements() {
    return z.array(IStatementSchema);
  },
  get parameters() {
    return z.array(IStatementSchema);
  },
  name: z.string().nullable(),
});

const ConditionTypeSchema = z.object({
  kind: z.literal("condition"),
  get result() {
    return DataTypeSchema;
  },
});
const ConditionValueSchema = z.object({
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

const ReferenceTypeSchema = z.object({
  kind: z.literal("reference"),
  get dataType() {
    return DataTypeSchema;
  },
});
const ReferenceValueSchema = z.object({ name: z.string(), id: z.string() });

const ErrorTypeSchema = z.object({
  kind: z.literal("error"),
  errorType: z.enum([
    "reference_error",
    "type_error",
    "runtime_error",
    "custom_error",
  ]),
});
const ErrorValueSchema = z.object({ reason: z.string() });

const InstanceTypeSchema = z.object({
  kind: z.literal("instance"),
  className: z.string(),
  get constructorArgs() {
    return z.array(ParameterSchema);
  },
});
const InstanceValueSchema = z.object({
  instanceId: z.string(),
  className: z.string(),
  get constructorArgs() {
    return z.array(IStatementSchema);
  },
});

const DataTypeSchema = z.union([
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

const BaseData = z.object({ id: z.string() });
const DataVariants = [
  BaseData.extend({ type: UndefinedTypeSchema, value: z.null() }),
  BaseData.extend({ type: StringTypeSchema, value: z.string() }),
  BaseData.extend({ type: NumberTypeSchema, value: z.number() }),
  BaseData.extend({ type: BooleanTypeSchema, value: z.boolean() }),
  BaseData.extend({ type: ArrayTypeSchema, value: ArrayValueSchema }),
  BaseData.extend({ type: TupleTypeSchema, value: ArrayValueSchema }),
  BaseData.extend({ type: ObjectTypeSchema, value: ObjectValueSchema }),
  BaseData.extend({ type: DictionaryTypeSchema, value: ObjectValueSchema }),
  BaseData.extend({ type: OperationTypeSchema, value: OperationValueSchema }),
  BaseData.extend({ type: ConditionTypeSchema, value: ConditionValueSchema }),
  BaseData.extend({ type: ReferenceTypeSchema, value: ReferenceValueSchema }),
  BaseData.extend({ type: ErrorTypeSchema, value: ErrorValueSchema }),
  BaseData.extend({ type: InstanceTypeSchema, value: InstanceValueSchema }),
  BaseData.extend({
    type: UnionTypeSchema,
    get value() {
      return z.union([
        z.null(),
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
] as const;
const IDataSchema = z.union(DataVariants);

const IStatementSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  isOptional: z.boolean().nullable(),
  get data() {
    return IDataSchema;
  },
  get operations() {
    return z.array(
      BaseData.extend({
        type: OperationTypeSchema,
        value: OperationValueSchema,
      })
    );
  },
});

/* Agent change schemas for LLM operations */
const AgentDeleteSchema = z.object({
  action: z.literal("delete"),
  entity: z.object({ id: z.string() }),
});

const AgentCreateSchema = z.object({
  action: z.literal("create"),
  parentId: z.string(),
  entity: IStatementSchema,
});

const AgentUpdateSchema = z.object({
  action: z.literal("update"),
  entity: z.union([
    IStatementSchema.extend({
      data: IDataSchema.nullable(),
      operations: z
        .array(
          BaseData.extend({
            type: OperationTypeSchema,
            value: OperationValueSchema,
          })
        )
        .nullable(),
    }),
    ...DataVariants.map((v) => v.extend({ value: v.shape.value.nullable() })),
  ]),
});

export const AgentChangeSchema = z.discriminatedUnion("action", [
  AgentDeleteSchema,
  AgentCreateSchema,
  AgentUpdateSchema,
]);

export const AgentResponseSchema = z.object({
  changes: z.array(AgentChangeSchema),
  explanation: z.string().nullable(),
});

export type AgentChange = z.infer<typeof AgentChangeSchema>;
