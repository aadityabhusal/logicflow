import { FaCrosshairs, FaLink, FaLock, FaUnlock } from "react-icons/fa6";
import { TbKeyboardOff } from "react-icons/tb";
import { IconButton } from "./IconButton";
import {
  useNavigationStore,
  useProjectStore,
  useUiConfigStore,
} from "../lib/store";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Tooltip } from "@mantine/core";
import { useMemo, useState, useEffect } from "react";
import { getTypeSignature, isPendingContext } from "@/lib/utils";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { useMediaQuery } from "@mantine/hooks";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { getDocsUrl, DOCS_REGISTRY } from "@/lib/docs-registry";
import { CodeHighlight } from "./CodeHighlight";
import {
  formatCode,
  generateData,
  createCodeGenContext,
} from "@/lib/format-code";

export function DetailsPanel() {
  const operationId = useProjectStore((s) => s.currentFileId);
  const result = useNavigationStore((s) => s.result);
  const skipExecution = useNavigationStore((s) =>
    s.skipExecution?.kind !== "error" ? s.skipExecution : undefined
  );
  const navigationId = useNavigationStore((s) => s.navigation?.id);
  const disableKeyboard = useUiConfigStore((s) => s.disableKeyboard);
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const operation = useNavigationStore((s) => s.operation);

  const panelLockedId = useUiConfigStore((s) => {
    const lockedId = operationId && s.sidebar?.lockedIds?.[operationId];
    if (
      !lockedId ||
      !useExecutionResultsStore.getState().results.has(lockedId)
    ) {
      return undefined;
    }
    return lockedId;
  });

  const context = useExecutionResultsStore((s) =>
    s.getContext(panelLockedId ?? navigationId ?? "_root_")
  );

  const typeSignature = useMemo(() => {
    if (result?.type.kind === "reference" && isPendingContext(context)) {
      return "Pending";
    }
    return getTypeSignature(result?.type ?? { kind: "undefined" });
  }, [result?.type, context]);

  const docsUrl = useMemo(
    () => getDocsUrl(operation?.value.source, operation?.value.name),
    [operation]
  );
  const docsConfig = operation?.value.source
    ? DOCS_REGISTRY[operation.value.source.name]
    : undefined;

  const [formattedValue, setFormattedValue] = useState("");

  useEffect(() => {
    if (!result) {
      setFormattedValue("");
      return;
    }
    if (result.type.kind === "reference" && isPendingContext(context)) {
      setFormattedValue("Pending");
      return;
    }
    const codeString = generateData(
      result,
      createCodeGenContext(context, { showResult: true })
    );

    formatCode(`export default ${codeString}`, { semi: false })
      .then((formatted) =>
        setFormattedValue(formatted.replace(/^export\s+default\s+/, "").trim())
      )
      .catch(() => setFormattedValue(codeString));
  }, [result, context]);

  if (!result) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-1 border-b">Details</div>
        <div className="p-2 text-gray-500">
          Select a data or an operation call
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between p-1 border-b gap-3 bg-dropdown-default">
        <p className="font-bold">Details</p>
        {smallScreen ? (
          <IconButton
            icon={TbKeyboardOff}
            title="Disable keyboard"
            size={16}
            className={disableKeyboard ? "text-reserved" : ""}
            onClick={() => {
              setUiConfig((p) => ({
                ...p,
                disableKeyboard: !p.disableKeyboard,
              }));
            }}
          />
        ) : null}
        {panelLockedId ? (
          <IconButton
            icon={FaCrosshairs}
            title="Focus"
            size={12}
            onClick={() => {
              setNavigation({ navigation: { id: panelLockedId } });
            }}
          />
        ) : null}
        {useExecutionResultsStore
          .getState()
          .results.has(panelLockedId ?? navigationId!) && (
          <IconButton
            icon={panelLockedId ? FaLock : FaUnlock}
            title={panelLockedId ? "Unlock" : "Lock"}
            className={panelLockedId ? "text-reserved" : ""}
            size={12}
            onClick={() => {
              setUiConfig((p) => {
                if (!operationId) return p;
                const lockedIds = { ...(p.sidebar?.lockedIds ?? {}) };
                if (panelLockedId) delete lockedIds[operationId];
                else lockedIds[operationId] = navigationId!;
                return { sidebar: { ...(p.sidebar ?? {}), lockedIds } };
              });
            }}
          />
        )}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b p-1 gap-1">
          <div className="text-gray-300 mb-1.5">Type</div>
          <Tooltip label={typeSignature}>
            <div className="overflow-x-auto dropdown-scrollbar whitespace-nowrap">
              {typeSignature}
            </div>
          </Tooltip>
        </div>
        {skipExecution && (
          <div className="p-1 border-b gap-1">
            <div className="text-gray-300 mb-1.5">Skipped</div>
            <div className="text-sm">{skipExecution.reason}</div>
          </div>
        )}
        {docsUrl && docsConfig && (
          <div className="p-1 border-b gap-1">
            <div className="text-gray-300 mb-1.5">Documentation</div>
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex gap-1 items-center"
            >
              <FaLink className="shrink-0" />
              <span>
                {docsConfig.displayName}:{operation?.value.name}
              </span>
            </a>
          </div>
        )}
        {formattedValue ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="text-gray-300 mb-1.5 p-1">Result</div>
            <div className="flex-1 min-h-0 overflow-auto dropdown-scrollbar">
              <ErrorBoundary displayError={true}>
                <CodeHighlight code={formattedValue} showLineNumbers={false} />
              </ErrorBoundary>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
