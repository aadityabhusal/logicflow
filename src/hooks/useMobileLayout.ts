import { useMediaQuery } from "@mantine/hooks";
import { useUiConfigStore } from "@/lib/store";
import { MAX_SCREEN_WIDTH } from "@/lib/data";

export function useMobileCodeWrapping() {
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const enableMobileWrapping = useUiConfigStore((s) => s.enableMobileWrapping);
  return smallScreen && Boolean(enableMobileWrapping);
}
