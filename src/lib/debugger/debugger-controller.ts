import { nanoid } from "nanoid";
import {
  DEBUG_COMMAND,
  DEBUG_CONTROL,
  DEBUG_STATE,
  codeToCommand,
  hasDebugBreakpoint,
} from "./control-buffer";
import { DebugFrame, DebugLocation, DebugPauseReason } from "./types";
import { IData } from "../types";
import {
  Context,
  DebuggerController,
  ExecutionResult,
  WorkerContext,
} from "../execution/types";

export function serializeContext(ctx: Context): WorkerContext {
  return {
    scopeId: ctx.scopeId,
    packageAliases: ctx.packageAliases,
    expectedType: ctx.expectedType,
    enforceExpectedType: ctx.enforceExpectedType,
    skipExecution: ctx.skipExecution,
    isSync: ctx.isSync,
    isIsolated: ctx.isIsolated,
    callDepth: ctx.callDepth,
    maxCallDepth: ctx.maxCallDepth,
    controlFlowState: ctx.controlFlowState,
    variables: [...ctx.variables],
    narrowedTypes: ctx.narrowedTypes ? [...ctx.narrowedTypes] : undefined,
  };
}

function serializeDebugContexts(
  getContexts: () => Map<string, Context>,
  debugContexts: Map<string, Context>
) {
  return serializeContexts(new Map([...getContexts(), ...debugContexts]));
}

export function publicResults(results: Map<string, ExecutionResult>) {
  return [...results].filter(
    ([id, result]) => result.shouldCacheResult || !id.includes(":")
  );
}

export function serializeContexts(contexts: Iterable<[string, Context]>) {
  return [...contexts].map(
    ([id, ctx]) => [id, serializeContext(ctx)] satisfies [string, WorkerContext]
  );
}

type StepMode = "continue" | "stepInto" | "stepOver" | "stepOut";

