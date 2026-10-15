import Link from "next/link";
import { DOCS } from "@/lib/docs";

export const metadata = { title: "Documentation — ErgoCapture" };

export default function DocsIndex() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documentation</h1>
        <p className="mt-1 text-sm text-slate-500">
          How to use ErgoCapture, how its results are computed, and how far they can be trusted. ErgoCapture is a screening tool: results should be reviewed by a qualified
          ergonomist.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {DOCS.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/${d.slug}`}
            className={`group rounded-xl border bg-white p-5 shadow-sm transition hover:border-sky-400 hover:shadow ${d.slug === "validity" ? "border-sky-300" : "border-slate-200"}`}
          >
            <h2 className="font-semibold group-hover:text-sky-700">{d.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{d.summary}</p>
          </Link>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        A shorter overview of the methods and the confidence model is on the{" "}
        <Link href="/methods" className="text-sky-700 underline">
          Methods
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
