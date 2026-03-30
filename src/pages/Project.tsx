import { Operation } from "@/components/Operation";
import {
  useProjectStore,
  useNavigationStore,
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
import { useHotkeys, useClickOutside, useDebouncedValue } from "@mantine/hooks";
import { Navigate } from "react-router";
import { useCustomHotkeys } from "@/hooks/useCustomHotkeys";
import { IData, OperationType } from "@/lib/types";
import { createFileFromOperation, createOperationFromFile } from "@/lib/utils";
import { getOperationEntities } from "@/lib/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { setOperationResults } from "@/lib/execution/execution";
import { useExecutionResultsStore } from "@/lib/execution/store";

export default function Project() {
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const updateFile = useProjectStore((s) => s.updateFile);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const currentOperation = useMemo(() => {
    return createOperationFromFile(
      currentProject?.files.find((file) => file.id === currentFileId)
    );
  }, [currentProject?.files, currentFileId]);
  const rootContext = useExecutionResultsStore((s) => s.rootContext);
  const rootPath = useMemo(() => [], []);
  useHotkeys(useCustomHotkeys(), []);
  const operationRef = useClickOutside(() => {
    setNavigation((p) => ({ navigation: { ...p.navigation, disable: true } }));
  });

  const getFile = useProjectStore((s) => s.getFile);

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
  useEffect(() => {
    if (deferredOperation) {
      setNavigation({
        navigationEntities: getOperationEntities(
          deferredOperation,
          rootContext
        ),
      });
    }
  }, [deferredOperation, setNavigation, rootContext]);

  const [debouncedOperation] = useDebouncedValue(currentOperation, 500);
  useEffect(() => {
    if (debouncedOperation) {
      setOperationResults(debouncedOperation, rootContext);
    }
  }, [debouncedOperation, rootContext, setNavigation]);

  useEffect(() => {
    useExecutionResultsStore.getState().removeAll();
  }, [currentFileId]);

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
        currentOperation={currentOperation}
        currentProject={currentProject}
      />
      <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0 relative">
        <SidebarTabs />
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
    </div>
  );
}
