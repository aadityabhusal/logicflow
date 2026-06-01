import { DebugCommand } from "./types";

export const DEBUG_CONTROL = {
  state: 0,
  command: 1,
  pauseRequest: 2,
  stopRequest: 3,
  sequence: 4,
  breakpointStart: 5,
} as const;

export const DEBUG_STATE = {
  idle: 0,
  running: 1,
  paused: 2,
  stopping: 3,
} as const;

export const DEBUG_COMMAND = {
  none: 0,
  continue: 1,
  stepInto: 2,
  stepOver: 3,
  stepOut: 4,
  stop: 5,
} as const;

const DEBUG_COMMAND_BY_CODE = Object.fromEntries(
  Object.entries(DEBUG_COMMAND).map(([command, code]) => [code, command])
) as Record<number, DebugCommand | "none">;

export function canUseSharedDebugger() {
  return typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated;
}

export function createDebugControlBuffer(breakpointCapacity = 0) {
  const buffer = new SharedArrayBuffer(
    Int32Array.BYTES_PER_ELEMENT *
      (DEBUG_CONTROL.breakpointStart + breakpointCapacity)
  );
  const control = new Int32Array(buffer);
  Atomics.store(control, DEBUG_CONTROL.state, DEBUG_STATE.running);
  return { buffer, control };
}

export function getDebugControl(buffer: SharedArrayBuffer) {
  return new Int32Array(buffer);
}

export function commandToCode(command: DebugCommand) {
  return DEBUG_COMMAND[command];
}

export function codeToCommand(code: number): DebugCommand | undefined {
  const command = DEBUG_COMMAND_BY_CODE[code];
  return command === "none" ? undefined : command;
}

export function setDebugBreakpoints(
  control: Int32Array | undefined,
  breakpointEntityIds: Iterable<string>,
  allEntityIds: Iterable<string>
) {
  if (!control) return;
  for (
    let index = DEBUG_CONTROL.breakpointStart;
    index < control.length;
    index += 1
  ) {
    Atomics.store(control, index, 0);
  }

  const entityIndexes = new Map(
    [...allEntityIds].map((entityId, index) => [entityId, index])
  );
  for (const entityId of breakpointEntityIds) {
    const index = entityIndexes.get(entityId);
    if (index !== undefined) {
      Atomics.store(control, DEBUG_CONTROL.breakpointStart + index, 1);
    }
  }
}

export function hasDebugBreakpoint(
  control: Int32Array,
  entityIndexes: Map<string, number>,
  entityId: string
) {
  const index = entityIndexes.get(entityId);
  return (
    index !== undefined &&
    DEBUG_CONTROL.breakpointStart + index < control.length &&
    Atomics.load(control, DEBUG_CONTROL.breakpointStart + index) === 1
  );
}

export function sendDebugCommand(
  control: Int32Array | undefined,
  command: DebugCommand
) {
  if (!control) return;
  Atomics.store(control, DEBUG_CONTROL.command, commandToCode(command));
  if (command === "stop") Atomics.store(control, DEBUG_CONTROL.stopRequest, 1);
  Atomics.store(control, DEBUG_CONTROL.state, DEBUG_STATE.running);
  Atomics.notify(control, DEBUG_CONTROL.state);
}

export function requestDebugPause(control: Int32Array | undefined) {
  if (!control) return;
  Atomics.store(control, DEBUG_CONTROL.pauseRequest, 1);
}

export function requestDebugStop(control: Int32Array | undefined) {
  sendDebugCommand(control, "stop");
}
