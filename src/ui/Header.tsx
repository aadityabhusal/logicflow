import {
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaChevronLeft,
  FaHouse,
  FaRegCircleQuestion,
  FaSpinner,
} from "react-icons/fa6";
import {
  fileHistoryActions,
  useProjectStore,
  useUiConfigStore,
} from "@/lib/store";
import { IconButton } from "./IconButton";
import { useMediaQuery } from "@mantine/hooks";
import { memo } from "react";
import { Button, Tooltip } from "@mantine/core";
import { Link } from "react-router";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { executionWorkerClient } from "@/lib/execution/worker-client";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { TbKeyboardOff, TbRefresh } from "react-icons/tb";

function HeaderComponent() {
  const currentFileId = useProjectStore((s) => s.getCurrentFile()?.id);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = fileHistoryActions.canUndo(currentFileId);
  const canRedo = fileHistoryActions.canRedo(currentFileId);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const isExecuting = useExecutionResultsStore((s) => s.isExecuting);
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);

  return (
    <div className="border-b p-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Button
          component={Link}
          to="/"
          className="outline-none p-0.5!"
          leftSection={<FaChevronLeft />}
        >
          {!smallScreen ? "Dashboard" : <FaHouse />}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        {isExecuting && (
          <Tooltip label="Executing Operation">
            <div>
              <FaSpinner className="animate-spin text-green-400" />
            </div>
          </Tooltip>
        )}
        {smallScreen && (
          <IconButton
            title={`${disableKeyboard ? "Enable" : "Disable"} keyboard focus`}
            icon={TbKeyboardOff}
            size={20}
            onClick={() => setUiConfig({ disableKeyboard: !disableKeyboard })}
            className={disableKeyboard ? "text-reserved" : ""}
          />
        )}
        <IconButton
          title="Clear cache and run"
          icon={TbRefresh}
          size={20}
          onClick={() => {
            executionWorkerClient.reset();
            useExecutionResultsStore.getState().clearCache();
          }}
          disabled={!currentFileId}
          className={!currentFileId ? "cursor-not-allowed" : ""}
        />
        <IconButton
          title="Undo"
          icon={FaArrowRotateLeft}
          size={16}
          onClick={() => undo()}
          disabled={!canUndo}
          className={!canUndo ? "cursor-not-allowed" : ""}
        />
        <IconButton
          title="Redo"
          icon={FaArrowRotateRight}
          size={16}
          onClick={() => redo()}
          disabled={!canRedo}
          className={!canRedo ? "cursor-not-allowed" : ""}
        />
        <Tooltip label="Open Docs">
          <Button
            component={Link}
            to="/docs"
            className="outline-none"
            leftSection={smallScreen ? null : <FaRegCircleQuestion size={18} />}
          >
            {smallScreen ? <FaRegCircleQuestion size={18} /> : "Help"}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

export const Header = memo(HeaderComponent);
