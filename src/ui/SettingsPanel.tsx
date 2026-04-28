import { useUiConfigStore } from "../lib/store";
import { BooleanInput } from "../components/Input/BooleanInput";
import { createData } from "@/lib/utils";
import { useMediaQuery } from "@mantine/hooks";
import { MAX_SCREEN_WIDTH } from "@/lib/data";

export function SettingsPanel() {
  const executionEnabled = useUiConfigStore((s) => s.executionEnabled);
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);

  return (
    <div className="flex flex-col h-full">
      <div className="p-1 border-b font-bold bg-dropdown-default">Settings</div>
      <label className="p-2 flex items-center justify-between gap-2">
        <span className="text-sm">Execute operation</span>
        <BooleanInput
          data={createData({ value: executionEnabled })}
          handleData={(data) => setUiConfig({ executionEnabled: data.value })}
        />
      </label>
      {smallScreen && (
        <label className="p-2 flex items-center justify-between gap-2 border-t">
          <span className="text-sm">Disable keyboard navigation</span>
          <BooleanInput
            data={createData({ value: disableKeyboard ?? false })}
            handleData={(data) => setUiConfig({ disableKeyboard: data.value })}
          />
        </label>
      )}
    </div>
  );
}
