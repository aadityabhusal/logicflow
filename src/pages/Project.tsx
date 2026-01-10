import { Operation } from "@/components/Operation";
import {
  fileHistoryActions,
  uiConfigStore,
  useProjectStore,
} from "@/lib/store";
import { Header } from "@/ui/Header";
import { Sidebar } from "@/ui/Sidebar";
import { NoteText } from "@/ui/NoteText";
import { MouseEvent, useCallback, useMemo } from "react";
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
import { updateFiles } from "@/lib/update";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataTypes } from "@/lib/data";
import { builtInOperations } from "@/lib/operation";

export default function Project() {
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const updateProject = useProjectStore((s) => s.updateProject);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const { hideSidebar, showDetailsPanel, setUiConfig } = uiConfigStore();

  const currentOperation = useMemo(
    () =>
      createOperationFromFile(
        currentProject?.files.find((file) => file.id === currentFileId)
      ),
    [currentProject?.files, currentFileId]
  );

  const handleOperationChange = useCallback(
    (operation: IData<OperationType>, remove?: boolean) => {
      if (!currentProject) return;
      if (remove) deleteFile(operation.id);
      else {
        updateProject(
          currentProject.id,
          {
            files: updateFiles(
              currentProject.files,
              fileHistoryActions.pushState,
              createFileFromOperation(operation)
            ),
          },
          getOperationEntities(operation)
        );
      }
    },
    [currentProject, updateProject, deleteFile]
  );

  useHotkeys(useCustomHotkeys(), []);

  const context = useMemo(() => {
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
    } as Context;
  }, [currentProject?.files, currentOperation?.id]);

  const handleOperationClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (currentOperation?.id && e.target === e.currentTarget) {
        setUiConfig({
          navigation: { id: `${currentOperation?.id}_statement_add` },
        });
      }
    },
    [currentOperation?.id, setUiConfig]
  );

  const reservedNames = useMemo(() => {
    return Array.from(context.reservedNames ?? []).map((r) => r.name);
  }, [context.reservedNames]);

  if (!currentProject) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-screen">
      <Header
        currentOperation={currentOperation}
        currentProject={currentProject}
      />
      <div className="flex flex-1 min-h-0 relative">
        {!hideSidebar && <Sidebar reservedNames={reservedNames} />}
        <div
          className={"flex-1 overflow-y-auto scroll flex flex-col md:flex-row"}
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
                className="flex-1 min-w-0 min-h-0 overflow-auto px-1"
                onClick={handleOperationClick}
              />
            ) : (
              <NoteText>Select an operation</NoteText>
            )}
          </ErrorBoundary>
          {showDetailsPanel ? <DetailsPanel /> : null}
        </div>
      </div>
    </div>
  );
}
