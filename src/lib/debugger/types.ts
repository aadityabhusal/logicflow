import { IStatement } from "@/lib/types";

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
  operationId?: string;
  statementId?: string;
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
  locationDepth: number;
  callback?: {
    invocation: number;
    createdAtOperationName?: string;
    createdAtOperationCallId?: string;
  };
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