export function createDebuggerController({
  runId,
  control,
  results,
  getContexts,
  pauseOnExceptions,
  entityFileMap,
}: {
  runId: string;
  control: Int32Array;
  results: Map<string, ExecutionResult>;
  getContexts: () => Map<string, Context>;
  pauseOnExceptions: boolean;
  entityFileMap: Map<string, string>;
}): DebuggerController {
  let suppressed = 0;
  let sequence = 0;
  let resumeSequence = 0;
  let stepMode: StepMode = "continue";
  let pausedFrameDepth = 0;
  let pausedLocationDepth = 0;
  let activeLocationDepth = 0;
  const frames: DebugFrame[] = [];
  const operationCallFrames: string[] = [];
  const locations: DebugLocation[] = [];
  const debugContexts = new Map<string, Context>();
  const entityIndexes = new Map(
    [...entityFileMap.keys()].map((entityId, index) => [entityId, index])
  );

  const getLocationDepth = () => frames.length + activeLocationDepth;

  const fileIdFor = (entityId?: string, fallback?: string) =>
    fallback ?? (entityId ? entityFileMap.get(entityId) : undefined);

  const withFile = (location: DebugLocation): DebugLocation => ({
    ...location,
    fileId: fileIdFor(location.entityId, location.fileId),
  });

  const registerContext = (entityId: string, context: Context) => {
    debugContexts.set(entityId, context);
  };

  const pushFrame = (frame: Omit<DebugFrame, "id"> & { id?: string }) => {
    const id = frame.id ?? nanoid();
    frames.push({
      id,
      ...frame,
      fileId: fileIdFor(frame.entityId, frame.fileId),
    });
    return id;
  };

  const removeFrame = (frameId?: string) => {
    if (!frameId) return;
    const index = frames.findIndex((frame) => frame.id === frameId);
    if (index >= 0) frames.splice(index, 1);
  };

  const pushLocation = (location: DebugLocation) => {
    const resolved = withFile(location);
    locations.push(resolved);
    maybePause(resolved);
  };

  function throwIfStopped() {
    if (Atomics.load(control, DEBUG_CONTROL.stopRequest)) {
      throw new Error("Execution cancelled");
    }
  }

  function shouldPause(location: DebugLocation, depth: number) {
    if (suppressed > 0) return undefined;
    if (Atomics.exchange(control, DEBUG_CONTROL.pauseRequest, 0)) {
      return "manual" as const;
    }
    if (hasDebugBreakpoint(control, entityIndexes, location.entityId)) {
      return "breakpoint" as const;
    }
    if (stepMode === "stepInto" && sequence > resumeSequence) {
      return "step" as const;
    }
    if (
      stepMode === "stepOver" &&
      sequence > resumeSequence &&
      depth <= pausedLocationDepth
    ) {
      return "step" as const;
    }
    if (
      stepMode === "stepOut" &&
      sequence > resumeSequence &&
      frames.length < pausedFrameDepth
    ) {
      return "step" as const;
    }
    return undefined;
  }

  function pause(
    reason: DebugPauseReason,
    location: DebugLocation,
    depth: number
  ) {
    pausedFrameDepth = frames.length;
    pausedLocationDepth = depth;
    resumeSequence = sequence;
    Atomics.store(control, DEBUG_CONTROL.state, DEBUG_STATE.paused);
    self.postMessage({
      type: "debug-paused" as const,
      runId,
      reason,
      location: withFile(location),
      callStack: [...frames].reverse(),
      results: publicResults(results),
      workerContexts: serializeDebugContexts(getContexts, debugContexts),
    });
    while (Atomics.load(control, DEBUG_CONTROL.state) === DEBUG_STATE.paused) {
      Atomics.wait(control, DEBUG_CONTROL.state, DEBUG_STATE.paused);
    }
    const command = codeToCommand(
      Atomics.exchange(control, DEBUG_CONTROL.command, DEBUG_COMMAND.none)
    );
    if (command === "stop") throw new Error("Execution cancelled");
    stepMode = command ?? "continue";
  }

  function maybePause(location: DebugLocation) {
    throwIfStopped();
    sequence += 1;
    Atomics.store(control, DEBUG_CONTROL.sequence, sequence);
    const depth = getLocationDepth();
    const reason = shouldPause(location, depth);
    if (reason) pause(reason, location, depth);
  }

  return {
    beforeStatement: (statement, context) => {
      registerContext(statement.id, context);
      registerContext(statement.data.id, context);
      pushLocation({
        kind: "data",
        entityId: statement.data.id,
        statementId: statement.id,
        fileId: entityFileMap.get(statement.id),
      });
      activeLocationDepth += 1;
    },
    afterStatement: () => {
      activeLocationDepth = Math.max(0, activeLocationDepth - 1);
      locations.pop();
    },
    beforeOperationCall: (operation, context) => {
      registerContext(operation.id, context);
      operationCallFrames.push(
        pushFrame({
          kind: "operationCall",
          operationId: operation.id,
          operationName: operation.value.name,
          scopeId: context.scopeId,
          entityId: operation.id,
          callDepth: context.callDepth ?? 0,
          locationDepth: getLocationDepth(),
        })
      );
      pushLocation({
        kind: "operation",
        entityId: operation.id,
        operationId: operation.id,
        operationName: operation.value.name,
      });
      activeLocationDepth += 1;
    },
    afterOperationCall: () => {
      activeLocationDepth = Math.max(0, activeLocationDepth - 1);
      locations.pop();
      removeFrame(operationCallFrames.pop());
    },
    enterFrame: pushFrame,
    exitFrame: removeFrame,
    registerContext,
    maybePauseOnError: (result: IData, context: Context) => {
      if (!pauseOnExceptions || suppressed > 0) return;
      const location = withFile(
        locations.at(-1) ?? { kind: "data", entityId: result.id }
      );
      debugContexts.set(location.entityId, context);
      pause("exception", location, getLocationDepth());
    },
    suppressBreakpoints: (fn) => {
      suppressed += 1;
      const release = () => {
        suppressed = Math.max(0, suppressed - 1);
      };
      try {
        const result = fn();
        if (result instanceof Promise) {
          return result.finally(release) as ReturnType<typeof fn>;
        }
        release();
        return result;
      } catch (error) {
        release();
        throw error;
      }
    },
  };
}
