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
import { createFileFromOperation, createOperationFromFile } from "@/lib/utils";
import { getOperationEntities } from "@/lib/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
  const currentOperation = useMemo(() => {
    return createOperationFromFile(
      projectFiles?.find((file) => file.id === currentFileId)
    );
  }, [projectFiles, currentFileId]);
  const rootContext = useExecutionResultsStore((s) => s.rootContext);
  const rootPath = useMemo(() => [], []);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string | undefined>(
    "operations"
  );
  useHotkeys(useCustomHotkeys(setActiveSidebarTab), []);
  const operationRef = useClickOutside(() => {
    setNavigation((p) => ({ navigation: { ...p.navigation, disable: true } }));
  });

  const getFile = useProjectStore((s) => s.getFile);
  const contextMenu = useContextMenuStore((s) => s.menu);
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

      const prevOperation = createOperationFromFile(file);
      if (!prevOperation) return;

      const newOperation = updater(prevOperation);
      if (!newOperation) return;

      fileHistoryActions.pushState(file.id, file.content);
      updateFile(file.id, createFileFromOperation(newOperation));
    },
    [getFile, currentFileId, deleteFile, updateFile]
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
        <SidebarTabs
          activeTab={activeSidebarTab}
          setActiveTab={setActiveSidebarTab}
        />
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
