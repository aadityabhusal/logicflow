import { useCallback } from "react";
import {
  IData,
  IStatement,
  OperationType,
  EntityPath,
  ContextMenuItem,
} from "@/lib/types";
import { useContextMenuStore } from "@/lib/store";
import { notifications } from "@mantine/notifications";
import {
  writeEntityClipboard,
  readEntityClipboard,
  cloneWithNewIds,
  EntityClipboard,
} from "@/lib/editor-clipboard";
import { moveArrayItemBy, shouldUseNativeContextMenu } from "@/lib/utils";

const kindLabels: Record<string, string> = {
  statement: "a statement",
  data: "data",
  operationCall: "an operation call",
  operation: "an operation",
};

export async function readClipboardAs<K extends EntityClipboard["kind"]>(
  kind: K,
  action: string
) {
  const entry = await readEntityClipboard();
  if (!entry || entry.kind !== kind) {
    notifications.show({
      message: `Cannot ${action}: clipboard does not contain ${kindLabels[kind]}`,
      color: "red",
    });
    return null;
  }
  return entry as Extract<EntityClipboard, { kind: K }>;
}

function cloneStatementForPasteOver(
  source: IStatement,
  target: IStatement,
  path: EntityPath
) {
  const cloned = cloneWithNewIds(source);
  const removeName = path.some(
    (part, index) => part === "value" && path[index + 1] === "parameters"
  );
  return {
    ...cloned,
    id: target.id,
    ...(removeName ? { name: undefined } : {}),
    ...(target.isRest ? { isRest: true } : {}),
    ...(target.isOptional ? { isOptional: true } : {}),
  };
}

interface Params {
  statement: IStatement;
  handleStatement: (s: IStatement, remove?: boolean, path?: EntityPath) => void;
  addStatement?: (
    s: IStatement,
    position: "before" | "after",
    id: string
  ) => void;
  moveStatement?: (id: string, dir: "up" | "down") => void;
  disableDelete?: boolean;
  path: EntityPath;
  position?: "first" | "last" | "only";
}

