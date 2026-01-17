import { Operation } from "@/components/Operation";
import {
  useUiConfigStore,
  useProjectStore,
  useNavigationStore,
  useResultsStore,
  fileHistoryActions,
} from "@/lib/store";
import { Header } from "@/ui/Header";
import { Sidebar } from "@/ui/Sidebar";
import { NoteText } from "@/ui/NoteText";
import { MouseEvent, useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "@mantine/hooks";
import { DetailsPanel } from "@/components/DetailsPanel";
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
import { builtInOperations, setOperationResults } from "@/lib/operation";

export default function Project() {
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const updateFile = useProjectStore((s) => s.updateFile);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const hideSidebar = useUiConfigStore((s) => s.hideSidebar);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const getResult = useResultsStore((s) => s.getResult);
  const setResult = useResultsStore((s) => s.setResult);

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
      getResult,
      setResult,
    } as Context;
  }, [currentProject?.files, currentOperation?.id, getResult, setResult]);

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

  useEffect(() => {
    if (currentOperation) {
      useResultsStore.getState().removeAll();
      setOperationResults(currentOperation, context);
      setNavigation({
        navigationEntities: getOperationEntities(currentOperation, context),
      });
    }
  }, [currentOperation, setNavigation, context]);

  useHotkeys(useCustomHotkeys(), []);

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
    <div className="flex flex-col h-screen">
      <Header
        context={context}
        currentOperation={currentOperation}
        currentProject={currentProject}
      />
      <div className="flex flex-1 min-h-0 relative">
        {!hideSidebar && <Sidebar context={context} />}
        <div
          className={
            "relative flex-1 overflow-y-auto scroll flex flex-col md:flex-row"
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
          <DetailsPanel />
        </div>
      </div>
    </div>
  );
}
