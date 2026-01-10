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
  Tooltip,
} from "@mantine/core";
import { LoadingFallback } from "./ui/LoadingFallback";
import { useProjectStore, waitForHydration } from "./lib/store";
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
        root: "outline outline-white p-1 hover:bg-dropdown-hover",
        inner: "flex items-center gap-1 outline-white",
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
