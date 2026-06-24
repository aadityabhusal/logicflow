import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";

export function showReloadNotification({
  title,
  buttonLabel = "Reload Now",
  onReload = () => window.location.reload(),
}: {
  title: string;
  buttonLabel?: string;
  onReload?: () => void;
}) {
  notifications.show({
    title,
    message: (
      <Button size="xs" className="py-0.5!" onClick={onReload}>
        {buttonLabel}
      </Button>
    ),
    autoClose: false,
    withCloseButton: false,
    classNames: { body: "flex gap-4 items-center" },
  });
}
