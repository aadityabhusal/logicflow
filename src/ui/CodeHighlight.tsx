import { Highlight, themes } from "prism-react-renderer";

interface CodeHighlightProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeHighlight({
  code,
  language = "javascript",
  showLineNumbers = true,
}: CodeHighlightProps) {
  return (
    <Highlight theme={themes.vsDark} code={code} language={language}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={className}
          style={{
            ...style,
            background: "transparent",
            margin: 0,
            padding: showLineNumbers ? "0.5rem 0" : 0,
            ...(showLineNumbers ? { minWidth: "100%" } : {}),
          }}
        >
          {showLineNumbers ? (
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
          ) : (
            tokens.map((line, i) => (
              <div key={i} className="table-row leading-6">
                <span className="table-cell">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))
          )}
        </pre>
      )}
    </Highlight>
  );
}
