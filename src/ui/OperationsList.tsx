import { FaPencil, FaPlus, FaGlobe, FaCode, FaTrash } from "react-icons/fa6";
import { Button, Menu, Popover } from "@mantine/core";
import { fileHistoryActions, useProjectStore } from "../lib/store";
import { createProjectFile, handleSearchParams } from "../lib/utils";
import { NoteText } from "./NoteText";
import { IconButton } from "./IconButton";
import { useNavigate, useSearchParams } from "react-router";
import { memo, useEffect, useRef, useState } from "react";
import { updateFiles } from "@/lib/update";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { ProjectFile } from "@/lib/types";
import { useRestrictedName } from "@/lib/useRestrictedName";

const OperationListItem = memo(OperationListItemComponent);

export function OperationsList() {
  const navigate = useNavigate();
  const addFile = useProjectStore((s) => s.addFile);
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const { isRestricted, reservedNames } = useRestrictedName();

  const handleAdd = (isTrigger: boolean) => {
    const newFile = createProjectFile(
      { type: "operation", trigger: isTrigger ? { type: "http" } : undefined },
      Array.from(reservedNames).map((r) => r.name)
    );
    addFile(newFile);
    navigate(`/project/${currentProject?.id}?file=${newFile.name}`);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-1 flex gap-2 justify-between items-center border-b bg-dropdown-default">
        <p className="font-bold flex-1">Operations</p>
        <Menu
          width={200}
          offset={1}
          withinPortal={false}
          position="bottom-start"
        >
          <Menu.Target>
            <IconButton size={16} icon={FaPlus} title="Add">
              Add
            </IconButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              rightSection={<FaCode />}
              onClick={() => handleAdd(false)}
            >
              Operation
            </Menu.Item>
            <Menu.Item
              rightSection={<FaGlobe />}
              onClick={() => handleAdd(true)}
            >
              Trigger
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      <ul className="flex-1 overflow-y-auto dropdown-scrollbar list-none m-0">
        {!currentProject?.files.length && (
          <NoteText center>Add an operation</NoteText>
        )}
        {currentProject?.files.map((item) => (
          <OperationListItem
            key={item.id}
            item={item}
            isRestricted={isRestricted}
          />
        ))}
      </ul>
    </div>
  );
}

function OperationListItemComponent({
  item,
  isRestricted,
}: {
  item: ProjectFile;
  isRestricted: (name: string, selfName?: string) => string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hoveringId, setHoveringId] = useState<string>();
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const getFile = useProjectStore((s) => s.getFile);
  const [editingId, setEditingId] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const projectId = useProjectStore((s) => s.getCurrentProject()?.id);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
    }
  }, [editingId]);
  return (
    <li
      className={
        "flex items-center gap-1 p-0.5 hover:bg-dropdown-hover " +
        (item.name === searchParams.get("file")
          ? "bg-dropdown-hover"
          : "bg-editor")
      }
      key={item.id}
      onPointerOver={() => setHoveringId(item.id)}
      onPointerLeave={() => setHoveringId(undefined)}
    >
      {editingId === item.id ? (
        <input
          ref={inputRef}
          className="rounded-xs focus:outline outline-white flex-1 w-full p-0.5"
          defaultValue={item.name}
          onBlur={({ target }) => {
            const name = target.value.trim();
            const error = isRestricted(name, item.name);
            if (error) {
              notifications.show({ message: error });
              setEditingId(undefined);
              return;
            }
            const file = getFile(item.id);
            if (name && projectId && file) {
              updateProject(projectId, {
                files: updateFiles(
                  useProjectStore.getState().getCurrentProject()?.files ?? [],
                  fileHistoryActions.pushState,
                  useExecutionResultsStore.getState().rootContext,
                  { ...file, name }
                ),
              });
              if (searchParams.get("file") === item.name) {
                setSearchParams(...handleSearchParams({ file: name }, true));
              }
            }
            setEditingId(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <Button
          component="p"
          className="flex-1 p-0.5! outline-none"
          onClick={() =>
            setSearchParams(...handleSearchParams({ file: item.name }, true))
          }
          leftSection={
            item.type !== "operation" ? null : item.trigger ? (
              <FaGlobe className="shrink-0" />
            ) : (
              <FaCode className="shrink-0" />
            )
          }
        >
          {item.name}
        </Button>
      )}
      {!editingId && (smallScreen ? true : hoveringId === item.id) && (
        <IconButton
          icon={FaPencil}
          title="Edit name"
          className="p-0.5 hover:outline hover:outline-border"
          size={12}
          onClick={() => setEditingId(item.id)}
        />
      )}
      {(smallScreen ? true : hoveringId === item.id) && (
        <Popover position="bottom-end" offset={1}>
          <Popover.Target>
            <IconButton
              icon={FaTrash}
              title="Delete"
              className="p-0.5 hover:outline hover:outline-border"
              size={12}
            />
          </Popover.Target>
          <Popover.Dropdown classNames={{ dropdown: "border" }}>
            <div className="flex flex-col gap-2 p-1">
              <span className="text-sm">Delete this operation?</span>
              <Button
                leftSection={<FaTrash className="text-red-400" />}
                className="text-sm self-end"
                onClick={() => {
                  deleteFile(item.id);
                  if (searchParams.get("file") === item.name && projectId)
                    navigate(`/project/${projectId}`);
                }}
              >
                Yes, delete.
              </Button>
            </div>
          </Popover.Dropdown>
        </Popover>
      )}
    </li>
  );
}
