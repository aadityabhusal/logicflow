import { nanoid } from "nanoid";
import { z } from "zod";
import { IData, IStatement, OperationType } from "./types";
import { ClipboardSchema, IStatementSchema, IDataSchema } from "./schemas";
import { isDataOfType } from "./utils";
import { notifications } from "@mantine/notifications";
import { walkStatement, walkData, Visitors } from "./walk";

function collectIds(map: Map<string, string>) {
  return {
    onStatement: (stmt) => map.set(stmt.id, nanoid()),
    onData: (data) => map.set(data.id, nanoid()),
  } as Visitors;
}

function remapIds(map: Map<string, string>) {
  return {
    onStatement: (stmt) => (stmt.id = map.get(stmt.id) ?? stmt.id),
    onData: (data) => {
      data.id = map.get(data.id) ?? data.id;
      if (isDataOfType(data, "reference")) {
        data.value.id = map.get(data.value.id) ?? data.value.id;
      }
    },
  } as Visitors;
}

const walkOptions = { operationCalls: true, nestedOperations: true };

export function cloneWithNewIds<T extends IStatement | IData>(entity: T): T {
  const clone = structuredClone(entity);
  const map = new Map<string, string>();
  if ("type" in clone) {
    walkData(clone, collectIds(map), walkOptions);
    walkData(clone, remapIds(map), walkOptions);
  } else {
    walkStatement(clone, collectIds(map), walkOptions);
    walkStatement(clone, remapIds(map), walkOptions);
  }
  return clone;
}

/* Clipboard read/write */

export type EntityClipboard =
  | { kind: "statement"; value: IStatement }
  | { kind: "operationCall"; value: IData<OperationType> }
  | { kind: "operation"; value: z.infer<typeof ClipboardSchema> }
  | { kind: "data"; value: IData };

export function writeEntityClipboard(entry: EntityClipboard): void {
  const envelope = { source: "logicflow", version: 1, ...entry };
  navigator.clipboard.writeText(JSON.stringify(envelope)).catch(() => {
    notifications.show({
      message: "Failed to write to clipboard",
      color: "red",
    });
  });
}

export async function readEntityClipboard(): Promise<EntityClipboard | null> {
  try {
    const text = await navigator.clipboard.readText();
    const parsed = JSON.parse(text);
    if (parsed?.source !== "logicflow" || parsed?.version !== 1) return null;

    const { kind, value } = parsed;

    if (kind === "statement") {
      const result = IStatementSchema.safeParse(value);
      return result.success ? { kind, value: result.data } : null;
    }
    if (kind === "operationCall") {
      const result = IDataSchema.safeParse(value);
      if (result.success && isDataOfType(result.data, "operation")) {
        return { kind, value: result.data as IData<OperationType> };
      }
      return null;
    }
    if (kind === "operation") {
      const result = ClipboardSchema.safeParse(value);
      return result.success ? { kind, value: result.data } : null;
    }
    if (kind === "data") {
      const result = IDataSchema.safeParse(value);
      return result.success ? { kind, value: result.data } : null;
    }
    return null;
  } catch {
    return null;
  }
}
