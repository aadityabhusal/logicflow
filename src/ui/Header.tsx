import {
  FaBars,
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaRegCopy,
  FaRegPaste,
  FaCheck,
} from "react-icons/fa6";
import {
  fileHistoryActions,
  useUiConfigStore,
  useProjectStore,
  jsonParseReviver,
  jsonStringifyReplacer,
  useNavigationStore,
} from "../lib/store";
import { IconButton } from "./IconButton";
import { useClipboard, useTimeout } from "@mantine/hooks";
import { createFileFromOperation } from "../lib/utils";
import { useState } from "react";
import { IData, OperationType, Project } from "../lib/types";
import { OperationValueSchema } from "../lib/schemas";
import { BaseInput } from "@/components/Input/BaseInput";
import { updateFiles } from "@/lib/update";

export function Header({
  currentProject,
  currentOperation,
}: {
  currentOperation?: IData<OperationType>;
  currentProject: Project;
}) {
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const updateProject = useProjectStore((s) => s.updateProject);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const canUndo = fileHistoryActions.canUndo(currentFileId);
  const canRedo = fileHistoryActions.canRedo(currentFileId);
  const clipboard = useClipboard({ timeout: 500 });
  const [isOperationPasted, setIsOperationPasted] = useState(false);
  const pasteAnimation = useTimeout(() => setIsOperationPasted(false), 500);

  return (
    <div className="border-b p-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 w-[88px]">
        <IconButton
          icon={FaBars}
          size={16}
          onClick={() => setUiConfig((p) => ({ hideSidebar: !p.hideSidebar }))}
        />
      </div>
      {currentProject && (
        <BaseInput
          className="focus:outline hover:outline outline-white"
          defaultValue={currentProject.name}
          onFocus={() => setNavigation({ navigation: undefined })}
          onBlur={(e) =>
            e.target.value &&
            updateProject(currentProject.id, { name: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
      <div className="flex items-center gap-2">
        <IconButton
          title="Copy"
          icon={clipboard.copied ? FaCheck : FaRegCopy}
          size={16}
          onClick={() => {
            if (!currentOperation) return;
            const { name: _, ...value } = currentOperation.value;
            clipboard.copy(JSON.stringify(value, jsonStringifyReplacer));
          }}
          disabled={!currentOperation}
          className={!currentOperation ? "cursor-not-allowed" : ""}
        />
        <IconButton
          title="Paste"
          icon={isOperationPasted ? FaCheck : FaRegPaste}
          size={16}
          onClick={async () => {
            try {
              if (!currentOperation || !currentProject) return;
              const copied = await navigator.clipboard.readText();
              const parsed = OperationValueSchema.safeParse(
                JSON.parse(copied, jsonParseReviver)
              );
              if (parsed.error) throw new Error(parsed.error.message);
              updateProject(currentProject.id, {
                files: updateFiles(
                  currentProject.files,
                  fileHistoryActions.pushState,
                  createFileFromOperation({
                    ...currentOperation,
                    value: { ...currentOperation.value, ...parsed.data },
                  })
                ),
              });
              setIsOperationPasted(true);
              pasteAnimation.start();
            } catch (error) {
              console.error(error);
              pasteAnimation.clear();
            }
          }}
          disabled={!currentOperation}
          className={!currentOperation ? "cursor-not-allowed" : ""}
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
