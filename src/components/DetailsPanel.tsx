import {
  FaChevronLeft,
  FaCrosshairs,
  FaLock,
  FaUnlock,
  FaX,
} from "react-icons/fa6";
import { IconButton } from "../ui/IconButton";
import {
  useNavigationStore,
  useProjectStore,
  useUiConfigStore,
} from "../lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { ParseData } from "./Parse/ParseData";
import { useHotkeys, useMediaQuery } from "@mantine/hooks";
import { getTypeSignature } from "@/lib/utils";
import { Tooltip } from "@mantine/core";
import { memo, useMemo } from "react";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { Resizer } from "@/ui/Resizer";

function DetailsPanelComponent() {
  const operationId = useProjectStore((s) => s.currentFileId);
  const result = useNavigationStore((s) => s.result);
  const skipExecution = useNavigationStore((s) =>
    s.skipExecution?.kind !== "error" ? s.skipExecution : undefined
  );
  const navigationId = useNavigationStore((s) => s.navigation?.id);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const detailsPanel = useUiConfigStore((s) => s.detailsPanel);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const typeSignature = useMemo(
    () => getTypeSignature(result?.type ?? { kind: "undefined" }),
    [result?.type]
  );
  const panelLockedId = useMemo(
    () => operationId && detailsPanel?.lockedIds?.[operationId],
    [detailsPanel?.lockedIds, operationId]
  );

  useHotkeys([["Escape", () => setNavigation({ result: undefined })]]);

  if (!result) return null;

  if (detailsPanel.hidden) {
    return (
      <div
        className={[
          "absolute bg-dropdown-hover p-1 flex items-center rounded-l-sm ",
          smallScreen ? "bottom-0 right-1 rotate-90" : "top-1 right-0",
        ].join(" ")}
      >
        <IconButton
          icon={FaChevronLeft}
          title="Open Details"
          onClick={() => {
            setUiConfig((p) => ({
              detailsPanel: { ...p.detailsPanel, hidden: false },
            }));
          }}
        />
      </div>
    );
  }

  return (
    <>
      {!smallScreen ? (
        <Resizer
          type="width"
          direction="negative"
          minSize={200}
          maxSize={window.innerWidth / 2}
          setPanelSize={(size) =>
            setUiConfig((p) => ({
              detailsPanel: {
                ...p.detailsPanel,
                size: { ...p.detailsPanel?.size, ...size },
              },
            }))
          }
          className="absolute top-0 left-0"
        />
      ) : (
        <Resizer
          type="height"
          direction="negative"
          minSize={150}
          maxSize={window.innerHeight / 2}
          setPanelSize={(size) =>
            setUiConfig((p) => ({
              detailsPanel: {
                ...p.detailsPanel,
                size: { ...p.detailsPanel?.size, ...size },
              },
            }))
          }
          className="absolute top-0 left-0"
        />
      )}
      <div
        className="relative flex flex-col bg-editor"
        style={{
          width: smallScreen ? "100%" : detailsPanel?.size?.width,
          height: !smallScreen ? "100%" : detailsPanel?.size?.height,
        }}
      >
        <div className="flex justify-between p-1 border-b gap-2">
          <div className="mr-auto">Details</div>
          {panelLockedId ? (
            <IconButton
              icon={FaCrosshairs}
              title="Focus"
              size={12}
              onClick={() => {
                setNavigation({ navigation: { id: panelLockedId } });
              }}
            />
          ) : null}
          <IconButton
            icon={panelLockedId ? FaLock : FaUnlock}
            title={panelLockedId ? "Unlock" : "Lock"}
            className={panelLockedId ? "text-reserved" : ""}
            size={12}
            onClick={() => {
              setUiConfig((p) => {
                if (!operationId) return p;
                const lockedIds = { ...(p.detailsPanel?.lockedIds ?? {}) };
                if (panelLockedId) delete lockedIds[operationId];
                else lockedIds[operationId] = navigationId!;
                return { detailsPanel: { ...p.detailsPanel, lockedIds } };
              });
            }}
          />
          <IconButton
            icon={FaX}
            title="Close"
            size={12}
            onClick={() => {
              setUiConfig((p) => ({
                detailsPanel: { ...p.detailsPanel, hidden: true },
              }));
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

export const DetailsPanel = memo(DetailsPanelComponent);
