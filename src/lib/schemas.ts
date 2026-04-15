import * as z from "zod";

const UnknownTypeSchema = z.object({ kind: z.literal("unknown") });
const NeverTypeSchema = z.object({ kind: z.literal("never") });
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
  required: z.array(z.string()).optional(),
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
  activeIndex: z.number().optional(),
  get types() {
    return z.array(DataTypeSchema);
  },
});

const ParameterSchema = z.object({
  name: z.string().optional(),
  get type() {
    return DataTypeSchema;
  },
  isOptional: z.boolean().optional(),
  isRest: z.boolean().optional(),
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
  name: z.string().optional(),
  isAsync: z.boolean().optional(),
  source: z
    .object({ name: z.enum(["remeda", "wretch", "wretchResponseChain"]) })
    .optional(),
  instanceId: z.string().optional(),
});

const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]);

const HttpTriggerSchema = z.object({
  type: z.literal("http"),
  path: z.string().optional(),
  methods: z.union([HttpMethodSchema, z.array(HttpMethodSchema)]).optional(),
  cors: z
    .object({
      origin: z.union([z.string(), z.array(z.string())]),
      methods: z.array(HttpMethodSchema).optional(),
      allowedHeaders: z.array(z.string()).optional(),
      credentials: z.boolean().optional(),
    })
    .optional(),
});

export const ClipboardSchema = OperationValueSchema.extend({
  trigger: HttpTriggerSchema.optional(),
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
  name: z.string(),
  isEnv: z.boolean().optional(),
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
  get result() {
    return DataTypeSchema.optional();
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

const BaseData = z.object({ id: z.string() });
const DataVariants = [
  BaseData.extend({ type: UnknownTypeSchema, value: z.unknown() }),
  BaseData.extend({ type: NeverTypeSchema, value: z.never() }),
  BaseData.extend({ type: UndefinedTypeSchema, value: z.undefined() }),
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
        z.unknown(),
        z.never(),
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
] as const;
const IDataSchema = z.union(DataVariants);

const IStatementSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  isOptional: z.boolean().optional(),
  isRest: z.boolean().optional(),
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

const DeploymentCredentialsSchema = z.object({
  token: z.string(),
});

const DeploymentRecordSchema = z.object({
  id: z.string(),
  url: z.string(),
  state: z.enum(["queued", "building", "ready", "error"]),
  createdAt: z.number(),
  dashboardUrl: z.string().optional(),
  triggerUrls: z.array(z.string()).optional(),
});

const DeploymentBase = z.object({
  credentials: DeploymentCredentialsSchema.optional(),
  deployments: z.array(DeploymentRecordSchema),
});

const VercelDeploymentSchema = DeploymentBase.extend({
  platform: z.literal("vercel"),
  projectId: z.string().optional(),
});

const NetlifyDeploymentSchema = DeploymentBase.extend({
  platform: z.literal("netlify"),
  siteId: z.string().optional(),
});

const SupabaseDeploymentSchema = z.object({
  platform: z.literal("supabase"),
  projectRef: z.string().optional(),
});

export const DeploymentTargetSchema = z.discriminatedUnion("platform", [
  VercelDeploymentSchema,
  NetlifyDeploymentSchema,
  SupabaseDeploymentSchema,
]);
