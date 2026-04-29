import { useUiConfigStore, useProjectStore } from "../lib/store";
import { BooleanInput } from "../components/Input/BooleanInput";
import { createData } from "@/lib/utils";
import { useMediaQuery } from "@mantine/hooks";
import { MAX_SCREEN_WIDTH } from "@/lib/data";

export function SettingsPanel() {
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const currentProjectId = useProjectStore((s) => s.getCurrentProject()?.id);
  const currentProjectName = useProjectStore(
    (s) => s.getCurrentProject()?.name
  );
  const updateProject = useProjectStore((s) => s.updateProject);

  return (
    <div className="flex flex-col h-full">
      <div className="p-1 border-b font-bold bg-dropdown-default">Settings</div>
      <div className="p-2 flex flex-col gap-2">
        {currentProjectId && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-gray-300">Project name</span>
            <input
              type="text"
              className="focus:outline outline-white border w-full p-0.5 text-sm"
              placeholder={"Project name"}
              value={currentProjectName}
              onChange={(e) => {
                updateProject(currentProjectId, { name: e.target.value });
              }}
            />
          </div>
        )}
        {smallScreen && (
          <label className="flex items-center justify-between gap-2 border-t pt-2">
            <span className="text-sm">Disable keyboard navigation</span>
            <BooleanInput
              data={createData({ value: disableKeyboard ?? false })}
              handleData={(data) =>
                setUiConfig({ disableKeyboard: data.value })
              }
            />
          </label>
        )}
      </div>
    </div>
  );
}
