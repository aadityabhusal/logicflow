import { useCallback } from "react";
import {
  IData,
  IStatement,
  OperationType,
  EntityPath,
  ContextMenuItem,
} from "@/lib/types";
import {
  useContextMenuStore,
  useNavigationStore,
  useUiConfigStore,
  useProjectStore,
} from "@/lib/store";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { Context } from "@/lib/execution/types";
import { useSearchParams } from "react-router";
import { notifications } from "@mantine/notifications";
import {
  writeEntityClipboard,
  readEntityClipboard,
  cloneWithNewIds,
  EntityClipboard,
} from "@/lib/editor-clipboard";
import {
  createOperationCall,
  getFilteredOperations,
} from "@/lib/execution/execution";
import {
  moveArrayItemBy,
  shouldUseNativeContextMenu,
  isDataOfType,
  getCacheKey,
  handleSearchParams,
  createVariableName,
  createFileFromOperation,
  createFileVariables,
  createParamData,
  getFreeVariableNames,
  createStatement,
  createData,
  getStatementResult,
} from "@/lib/utils";

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
  context: Context;
}

export function useEntityContextMenu({
  statement,
  handleStatement,
  addStatement,
  moveStatement,
  disableDelete,
  path,
  position,
  context,
}: Params) {
  const isHighlighted = useContextMenuStore(
    (s) => s.highlightedEntityId === statement.id
  );
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const foldedEntities = useUiConfigStore((s) => s.foldedEntities);
  const addFile = useProjectStore((s) => s.addFile);
  const [, setSearchParams] = useSearchParams();

  const handleExtractToFile = useCallback(
    async (data: IData<OperationType>) => {
      const newName = createVariableName({
        prefix: "operation",
        prev: useProjectStore.getState().getCurrentProject()?.files || [],
      });

      const definedVars = [...getFreeVariableNames(data, context)]
        .map((name) => ({ name, variable: context.variables.get(name)! }))
        .filter((item) => !!item.variable);
      const fileParams = definedVars.map(({ name, variable }) => {
        const paramData = createParamData({ type: variable.data.type });
        return createStatement({ name, data: paramData });
      });
      const callArgs = definedVars.map(({ name, variable }) => {
        const refData = createData({ value: { name, id: variable.data.id } });
        return createStatement({ name, data: refData });
      });

      const file = createFileFromOperation(
        createData({
          type: fileParams.length > 0 ? undefined : data.type,
          value: {
            ...data.value,
            name: newName,
            parameters: [...fileParams, ...data.value.parameters],
          },
        })
      );
      addFile(file);

      const opRef = createData({ value: { name: newName, id: data.id } });
      if (fileParams.length === 0) {
        handleStatement({ ...statement, data: opRef }, false, path);
        return;
      }
      const newVariables = createFileVariables([file], context.variables);
      const callOp = await createOperationCall({
        data: opRef,
        name: "call",
        parameters: [...callArgs, ...data.value.parameters],
        context: { ...context, variables: newVariables },
      });

      handleStatement(
        {
          ...statement,
          data: createData({
            type: data.type,
            value: {
              parameters: data.value.parameters,
              statements: [
                createStatement({ data: opRef, operations: [callOp] }),
              ],
            },
          }),
        },
        false,
        path
      );
    },
    [addFile, context, handleStatement, path, statement]
  );

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
      const data = statement.data;
      const extraItems: ContextMenuItem[] = [];
      const isFolded = !!foldedEntities?.[data.id];
      if (
        [
          "array",
          "tuple",
          "object",
          "dictionary",
          "condition",
          "union",
          "operation",
        ].includes(data.type.kind)
      ) {
        extraItems.push({
          label: isFolded ? "Expand" : "Collapse",
          onClick: () =>
            setUiConfig(({ foldedEntities }) => ({
              foldedEntities: { ...foldedEntities, [data.id]: !isFolded },
            })),
        });
      }

      if (isDataOfType(data, "reference")) {
        const variable = context.variables.get(data.value.name);
        const operationFile =
          variable && isDataOfType(variable.data, "operation")
            ? useProjectStore.getState().getFile(variable.data.id)
            : undefined;
        if (operationFile) {
          extraItems.push({
            label: "Go to operation",
            onClick: () =>
              setSearchParams(
                ...handleSearchParams({ file: operationFile.name }, true)
              ),
          });
        } else if (variable && !variable.isEnv) {
          extraItems.push({
            label: "Go to reference",
            onClick: () =>
              setNavigation({ navigation: { id: `${variable.data.id}_name` } }),
          });
        }
      }

      if (isDataOfType(data, "operation")) {
        extraItems.push({
          label: "Extract operation",
          onClick: () => handleExtractToFile(data),
        });
      }

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
          ...extraItems,
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
      context,
      foldedEntities,
      handleExtractToFile,
      setNavigation,
      setUiConfig,
      setSearchParams,
    ]
  );

  const getOperationMenuItems = useCallback(
    (operation: IData<OperationType>, opIndex: number, ctx: Context) => {
      const inputData = getStatementResult(statement, ctx, {
        index: opIndex,
        prevEntity: true,
        skipResolveReference: true,
      });
      const opName = operation.value.name;
      const sourceOpVariable =
        opName === "call" && isDataOfType(inputData, "reference")
          ? ctx.variables.get(inputData.value.name)
          : ctx.variables.get(opName ?? "");
      const isUserOperation = !!(
        sourceOpVariable &&
        !sourceOpVariable.isEnv &&
        isDataOfType(sourceOpVariable.data, "operation") &&
        !sourceOpVariable.data.id.startsWith("builtin:")
      );
      const canSyncReference =
        isUserOperation &&
        getFilteredOperations(inputData, ctx).some((i) => i.name === opName);
      const file = isUserOperation
        ? useProjectStore.getState().getFile(sourceOpVariable.data.id)?.name
        : undefined;

      return [
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
        ...(isUserOperation
          ? [
              {
                label: file ? "Go to operation" : "Go to reference",
                onClick: () =>
                  file
                    ? setSearchParams(...handleSearchParams({ file }, true))
                    : setNavigation({
                        navigation: { id: `${sourceOpVariable.data.id}_name` },
                      }),
              },
            ]
          : []),
        ...(canSyncReference
          ? [
              {
                label: "Sync Reference",
                onClick: async () => {
                  const operationCall = await createOperationCall({
                    data: inputData,
                    name: operation.value.name,
                    parameters: operation.value.parameters,
                    context: ctx,
                    operationId: operation.id,
                  });
                  const operations = [...statement.operations];
                  operations[opIndex] = operationCall;
                  handleStatement({ ...statement, operations }, false, path);
                },
              },
            ]
          : []),
        {
          label: "Show result",
          disabled: !useExecutionResultsStore
            .getState()
            .results.has(getCacheKey(ctx, operation.id)),
          onClick: () => {
            const fileId = useProjectStore.getState().currentFileId;
            if (!fileId) return;
            setUiConfig((p) => ({
              sidebar: {
                ...p.sidebar,
                lockedIds: { ...p.sidebar?.lockedIds, [fileId]: operation.id },
              },
            }));
            setSearchParams(...handleSearchParams({ tab: "details" }, true));
          },
        },
      ];
    },
    [
      statement,
      handleStatement,
      path,
      setUiConfig,
      setSearchParams,
      setNavigation,
    ]
  );

  const handleOperationContextMenu = useCallback(
    (e: React.MouseEvent, operation: IData<OperationType>, ctx: Context) => {
      e.preventDefault();
      e.stopPropagation();
      const opIndex = statement.operations.findIndex(
        (op) => op.id === operation.id
      );
      openMenu({
        items: getOperationMenuItems(operation, opIndex, ctx),
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
