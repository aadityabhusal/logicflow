import { IData, IStatement } from "@/lib/types";

export type DebuggerStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "completed"
  | "error";

export type DebugLocation = {
  kind: "data" | "operation";
  entityId: string;
  fileId?: string;
  operationName?: string;
};

export type DebugFrame = {
  id: string;
  kind: "root" | "operation" | "operationCall" | "callback";
  operationId?: string;
  operationName?: string;
  scopeId: string;
  entityId?: string;
  fileId?: string;
  callDepth: number;
};

export type DebugFlowStep = {
  id: string;
  phase: "running" | "completed" | "errored" | "skipped";
  entityId: string;
  fileId?: string;
  operationName?: string;
  scopeId: string;
  input?: IData;
  output?: IData;
};

export type DebugBreakpoint = {
  id: string;
  projectId: string;
  fileId: string;
  entityId: string;
  kind: "data" | "operation";
  enabled: boolean;
};

export type DebugWatch = {
  id: string;
  projectId: string;
  name?: string;
  statement: IStatement;
  enabled: boolean;
};

export type DebugCommand =
  | "continue"
  | "stepInto"
  | "stepOver"
  | "stepOut"
  | "stop";

export type DebugPauseReason = "breakpoint" | "step" | "manual" | "exception";

export type DebugRunConfig = {
  controlBuffer: SharedArrayBuffer;
  pauseOnExceptions: boolean;
  entityFileIndex: [string, string][];
};
