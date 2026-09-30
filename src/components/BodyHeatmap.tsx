"use client";

import { BODY_SHAPES, exposureColor } from "@/lib/draw";
import type { SegmentExposure } from "@/lib/ergo/exposure";
import { SEGMENT_LABELS } from "@/lib/pose/types";

/** Front-view body figure coloured by how long each segment spends at elevated risk. Left/right are the worker's. */
export function BodyHeatmap({ exposure }: { exposure: SegmentExposure[] }) {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <svg viewBox="0 0 200 420" className="h-80 w-auto shrink-0">
        {BODY_SHAPES.map((s) => {
          const e = exposure.find((x) => x.segment === s.seg);
          return (
            <line key={s.seg} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={e ? exposureColor(e.pctElevated, e.pctHigh) : "#cbd5e1"} strokeWidth={s.r * 2} strokeLinecap="round">
              <title>{e ? `${SEGMENT_LABELS[s.seg]}: ${e.pctElevated.toFixed(0)}% medium+, ${e.pctHigh.toFixed(0)}% high` : SEGMENT_LABELS[s.seg]}</title>
            </line>
          );
        })}
        <text x={100} y={416} textAnchor="middle" fontSize={10} fill="#94a3b8">
          front view (worker&apos;s right on the left)
        </text>
      </svg>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1 font-medium">Body part</th>
            <th className="py-1 text-right font-medium">Medium+ risk</th>
            <th className="py-1 text-right font-medium">High risk</th>
          </tr>
        </thead>
        <tbody>
          {[...exposure]
            .sort((a, b) => b.pctElevated - a.pctElevated)
            .map((e) => (
              <tr key={e.segment} className="border-t border-slate-100">
                <td className="py-1">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: exposureColor(e.pctElevated, e.pctHigh) }} />
                  {SEGMENT_LABELS[e.segment]}
                </td>
                <td className="tabular py-1 text-right">{e.pctElevated.toFixed(0)}%</td>
                <td className="tabular py-1 text-right">{e.pctHigh.toFixed(0)}%</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
