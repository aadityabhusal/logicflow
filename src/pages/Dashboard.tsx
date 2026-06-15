import { IconButton } from "@/ui/IconButton";
import { Button, Popover } from "@mantine/core";
import { useEffect, useMemo } from "react";
import {
  FaBookOpen,
  FaChevronDown,
  FaFolderOpen,
  FaGithub,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import { Link, useNavigate } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { useProjectStore, useUiConfigStore } from "@/lib/store";
import { examples, createExampleProjectMetadata } from "@/examples";
import {
  createContextVariable,
  createData,
  createFileFromOperation,
  createFileVariables,
  createStatement,
  createVariableName,
  resolveConstructorArgs,
} from "@/lib/utils";
import { createOperationCall } from "@/lib/execution/execution";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { Project, ProjectFile, DataType } from "@/lib/types";
import { InstanceTypes } from "@/lib/packages/registry";
import { AppIcon } from "@/ui/AppIcon";

function getProjectUrl(project: Pick<Project, "id" | "files">) {
  return project.files[0]
    ? `/project/${project.id}?file=${project.files[0].name}`
    : `/project/${project.id}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const examplesCollapsed = useUiConfigStore((s) => s.examplesCollapsed);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const projects = useProjectStore((s) => s.projects);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const context = useExecutionResultsStore((s) => s.rootContext);

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
    const variable = createContextVariable(nameParam, context, nameParam.data);
    const concatOperation = await createOperationCall({
      data: helloData,
      name: "concat",
      parameters: [
        createStatement({
          data: createData({
            type: { kind: "reference", name: "name" },
            value: { name: "name", id: nameParam.id },
          }),
        }),
      ],
      context: {
        ...context,
        ...(nameParam.name && variable
          ? { variables: new Map([[nameParam.name, variable]]) }
          : {}),
      },
    });
    const greetOpFile = createFileFromOperation(
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

    const requestParamType: DataType = {
      kind: "instance",
      className: "Request",
      constructorArgs: resolveConstructorArgs(
        InstanceTypes.Request.constructorArgs
      ),
    };

    const requestData = createData({ type: requestParamType });
    const reqUrl = "https://example.com?name=User";
    requestData.value.constructorArgs[0].data = createData({ value: reqUrl });
    context.setInstance(requestData.value.instanceId, {
      instance: new Request(reqUrl),
      type: requestParamType,
    });
    const reqStmt = createStatement({ name: "request", data: requestData });

    const getQueryOp = await createOperationCall({
      data: requestData,
      name: "getQuery",
      parameters: [createStatement({ data: createData({ value: "name" }) })],
      context,
    });

    const greetOp = await createOperationCall({
      data: createData({ value: "User" }),
      name: "greet",
      context: { ...context, variables: createFileVariables([greetOpFile]) },
    });

    const mainStatement = createStatement({
      data: createData({ value: { name: "request", id: reqStmt.id } }),
      operations: [getQueryOp, greetOp],
    });
    const mainOperationData = createData({
      type: {
        kind: "operation",
        parameters: [{ name: "request", type: requestParamType }],
        result: { kind: "string" },
      },
      value: {
        name: "main",
        parameters: [reqStmt],
        statements: [mainStatement],
      },
    });

    const mainTriggerFile = {
      ...createFileFromOperation(mainOperationData),
      trigger: { type: "http", methods: ["GET"] as const },
    } as ProjectFile;

    const created = createProject({
      name: createVariableName({
        prefix: "New Project ",
        prev: Object.values(projects).map((p) => p.name),
      }),
      files: [mainTriggerFile, greetOpFile],
    });
    navigate(getProjectUrl(created));
  };

  const handleCreateExample = (example: (typeof examples)[number]) => {
    const projectMetadata = createExampleProjectMetadata(example.project);
    const created = createProject(projectMetadata);
    navigate(getProjectUrl(created));
  };

  useEffect(() => {
    document.title = "Logicflow - Programming through chained operations";
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="border-b pb-2 flex items-center justify-between gap-4">
        <div className="mr-auto flex items-center gap-3">
          <AppIcon className="size-10 shadow-lg shadow-black/20" />
          <h1 className="hidden text-2xl leading-tight sm:block">Logicflow</h1>
        </div>
        <Button
          component="a"
          href="https://github.com/aadityabhusal/logicflow"
          target="_blank"
          rel="noreferrer"
          className="outline-none"
          leftSection={<FaGithub />}
        >
          <span className="hidden sm:inline">Source</span>
        </Button>
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
      <section className={"space-y-2 border-b pb-3"}>
        <Button
          variant="subtle"
          className="outline-none"
          classNames={{ inner: "gap-2" }}
          leftSection={
            <FaChevronDown
              className={!examplesCollapsed ? undefined : "-rotate-90"}
            />
          }
          aria-expanded={!examplesCollapsed}
          onClick={() => setUiConfig({ examplesCollapsed: !examplesCollapsed })}
        >
          <span className="text-xl">Examples</span>
        </Button>
        {!examplesCollapsed && (
          <div className="grid gap-4 sm:grid-cols-3">
            {examples.map((example) => (
              <button
                key={example.id}
                type="button"
                className="flex flex-col gap-2 rounded-xs border p-3 text-left transition hover:bg-dropdown-hover"
                onClick={() => handleCreateExample(example)}
              >
                <span className="text-lg font-semibold">
                  {example.project.name}
                </span>
                <span className="text-sm text-gray-300">
                  {example.project.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <h2 className="flex items-center gap-2 text-xl pl-1">
        <FaFolderOpen size={16} />
        Projects
      </h2>
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
              className="rounded-xs border p-3 flex items-start justify-between"
            >
              <div className="flex-1 flex flex-col gap-2">
                <Link
                  to={getProjectUrl(project)}
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
                    <span>
                      Updated{" "}
                      {formatDistanceToNow(project.updatedAt, {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              </div>
              <Popover position="bottom-end" offset={1}>
                <Popover.Target>
                  <IconButton icon={FaTrash} title="Delete" className="p-1" />
                </Popover.Target>
                <Popover.Dropdown classNames={{ dropdown: "border" }}>
                  <div className="flex flex-col gap-2 p-1">
                    <span className="text-sm">Delete this project?</span>
                    <Button
                      leftSection={<FaTrash className="text-red-400" />}
                      className="text-sm self-end"
                      onClick={() => deleteProject(project.id)}
                    >
                      Yes, delete.
                    </Button>
                  </div>
                </Popover.Dropdown>
              </Popover>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
