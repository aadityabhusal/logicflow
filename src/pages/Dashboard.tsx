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
import { useProjectStore, useExecutionResultsStore } from "@/lib/store";
import {
  createContextVariables,
  createData,
  createFileFromOperation,
  createFileVariables,
  createStatement,
  createVariableName,
} from "@/lib/utils";
import {
  createOperationCall,
  executeOperation,
  executeStatement,
} from "@/lib/operation";
import { Context } from "@/lib/types";

dayjs.extend(relativeTime);

export default function Dashboard() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const setResult = useExecutionResultsStore((s) => s.setResult);

  const context = useMemo<Context>(
    () => ({
      variables: new Map(),
      getResult: useExecutionResultsStore.getState().getResult,
      getInstance: useExecutionResultsStore.getState().getInstance,
      setInstance: useExecutionResultsStore.getState().setInstance,
      executeOperation,
      executeStatement,
    }),
    []
  );

  const sortedProjects = useMemo(
    () =>
      Object.values(projects).toSorted(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      ),
    [projects]
  );

  const handleCreate = async () => {
    const nameParam = createStatement({
      data: createData({ value: "Test name" }),
      name: "name",
    });
    const helloData = createData({ value: "Hello! " });
    const concatOperation = await createOperationCall({
      data: helloData,
      name: "concat",
      parameters: [
        createStatement({
          data: createData({
            type: { kind: "reference", dataType: nameParam.data.type },
            value: { name: "name", id: nameParam.id },
          }),
        }),
      ],
      context: {
        ...context,
        variables: createContextVariables([nameParam], context),
      },
      setResult,
    });
    const greetOperationFile = createFileFromOperation(
      createData({
        type: {
          kind: "operation",
          parameters: [{ name: "name", type: { kind: "string" } }],
          result: { kind: "string" },
        },
        value: {
          name: "greet",
          parameters: [nameParam],
          statements: [
            createStatement({
              data: helloData,
              operations: [concatOperation],
            }),
          ],
        },
      })
    );

    const nameData = createData({ value: "Your name" });
    const mainOperationFile = createFileFromOperation(
      createData({
        type: { kind: "operation", parameters: [], result: { kind: "string" } },
        value: {
          name: "main",
          parameters: [],
          statements: [
            createStatement({
              data: nameData,
              operations: [
                await createOperationCall({
                  data: nameData,
                  name: "greet",
                  parameters: [nameParam],
                  context: {
                    ...context,
                    variables: createFileVariables([greetOperationFile]),
                  },
                  setResult,
                }),
              ],
            }),
          ],
        },
      })
    );

    const created = createProject(
      createVariableName({
        prefix: "New Project ",
        prev: Object.values(projects).map((p) => p.name),
      }),
      [mainOperationFile, greetOperationFile]
    );
    navigate(`/project/${created.id}?file=${mainOperationFile.name}`);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
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
