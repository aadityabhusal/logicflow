import { Highlight, themes } from "prism-react-renderer";
import { useClipboard } from "@mantine/hooks";
import { FaRegCopy, FaCheck } from "react-icons/fa6";
import { IconButton } from "./IconButton";
import { useProjectStore } from "@/lib/store";
import { createOperationFromFile } from "@/lib/utils";
import { useMemo, useState, useEffect, useDeferredValue } from "react";
import { formatCode, generateOperation } from "@/lib/format-code";

export function CodePanel() {
  const currentOperationName = useProjectStore((s) => s.getCurrentFile()?.name);
  const currentFile = useProjectStore((s) => s.getCurrentFile());
  const clipboard = useClipboard({ timeout: 500 });
  const [formattedCode, setFormattedCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const _currentOperation = useMemo(() => {
    return createOperationFromFile(currentFile);
  }, [currentFile]);
  const currentOperation = useDeferredValue(_currentOperation);

  useEffect(() => {
    if (!currentOperation) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    formatCode(generateOperation(currentOperation))
      .then((formatted) => setFormattedCode(formatted))
      .finally(() => setIsLoading(false));
  }, [currentOperation]);

  if (!currentOperation || isLoading) {
    return (
      <div className="flex flex-col h-full bg-editor">
        <div className="p-1 border-b">Code</div>
        <div className="p-2 text-gray-500">
          {!currentOperation ? "No operation selected" : "Formatting code..."}
        </div>
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
        <Highlight
          theme={themes.vsDark}
          code={formattedCode}
          language="javascript"
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className={className}
              style={{
                ...style,
                background: "transparent",
                margin: 0,
                padding: "0.5rem 0",
                minWidth: "100%",
              }}
            >
              <div className="table">
                {tokens.map((line, i) => (
                  <div
                    key={i}
                    {...getLineProps({ line })}
                    className="table-row leading-6"
                  >
                    <span className="table-cell w-10 min-w-10 pr-3 text-right text-white/25 select-none sticky left-0 bg-editor">
                      {i + 1}
                    </span>
                    <span className="table-cell pl-2">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
