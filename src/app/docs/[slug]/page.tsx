import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, readDoc } from "@/lib/docs";
import { Markdown } from "../Markdown";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug);
  return { title: d ? `${d.title} — ErgoCapture` : "ErgoCapture" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await readDoc(slug);
  if (source === null) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[14rem_1fr]">
      <nav className="text-sm lg:sticky lg:top-20 lg:self-start">
        <Link href="/docs" className="font-semibold text-slate-800 hover:text-sky-700">
          Documentation
        </Link>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 lg:block lg:space-y-1">
          {DOCS.map((d) => (
            <li key={d.slug}>
              <Link href={`/docs/${d.slug}`} className={d.slug === slug ? "font-medium text-sky-700" : "text-slate-600 hover:text-sky-700"}>
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8">
        <Markdown source={source} />
      </article>
    </div>
  );
}
