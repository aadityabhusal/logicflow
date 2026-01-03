import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import { FaHouse } from "react-icons/fa6";
import { Button } from "@mantine/core";

import introduction from "@/../docs/introduction.md?raw";
import gettingStarted from "@/../docs/getting-started.md?raw";
import coreConcepts from "@/../docs/core-concepts.md?raw";
import dataTypes from "@/../docs/data-types.md?raw";
import additionalFeatures from "@/../docs/additional-features.md?raw";
import { Fragment, ReactNode, useEffect } from "react";

function createSubHeadingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-"); // Replace spaces with hyphens
}

interface Heading {
  level: number;
  text: string;
  slug: string;
}
function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  // Remove code blocks first (to avoid false matches)
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  // Match all headings (## or ###, etc.)
  const headingRegex = /(?:^|\n)(#{1,6})\s+(.+?)(?=\n|$)/gm;
  let match;
  while ((match = headingRegex.exec(withoutCode)) !== null) {
    const level = match[1].length; // Count the # symbols
    const text = match[2].trim();
    const slug = createSubHeadingSlug(text);
    headings.push({ level, text, slug });
  }
  return headings;
}

const docSections = [
  {
    id: "introduction",
    title: "Introduction",
    content: introduction,
    subHeadings: extractHeadings(introduction).filter((h) => h.level === 2),
  },
  {
    id: "getting-started",
    title: "Getting Started",
    content: gettingStarted,
    subHeadings: extractHeadings(gettingStarted).filter((h) => h.level === 2),
  },
  {
    id: "core-concepts",
    title: "Core Concepts",
    content: coreConcepts,
    subHeadings: extractHeadings(coreConcepts).filter((h) => h.level === 2),
  },
  {
    id: "data-types",
    title: "Data Types",
    content: dataTypes,
    subHeadings: extractHeadings(dataTypes).filter((h) => h.level === 2),
  },
  {
    id: "additional-features",
    title: "Additional Features",
    content: additionalFeatures,
    subHeadings: extractHeadings(additionalFeatures).filter(
      (h) => h.level === 2
    ),
  },
];

export default function Docs() {
  useEffect(() => {
    document.title = "Logicflow Docs";
  }, []);

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-4 border-b p-2 justify-between">
        <h2 className="text-2xl">Logicflow Docs</h2>
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
          <div className="space-y-1 flex flex-col gap-2 pb-12">
            {docSections.map(({ id, title, subHeadings }) => (
              <Fragment key={id}>
                <a key={id} href={`#${id}`} className="hover:underline text-lg">
                  {title}
                </a>
                <div className="space-y-1 flex flex-col gap-2 ml-6">
                  {subHeadings.map(({ text, slug }) => (
                    <a key={slug} href={`#${slug}`} className="hover:underline">
                      {text}
                    </a>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </aside>
        <article className="flex-1 overflow-y-auto scroll bg-editor mx-32">
          {docSections.map(({ id, content }) => (
            <section key={id} className="prose prose-invert max-w-none mb-8">
              <ReactMarkdown
                components={{
                  h1: ({ node: _, ...props }) => (
                    <h1 id={id} className="text-2xl my-4 border-b" {...props} />
                  ),
                  h2: ({
                    node: _,
                    ...props
                  }: {
                    node: ReactNode;
                    children: ReactNode;
                  }) => (
                    <h2
                      id={
                        typeof props.children === "string"
                          ? createSubHeadingSlug(props.children)
                          : undefined
                      }
                      className="text-xl mb-4 mt-8"
                      {...props}
                    />
                  ),
                  h3: ({ node: _, ...props }) => (
                    <h3 className="text-lg mb-3 mt-6" {...props} />
                  ),
                  p: ({ node: _, ...props }) => (
                    <p
                      className="mb-4 text-gray-300 leading-relaxed"
                      {...props}
                    />
                  ),
                  ul: ({ node: _, ...props }) => (
                    <ul
                      className="list-disc list-inside mb-4 ml-4 space-y-2"
                      {...props}
                    />
                  ),
                  ol: ({ node: _, ...props }) => (
                    <ol
                      className="list-decimal list-inside mb-4 ml-4 space-y-2"
                      {...props}
                    />
                  ),
                  a: ({ node: _, ...props }) => (
                    <a className="text-variable hover:underline" {...props} />
                  ),
                  strong: ({ node: _, ...props }) => (
                    <strong className="font-semibold" {...props} />
                  ),
                  code: ({ node: _, ...props }) => (
                    <code
                      className="bg-dropdown-hover p-1 rounded text-xs"
                      {...props}
                    />
                  ),
                  img: ({ src = "", alt = "", title, ...props }) => (
                    <figure className="my-8 flex flex-col items-center gap-2">
                      <img
                        src={src}
                        alt={alt}
                        className="rounded border border-border max-w-5xl w-full"
                        {...props}
                      />
                      {title ?? alt ? (
                        <figcaption className="text-sm text-gray-300">
                          {title ?? alt}
                        </figcaption>
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
