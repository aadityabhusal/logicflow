import { FaPencil, FaPlus, FaX } from "react-icons/fa6";
import { fileHistoryActions, useProjectStore } from "../lib/store";
import { createProjectFile, handleSearchParams } from "../lib/utils";
import { NoteText } from "./NoteText";
import { IconButton } from "./IconButton";
import { SiGithub, SiYoutube } from "react-icons/si";
import { useSearchParams } from "react-router";
import { memo, useState } from "react";
import { updateFiles } from "@/lib/update";

function SidebarComponent() {
  const addFile = useProjectStore((s) => s.addFile);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const getFile = useProjectStore((s) => s.getFile);
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string>();
  const [hoveringId, setHoveringId] = useState<string>();

  return (
    <div className="flex flex-col ml-auto w-40 border-r">
      <div className="p-1 flex gap-2 justify-between items-center border-b">
        <span>Operations</span>
        <IconButton
          size={16}
          icon={FaPlus}
          title="Add operation"
          onClick={() =>
            addFile(
              createProjectFile({ type: "operation" }, currentProject?.files)
            )
          }
        >
          Add
        </IconButton>
      </div>
      <ul className="flex-1 p-1 overflow-y-auto dropdown-scrollbar list-none m-0">
        {!currentProject?.files.length && (
          <NoteText center>Add an operation</NoteText>
        )}
        {currentProject?.files.map((item) => (
          <li
            className={
              "flex items-center gap-1 justify-between p-1 hover:bg-dropdown-hover " +
              (item.name === searchParams.get("file")
                ? "bg-dropdown-hover"
                : "bg-editor")
            }
            key={item.id}
            onClick={() =>
              setSearchParams(...handleSearchParams({ file: item.name }, true))
            }
            onPointerOver={() => setHoveringId(item.id)}
            onPointerLeave={() => setHoveringId(undefined)}
          >
            {editingId === item.id ? (
              <input
                autoFocus
                className="focus:outline outline-white flex-1 w-full"
                defaultValue={item.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={({ target }) => {
                  const file = getFile(item.id);
                  if (target.value && currentProject && file) {
                    updateProject(currentProject.id, {
                      files: updateFiles(
                        currentProject.files,
                        fileHistoryActions.pushState,
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
              <span className="truncate mr-auto">{item.name}</span>
            )}
            {!editingId && hoveringId === item.id && (
              <IconButton
                icon={FaPencil}
                title="Edit operation name"
                className="p-0.5 hover:outline hover:outline-border"
                size={10}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(item.id);
                }}
              />
            )}
            {hoveringId === item.id && (
              <IconButton
                icon={FaX}
                title="Delete operation"
                className="p-0.5 hover:outline hover:outline-border"
                size={10}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteFile(item.id);
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 p-2 border-t">
        <a
          href="https://www.youtube.com/watch?v=AOfOhNwQL64"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1"
          title="Demo video"
        >
          <SiYoutube size={20} />
          <span className="p-px mr-1 text-white">Demo</span>
        </a>
        <a
          href="https://github.com/aadityabhusal/logicflow"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1"
          title="Source code"
        >
          <SiGithub size={20} />
          <span className="p-px mr-1 text-white">Source code</span>
        </a>
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
