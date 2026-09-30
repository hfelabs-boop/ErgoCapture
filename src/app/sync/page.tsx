"use client";

import { Button } from "@/components/ui";
import { useEffect, useRef, useState } from "react";

/**
 * Sync signal for multi-phone recording: a full-screen white flash with a
 * sharp beep, visible and audible to every camera. The Analyze page detects
 * either one to align the recordings. A running millisecond clock is shown
 * as a visual cross-check.
 */
export default function SyncPage() {
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(0);
  const [auto, setAuto] = useState(false);
  const [count, setCount] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fire = () => {
    ctxRef.current ??= new AudioContext();
    const ctx = ctxRef.current;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 2000;
    g.gain.setValueAtTime(0.8, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
    setFlash(true);
    setCount((c) => c + 1);
    setTimeout(() => setFlash(false), 150);
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(fire, 5000);
    return () => clearInterval(id);
  }, [auto]);

  const secs = now / 1000;
  return (
    <div
      className={`-mx-4 -my-6 flex min-h-[80vh] flex-col items-center justify-center gap-6 px-4 transition-colors duration-75 ${flash ? "bg-white" : "bg-slate-950"}`}
      onClick={fire}
    >
      <div className={`tabular font-mono text-6xl font-bold sm:text-8xl ${flash ? "text-slate-900" : "text-sky-400"}`}>
        {Math.floor(secs / 60)
          .toString()
          .padStart(2, "0")}
        :{(secs % 60).toFixed(3).padStart(6, "0")}
      </div>
      <p className={`max-w-md text-center text-sm ${flash ? "text-slate-700" : "text-slate-400"}`}>
        Start recording on every camera, then hold this screen where all cameras can see it and tap anywhere. The flash and beep mark the same instant in every video.
        Flashes: {count}
      </p>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button onClick={fire}>Flash + beep</Button>
        <Button variant="secondary" onClick={() => setAuto(!auto)}>
          {auto ? "Stop auto (5 s)" : "Auto every 5 s"}
        </Button>
      </div>
    </div>
  );
}
