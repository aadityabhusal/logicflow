import { Highlight, themes } from "prism-react-renderer";

interface CodeHighlightProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  wrap?: boolean;
}

export function CodeHighlight({
  code,
  language = "javascript",
  showLineNumbers = true,
  wrap,
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
            maxWidth: "100%",
            overflowX: "auto",
            whiteSpace: wrap ? "pre-wrap" : "pre",
            overflowWrap: wrap ? "anywhere" : "normal",
          }}
        >
          {showLineNumbers ? (
            <div>
              {tokens.map((line, i) => (
                <div
                  key={i}
                  {...getLineProps({ line })}
                  className="flex leading-6"
                >
                  <span className="w-10 min-w-10 shrink-0 pr-3 text-right text-white/25 select-none sticky left-0 bg-editor">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 pl-2">
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            tokens.map((line, i) => (
              <div key={i} className="leading-6">
                <span>
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
