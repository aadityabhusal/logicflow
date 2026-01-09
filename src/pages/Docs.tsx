import ReactMarkdown from "react-markdown";
import { Link, useLocation } from "react-router";
import { FaHouse, FaBars, FaXmark } from "react-icons/fa6";
import { Button } from "@mantine/core";

import introduction from "@/../docs/introduction.md?raw";
import gettingStarted from "@/../docs/getting-started.md?raw";
import coreConcepts from "@/../docs/core-concepts.md?raw";
import dataTypes from "@/../docs/data-types.md?raw";
import additionalFeatures from "@/../docs/additional-features.md?raw";
import { Fragment, ReactNode, useEffect, useState } from "react";

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.title = "Logicflow Docs";
    if (location.hash) {
      const timeoutId = setTimeout(() => {
        const id = location.hash.slice(1);
        const element = document.getElementById(id);
        if (element) element.scrollIntoView();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [location.hash]);

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2 justify-between sticky h-12 top-0 bg-editor z-40">
        <div className="flex items-center gap-4">
          <Button
            className="md:hidden outline-none"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <FaXmark size={20} /> : <FaBars size={20} />}
          </Button>
          <h2 className="text-2xl">Logicflow Docs</h2>
        </div>
        <Button
          component={Link}
          to="/"
          className="outline-none"
          leftSection={<FaHouse />}
        >
          Dashboard
        </Button>
      </header>
      <main className="flex gap-2 relative">
        <aside
          className={`w-64 border-r bg-editor overflow-y-auto p-4 top-12 h-[calc(100vh-48px)] z-40
          ${isSidebarOpen ? "fixed left-0" : "hidden md:block md:sticky"}`}
        >
          <div className="space-y-1 flex flex-col gap-2">
            {docSections.map(({ id, title, subHeadings }) => (
              <Fragment key={id}>
                <a
                  key={id}
                  href={`#${id}`}
                  className="hover:underline text-lg"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  {title}
                </a>
                <div className="space-y-1 flex flex-col gap-2 ml-6">
                  {subHeadings.map(({ text, slug }) => (
                    <a
                      key={slug}
                      href={`#${slug}`}
                      className="hover:underline"
                      onClick={() => setIsSidebarOpen(false)}
                    >
                      {text}
                    </a>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </aside>
        <article className="flex-1 overflow-y-auto scroll bg-editor md:mx-20 mx-4">
          {docSections.map(({ id, content }) => (
            <section key={id} className="prose prose-invert max-w-none mb-8">
              <ReactMarkdown
                components={{
                  h1: ({ node: _, ...props }) => (
                    <h1
                      id={id}
                      className="text-2xl my-4 border-b scroll-mt-14"
                      {...props}
                    />
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
                      className="text-xl mb-4 mt-8 scroll-mt-14"
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
