import {
  FaArrowUpRightFromSquare,
  FaCheck,
  FaCrosshairs,
  FaLock,
  FaRegCopy,
  FaTextWidth,
  FaUnlock,
} from "react-icons/fa6";
import { IconButton } from "./IconButton";
import {
  useNavigationStore,
  useProjectStore,
  useUiConfigStore,
} from "../lib/store";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Button, Tooltip } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useMemo, useState, useEffect } from "react";
import {
  createOperationFromFile,
  getTypeSignature,
  isPendingContext,
  getCacheKey,
  getActualOperationName,
} from "@/lib/utils";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { getDocsUrl, DOCS_REGISTRY } from "@/lib/docs-registry";
import { CodeHighlight } from "./CodeHighlight";
import {
  formatCode,
  generateData,
  createCodeGenContext,
} from "@/lib/format-code";
import { resolveDisplayName } from "@/lib/packages/registry";
import { Link } from "react-router";

export function DetailsPanel() {
  const operationId = useProjectStore((s) => s.currentFileId);
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const result = useNavigationStore((s) => s.result);
  const skipExecution = useNavigationStore((s) =>
    s.skipExecution?.kind !== "error" ? s.skipExecution : undefined
  );
  const navigationId = useNavigationStore((s) => s.navigation?.id);
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);
  const wrapResult = useUiConfigStore((s) => s.wrapResult);
  const _operation = useNavigationStore((s) => s.operation);
  const currentOperation = useMemo(
    () => createOperationFromFile(currentFile),
    [currentFile]
  );

  const panelLockedId = useUiConfigStore((s) => {
    const lockedId = operationId && s.sidebar?.lockedIds?.[operationId];
    if (!lockedId) return undefined;
    const ctx = useExecutionResultsStore.getState().getContext(lockedId);
    if (
      !useExecutionResultsStore
        .getState()
        .results.has(getCacheKey(ctx, lockedId))
    ) {
      return undefined;
    }
    return lockedId;
  });
  const detailsId =
    !panelLockedId &&
    (!navigationId || navigationId === `${currentOperation?.id}_statement_add`)
      ? undefined
      : (panelLockedId ?? navigationId);
  const displayedResult = detailsId ? result : currentOperation;
  const operation = detailsId ? _operation : currentOperation;

  const context = useExecutionResultsStore((s) =>
    s.getContext(detailsId ?? "_root_")
  );

  const isResultPending =
    detailsId && detailsId === operation?.id
      ? !useExecutionResultsStore
          .getState()
          .results.has(getCacheKey(context, detailsId))
      : detailsId && displayedResult?.type.kind === "reference"
        ? isPendingContext(context)
        : false;

  const typeSignature = useMemo(() => {
    if (isResultPending) return "Pending";
    if (detailsId && operation?.type.kind === "operation") {
      return getTypeSignature(operation.type, context);
    }
    return getTypeSignature(
      displayedResult?.type ?? { kind: "undefined" },
      context
    );
  }, [
    displayedResult?.type,
    isResultPending,
    detailsId,
    operation?.type,
    context,
  ]);

  const docsUrl = useMemo(
    () => getDocsUrl(operation?.value.source, operation?.value.name),
    [operation]
  );
  const docsConfig = operation?.value.source
    ? DOCS_REGISTRY[operation.value.source.name]
    : undefined;

  const [formattedValue, setFormattedValue] = useState("");
  const clipboard = useClipboard({ timeout: 500 });

  useEffect(() => {
    if (!displayedResult) {
      setFormattedValue(isResultPending ? "Pending" : "");
      return;
    }
    if (isResultPending) {
      setFormattedValue("Pending");
      return;
    }
    const codeString = generateData(
      displayedResult,
      createCodeGenContext(context, { showResult: true })
    );
    let ignore = false;

    formatCode(`export default ${codeString}`, { semi: false })
      .then((formatted) => {
        if (ignore) return;
        setFormattedValue(formatted.replace(/^export\s+default\s+/, "").trim());
      })
      .catch(() => !ignore && setFormattedValue(codeString));

    return () => {
      ignore = true;
    };
  }, [displayedResult, context, isResultPending]);

  if (!displayedResult && !isResultPending) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-1 border-b font-bold bg-dropdown-default">
          Details
        </div>
        <div className="p-2 text-gray-500">
          Select a data or an operation call
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between p-1 border-b gap-3 bg-dropdown-default">
        <p className="font-bold mr-auto">Details</p>
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
        {detailsId &&
        useExecutionResultsStore
          .getState()
          .results.has(getCacheKey(context, detailsId)) ? (
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
                else lockedIds[operationId] = detailsId;
                return { sidebar: { ...(p.sidebar ?? {}), lockedIds } };
              });
            }}
          />
        ) : null}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {!detailsId && operation?.value.name ? (
          <div className="border-b p-1 gap-1">
            <div className="text-gray-300 mb-1.5">Operation</div>
            <div className="mb-1.5">
              {resolveDisplayName(operation.value.name, context.packageAliases)}
            </div>
          </div>
        ) : null}
        <div className="p-1 border-b gap-1">
          <div className="text-gray-300 mb-1.5">Type</div>
          <Tooltip label={typeSignature}>
            <div className="overflow-x-auto dropdown-scrollbar whitespace-nowrap">
              {typeSignature}
            </div>
          </Tooltip>
        </div>
        {detailsId && skipExecution && (
          <div className="p-1 border-b gap-1">
            <div className="text-gray-300 mb-1.5">Skipped</div>
            <div className="text-sm">{skipExecution.reason}</div>
          </div>
        )}
        {docsUrl && docsConfig && (
          <div className="p-1 border-b gap-1 flex flex-col">
            <div className="text-gray-300 mb-1.5">Documentation</div>
            <Button
              component={Link}
              to={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="outline-none w-fit"
              rightSection={<FaArrowUpRightFromSquare />}
            >
              {docsConfig.displayName}:
              {getActualOperationName(operation?.value.name ?? "")}
            </Button>
          </div>
        )}
        {formattedValue ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1.5 p-1">
              <div className="text-gray-300">Result</div>
              <div className="flex items-center gap-1.5">
                <IconButton
                  icon={FaTextWidth}
                  title={wrapResult ? "Disable wrapping" : "Wrap result"}
                  size={14}
                  className={wrapResult ? "text-reserved" : ""}
                  aria-pressed={wrapResult}
                  onClick={() =>
                    setUiConfig((s) => ({ wrapResult: !s.wrapResult }))
                  }
                />
                <IconButton
                  icon={clipboard.copied ? FaCheck : FaRegCopy}
                  title={clipboard.copied ? "Copied!" : "Copy result"}
                  size={14}
                  onClick={() => clipboard.copy(formattedValue)}
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto dropdown-scrollbar">
              <ErrorBoundary displayError={true}>
                <CodeHighlight
                  code={formattedValue}
                  showLineNumbers={false}
                  wrap={wrapResult}
                />
              </ErrorBoundary>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
