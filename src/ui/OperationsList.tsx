import { FaPencil, FaPlus, FaX, FaGlobe, FaCode } from "react-icons/fa6";
import { Menu } from "@mantine/core";
import { fileHistoryActions, useProjectStore } from "../lib/store";
import {
  createProjectFile,
  handleSearchParams,
  isValidIdentifier,
} from "../lib/utils";
import { NoteText } from "./NoteText";
import { IconButton } from "./IconButton";
import { useNavigate, useSearchParams } from "react-router";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { updateFiles } from "@/lib/update";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import {
  getReservedNames,
  useExecutionResultsStore,
} from "@/lib/execution/store";
import { ReservedNames } from "@/lib/execution/types";
import { ProjectFile } from "@/lib/types";

const OperationListItem = memo(OperationListItemComponent);

export function OperationsList() {
  const context = useExecutionResultsStore((s) => s.rootContext);
  const navigate = useNavigate();
  const addFile = useProjectStore((s) => s.addFile);
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const currentFileName = useProjectStore((s) => s.getCurrentFile()?.name);

  const reservedNames = useMemo(() => {
    const _reservedNames = getReservedNames(context.variables);
    if (!currentFileName) return _reservedNames;
    return _reservedNames.concat([
      { kind: "operation", name: currentFileName } as ReservedNames[number],
    ]);
  }, [context.variables, currentFileName]);

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
        <p className="font-bold">Operations</p>
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
            reservedNames={reservedNames}
          />
        ))}
      </ul>
    </div>
  );
}

function OperationListItemComponent({
  item,
  reservedNames,
}: {
  item: ProjectFile;
  reservedNames: ReservedNames;
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
  const currentProjectId = useProjectStore((s) => s.getCurrentProject()?.id);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
    }
  }, [editingId]);
  return (
    <li
      className={
        "flex items-center gap-1 p-1 hover:bg-dropdown-hover cursor-pointer " +
        (item.name === searchParams.get("file")
          ? "bg-dropdown-hover"
          : "bg-editor")
      }
      key={item.id}
      onClick={() =>
        setSearchParams(...handleSearchParams({ file: item.name }, true))
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSearchParams(...handleSearchParams({ file: item.name }, true));
        }
      }}
      onPointerOver={() => setHoveringId(item.id)}
      onPointerLeave={() => setHoveringId(undefined)}
    >
      {editingId === item.id ? (
        <input
          ref={inputRef}
          className="focus:outline outline-white flex-1 w-full"
          defaultValue={item.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={({ target }) => {
            if (target.value && !isValidIdentifier(target.value)) {
              setEditingId(undefined);
              return notifications.show({
                message: `"${target.value}" is not a valid name`,
              });
            }
            const isReserved = Array.from(reservedNames).find(
              (r) => r.name === target.value && item.name !== target.value
            );
            if (isReserved) {
              notifications.show({
                message: `Cannot use the ${isReserved.kind} '${target.value}' as an operation name`,
              });
              setEditingId(undefined);
              return;
            }
            const file = getFile(item.id);
            if (target.value && currentProjectId && file) {
              updateProject(currentProjectId, {
                files: updateFiles(
                  useProjectStore.getState().getCurrentProject()?.files ?? [],
                  fileHistoryActions.pushState,
                  useExecutionResultsStore.getState().rootContext,
                  { ...file, name: target.value }
                ),
              });
              if (searchParams.get("file") === item.name) {
                setSearchParams(
                  ...handleSearchParams({ file: target.value }, true)
                );
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
        <>
          {item.type === "operation" &&
            (item.trigger ? (
              <FaGlobe className="shrink-0" />
            ) : (
              <FaCode className="shrink-0" />
            ))}
          <span className="truncate mr-auto">{item.name}</span>
        </>
      )}
      {!editingId && (smallScreen ? true : hoveringId === item.id) && (
        <IconButton
          icon={FaPencil}
          title="Edit name"
          className="p-0.5 hover:outline hover:outline-border"
          size={10}
          onClick={(e) => {
            e.stopPropagation();
            setEditingId(item.id);
          }}
        />
      )}
      {(smallScreen ? true : hoveringId === item.id) && (
        <IconButton
          icon={FaX}
          title="Delete"
          className="p-0.5 hover:outline hover:outline-border"
          size={10}
          onClick={(e) => {
            e.stopPropagation();
            deleteFile(item.id);
            if (currentProjectId) navigate(`/project/${currentProjectId}`);
          }}
        />
      )}
    </li>
  );
}
