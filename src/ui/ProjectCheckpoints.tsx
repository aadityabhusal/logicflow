import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Popover } from "@mantine/core";
import { FaRotateLeft, FaTrash, FaCheck } from "react-icons/fa6";
import { formatDistanceToNow } from "date-fns";
import { notifications } from "@mantine/notifications";
import { useCheckpointStore, useProjectStore } from "../lib/store";
import { executionWorkerClient } from "@/lib/execution/worker-client";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { ProjectCheckpoint } from "@/lib/types";
import { IconButton } from "./IconButton";
import { NoteText } from "./NoteText";

export function ProjectCheckpoints() {
  const navigate = useNavigate();
  const currentProject = useProjectStore((s) => s.getCurrentProject());
  const restoreProjectFromCheckpoint = useProjectStore(
    (s) => s.restoreProjectFromCheckpoint
  );
  const projectCheckpoints = useCheckpointStore((s) =>
    currentProject ? (s.checkpoints[currentProject.id] ?? []) : []
  );
  const createCheckpoint = useCheckpointStore((s) => s.createCheckpoint);
  const deleteCheckpoint = useCheckpointStore((s) => s.deleteCheckpoint);

  const [checkpointName, setCheckpointName] = useState("");

  const handleCreateCheckpoint = () => {
    if (!currentProject) return;
    const name = checkpointName.trim() || undefined;
    createCheckpoint(currentProject, name);
    setCheckpointName("");
    notifications.show({ message: "Checkpoint created" });
  };

  const handleRestore = (checkpoint: ProjectCheckpoint) => {
    if (!currentProject) return;
    const prevFileId = useProjectStore.getState().currentFileId;
    restoreProjectFromCheckpoint(checkpoint);
    executionWorkerClient.reset();
    useExecutionResultsStore.getState().clearCache();
    notifications.show({ message: "Checkpoint restored" });
    if (
      !prevFileId ||
      !checkpoint.snapshot.files.some((f) => f.id === prevFileId)
    ) {
      navigate(`/project/${currentProject.id}`, { replace: true });
    }
  };

  const handleDelete = (checkpointId: string) => {
    if (!currentProject) return;
    deleteCheckpoint(currentProject.id, checkpointId);
    notifications.show({ message: "Checkpoint deleted" });
  };

  if (!currentProject) return null;

  return (
    <div className="border-t pt-2 flex flex-col gap-2">
      <span className="text-gray-300">Project checkpoints</span>
      <div className="flex gap-1">
        <input
          type="text"
          className="focus:outline outline-white border w-full p-0.5 text-sm flex-1"
          placeholder="Checkpoint name (optional)"
          value={checkpointName}
          onChange={(e) => setCheckpointName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreateCheckpoint();
            }
          }}
        />
        <IconButton
          icon={FaCheck}
          className="px-1 border"
          onClick={handleCreateCheckpoint}
        />
      </div>
      {projectCheckpoints.length === 0 ? (
        <NoteText center>No checkpoints yet.</NoteText>
      ) : (
        <div className="flex flex-col gap-1">
          {projectCheckpoints.map((cp) => (
            <div
              key={cp.id}
              className="border border-border flex items-center justify-between gap-1 p-1"
            >
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm truncate">{cp.name}</span>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(cp.createdAt, { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Popover position="bottom-end" offset={1}>
                  <Popover.Target>
                    <IconButton icon={FaRotateLeft} title="Restore" />
                  </Popover.Target>
                  <Popover.Dropdown classNames={{ dropdown: "border" }}>
                    <div className="flex flex-col p-1">
                      <span className="text-sm">
                        Current project will be overwritten.
                      </span>
                      <Button
                        leftSection={<FaRotateLeft />}
                        className="text-sm self-end mt-3"
                        onClick={() => handleRestore(cp)}
                      >
                        Yes, restore.
                      </Button>
                    </div>
                  </Popover.Dropdown>
                </Popover>
                <Popover position="bottom-end" offset={1}>
                  <Popover.Target>
                    <IconButton icon={FaTrash} title="Delete" />
                  </Popover.Target>
                  <Popover.Dropdown classNames={{ dropdown: "border" }}>
                    <div className="flex flex-col gap-2 p-1">
                      <span className="text-sm">Delete this checkpoint?</span>
                      <Button
                        leftSection={<FaTrash className="text-red-400" />}
                        className="text-sm self-end"
                        onClick={() => handleDelete(cp.id)}
                      >
                        Yes, delete.
                      </Button>
                    </div>
                  </Popover.Dropdown>
                </Popover>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
