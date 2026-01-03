import { Operation } from "@/components/Operation";
import {
  fileHistoryActions,
  uiConfigStore,
  useProjectStore,
} from "@/lib/store";
import { Header } from "@/ui/Header";
import { Sidebar } from "@/ui/Sidebar";
import { NoteText } from "@/ui/NoteText";
import { useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "@mantine/hooks";
import { FocusInfo } from "@/components/FocusInfo";
import { Navigate } from "react-router";
import { useCustomHotkeys } from "@/hooks/useNavigation";
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

export default function Project() {
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const updateProject = useProjectStore((s) => s.updateProject);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const { hideSidebar, hideFocusInfo, setUiConfig } = uiConfigStore();

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
        updateProject(currentProject.id, {
          files: updateFiles(
            currentProject.files,
            fileHistoryActions.pushState,
            createFileFromOperation(operation)
          ),
        });
      }
    },
    [currentProject, updateProject, deleteFile]
  );

  useEffect(() => {
    if (currentOperation) {
      setUiConfig({
        navigationEntities: getOperationEntities(currentOperation, 0),
      });
    }
  }, [currentOperation, setUiConfig]);

  useHotkeys(useCustomHotkeys(currentOperation), []);

  const operationOptions = useMemo(
    () => ({ isTopLevel: true, disableDropdown: true }),
    []
  );
  const context = useMemo(() => {
    return {
      variables: createFileVariables(
        currentProject?.files,
        currentOperation?.id
      ),
      reservedNames: new Set(
        (currentProject?.files ?? [])
          .map((file) => file.name)
          .concat(Object.keys(DataTypes))
      ),
    } as Context;
  }, [currentProject?.files, currentOperation?.id]);

  if (!currentProject) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col h-screen">
      <Header
        currentOperation={currentOperation}
        currentProject={currentProject}
      />
      <div className="flex flex-1 min-h-0 relative">
        {!hideSidebar && (
          <Sidebar reservedNames={Array.from(context.reservedNames ?? [])} />
        )}
        <div
          className={"p-1 flex-1 overflow-y-auto scroll"}
          onClick={(e) => {
            if (currentOperation?.id && e.target === e.currentTarget) {
              setUiConfig({
                navigation: { id: `${currentOperation.id}_statement_add` },
              });
            }
          }}
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
                options={operationOptions}
              />
            ) : (
              <NoteText>Select an operation</NoteText>
            )}
          </ErrorBoundary>
          {!hideFocusInfo && <FocusInfo />}
        </div>
      </div>
    </div>
  );
}
