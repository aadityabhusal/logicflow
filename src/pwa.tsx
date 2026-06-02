import { registerSW } from "virtual:pwa-register";
import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifications.show({
      id: "pwa-update-available",
      title: "New version available",
      message: "Update Logicflow to get the latest changes.",
      autoClose: false,
      withCloseButton: true,
      withBorder: true,
      children: (
        <Button className="mt-2 self-start" onClick={() => updateSW(true)}>
          Update
        </Button>
      ),
    });
  },
});
