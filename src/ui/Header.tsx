import {
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaRegCopy,
  FaRegPaste,
  FaCheck,
  FaChevronLeft,
  FaHouse,
  FaSpinner,
} from "react-icons/fa6";
import { fileHistoryActions, useProjectStore } from "@/lib/store";
import { IconButton } from "./IconButton";
import { useClipboard, useMediaQuery, useTimeout } from "@mantine/hooks";
import { createFileFromOperation, createOperationFromFile } from "@/lib/utils";
import { memo, useState } from "react";
import { ClipboardSchema } from "@/lib/schemas";
import { updateFiles } from "@/lib/update";
import { Button, Tooltip } from "@mantine/core";
import { Link } from "react-router";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { MAX_SCREEN_WIDTH } from "@/lib/data";

function HeaderComponent() {
  const currentFileId = useProjectStore((s) => s.getCurrentFile()?.id);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const updateProject = useProjectStore((s) => s.updateProject);
  const canUndo = fileHistoryActions.canUndo(currentFileId);
  const canRedo = fileHistoryActions.canRedo(currentFileId);
  const clipboard = useClipboard({ timeout: 500 });
  const [isOperationPasted, setIsOperationPasted] = useState(false);
  const pasteAnimation = useTimeout(() => setIsOperationPasted(false), 500);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const isExecuting = useExecutionResultsStore((s) => s.isExecuting);

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
        <IconButton
          title={clipboard.copied ? "Copied!" : "Copy"}
          icon={clipboard.copied ? FaCheck : FaRegCopy}
          size={16}
          onClick={() => {
            const operation = createOperationFromFile(
              useProjectStore.getState().getCurrentFile()
            );
            const project = useProjectStore.getState().getCurrentProject();
            if (!operation || !project) return;
            const { name: _, ...value } = operation.value;
            const source = project.files.find((f) => f.id === operation.id);
            const trigger =
              source?.type === "operation" ? source.trigger : undefined;
            clipboard.copy(JSON.stringify({ ...value, trigger }));
          }}
          disabled={!currentFileId}
          className={!currentFileId ? "cursor-not-allowed" : ""}
        />
        <IconButton
          title={isOperationPasted ? "Pasted!" : "Paste"}
          icon={isOperationPasted ? FaCheck : FaRegPaste}
          size={16}
          onClick={async () => {
            try {
              const operation = createOperationFromFile(
                useProjectStore.getState().getCurrentFile()
              );
              const project = useProjectStore.getState().getCurrentProject();
              if (!operation || !project) return;
              const copied = await navigator.clipboard.readText();
              const parsed = ClipboardSchema.safeParse(JSON.parse(copied));
              if (parsed.error) throw new Error(parsed.error.message);
              const { trigger, parameters, ...content } = parsed.data;
              const currentFile = project.files.find(
                (f) => f.id === operation.id
              );
              const isTargetTrigger =
                currentFile?.type === "operation" && !!currentFile.trigger;
              const isSameType = !!trigger === isTargetTrigger;
              updateProject(project.id, {
                files: updateFiles(
                  project.files,
                  fileHistoryActions.pushState,
                  useExecutionResultsStore.getState().rootContext,
                  {
                    ...createFileFromOperation({
                      ...operation,
                      value: {
                        ...operation.value,
                        ...(isSameType ? { ...content, parameters } : content),
                      } as typeof operation.value,
                    }),
                    ...{
                      trigger: isTargetTrigger
                        ? isSameType
                          ? trigger
                          : currentFile?.trigger
                        : undefined,
                    },
                  }
                ),
              });
              setIsOperationPasted(true);
              pasteAnimation.start();
            } catch (error) {
              console.error(error);
              pasteAnimation.clear();
            }
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
      </div>
    </div>
  );
}

export const Header = memo(HeaderComponent);
