/**
 * Worker-safe AI narrative core (no DOM access): loads the models with
 * Transformers.js and produces frame notes and narrative sections.
 * Runs inside ai.worker.ts so generation never blocks the page.
 */
import type { NarrativeSection } from "./template";

export type AiDevice = "webgpu" | "wasm";

export const AI_MODELS = {
  vision: { id: "HuggingFaceTB/SmolVLM2-500M-Video-Instruct", name: "SmolVLM2-500M", mb: 360 },
  text: { id: "onnx-community/Qwen3-1.7B-ONNX", name: "Qwen3-1.7B", mb: 1430 },
  // Smaller writer for CPU-only test runs (?ai=wasm); not offered to users.
  textCpu: { id: "onnx-community/Qwen3-0.6B-ONNX", name: "Qwen3-0.6B", mb: 620 },
};

export interface CoreOptions {
  device: AiDevice;
  /** Use the production writer even on CPU (testing) */
  fullWriter?: boolean;
  onProgress?: (message: string) => void;
}

export interface FrameInput {
  t: number;
  width: number;
  height: number;
  /** RGBA pixels */
  data: Uint8ClampedArray;
}

type ProgressInfo = { status: string; file?: string; progress?: number; loaded?: number; total?: number };

function progressReporter(label: string, onProgress?: (m: string) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: ProgressInfo) => {
    if (p.status === "progress" && p.file && p.total) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0,
        total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress?.(`Downloading ${label}… ${Math.round((loaded / total) * 100)}% (first use only)`);
    } else if (p.status === "ready") onProgress?.(`${label} ready`);
  };
}

/** Describe each frame in one sentence with SmolVLM2. */
export async function describeFrames(frames: FrameInput[], o: CoreOptions) {
  if (!frames.length) return [];
  const tf = await import("@huggingface/transformers");
  const { AutoProcessor, AutoModelForVision2Seq, RawImage } = tf;
  const id = AI_MODELS.vision.id;
  const onp = progressReporter("vision model", o.onProgress);
  const processor = await AutoProcessor.from_pretrained(id, { progress_callback: onp });
  const model = await AutoModelForVision2Seq.from_pretrained(id, {
    device: o.device,
    dtype:
      o.device === "webgpu"
        ? { embed_tokens: "q4f16", vision_encoder: "q4f16", decoder_model_merged: "q4f16" }
        : { embed_tokens: "int8", vision_encoder: "int8", decoder_model_merged: "q4" },
    progress_callback: onp,
  });
  const out: Array<{ t: number; text: string }> = [];
  try {
    for (const [i, f] of frames.entries()) {
      o.onProgress?.(`Looking at key moment ${i + 1} of ${frames.length}…`);
      const image = new RawImage(f.data, f.width, f.height, 4);
      const messages = [
        {
          role: "user",
          content: [
            { type: "image" },
            {
              type: "text",
              text: "This is a frame from a workplace video. In one short sentence, describe what the person is doing with their body and what they are holding or handling, if anything. Only describe what is clearly visible.",
            },
          ],
        },
      ];
      const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
      const inputs = await processor(prompt, [image], { do_image_splitting: false });
      const ids = (await model.generate({ ...inputs, max_new_tokens: 60, do_sample: false })) as { slice: (...a: unknown[]) => unknown };
      const promptLen = (inputs.input_ids as { dims: number[] }).dims.at(-1);
      const [text] = processor.batch_decode(ids.slice(null, [promptLen, null]) as never, { skip_special_tokens: true });
      out.push({ t: f.t, text: cleanSentence(text) });
    }
  } finally {
    await model.dispose();
  }
  return out;
}

function cleanSentence(s: string) {
  const t = s.replace(/^\s*(Assistant:)?\s*/i, "").replace(/\s+/g, " ").trim();
  return t.length > 240 ? `${t.slice(0, 237)}…` : t;
}

/** All numbers mentioned in a text, normalised ("4.08", "27", "1:30" → "1", "30"). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    const v = parseFloat(m[0]);
    out.add(String(v));
    out.add(String(Math.round(v)));
  }
  return out;
}

/** Drop sentences that contain numbers not present in the facts. */
export function guardNumbers(sections: NarrativeSection[], facts: string) {
  const allowed = numbersIn(facts);
  let removed = 0;
  const kept = sections.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs
      .map((p) =>
        p
          .split(/(?<=[.!?])\s+/)
          .filter((sentence) => {
            const bad = [...sentence.matchAll(/\d+(?:\.\d+)?/g)].some((m) => !allowed.has(String(parseFloat(m[0]))));
            if (bad) removed++;
            return !bad;
          })
          .join(" "),
      )
      .filter((p) => p.trim()),
  }));
  return { sections: kept.filter((s) => s.paragraphs.length), removed };
}

