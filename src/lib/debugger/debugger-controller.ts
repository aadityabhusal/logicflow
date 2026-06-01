import { nanoid } from "nanoid";
import {
  DEBUG_COMMAND,
  DEBUG_CONTROL,
  DEBUG_STATE,
  codeToCommand,
  hasDebugBreakpoint,
} from "./control-buffer";
import {
  DebugFlowStep,
  DebugFrame,
  DebugLocation,
  DebugPauseReason,
} from "./types";
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
  const frames: DebugFrame[] = [];
  const locations: DebugLocation[] = [];
  const flowSteps: DebugFlowStep[] = [];
  const operationCalls: { frameId: string; stepId: string }[] = [];
  const callbackFlowSteps = new Map<string, DebugFlowStep>();
  const debugContexts = new Map<string, Context>();
  const entityIndexes = new Map(
    [...entityFileMap.keys()].map((entityId, index) => [entityId, index])
  );

  const getLocationDepth = () => frames.length + locations.length;

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

  const pauseAt = (location: DebugLocation) => {
    const resolved = withFile(location);
    locations.push(resolved);
    maybePause(resolved, frames.length + Math.max(0, locations.length - 1));
  };

  const activeCallbackFrame = () =>
    [...frames].reverse().find((frame) => frame.kind === "callback");

  const callbackFlowKey = (location: DebugLocation) => {
    const callback = activeCallbackFrame();
    if (!callback?.entityId) return undefined;
    return `${callback.entityId}:${location.entityId}`;
  };

  const flowStepUpdate = (props: {
    location: DebugLocation;
    context: Context;
    input?: IData;
  }) => ({
    phase: "running" as const,
    entityId: props.location.entityId,
    fileId: fileIdFor(props.location.entityId, props.location.fileId),
    operationName: props.location.operationName,
    scopeId: props.context.scopeId,
    input: props.input,
    output: undefined,
  });

  const startFlowStep = (props: Parameters<typeof flowStepUpdate>[0]) => {
    const key = callbackFlowKey(props.location);
    const existing = key ? callbackFlowSteps.get(key) : undefined;
    if (existing) {
      Object.assign(existing, flowStepUpdate(props));
      return existing.id;
    }
    const nextStep = { id: nanoid(), ...flowStepUpdate(props) };
    flowSteps.push(nextStep);
    if (key) callbackFlowSteps.set(key, nextStep);
    return nextStep.id;
  };

  const finishFlowStep = (
    stepId: string | undefined,
    context: Context,
    output: IData
  ) => {
    if (!stepId) return;
    const step = flowSteps.find((item) => item.id === stepId);
    if (!step) return;
    step.output = output;
    step.phase = context.skipExecution
      ? "skipped"
      : output.type.kind === "error"
        ? "errored"
        : "completed";
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
      flowSteps: [...flowSteps],
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

  function maybePause(location: DebugLocation, depth: number) {
    throwIfStopped();
    sequence += 1;
    Atomics.store(control, DEBUG_CONTROL.sequence, sequence);
    const reason = shouldPause(location, depth);
    if (reason) pause(reason, location, depth);
  }

  return {
    resetFlow: () => {
      flowSteps.length = 0;
      callbackFlowSteps.clear();
    },
    beforeData: (data, context) => {
      registerContext(data.id, context);
      pauseAt({ kind: "data", entityId: data.id });
    },
    exitData: () => {
      locations.pop();
    },
    beforeOperationCall: (operation, context, input) => {
      registerContext(operation.id, context);
      const _location = {
        kind: "operation",
        entityId: operation.id,
        operationName: operation.value.name,
      } satisfies DebugLocation;
      operationCalls.push({
        stepId: startFlowStep({ location: _location, context, input }),
        frameId: pushFrame({
          kind: "operationCall",
          operationId: operation.id,
          operationName: operation.value.name,
          scopeId: context.scopeId,
          entityId: operation.id,
          callDepth: context.callDepth ?? 0,
        }),
      });
      pauseAt(_location);
    },
    afterOperationCall: (_operation, context, result) => {
      const call = operationCalls.pop();
      if (result) finishFlowStep(call?.stepId, context, result);
      locations.pop();
      removeFrame(call?.frameId);
    },
    enterFrame: pushFrame,
    exitFrame: removeFrame,
    registerContext,
    maybePauseOnError: (result: IData, context: Context) => {
      if (!pauseOnExceptions || suppressed > 0) return;
      finishFlowStep(operationCalls.at(-1)?.stepId, context, result);
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
    getFlowSteps: () => [...flowSteps],
  };
}
