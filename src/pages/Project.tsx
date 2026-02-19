import { Operation } from "@/components/Operation";
import {
  useProjectStore,
  useNavigationStore,
  useExecutionResultsStore,
  fileHistoryActions,
} from "@/lib/store";
import { Header } from "@/ui/Header";
import { SidebarTabs } from "@/ui/SidebarTabs";
import { NoteText } from "@/ui/NoteText";
import {
  MouseEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
} from "react";
import { useHotkeys, useClickOutside } from "@mantine/hooks";
import { Navigate } from "react-router";
import { useCustomHotkeys } from "@/hooks/useCustomHotkeys";
import { Context, IData, OperationType } from "@/lib/types";
import {
  createFileFromOperation,
  createFileVariables,
  createOperationFromFile,
} from "@/lib/utils";
import { getOperationEntities } from "@/lib/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataTypes } from "@/lib/data";
import {
  executeOperation,
  executeStatement,
  setOperationResults,
} from "@/lib/operation";
import { builtInOperations } from "@/lib/built-in-operations";

export default function Project() {
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const updateFile = useProjectStore((s) => s.updateFile);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setResult = useExecutionResultsStore((s) => s.setResult);

  const currentOperation = useMemo(
    () =>
      createOperationFromFile(
        currentProject?.files.find((file) => file.id === currentFileId)
      ),
    [currentProject?.files, currentFileId]
  );

  const context = useMemo<Context>(() => {
    return {
      variables: createFileVariables(
        currentProject?.files,
        currentOperation?.id
      ),
      reservedNames: new Set(
        (currentProject?.files ?? [])
          .map((file) => ({ kind: "operation", name: file.name }))
          .concat(
            Object.keys(DataTypes).map((type) => ({
              kind: "data-type",
              name: type,
            }))
          )
          .concat(
            builtInOperations.map((op) => ({
              kind: "built-in-operation",
              name: op.name,
            }))
          )
      ),
      getResult: useExecutionResultsStore.getState().getResult,
      getInstance: useExecutionResultsStore.getState().getInstance,
      setInstance: useExecutionResultsStore.getState().setInstance,
      executeOperation,
      executeStatement,
    } as Context;
  }, [currentProject?.files, currentOperation?.id]);

  useHotkeys(useCustomHotkeys(), []);
  const operationRef = useClickOutside(() => {
    setNavigation((p) => ({ navigation: { ...p.navigation, disable: true } }));
  });

  const handleOperationChange = useCallback(
    (operation: IData<OperationType>, remove?: boolean) => {
      if (!currentProject) return;
      if (remove) deleteFile(operation.id);
      else {
        if (currentOperation) {
          const lastContent = createFileFromOperation(currentOperation).content;
          fileHistoryActions.pushState(operation.id, lastContent);
        }
        updateFile(operation.id, createFileFromOperation(operation));
      }
    },
    [currentProject, deleteFile, updateFile, currentOperation]
  );

  const deferredOperation = useDeferredValue(currentOperation);
  const deferredContext = useDeferredValue(context);
  useEffect(() => {
    if (deferredOperation) {
      useExecutionResultsStore.getState().removeAll();
      setOperationResults(deferredOperation, {
        ...deferredContext,
        setResult,
      });
      setNavigation({
        navigationEntities: getOperationEntities(
          deferredOperation,
          deferredContext
        ),
      });
    }
  }, [
    currentFileId,
    deferredContext,
    deferredOperation,
    setNavigation,
    setResult,
  ]);

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

  if (!currentProject) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-dvh">
      <Header
        context={context}
        currentOperation={currentOperation}
        currentProject={currentProject}
      />
      <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0 relative">
        <SidebarTabs context={context} />
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
            {currentProject && currentOperation ? (
              <Operation
                ref={operationRef}
                operation={currentOperation}
                handleChange={handleOperationChange}
                context={context}
                className="flex-1 min-w-0 min-h-0 overflow-auto p-1"
                onClick={handleOperationClick}
              />
            ) : (
              <NoteText>Select an operation</NoteText>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
