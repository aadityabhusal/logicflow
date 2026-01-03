import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import { FaHouse } from "react-icons/fa6";
import { Button } from "@mantine/core";

function resolveDocImg(src: string) {
  // Only rewrite relative image paths
  if (src.startsWith("./images/")) {
    const rel = src.replace("./", "");
    return `${import.meta.env.BASE_URL}docs/${rel}`; // BASE_URL + "docs/images/..."
  }
  return src;
}

const docSections: { id: string; title: string; content: string }[] = [];

export default function Docs() {
  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-4 border-b p-2 justify-between">
        <h2 className="text-2xl font-bold">Logicflow Docs</h2>
        <Button
          component={Link}
          to="/"
          className="outline-none"
          leftSection={<FaHouse />}
        >
          Dashboard
        </Button>
      </header>
      <main className="flex gap-2">
        <aside className="w-64 border-r bg-editor overflow-y-auto p-4 sticky top-0 h-screen">
          <h2 className="text-xl font-semibold mb-4">Table of Contents</h2>
          <div className="space-y-1 flex flex-col gap-2">
            {docSections.map(({ id, title }) => (
              <a key={id} href={`#${id}`} className="hover:underline">
                {title}
              </a>
            ))}
          </div>
        </aside>
        <article className="flex-1 overflow-y-auto scroll bg-editor">
          {docSections.map(({ id, content }) => (
            <section key={id} className="prose prose-invert max-w-none mb-8">
              <ReactMarkdown
                components={{
                  h1: ({ node: _, ...props }) => (
                    <h1 id={id} className="text-2xl my-4" {...props} />
                  ),
                  h2: ({ node: _, ...props }) => (
                    <h2 className="text-xl my-4" {...props} />
                  ),
                  h3: ({ node: _, ...props }) => (
                    <h3 className="text-lg my-3" {...props} />
                  ),
                  p: ({ node: _, ...props }) => (
                    <p
                      className="mb-4 text-gray-300 leading-relaxed"
                      {...props}
                    />
                  ),
                  ul: ({ node: _, ...props }) => (
                    <ul
                      className="list-disc list-inside mb-4 space-y-2"
                      {...props}
                    />
                  ),
                  ol: ({ node: _, ...props }) => (
                    <ol
                      className="list-decimal list-inside mb-4 space-y-2"
                      {...props}
                    />
                  ),
                  a: ({ node: _, ...props }) => (
                    <a className="text-variable hover:underline" {...props} />
                  ),
                  strong: ({ node: _, ...props }) => (
                    <strong className="font-semibold" {...props} />
                  ),
                  img: ({ src = "", alt = "", title, ...props }) => (
                    <figure className="my-8 flex flex-col items-center gap-2">
                      <img
                        src={resolveDocImg(src)}
                        alt={alt}
                        className="rounded border border-border"
                        {...props}
                      />
                      {title ?? alt ? (
                        <figcaption>{title ?? alt}</figcaption>
                      ) : null}
                    </figure>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </section>
          ))}
        </article>
      </main>
    </div>
  );
}
