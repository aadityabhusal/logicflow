import { useClipboard } from "@mantine/hooks";
import { FaRegCopy, FaCheck } from "react-icons/fa6";
import { IconButton } from "./IconButton";
import { CodeHighlight } from "./CodeHighlight";
import { useProjectStore } from "@/lib/store";
import { createOperationFromFile } from "@/lib/utils";
import { useMemo, useState, useEffect, useDeferredValue, memo } from "react";
import { formatCode, generateOperation } from "@/lib/format-code";
import { useExecutionResultsStore } from "@/lib/execution/store";

function CodePanelComponent() {
  const currentOperationName = useProjectStore((s) => s.getCurrentFile()?.name);
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const rootContext = useExecutionResultsStore((s) => s.rootContext);
  const clipboard = useClipboard({ timeout: 500 });
  const [formattedCode, setFormattedCode] = useState("");

  const _currentOperation = useMemo(() => {
    return createOperationFromFile(currentFile);
  }, [currentFile]);
  const currentOperation = useDeferredValue(_currentOperation);

  useEffect(() => {
    if (!currentOperation) return;
    const codeString = generateOperation(currentOperation, rootContext);
    formatCode(codeString)
      .then((formatted) => setFormattedCode(formatted))
      .catch(() => setFormattedCode(codeString));
  }, [currentOperation, rootContext]);

  if (!currentOperation) {
    return (
      <div className="flex flex-col h-full bg-editor">
        <div className="p-1 border-b">Code</div>
        <div className="p-2 text-gray-500">No operation selected</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-editor">
      <div className="flex justify-between items-center p-1 border-b">
        <span>Code</span>
        <span className="text-sm">{currentOperationName}.js</span>
        <IconButton
          icon={clipboard.copied ? FaCheck : FaRegCopy}
          title={clipboard.copied ? "Copied!" : "Copy code"}
          size={14}
          onClick={() => clipboard.copy(formattedCode)}
        />
      </div>
      <div className="flex-1 overflow-auto dropdown-scrollbar font-mono">
        <CodeHighlight code={formattedCode} />
      </div>
    </div>
  );
}

export const CodePanel = memo(CodePanelComponent);
