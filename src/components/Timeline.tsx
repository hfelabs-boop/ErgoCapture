"use client";

import type { SessionAnalysis } from "@/lib/ergo/analyze";
import { CONFIDENCE_COLORS, confidenceLevel, RISK_COLORS } from "@/lib/ergo/risk";
import { useMemo, useRef } from "react";

const ACT_COLORS: Record<string, string> = {
  Lifting: "#7c3aed",
  Lowering: "#a78bfa",
  "Carrying / walking": "#0891b2",
  Walking: "#67e8f9",
  "Overhead work": "#dc2626",
  Bending: "#f97316",
  "Squatting / kneeling": "#b45309",
  Reaching: "#eab308",
  "Seated work": "#64748b",
  "Static standing": "#94a3b8",
  "Manual work": "#cbd5e1",
  "No person": "#f1f5f9",
};

/** Scores over time with activity strip, confidence strip and bookmarks at the worst moments. */
export function Timeline({ a, time, onSeek }: { a: SessionAnalysis; time: number; onSeek: (t: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 1000;
  const t0 = a.frames[0]?.t ?? 0;
  const dur = Math.max(1e-3, a.duration);
  const X = (t: number) => ((t - t0) / dur) * W;

  const path = (vals: number[], max: number, top: number, h: number) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (!a.frames[i].valid) {
        pen = false;
        return;
      }
      const x = X(a.frames[i].t).toFixed(1);
      const y = (top + h - (v / max) * h).toFixed(1);
      d += `${pen ? "L" : "M"}${x},${y}`;
      pen = true;
    });
    return d;
  };

  const rows = useMemo(() => {
    const bands = (colorOf: (i: number) => string) => {
      const out: Array<{ x: number; w: number; c: string }> = [];
      let start = 0;
      for (let i = 1; i <= a.frames.length; i++) {
        if (i === a.frames.length || colorOf(i) !== colorOf(start)) {
          out.push({ x: X(a.frames[start].t), w: Math.max(0.5, X(a.frames[i - 1].t) - X(a.frames[start].t) + W / a.frames.length), c: colorOf(start) });
          start = i;
        }
      }
      return out;
    };
    return {
      owas: bands((i) => (a.frames[i].valid ? RISK_COLORS[a.owas[i].risk] : "#f1f5f9")),
      conf: bands((i) => (a.frames[i].valid ? CONFIDENCE_COLORS[confidenceLevel(Math.min(a.rula[i].conf, a.reba[i].conf))] : "#f1f5f9")),
      ctx: bands((i) => (a.contexts[i].staticHold ? "#64748b" : a.contexts[i].repetitive ? "#8b5cf6" : "#f8fafc")),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a]);

  const bookmarks = [
    ...a.summary.reba.worstFrames.map((i) => ({ i, label: `REBA ${a.reba[i].score}` })),
    ...a.summary.rula.worstFrames.map((i) => ({ i, label: `RULA ${a.rula[i].score}` })),
  ];

  const click = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onSeek(t0 + ((e.clientX - r.left) / r.width) * dur);
  };

  const H = 250;
  const lanes = { rula: [8, 60], reba: [78, 70], owas: 160, act: 180, ctx: 200, conf: 220 };
  return (
    <div className="select-none">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-64 w-full cursor-crosshair" onClick={click}>
        {[3, 5, 7].map((v) => (
          <line key={v} x1={0} x2={W} y1={lanes.rula[0] + lanes.rula[1] - (v / 7) * lanes.rula[1]} y2={lanes.rula[0] + lanes.rula[1] - (v / 7) * lanes.rula[1]} stroke="#e2e8f0" strokeDasharray="4 4" />
        ))}
        {[4, 8, 11].map((v) => (
          <line key={v} x1={0} x2={W} y1={lanes.reba[0] + lanes.reba[1] - (v / 15) * lanes.reba[1]} y2={lanes.reba[0] + lanes.reba[1] - (v / 15) * lanes.reba[1]} stroke="#e2e8f0" strokeDasharray="4 4" />
        ))}
        <path d={path(a.rula.map((r) => r.score), 7, lanes.rula[0], lanes.rula[1])} fill="none" stroke="#0284c7" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        <path d={path(a.reba.map((r) => r.score), 15, lanes.reba[0], lanes.reba[1])} fill="none" stroke="#ea580c" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        {rows.owas.map((b, k) => (
          <rect key={`o${k}`} x={b.x} y={lanes.owas} width={b.w} height={14} fill={b.c} />
        ))}
        {a.activities.map((s, k) => (
          <rect key={`a${k}`} x={X(s.start)} y={lanes.act} width={Math.max(0.5, X(s.end) - X(s.start) + W / a.frames.length)} height={14} fill={ACT_COLORS[s.label]}>
            <title>{`${s.label} ${s.start.toFixed(1)}–${s.end.toFixed(1)} s`}</title>
          </rect>
        ))}
        {rows.ctx.map((b, k) => (
          <rect key={`c${k}`} x={b.x} y={lanes.ctx} width={b.w} height={14} fill={b.c} />
        ))}
        {rows.conf.map((b, k) => (
          <rect key={`f${k}`} x={b.x} y={lanes.conf} width={b.w} height={14} fill={b.c} opacity={0.8} />
        ))}
        {a.niosh.lifts.map((l, k) => (
          <rect key={`l${k}`} x={X(l.start)} y={lanes.rula[0]} width={Math.max(1, X(l.end) - X(l.start))} height={lanes.reba[0] + lanes.reba[1] - lanes.rula[0]} fill="#7c3aed" opacity={0.07} />
        ))}
        {bookmarks.map((b, k) => (
          <g key={`b${k}`} onClick={(e) => (e.stopPropagation(), onSeek(a.frames[b.i].t))} className="cursor-pointer">
            <path d={`M${X(a.frames[b.i].t) - 6},0 L${X(a.frames[b.i].t) + 6},0 L${X(a.frames[b.i].t)},9 Z`} fill="#dc2626" />
            <title>{b.label}</title>
          </g>
        ))}
        <line x1={X(time)} x2={X(time)} y1={0} y2={H} stroke="#0f172a" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-500 sm:grid-cols-3 lg:grid-cols-6">
        <span><b className="text-sky-700">━</b> RULA (0–7)</span>
        <span><b className="text-orange-600">━</b> REBA (0–15)</span>
        <span>Strip 1: OWAS action category</span>
        <span>Strip 2: activity</span>
        <span>Strip 3: static (grey) / repetitive (violet)</span>
        <span>Strip 4: confidence · ▼ worst moments</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {Object.entries(ACT_COLORS)
          .filter(([k]) => a.activities.some((s) => s.label === k))
          .map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
              {k}
            </span>
          ))}
      </div>
    </div>
  );
}
