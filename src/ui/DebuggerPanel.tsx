import {
  FaArrowRightLong,
  FaForward,
  FaPause,
  FaPlay,
  FaRotateRight,
  FaStop,
  FaTrash,
} from "react-icons/fa6";
import { IconButton } from "./IconButton";
import { useDebuggerStore } from "@/lib/debugger/store";
import {
  canUseSharedDebugger,
  createDebugControlBuffer,
  requestDebugPause,
  requestDebugStop,
  sendDebugCommand,
} from "@/lib/debugger/control-buffer";
import {
  executionWorkerClient,
  hydrateContexts,
} from "@/lib/execution/worker-client";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { useNavigationStore, useProjectStore } from "@/lib/store";
import {
  createOperationFromFile,
  getTypeSignature,
  isDataOfType,
} from "@/lib/utils";
import { createCodeGenContext, generateData } from "@/lib/format-code";
import { getEnabledPackages } from "@/lib/packages/catalog";
import { createProjectEntityFileIndex } from "@/lib/debugger/utils";
import { Context, Variable } from "@/lib/execution/types";

const MAX_SCOPE_VALUE_LENGTH = 160;

function isBuiltInScopeVariable(variable: Variable) {
  return variable.data.id.startsWith("builtin:");
}

function formatScopeVariableValue(variable: Variable, context: Context) {
  let value: string;
  try {
    value = generateData(
      variable.data,
      createCodeGenContext(context, { showResult: true })
    );
  } catch {
    const rawValue = variable.data.value;
    if (rawValue === undefined) value = "undefined";
    else {
      try {
        value = JSON.stringify(rawValue) ?? String(rawValue);
      } catch {
        value = String(rawValue);
      }
    }
  }

  return {
    full: value,
    preview:
      value.length > MAX_SCOPE_VALUE_LENGTH
        ? `${value.slice(0, MAX_SCOPE_VALUE_LENGTH)}...`
        : value,
  };
}

