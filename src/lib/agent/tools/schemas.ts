import { z } from "zod";
import { DataTypeSchema, IDataSchema, IStatementSchema } from "@/lib/schemas";

export const CreateStatementSchema = IStatementSchema.extend({
  isParameter: z.boolean().default(false),
  position: z.enum(["start", "end"]).default("end"),
});

export const CreateOperationCallSchema = z.object({
  parentId: z.string(),
  data: IDataSchema,
  index: z.number().nullable().default(null),
});

export const UpdateDataSchema = z.object({
  entityId: z.string(),
  data: IDataSchema,
});

export const DeleteEntitySchema = z.object({
  id: z.string(),
  type: z.enum(["statement", "parameter", "operation_call"]),
});

export const EntityFilterSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  isOptional: z.boolean().optional(),
  entityType: z.enum(["statement", "parameter", "operation_call"]).optional(),
  data: IDataSchema.optional(),
  dataType: DataTypeSchema.optional(),
});

export const GetEntitiesSchema = z.object({
  filter: z.array(EntityFilterSchema).optional(),
  beforeStatementId: z.string().optional(),
});

export const GetOperationsSchema = z.object({
  dataTypeKind: z.string().optional(),
  entityId: z.string().optional(),
});
