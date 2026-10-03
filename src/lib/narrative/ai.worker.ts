/// <reference lib="webworker" />
import { describeFrames, writeNarrative, type AiDevice, type FrameInput } from "./aiCore";

/** Runs the AI narrative models off the main thread so the page stays responsive. */
self.onmessage = async (e: MessageEvent<{ device: AiDevice; facts: string; frames: FrameInput[] }>) => {
  const { device, facts, frames } = e.data;
  const onProgress = (message: string) => self.postMessage({ type: "progress", message });
  try {
    const frameNotes = await describeFrames(frames, { device, onProgress });
    const { sections, removed, model } = await writeNarrative(facts, frameNotes, { device, onProgress });
    self.postMessage({ type: "result", sections, removed, model, frameNotes });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
