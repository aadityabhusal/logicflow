import { FaCrosshairs, FaLock, FaUnlock } from "react-icons/fa6";
import { TbKeyboardOff } from "react-icons/tb";
import { IconButton } from "./IconButton";
import {
  useNavigationStore,
  useProjectStore,
  useExecutionResultsStore,
  useUiConfigStore,
} from "../lib/store";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ParseData } from "../components/Parse/ParseData";
import { Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { createData, getTypeSignature } from "@/lib/utils";
import { Context } from "@/lib/types";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { useMediaQuery } from "@mantine/hooks";

export function DetailsPanel() {
  const operationId = useProjectStore((s) => s.currentFileId);
  const result = useNavigationStore((s) => s.result);
  const skipExecution = useNavigationStore((s) =>
    s.skipExecution?.kind !== "error" ? s.skipExecution : undefined
  );
  const navigationId = useNavigationStore((s) => s.navigation?.id);
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);

  const typeSignature = useMemo(
    () => getTypeSignature(result?.type ?? { kind: "undefined" }),
    [result?.type]
  );

  const panelLockedId = useUiConfigStore((s) => {
    const lockedId = operationId && s.sidebar?.lockedIds?.[operationId];
    if (
      !lockedId ||
      !useExecutionResultsStore.getState().results.has(lockedId)
    ) {
      return undefined;
    }
    return lockedId;
  });

  const context = useMemo<Context>(
    () => ({
      variables: new Map(),
      getResult: useExecutionResultsStore.getState().getResult,
      getInstance: useExecutionResultsStore.getState().getInstance,
      setInstance: useExecutionResultsStore.getState().setInstance,
      executeOperation: () => Promise.resolve(createData()),
      executeStatement: () => Promise.resolve(createData()),
    }),
    []
  );

  if (!result) {
    return (
      <div className="flex flex-col h-full bg-editor">
        <div className="p-1 border-b">Details</div>
        <div className="p-2 text-gray-500">
          Select a data or an operation call
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-editor">
      <div className="flex justify-between p-1 border-b gap-3">
        <div className="mr-auto">Details</div>
        {smallScreen ? (
          <IconButton
            icon={TbKeyboardOff}
            title="Disable keyboard"
            size={16}
            className={disableKeyboard ? "text-reserved" : ""}
            onClick={() => {
              setUiConfig((p) => ({
                ...p,
                disableKeyboard: !p.disableKeyboard,
              }));
            }}
          />
        ) : null}
        {panelLockedId ? (
          <IconButton
            icon={FaCrosshairs}
            title="Focus"
            size={12}
            onClick={() => {
              setNavigation({ navigation: { id: panelLockedId } });
            }}
          />
        ) : null}
        {useExecutionResultsStore
          .getState()
          .results.has(panelLockedId ?? navigationId!) && (
          <IconButton
            icon={panelLockedId ? FaLock : FaUnlock}
            title={panelLockedId ? "Unlock" : "Lock"}
            className={panelLockedId ? "text-reserved" : ""}
            size={12}
            onClick={() => {
              setUiConfig((p) => {
                if (!operationId) return p;
                const lockedIds = { ...(p.sidebar?.lockedIds ?? {}) };
                if (panelLockedId) delete lockedIds[operationId];
                else lockedIds[operationId] = navigationId!;
                return { sidebar: { ...(p.sidebar ?? {}), lockedIds } };
              });
            }}
          />
        )}
      </div>
      <div className="flex-1 overflow-y-auto dropdown-scrollbar">
        <div className="border-b p-1 flex items-center gap-1">
          <span className="text-type">Type: </span>
          <Tooltip label={typeSignature}>
            <div className="truncate">{typeSignature}</div>
          </Tooltip>
        </div>
        {result?.type.kind !== "operation" ? (
          <div className="p-1 border-b">
            <div className="text-gray-300 mb-1.5">Result</div>
            <ErrorBoundary displayError={true}>
              <pre className="overflow-x-auto dropdown-scrollbar text-wrap text-sm">
                <ParseData data={result} showData={true} context={context} />
              </pre>
            </ErrorBoundary>
          </div>
        ) : null}
        {skipExecution && (
          <div className="p-1 border-b">
            <div className={"mb-1.5"}>Skipped</div>
            <div className="text-sm">{skipExecution.reason}</div>
          </div>
        )}
      </div>
    </div>
  );
}