export function DebuggerPanel() {
  const project = useProjectStore((s) => s.getCurrentProject());
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const setCurrentFileId = useProjectStore((s) => s.setCurrentFileId);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const status = useDebuggerStore((s) => s.status);
  const breakpoints = useDebuggerStore((s) => s.breakpoints);
  const pauseOnExceptions = useDebuggerStore((s) => s.pauseOnExceptions);
  const setPauseOnExceptions = useDebuggerStore((s) => s.setPauseOnExceptions);
  const setRuntimeState = useDebuggerStore((s) => s.setRuntimeState);
  const resetRuntime = useDebuggerStore((s) => s.resetRuntime);
  const currentLocation = useDebuggerStore((s) => s.currentLocation);
  const callStack = useDebuggerStore((s) => s.callStack);
  const selectedFrameId = useDebuggerStore((s) => s.selectedFrameId);
  const setSelectedFrame = useDebuggerStore((s) => s.setSelectedFrame);
  const activeControl = useDebuggerStore((s) => s.activeControl);
  const removeBreakpoint = useDebuggerStore((s) => s.removeBreakpoint);

  const canDebug = canUseSharedDebugger();
  const isActive = ["starting", "running", "paused", "stopping"].includes(
    status
  );
  const canStartDebug =
    canDebug && !isActive && currentFile?.type === "operation";
  const playDisabled = status === "paused" ? false : !canStartDebug;
  const selectedFrame =
    callStack.find((frame) => frame.id === selectedFrameId) ?? callStack[0];
  const projectBreakpoints = breakpoints.filter(
    (bp) => bp.projectId === project?.id
  );
  const selectedContext = useExecutionResultsStore((s) =>
    selectedFrame?.entityId
      ? s.getContext(selectedFrame.entityId)
      : s.rootContext
  );
  const scopeVariables = [...selectedContext.variables]
    .filter(([, variable]) => !isBuiltInScopeVariable(variable))
    .reverse();

  const startDebug = () => {
    if (!project || currentFile?.type !== "operation" || !canDebug) return;
    const operation = createOperationFromFile(currentFile);
    if (!operation) return;

    executionWorkerClient.cancel();
    const { results, rootContext } = useExecutionResultsStore.getState();
    const entityIndex = createProjectEntityFileIndex(project.files);
    const { buffer, control } = createDebugControlBuffer(entityIndex.size);

    setRuntimeState({
      status: "starting",
      activeControl: control,
      activeEntityIds: [...entityIndex.keys()],
      currentLocation: undefined,
      callStack: [],
      selectedFrameId: undefined,
      error: undefined,
    });
    useExecutionResultsStore.getState().setIsExecuting(true);

    executionWorkerClient
      .run(
        {
          operation,
          files: project.files,
          packages: getEnabledPackages(project),
          envVariables: project.deployment?.envVariables ?? [],
          cachedResults: [...results].filter(([, r]) => r.shouldCacheResult),
          expectedType: rootContext.expectedType,
          enforceExpectedType: rootContext.enforceExpectedType,
          debug: {
            controlBuffer: buffer,
            pauseOnExceptions,
            entityFileIndex: [...entityIndex],
          },
        },
        {
          onPaused: (event) => {
            if (
              event.reason === "breakpoint" &&
              !useDebuggerStore
                .getState()
                .breakpoints.some(
                  (bp) =>
                    bp.projectId === project.id &&
                    bp.entityId === event.location.entityId &&
                    bp.enabled
                )
            ) {
              sendDebugCommand(control, "continue");
              return;
            }

            const contexts = hydrateContexts(
              event.workerContexts,
              rootContext,
              { isPartial: true }
            );
            useExecutionResultsStore.setState({
              results: new Map(event.results),
              contexts,
              isExecuting: false,
            });
            const file = project.files.find(
              (file) => file.id === event.location.fileId
            );
            if (file) setCurrentFileId(file.name);
            setNavigation({
              navigation: { id: event.location.entityId },
            });
            setRuntimeState({
              status: "paused",
              currentLocation: event.location,
              callStack: event.callStack,
              selectedFrameId: event.callStack[0]?.id,
            });
          },
        }
      )
      .then((result) => {
        const contexts = hydrateContexts(result.workerContexts, rootContext);
        useExecutionResultsStore.setState({
          results: result.results,
          contexts,
          isExecuting: false,
        });
        setRuntimeState({ status: "completed", activeControl: undefined });
      })
      .catch((error) => {
        const currentStatus = useDebuggerStore.getState().status;
        const message = error instanceof Error ? error.message : String(error);
        useExecutionResultsStore.getState().setIsExecuting(false);
        setRuntimeState({
          status: currentStatus === "stopping" ? "idle" : "error",
          activeControl: undefined,
          error: message,
        });
      });
  };

  const resume = (
    command: "continue" | "stepInto" | "stepOver" | "stepOut"
  ) => {
    sendDebugCommand(activeControl, command);
    setRuntimeState({ status: "running" });
    useExecutionResultsStore.getState().setIsExecuting(true);
  };

  const stop = () => {
    requestDebugStop(activeControl);
    useExecutionResultsStore.getState().setIsExecuting(false);
    resetRuntime("stopping");
    executionWorkerClient.reset();
  };

  const navigateToEntity = (fileId: string | undefined, entityId: string) => {
    if (!project) return;
    const file = fileId
      ? project.files.find((item) => item.id === fileId)
      : undefined;
    if (file) setCurrentFileId(file.name);
    setNavigation({ navigation: { id: entityId } });
  };

  const selectAndNavigateToFrame = (frameId: string) => {
    const frame = callStack.find((item) => item.id === frameId);
    setSelectedFrame(frameId);
    if (!frame || !project) return;

    if (frame.entityId && frame.entityId !== frame.fileId) {
      navigateToEntity(frame.fileId, frame.entityId);
    } else if (frame.fileId) {
      const file = project.files.find((item) => item.id === frame.fileId);
      if (file) setCurrentFileId(file.name);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-1 flex gap-2 justify-between items-center border-b bg-dropdown-default">
        <p className="font-bold">Debugger</p>
        <span className="text-xs text-gray-300">{status}</span>
      </div>
      <div className="flex flex-col gap-2 p-1 border-b ">
        <div className="flex gap-2 flex-wrap items-center">
          <IconButton
            icon={FaPlay}
            title={status === "paused" ? "Continue" : "Start debugging"}
            disabled={playDisabled}
            onClick={() =>
              status === "paused" ? resume("continue") : startDebug()
            }
          />
          <IconButton
            icon={FaArrowRightLong}
            title="Step into"
            disabled={status !== "paused"}
            onClick={() => resume("stepInto")}
          />
          <IconButton
            icon={FaForward}
            title="Step over"
            disabled={status !== "paused"}
            onClick={() => resume("stepOver")}
          />
          <IconButton
            icon={FaRotateRight}
            title="Step out"
            disabled={status !== "paused"}
            onClick={() => resume("stepOut")}
          />
          <IconButton
            icon={FaPause}
            title="Pause"
            disabled={status !== "running"}
            onClick={() => requestDebugPause(activeControl)}
          />
          <IconButton
            icon={FaStop}
            title="Stop"
            disabled={!isActive}
            onClick={stop}
          />
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-200 select-none">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={pauseOnExceptions}
            onChange={(event) => setPauseOnExceptions(event.target.checked)}
          />
          Pause on exceptions
        </label>
      </div>
      {!canDebug ? (
        <div className="p-2 text-sm text-error">
          Debugging requires SharedArrayBuffer and cross-origin isolation.
        </div>
      ) : null}
      <div className="flex-1 overflow-auto dropdown-scrollbar">
        <section className="border-b p-1">
          <p className="font-bold mb-1">Paused Location</p>
          {currentLocation ? (
            <button
              className="text-sm text-gray-300 text-left hover:bg-dropdown-hover p-0.5 w-full"
              onClick={() =>
                navigateToEntity(
                  currentLocation.fileId,
                  currentLocation.entityId
                )
              }
            >
              {currentLocation.kind}:{" "}
              {currentLocation.operationName ?? currentLocation.entityId}
            </button>
          ) : (
            <div className="text-sm text-gray-300">Not paused</div>
          )}
        </section>
        <section className="border-b p-1">
          <p className="font-bold mb-1">Call Stack</p>
          {callStack.length ? (
            callStack.map((frame) => (
              <button
                key={frame.id}
                className={[
                  "block w-full text-left p-1 text-sm hover:bg-dropdown-hover",
                  selectedFrame?.id === frame.id ? "bg-dropdown-selected" : "",
                ].join(" ")}
                onClick={() => selectAndNavigateToFrame(frame.id)}
              >
                {frame.kind}:{" "}
                {frame.operationName ?? frame.operationId ?? frame.scopeId}
              </button>
            ))
          ) : (
            <div className="text-sm text-gray-300">No frames</div>
          )}
        </section>
        <section className="border-b p-1">
          <p className="font-bold mb-1">Scope Variables</p>
          {scopeVariables.length ? (
            scopeVariables.map(([name, variable]) => {
              const isOperation = isDataOfType(variable.data, "operation");
              const value = isOperation
                ? undefined
                : formatScopeVariableValue(variable, selectedContext);
              return (
                <div key={name} className="text-sm py-0.5">
                  <span className="text-variable">{name}</span>
                  <span className="text-gray-400">: </span>
                  {isOperation ? (
                    <span className="text-gray-300">
                      {getTypeSignature(variable.data.type, selectedContext)}
                    </span>
                  ) : (
                    <span
                      className="text-gray-200 wrap-break-word"
                      title={value?.full}
                    >
                      {value?.preview}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-sm text-gray-300">No variables</div>
          )}
        </section>
        <section className="p-1">
          <p className="font-bold mb-1">Breakpoints</p>
          {projectBreakpoints.length ? (
            projectBreakpoints.map((bp) => (
              <div key={bp.id} className="flex items-center gap-1 text-sm">
                <span className="h-2 w-2 rounded-full bg-error" />
                <button
                  className="text-left flex-1 hover:bg-dropdown-hover p-0.5"
                  onClick={() => {
                    navigateToEntity(bp.fileId, bp.entityId);
                  }}
                >
                  {bp.kind}: {bp.entityId}
                </button>
                <IconButton
                  icon={FaTrash}
                  title="Delete breakpoint"
                  onClick={() => removeBreakpoint(bp.id)}
                />
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-300">
              Right-click data or an operation call to add one.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
