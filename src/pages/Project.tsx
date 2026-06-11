import { Operation } from "@/components/Operation";
import {
  useProjectStore,
  useNavigationStore,
  fileHistoryActions,
  useContextMenuStore,
} from "@/lib/store";
import { EntityContextMenu } from "@/components/EntityContextMenu";
import { Header } from "@/ui/Header";
import { SidebarTabs } from "@/ui/SidebarTabs";
import { NoteText } from "@/ui/NoteText";
import {
  MouseEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useHotkeys, useClickOutside } from "@mantine/hooks";
import { Navigate } from "react-router";
import { useCustomHotkeys } from "@/hooks/useCustomHotkeys";
import { IData, OperationType } from "@/lib/types";
import {
  createFileFromOperation,
  createOperationFromFile,
  shouldUseNativeContextMenu,
} from "@/lib/utils";
import { getOperationEntities } from "@/lib/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cloneWithNewIds, writeEntityClipboard } from "@/lib/editor-clipboard";
import { readClipboardAs } from "@/hooks/useEntityContextMenu";
import { ClipboardSchema } from "@/lib/schemas";
import { useExecutionResultsStore } from "@/lib/execution/store";
import {
  executionWorkerClient,
  hydrateContexts,
} from "@/lib/execution/worker-client";
import { getEnabledPackages } from "@/lib/packages/catalog";
import { syncPackageRegistry } from "@/lib/operations/built-in";

export default function Project() {
  const projectFiles = useProjectStore((s) => s.getCurrentProject()?.files);
  const projectId = useProjectStore((s) => s.getCurrentProject()?.id);
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const updateFile = useProjectStore((s) => s.updateFile);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const currentFile = useMemo(() => {
    return projectFiles?.find((file) => file.id === currentFileId);
  }, [projectFiles, currentFileId]);
  const currentOperation = useMemo(() => {
    return createOperationFromFile(currentFile);
  }, [currentFile]);
  const rootContext = useExecutionResultsStore((s) => s.rootContext);
  const rootPath = useMemo(() => [], []);
  const [activeTab, setActiveTab] = useState<string | undefined>("operations");
  useHotkeys(useCustomHotkeys(setActiveTab), []);
  const operationRef = useClickOutside(() => {
    setNavigation((p) => ({ navigation: { ...p.navigation, disable: true } }));
  });

  const getFile = useProjectStore((s) => s.getFile);
  const contextMenu = useContextMenuStore((s) => s.menu);
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);

  const handleOperationChange = useCallback(
    (
      updater: (prev: IData<OperationType>) => IData<OperationType> | null,
      remove?: boolean
    ) => {
      const file = getFile(currentFileId);
      if (!file || file.type !== "operation") return;
      if (remove) {
        deleteFile(file.id);
        return;
      }

      const operation = createOperationFromFile(file);
      const updatedOperation = operation && updater(operation);
      if (!updatedOperation) return;

      fileHistoryActions.pushState(file.id, file.content);
      updateFile(file.id, createFileFromOperation(updatedOperation));
    },
    [getFile, currentFileId, deleteFile, updateFile]
  );

  const handleOperationContextMenu = useCallback(
    (e: MouseEvent) => {
      if (shouldUseNativeContextMenu(e.target)) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!currentOperation || currentFile?.type !== "operation") return;

      openContextMenu({
        items: [
          {
            label: "Copy operation",
            onClick: () => {
              const { name: _, ...value } = currentOperation.value;
              const { trigger } = currentFile;
              writeEntityClipboard({
                kind: "operation",
                value: ClipboardSchema.parse({ ...value, trigger }),
              });
            },
          },
          {
            label: "Paste over",
            onClick: async () => {
              const entry = await readClipboardAs("operation", "paste over");
              if (!entry) return;

              const { trigger, parameters, ...content } = entry.value;
              const isSameTriggerType = !!trigger === !!currentFile.trigger;
              const cloned = cloneWithNewIds({
                ...currentOperation,
                value: {
                  ...currentOperation.value,
                  ...(isSameTriggerType ? { ...content, parameters } : content),
                },
              });
              fileHistoryActions.pushState(currentFile.id, currentFile.content);
              updateFile(currentFile.id, {
                type: "operation",
                content: {
                  type: cloned.type,
                  value: { ...cloned.value, name: currentFile.name },
                },
                trigger: currentFile.trigger
                  ? isSameTriggerType
                    ? trigger
                    : currentFile.trigger
                  : undefined,
              });
            },
          },
        ],
        position: { x: e.clientX, y: e.clientY },
        highlightedEntityId: currentOperation.id,
      });
    },
    [currentOperation, currentFile, openContextMenu, updateFile]
  );

  const deferredOperation = useDeferredValue(currentOperation);
  const runVersion = useExecutionResultsStore((s) => s.runVersion);
  useEffect(() => {
    if (deferredOperation?.id !== currentOperation?.id) return;
    if (deferredOperation) {
      setNavigation({
        navigationEntities: getOperationEntities(
          deferredOperation,
          rootContext
        ),
      });
    }
  }, [deferredOperation, currentOperation?.id, setNavigation, rootContext]);

  useEffect(() => {
    const project = useProjectStore.getState().getCurrentProject();
    if (!project) return;
    void syncPackageRegistry(getEnabledPackages(project));
  }, [projectId]);

  useEffect(() => {
    if (!deferredOperation) return;
    if (deferredOperation.id !== currentOperation?.id) return;

    let cancelled = false;
    const { results, instances, rootContext } =
      useExecutionResultsStore.getState();
    const project = useProjectStore.getState().getCurrentProject();
    useExecutionResultsStore.getState().setIsExecuting(true);

    executionWorkerClient
      .run({
        operation: deferredOperation,
        files: project?.files ?? [],
        packages: getEnabledPackages(project),
        envVariables: project?.deployment?.envVariables ?? [],
        cachedResults: [...results].filter(([, r]) => r.shouldCacheResult),
        expectedType: rootContext.expectedType,
        enforceExpectedType: rootContext.enforceExpectedType,
      })
      .then((result) => {
        if (cancelled) return;
        const contexts = hydrateContexts(result.workerContexts, rootContext);
        useExecutionResultsStore.setState({
          results: result.results,
          contexts,
          instances,
          isExecuting: false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        useExecutionResultsStore.getState().setIsExecuting(false);
        console.error("Execution worker error:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [deferredOperation, currentOperation?.id, runVersion]);

  const handleOperationClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (currentOperation?.id && e.target === e.currentTarget) {
        setNavigation({
          navigation: { id: `${currentOperation?.id}_statement_add` },
        });
      }
    },
    [currentOperation?.id, setNavigation]
  );

  if (!projectId) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-dvh">
      <Header />
      <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0 relative">
        <SidebarTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        <div
          className={
            "relative flex-1 overflow-y-auto scroll flex flex-col pr-2"
          }
        >
          <ErrorBoundary
            fallback={
              <p className="text-error p-1">
                Something went wrong. Please refresh or delete the operation.
              </p>
            }
          >
            {currentOperation ? (
              <Operation
                ref={operationRef}
                operation={currentOperation}
                handleChange={handleOperationChange}
                context={rootContext}
                path={rootPath}
                className="flex-1 min-w-0 min-h-0 overflow-auto p-1"
                onClick={handleOperationClick}
                onContextMenu={handleOperationContextMenu}
              />
            ) : (
              <NoteText>Select an operation</NoteText>
            )}
          </ErrorBoundary>
        </div>
      </div>
      {contextMenu && (
        <EntityContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