export function useEntityContextMenu({
  statement,
  handleStatement,
  addStatement,
  moveStatement,
  disableDelete,
  path,
  position,
}: Params) {
  const isHighlighted = useContextMenuStore(
    (s) => s.highlightedEntityId === statement.id
  );
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (shouldUseNativeContextMenu(e.target)) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      openMenu({
        items: [
          {
            label: "Copy",
            onClick: () =>
              writeEntityClipboard({ kind: "statement", value: statement }),
          },
          {
            label: "Cut",
            disabled: !!disableDelete,
            onClick: () => {
              writeEntityClipboard({ kind: "statement", value: statement });
              handleStatement(statement, true, path);
            },
          },
          {
            label: "Paste over",
            disabled: !!disableDelete,
            onClick: async () => {
              const entry = await readClipboardAs("statement", "paste over");
              if (!entry) return;
              handleStatement(
                cloneStatementForPasteOver(entry.value, statement, path),
                false,
                path
              );
            },
          },
          {
            label: "Paste after",
            disabled: !addStatement,
            onClick: async () => {
              if (!addStatement) return;
              const entry = await readClipboardAs("statement", "paste");
              if (!entry) return;
              const cloned = cloneWithNewIds(entry.value);
              addStatement(cloned, "after", statement.id);
            },
          },
          {
            label: "Duplicate",
            disabled: !addStatement,
            onClick: () => {
              if (!addStatement) return;
              addStatement(cloneWithNewIds(statement), "after", statement.id);
            },
          },
          {
            label: "Delete",
            danger: true,
            disabled: !!disableDelete,
            onClick: () => handleStatement(statement, true, path),
          },
          {
            label: "Move up",
            disabled:
              !moveStatement || position === "first" || position === "only",
            onClick: () => moveStatement?.(statement.id, "up"),
          },
          {
            label: "Move down",
            disabled:
              !moveStatement || position === "last" || position === "only",
            onClick: () => moveStatement?.(statement.id, "down"),
          },
        ],
        position: { x: e.clientX, y: e.clientY },
        highlightedEntityId: statement.id,
      });
    },
    [
      statement,
      handleStatement,
      addStatement,
      moveStatement,
      disableDelete,
      path,
      openMenu,
      position,
    ]
  );

  const handleDataContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu({
        items: [
          {
            label: "Copy",
            onClick: () =>
              writeEntityClipboard({ kind: "data", value: statement.data }),
          },
          {
            label: "Cut",
            disabled: !!disableDelete,
            onClick: () => {
              writeEntityClipboard({ kind: "data", value: statement.data });
              handleStatement(statement, true, path);
            },
          },
          {
            label: "Paste over",
            onClick: async () => {
              const entry = await readEntityClipboard();
              if (!entry) return;
              if (entry.kind === "data") {
                handleStatement(
                  { ...statement, data: cloneWithNewIds(entry.value) },
                  false,
                  path
                );
                return;
              }
              if (entry.kind === "statement") {
                handleStatement(
                  cloneStatementForPasteOver(entry.value, statement, path),
                  false,
                  path
                );
                return;
              }
              notifications.show({
                message: "Cannot paste over: invalid data or statement",
                color: "red",
              });
            },
          },
          {
            label: "Delete",
            danger: true,
            disabled: !!disableDelete,
            onClick: () => handleStatement(statement, true, path),
          },
          {
            label: "Move before",
            disabled:
              !moveStatement || position === "first" || position === "only",
            onClick: () => moveStatement?.(statement.id, "up"),
          },
          {
            label: "Move after",
            disabled:
              !moveStatement || position === "last" || position === "only",
            onClick: () => moveStatement?.(statement.id, "down"),
          },
        ],
        position: { x: e.clientX, y: e.clientY },
        highlightedEntityId: statement.data.id,
      });
    },
    [
      statement,
      handleStatement,
      disableDelete,
      path,
      openMenu,
      moveStatement,
      position,
    ]
  );

  const getOperationMenuItems = useCallback(
    (operation: IData<OperationType>, opIndex: number): ContextMenuItem[] => [
      {
        label: "Copy",
        onClick: () =>
          writeEntityClipboard({ kind: "operationCall", value: operation }),
      },
      {
        label: "Cut",
        onClick: () => {
          writeEntityClipboard({ kind: "operationCall", value: operation });
          const ops = [...statement.operations];
          ops.splice(opIndex, 1);
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
      {
        label: "Paste over",
        onClick: async () => {
          const entry = await readClipboardAs("operationCall", "paste over");
          if (!entry) return;
          const ops = [...statement.operations];
          ops[opIndex] = cloneWithNewIds(entry.value);
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
      {
        label: "Paste after",
        onClick: async () => {
          const entry = await readClipboardAs("operationCall", "paste");
          if (!entry) return;
          const ops = [...statement.operations];
          ops.splice(opIndex + 1, 0, cloneWithNewIds(entry.value));
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
      {
        label: "Duplicate",
        onClick: () => {
          const ops = [...statement.operations];
          ops.splice(opIndex + 1, 0, cloneWithNewIds(operation));
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
      {
        label: "Delete",
        danger: true,
        onClick: () => {
          const ops = [...statement.operations];
          ops.splice(opIndex, 1);
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
      {
        label: "Move before",
        disabled: opIndex === 0,
        onClick: () => {
          const ops = moveArrayItemBy(
            statement.operations,
            (op) => op.id === operation.id,
            "up"
          )!;
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
      {
        label: "Move after",
        disabled: opIndex === statement.operations.length - 1,
        onClick: () => {
          const ops = moveArrayItemBy(
            statement.operations,
            (op) => op.id === operation.id,
            "down"
          )!;
          handleStatement({ ...statement, operations: ops }, false, path);
        },
      },
    ],
    [statement, handleStatement, path]
  );

  const handleOperationContextMenu = useCallback(
    (e: React.MouseEvent, operation: IData<OperationType>) => {
      e.preventDefault();
      e.stopPropagation();
      const opIndex = statement.operations.findIndex(
        (op) => op.id === operation.id
      );
      openMenu({
        items: getOperationMenuItems(operation, opIndex),
        position: { x: e.clientX, y: e.clientY },
        highlightedEntityId: operation.id,
      });
    },
    [statement.operations, openMenu, getOperationMenuItems]
  );

  return {
    handleContextMenu,
    handleDataContextMenu,
    handleOperationContextMenu,
    isHighlighted,
  } as const;
}
