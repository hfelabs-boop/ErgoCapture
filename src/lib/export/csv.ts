import type { SessionAnalysis } from "../ergo/analyze";
import { MEASURE_DEFS } from "../ergo/measures";

const UNIT_SUFFIX: Record<string, string> = { "°": "_deg", "%": "_pct", m: "_m", "body-heights/s": "_bh_per_s" };

/** Raw per-frame data export for statistical analysis. */
export function analysisToCsv(a: SessionAnalysis): string {
  const act = (t: number) => a.activities.find((s) => t >= s.start && t <= s.end)?.label ?? "";
  const head = [
    "time_s",
    "valid",
    "interpolated",
    "view_yaw_deg",
    ...MEASURE_DEFS.flatMap((d) => [`${d.key}${UNIT_SUFFIX[d.unit] ?? ""}`, `${d.key}_conf`]),
    "rula",
    "rula_conf",
    "reba",
    "reba_conf",
    "owas_code",
    "owas_ac",
    "owas_conf",
    "static_hold",
    "repetitive",
    "rapid_change",
    "load_active",
    "seated",
    "activity",
  ];
  const num = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "");
  const rows = a.frames.map((f, i) => {
    const c = a.contexts[i];
    return [
      num(f.t, 3),
      f.valid ? 1 : 0,
      f.interpolated ? 1 : 0,
      num(f.viewYaw, 1),
      ...MEASURE_DEFS.flatMap((d) => [num(f.m[d.key], d.unit === "m" ? 3 : 2), num(f.c[d.key], 2)]),
      f.valid ? a.rula[i].score : "",
      num(a.rula[i].conf, 2),
      f.valid ? a.reba[i].score : "",
      num(a.reba[i].conf, 2),
      f.valid ? a.owas[i].parts.code : "",
      f.valid ? a.owas[i].score : "",
      num(a.owas[i].conf, 2),
      c.staticHold ? 1 : 0,
      c.repetitive ? 1 : 0,
      c.rapidChange ? 1 : 0,
      c.loadActive ? 1 : 0,
      c.seated ? 1 : 0,
      `"${act(f.t)}"`,
    ].join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

export function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
