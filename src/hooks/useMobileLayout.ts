import { useMediaQuery } from "@mantine/hooks";
import { useUiConfigStore } from "@/lib/store";
import { MAX_SCREEN_WIDTH } from "@/lib/data";

export function useMobileLayout() {
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const disableMobileWrapping = useUiConfigStore(
    (s) => s.disableMobileWrapping
  );
  return smallScreen && !disableMobileWrapping;
}
