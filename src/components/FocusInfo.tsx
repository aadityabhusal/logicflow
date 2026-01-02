import { FaX } from "react-icons/fa6";
import { IconButton } from "../ui/IconButton";
import { uiConfigStore } from "../lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { ParseData } from "./Parse/ParseData";
import { useHotkeys } from "@mantine/hooks";
import { getTypeSignature } from "@/lib/utils";
import { Tooltip } from "@mantine/core";
import { useMemo } from "react";

export function FocusInfo() {
  const showPopup = uiConfigStore((s) => s.showPopup);
  const result = uiConfigStore((s) => s.result);
  const skipExecution = uiConfigStore((s) =>
    s.skipExecution?.kind !== "error" ? s.skipExecution : undefined
  );
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);

  const typeSignature = useMemo(
    () => getTypeSignature(result?.type ?? { kind: "undefined" }),
    [result?.type]
  );

  useHotkeys([
    ["Escape", () => setUiConfig({ showPopup: false, result: undefined })],
  ]);

  if (!showPopup || !result) return null;
  return (
    <div className="absolute border top-1 right-1 flex flex-col bg-editor z-50">
      <div className="flex justify-between min-w-60 max-w-80 p-1 border-b">
        <div>Details</div>
        <IconButton
          icon={FaX}
          title="Delete operation"
          size={12}
          onClick={(e) => {
            e.stopPropagation();
            setUiConfig({ showPopup: false, result: undefined });
          }}
        />
      </div>
      <div className="border-b p-1 flex items-center gap-1">
        <span className="text-type">Type: </span>
        <Tooltip label={typeSignature}>
          <div className="truncate max-w-64">{typeSignature}</div>
        </Tooltip>
      </div>
      {result?.type.kind !== "operation" ? (
        <div className={["p-1", skipExecution ? "border-b" : ""].join(" ")}>
          <div className="text-gray-300 mb-1.5">Result</div>
          <ErrorBoundary displayError={true}>
            <pre className="max-w-96 overflow-x-auto dropdown-scrollbar text-wrap text-sm">
              <ParseData data={result} showData={true} />
            </pre>
          </ErrorBoundary>
        </div>
      ) : null}
      {skipExecution && (
        <div className="p-1">
          <div className={"mb-1.5"}>Skipped</div>
          <div className="text-sm">{skipExecution.reason}</div>
        </div>
      )}
    </div>
  );
}
