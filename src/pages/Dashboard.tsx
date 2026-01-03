import { IconButton } from "@/ui/IconButton";
import { Button, Menu } from "@mantine/core";
import { useMemo } from "react";
import {
  FaBookOpen,
  FaEllipsisVertical,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import { Link, useNavigate } from "react-router";
import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";
import { useProjectStore } from "@/lib/store";

dayjs.extend(relativeTime);

export default function Dashboard() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  const sortedProjects = useMemo(
    () =>
      Object.values(projects).sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      ),
    [projects]
  );

  const handleCreate = () => {
    const created = createProject();
    navigate(`/project/${created.id}`);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="border-b pb-2 flex items-center justify-between gap-4">
        <h2 className="text-2xl mr-auto">Projects</h2>
        <Button
          component={Link}
          to="/docs"
          className="outline-none"
          leftSection={<FaBookOpen />}
        >
          Docs
        </Button>
        <Button leftSection={<FaPlus />} onClick={() => handleCreate()}>
          Create project
        </Button>
      </div>
      {sortedProjects.length === 0 ? (
        <div className="text-center py-8 text-disabled">
          <p className="text-lg mb-2">No projects</p>
          <p className="text-sm">Create your first project to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedProjects.map((project) => (
            <div
              key={project.id}
              className="border p-4 flex items-start justify-between"
            >
              <div className="flex-1 flex flex-col gap-2">
                <Link
                  to={`/project/${project.id}?file=${project.files[0].name}`}
                  className="hover:underline text-lg font-semibold"
                >
                  {project.name}
                </Link>
                <div className="flex gap-2 text-xs text-gray-300">
                  <span>
                    {project.files.length} file
                    {project.files.length > 1 ? "s" : ""}
                  </span>
                  {project.updatedAt && <span>•</span>}
                  {project.updatedAt && (
                    <span>Updated {dayjs(project.updatedAt).fromNow()}</span>
                  )}
                </div>
              </div>
              <Menu width={200} position="bottom-end" withinPortal={false}>
                <Menu.Target>
                  <IconButton icon={FaEllipsisVertical} className="p-1" />
                </Menu.Target>
                <Menu.Dropdown
                  classNames={{ dropdown: "absolute border flex flex-col" }}
                >
                  <Menu.Item
                    leftSection={<FaTrash />}
                    classNames={{
                      item: "flex items-center gap-4 p-2 hover:bg-dropdown-hover text-red-600",
                    }}
                    onClick={() => deleteProject(project.id)}
                  >
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
