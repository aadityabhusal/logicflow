import { useState } from "react";
import {
  FaCheck,
  FaSpinner,
  FaChevronDown,
  FaChevronRight,
  FaXmark,
} from "react-icons/fa6";
import type { ToolCallDisplay } from "@/lib/store";
import { isObject } from "@/lib/utils";

interface ToolCallDisplayProps {
  toolCall: ToolCallDisplay;
}

export function ToolCallDisplayComponent({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: <FaSpinner className="animate-spin text-gray-400" />,
    running: <FaSpinner className="animate-spin text-blue-400" />,
    complete: <FaCheck className="text-green-400" />,
    error: <FaXmark className="text-red-400" />,
  }[toolCall.status];

  const statusColor = {
    pending: "border-gray-600 bg-gray-800/50",
    running: "border-blue-600 bg-blue-900/20",
    complete: "border-green-600/50 bg-green-900/10",
    error: "border-red-600/50 bg-red-900/10",
  }[toolCall.status];

  const toolDisplayName = toolCall.toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const hasDetails = toolCall.args && Object.keys(toolCall.args).length > 0;

  const getResultMessage = (): string | null => {
    if (!toolCall.result) return null;
    const result = toolCall.result as Record<string, unknown>;
    if (isObject("result")) {
      if ("message" in result && typeof result.message === "string")
        return result.message;
      if ("error" in result && typeof result.error === "string")
        return result.error;
    }
    return null;
  };

  return (
    <div className={`rounded border ${statusColor} overflow-hidden`}>
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {hasDetails &&
          (expanded ? (
            <FaChevronDown className="text-xs text-gray-500" />
          ) : (
            <FaChevronRight className="text-xs text-gray-500" />
          ))}
        <span className="text-sm">{statusIcon}</span>
        <span className="text-sm font-medium text-gray-200">
          {toolDisplayName}
        </span>
        {toolCall.status === "complete" && (
          <span className="text-xs text-gray-500 ml-auto">
            {getResultMessage() || "Done"}
          </span>
        )}
        {toolCall.status === "error" && (
          <span className="text-xs text-red-400 ml-auto">
            {getResultMessage() || "Error"}
          </span>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="border-t border-gray-700/50 px-2 py-1.5 bg-black/20">
          <div className="text-xs text-gray-400 mb-1">Arguments:</div>
          <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(toolCall.args, null, 2) ?? ""}
          </pre>
          {toolCall.result !== undefined && toolCall.result !== null && (
            <>
              <div className="text-xs text-gray-400 mt-2 mb-1">Result:</div>
              <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(toolCall.result, null, 2) ?? ""}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
