import { FaX } from "react-icons/fa6";
import { IconButton } from "../ui/IconButton";
import { uiConfigStore } from "../lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { ParseData } from "./Parse/ParseData";
import { useHotkeys, useMediaQuery } from "@mantine/hooks";
import { getTypeSignature } from "@/lib/utils";
import { Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { Resizer } from "@/ui/Resizer";

export function DetailsPanel() {
  const result = uiConfigStore((s) => s.result);
  const skipExecution = uiConfigStore((s) =>
    s.skipExecution?.kind !== "error" ? s.skipExecution : undefined
  );
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);
  const detailsPanelSize = uiConfigStore(
    (s) => s.detailsPanelSize ?? { width: 200, height: 150 }
  );
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const typeSignature = useMemo(
    () => getTypeSignature(result?.type ?? { kind: "undefined" }),
    [result?.type]
  );

  useHotkeys([["Escape", () => setUiConfig({ result: undefined })]]);

  if (!result) return null;
  return (
    <>
      {!smallScreen ? (
        <Resizer
          type="width"
          direction="negative"
          minSize={200}
          maxSize={window.innerWidth / 2}
          setPanelSize={(size) => setUiConfig({ detailsPanelSize: size })}
          className="absolute top-0 left-0"
        />
      ) : (
        <Resizer
          type="height"
          direction="negative"
          minSize={150}
          maxSize={window.innerHeight / 2}
          setPanelSize={(size) => setUiConfig({ detailsPanelSize: size })}
          className="absolute top-0 left-0"
        />
      )}
      <div
        className="relative flex flex-col bg-editor"
        style={{
          width: smallScreen ? "100%" : detailsPanelSize?.width,
          height: !smallScreen ? "100%" : detailsPanelSize?.height,
        }}
      >
        <div className="flex justify-between p-1 border-b">
          <div>Details</div>
          <IconButton
            icon={FaX}
            title="Close"
            size={12}
            onClick={(e) => {
              e.stopPropagation();
              setUiConfig({ result: undefined });
            }}
          />
        </div>
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
                <ParseData data={result} showData={true} />
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
    </>
  );
}
