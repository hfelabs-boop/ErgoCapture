"use client";

import { canKeepModel, ENGINES, isConstrainedDevice, pendingDownloadMb, type EngineId } from "@/lib/pose/engines";
import { useCallback, useRef, useState } from "react";
import { Button } from "./ui";

type Choice = EngineId | null;

/**
 * Ask before a large one-time model download (RTMW ≈ 370 MB). Resolves with
 * the engine to use: the requested one, MediaPipe instead, or null (cancel).
 * Nothing is asked when the model is already in the browser cache.
 */
export function useDownloadGate() {
  const [ask, setAsk] = useState<{ engine: EngineId; mb: number; keep: boolean } | null>(null);
  const resolver = useRef<((c: Choice) => void) | null>(null);

  const gate = useCallback(async (engine: EngineId): Promise<Choice> => {
    const mb = await pendingDownloadMb(engine);
    if (mb === 0) return engine;
    const keep = await canKeepModel(engine);
    return new Promise<Choice>((resolve) => {
      resolver.current = resolve;
      setAsk({ engine, mb, keep });
    });
  }, []);

  const answer = (c: Choice) => {
    setAsk(null);
    resolver.current?.(c);
    resolver.current = null;
  };

  const dialog = ask ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="dl-title">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="dl-title" className="text-lg font-semibold">
          Download the {ENGINES[ask.engine].source} model?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {ENGINES[ask.engine].label} needs a one-time download of about <b>{ask.mb} MB</b>. The browser keeps it, so later analyses start without downloading.
        </p>
        {!ask.keep && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
            This browser has too little storage to keep the model (a private window or a nearly full disk), so it would download again next time.
          </p>
        )}
        {isConstrainedDevice() && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
            This looks like a phone or a mobile/slow connection. MediaPipe (≈ 6–30 MB) is the lighter choice here.
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => answer(null)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => answer("mediapipe")}>
            Use MediaPipe instead
          </Button>
          <Button onClick={() => answer(ask.engine)}>Download {ask.mb} MB</Button>
        </div>
      </div>
    </div>
  ) : null;

  return { gate, dialog };
}
