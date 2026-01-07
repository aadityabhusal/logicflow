import {
  FaBars,
  FaArrowRotateLeft,
  FaArrowRotateRight,
  FaRegCopy,
  FaRegPaste,
  FaCheck,
  FaGear,
} from "react-icons/fa6";
import {
  fileHistoryActions,
  uiConfigStore,
  useProjectStore,
  jsonParseReviver,
  jsonStringifyReplacer,
} from "../lib/store";
import { IconButton } from "./IconButton";
import { useClipboard, useTimeout } from "@mantine/hooks";
import { createFileFromOperation } from "../lib/utils";
import { useState } from "react";
import { IData, OperationType, Project } from "../lib/types";
import { OperationValueSchema } from "../lib/schemas";
import { Popover } from "@mantine/core";
import { BaseInput } from "@/components/Input/BaseInput";
import { preferenceOptions } from "@/lib/data";
import { updateFiles } from "@/lib/update";

export function Header({
  currentProject,
  currentOperation,
}: {
  currentOperation?: IData<OperationType>;
  currentProject: Project;
}) {
  const uiConfig = uiConfigStore((s) => ({
    highlightOperation: s.highlightOperation,
    hideFocusInfo: s.hideFocusInfo,
  }));
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);
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
      <div className="flex items-center gap-4">
        <IconButton
          icon={FaBars}
          size={16}
          onClick={() => setUiConfig((p) => ({ hideSidebar: !p.hideSidebar }))}
        />
        <Popover>
          <Popover.Target>
            <IconButton title="Settings" className="w-5 h-5" icon={FaGear} />
          </Popover.Target>
          <Popover.Dropdown
            classNames={{ dropdown: "absolute bg-editor border" }}
          >
            {preferenceOptions.map((item) => (
              <div
                className="flex justify-between items-center gap-4 py-1 px-2 border-b"
                key={item.id}
              >
                <label className="cursor-pointer" htmlFor={item.id}>
                  {item.label}
                </label>
                <input
                  id={item.id}
                  type="checkbox"
                  checked={uiConfig[item.id]}
                  onChange={(e) => setUiConfig({ [item.id]: e.target.checked })}
                />
              </div>
            ))}
          </Popover.Dropdown>
        </Popover>
      </div>
      {currentProject && (
        <BaseInput
          className="focus:outline hover:outline outline-white"
          defaultValue={currentProject.name}
          onFocus={() => setUiConfig({ navigation: undefined })}
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
