import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "@/lib/docs";

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(textOf).join("")
      : n && typeof n === "object" && "props" in n
        ? textOf((n as { props: { children?: ReactNode } }).props.children)
        : "";

/** Links between docs (validity.md#x) become in-app routes (/docs/validity#x). */
function href(h: string) {
  const m = h.match(/^([\w-]+)\.md(#.*)?$/);
  if (m) return `/docs/${m[1]}${m[2] ?? ""}`;
  if (h.startsWith("../")) return `https://github.com/hfelabs-boop/ErgoCapture/blob/main/${h.replace(/^\.\.\//, "")}`;
  return h;
}

export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-4 text-2xl font-semibold tracking-tight">{children}</h1>,
        h2: ({ children }) => (
          <h2 id={slugify(textOf(children))} className="mt-10 mb-3 scroll-mt-20 border-b border-slate-200 pb-1 text-xl font-semibold">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 id={slugify(textOf(children))} className="mt-6 mb-2 scroll-mt-20 text-base font-semibold">
            {children}
          </h3>
        ),
        h4: ({ children }) => <h4 className="mt-4 mb-1 text-sm font-semibold">{children}</h4>,
        p: ({ children }) => <p className="my-3 leading-relaxed text-slate-700">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-slate-700">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-slate-700">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ href: h = "", children }) => {
          const to = href(h);
          return to.startsWith("/") || to.startsWith("#") ? (
            <Link href={to} className="text-sky-700 underline underline-offset-2">
              {children}
            </Link>
          ) : (
            <a href={to} className="break-words text-sky-700 underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
        blockquote: ({ children }) => <blockquote className="my-4 rounded-r-lg border-l-4 border-sky-500 bg-sky-50 px-4 py-1 text-slate-700">{children}</blockquote>,
        code: ({ children, className }) =>
          className ? (
            <code className={className}>{children}</code>
          ) : (
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">{children}</code>
          ),
        pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{children}</pre>,
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b border-slate-300 px-2 py-1.5 text-left align-bottom font-semibold text-slate-600">{children}</th>,
        td: ({ children }) => <td className="border-b border-slate-100 px-2 py-1.5 align-top text-slate-700">{children}</td>,
        hr: () => <hr className="my-8 border-slate-200" />,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