/** Parse "## Heading" markdown into sections; strips any <think> block. */
export function parseSections(md: string): NarrativeSection[] {
  const text = md.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<\/?think>/g, "").trim();
  const sections: NarrativeSection[] = [];
  let cur: NarrativeSection | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const h = line.match(/^#{1,4}\s*(.+?)\s*#*$/) ?? line.match(/^\*\*(.+?)\*\*:?$/);
    if (h) {
      cur = { heading: h[1].replace(/\*\*/g, ""), paragraphs: [] };
      sections.push(cur);
      continue;
    }
    if (!line) continue;
    if (!cur) {
      cur = { heading: "Summary", paragraphs: [] };
      sections.push(cur);
    }
    const clean = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/\*\*/g, "");
    if (/^[-*•]|^\d+[.)]/.test(line) || !cur.paragraphs.length) cur.paragraphs.push(clean);
    else cur.paragraphs[cur.paragraphs.length - 1] += ` ${clean}`;
  }
  return sections.filter((s) => s.paragraphs.length);
}

/** Write with the large model; if it does not fit in memory, retry once with the small one. */
export async function writeNarrative(facts: string, frameNotes: Array<{ t: number; text: string }>, o: CoreOptions) {
  const first = o.device === "webgpu" || o.fullWriter ? AI_MODELS.text : AI_MODELS.textCpu;
  try {
    return await writeWith(first, facts, frameNotes, o);
  } catch (e) {
    if (first === AI_MODELS.textCpu) throw e;
    o.onProgress?.(`${first.name} did not fit in this device's memory; using the smaller ${AI_MODELS.textCpu.name}…`);
    return await writeWith(AI_MODELS.textCpu, facts, frameNotes, o);
  }
}

async function writeWith(
  m: { id: string; name: string },
  facts: string,
  frameNotes: Array<{ t: number; text: string }>,
  o: CoreOptions,
) {
  const tf = await import("@huggingface/transformers");
  const onp = progressReporter("writing model", o.onProgress);
  const generator = await tf.pipeline("text-generation", m.id, {
    device: o.device,
    dtype: o.device === "webgpu" ? "q4f16" : "int8",
    // (both Qwen3 sizes ship q4f16 for WebGPU and int8 for CPU)
    progress_callback: onp,
  });
  const seen = frameNotes.length
    ? `\n\n## What the camera shows at key moments\n${frameNotes.map((f) => `- At ${Math.floor(f.t / 60)}:${String(Math.floor(f.t % 60)).padStart(2, "0")}: ${f.text}`).join("\n")}`
    : "";
  const messages = [
    {
      role: "system",
      content:
        "You are an occupational ergonomist writing the narrative part of a workplace posture assessment report. Write clear, professional, plain English for a manager. Use ONLY the facts provided. Never invent numbers, scores, causes or recommendations, and do not change any number. If a fact is uncertain, say so.",
    },
    {
      role: "user",
      content: `Facts from the automated assessment:\n\n${facts}${seen}\n\nWrite the descriptive part of the report with exactly these four sections, each starting with a markdown heading (##): Overview, What the worker does, Main risks, Confidence. Weave what the camera shows into "What the worker does". Do not write recommendations and do not add other sections. Use short paragraphs. Keep every number and its meaning exactly as given. /no_think`,
    },
  ];
  o.onProgress?.("Writing the narrative…");
  try {
    const result = (await generator(messages, { max_new_tokens: 900, do_sample: false, repetition_penalty: 1.05 })) as Array<{
      generated_text: Array<{ role: string; content: string }>;
    }>;
    const reply = result[0].generated_text.at(-1)?.content ?? "";
    // Recommendations always come from the rule-based engine, never from the model.
    const written = parseSections(reply).filter((s) => !/recommend|camera shows|key moments/i.test(s.heading));
    const { sections, removed } = guardNumbers(written, `${facts}${seen}`);
    return { sections, removed, model: m.name };
  } finally {
    await generator.dispose();
  }
}

