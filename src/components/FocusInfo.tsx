import { FaX } from "react-icons/fa6";
import { IconButton } from "../ui/IconButton";
import { uiConfigStore } from "../lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { ParseData } from "./Parse/ParseData";
import { useHotkeys } from "@mantine/hooks";
import { getTypeSignature } from "@/lib/utils";

export function FocusInfo() {
  const showPopup = uiConfigStore((s) => s.showPopup);
  const result = uiConfigStore((s) => s.result);
  const skipExecution = uiConfigStore((s) => s.skipExecution);
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);

  useHotkeys([
    ["Escape", () => setUiConfig({ showPopup: false, result: undefined })],
  ]);

  if (!showPopup || !result) return null;
  return (
    <div className="absolute border top-1 right-1 flex flex-col bg-editor">
      <div className="flex justify-between min-w-60 max-w-96 p-1 border-b">
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
      <div className="border-b p-1">
        <span className="text-type">Type: </span>
        <span>{getTypeSignature(result?.type ?? { kind: "undefined" })}</span>
      </div>
      {result?.type.kind !== "operation" ? (
        <div className="p-1">
          <div className="text-gray-300 mb-1.5">
            {skipExecution ? "Skipped" : "Result"}
          </div>
          <ErrorBoundary displayError={true}>
            <pre className="max-w-96 overflow-x-auto dropdown-scrollbar text-wrap text-sm">
              {skipExecution ? (
                skipExecution.reason
              ) : (
                <ParseData data={result} showData={true} />
              )}
            </pre>
          </ErrorBoundary>
        </div>
      ) : null}
    </div>
  );
}
