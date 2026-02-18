import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import {
  createBrowserRouter,
  LoaderFunctionArgs,
  Navigate,
  RouterProvider,
} from "react-router";
import {
  ActionIcon,
  Button,
  createTheme,
  HeadlessMantineProvider,
  Input,
  Menu,
  Popover,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { LoadingFallback } from "./ui/LoadingFallback";
import {
  useNavigationStore,
  useProjectStore,
  waitForHydration,
} from "./lib/store";
import { Notifications } from "@mantine/notifications";

const theme = createTheme({
  scale: 1,
  components: {
    Tooltip: Tooltip.extend({
      classNames: {
        tooltip: "absolute bg-dropdown-default px-2 py-1 rounded-md text-xs",
      },
    }),
    ActionIcon: ActionIcon.extend({
      classNames: {
        root: "focus:outline focus:outline-white hover:opacity-90 disabled:text-disabled",
      },
    }),
    Button: Button.extend({
      classNames: {
        root: "outline outline-white p-1 hover:bg-dropdown-hover truncate",
        inner: "flex items-center gap-1 outline-white",
        label: "truncate",
      },
    }),
    Popover: Popover.extend({
      classNames: { dropdown: "absolute bg-editor" },
    }),
    Input: Input.extend({
      classNames: {
        wrapper: "flex gap-1 items-center",
        input: "outline-0 bg-inherit border-none p-0 resize-none",
      },
    }),
    Textarea: Textarea.extend({
      classNames: {
        wrapper: "flex gap-1 items-center",
        input: "outline-0 bg-inherit border-none p-0 flex-1",
      },
    }),
    Menu: Menu.extend({
      classNames: {
        dropdown: "absolute border flex flex-col bg-editor",
        item: "flex items-center justify-between gap-2 p-1 hover:bg-dropdown-hover focus:bg-dropdown-hover focus:outline-none data-disabled:text-disabled",
      },
    }),
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    lazy: () =>
      import("@/pages/Dashboard").then((m) => ({ Component: m.default })),
    HydrateFallback: LoadingFallback,
  },
  {
    path: "/project/:id",
    lazy: () =>
      import("@/pages/Project").then((m) => ({ Component: m.default })),
    loader: async ({ params, request }: LoaderFunctionArgs) => {
      const url = new URL(request.url);
      const fileName = url.searchParams.get("file");
      await waitForHydration();
      useProjectStore.getState().setCurrentProjectId(params.id!);
      useProjectStore.getState().setCurrentFileId(fileName ?? undefined);
      useNavigationStore.getState().setNavigation({ result: undefined });
      return null;
    },
    HydrateFallback: LoadingFallback,
  },
  {
    path: "/docs",
    lazy: () => import("@/pages/Docs").then((m) => ({ Component: m.default })),
    HydrateFallback: LoadingFallback,
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HeadlessMantineProvider theme={theme}>
      <Notifications
        autoClose={2000}
        limit={3}
        classNames={{
          notification:
            "flex bg-editor items-center gap-2 p-2 rounded-sm border [&_svg]:size-5!",
          root: "fixed right-2 bottom-2",
        }}
      />
      <RouterProvider router={router} />
    </HeadlessMantineProvider>
  </React.StrictMode>
);
