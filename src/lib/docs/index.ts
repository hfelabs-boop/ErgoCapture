import { readFile } from "node:fs/promises";
import path from "node:path";

/** Documentation pages, rendered from the markdown files in /docs. */
export const DOCS = [
  { slug: "user-guide", title: "User guide", summary: "Capturing, workflows, pose engines, task inputs, reading results, reports, privacy, troubleshooting." },
  {
    slug: "validity",
    title: "Validity of the analytical methods",
    summary: "Evidence for each method and for camera-based measurement, what ErgoCapture has verified, limitations, and the validation plan.",
  },
  { slug: "methods", title: "Methods reference", summary: "Exactly how every angle and score is computed, with all thresholds and deviations from the published methods." },
  { slug: "technical", title: "Technical reference", summary: "Architecture, pose file format, models and licences, deployment, tests." },
] as const;

export type DocSlug = (typeof DOCS)[number]["slug"];

export async function readDoc(slug: string): Promise<string | null> {
  if (!DOCS.some((d) => d.slug === slug)) return null;
  return readFile(path.join(process.cwd(), "docs", `${slug}.md`), "utf8");
}

/** GitHub-style heading anchor, so links like validity.md#6-validation-plan work in the app too. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
