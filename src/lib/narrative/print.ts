"use client";

import type { SessionAnalysis } from "../ergo/analyze";
import { RISK_COLORS, RISK_NAMES } from "../ergo/risk";
import { summaryRows } from "../export/reportModel";
import type { Narrative } from "./template";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Printable HTML of the narrative with the score summary. */
export function narrativeHtml(n: Narrative, a: SessionAnalysis): string {
  const rows = summaryRows(a);
  const origin =
    n.source === "ai"
      ? `Narrative written on this device by ${esc(n.model ?? "an AI model")} from the measured results. Check it before use.`
      : "Narrative generated from the measured results.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(n.title)}</title>
<style>
  body{font:11pt/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;max-width:780px;margin:24px auto;padding:0 16px}
  h1{font-size:20pt;margin:0 0 4px} h2{font-size:13pt;margin:20px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:2px}
  .meta{color:#64748b;font-size:9.5pt} .badge{display:inline-block;padding:2px 10px;border-radius:99px;color:#fff;font-weight:600}
  table{border-collapse:collapse;width:100%;font-size:9.5pt;margin-top:8px} td,th{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left;vertical-align:top}
  th{color:#64748b;font-weight:600} .note{color:#64748b;font-size:9pt;margin-top:24px}
  @media print{body{margin:0} button{display:none}}
</style></head><body>
<button onclick="print()" style="float:right">Print</button>
<h1>${esc(n.title)}</h1>
<div class="meta">${new Date(a.createdAt).toLocaleString()} · ${Math.round(a.duration)} s analysed · ${a.views.map((v) => esc(`${v.label} (${v.source})`)).join(", ")}</div>
<p><span class="badge" style="background:${RISK_COLORS[a.overall.risk]};color:${a.overall.risk === 1 || a.overall.risk === 2 ? "#1e293b" : "#fff"}">Overall: ${RISK_NAMES[a.overall.risk]} risk</span></p>
${n.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("\n")}
${n.frameNotes?.length ? `<h2>What the camera shows (AI description, indicative)</h2>${n.frameNotes.map((f) => `<p><b>${Math.floor(f.t / 60)}:${String(Math.floor(f.t % 60)).padStart(2, "0")}</b> ${esc(f.text)}</p>`).join("")}` : ""}
<h2>Scores</h2>
<table><tr><th>Method</th><th>Result</th><th>Risk</th><th>Confidence</th></tr>
${rows.map((r) => `<tr><td><b>${esc(r.method)}</b></td><td>${esc(r.result)}</td><td>${esc(r.riskText)}</td><td>${r.confLevel} (${Math.round(r.conf * 100)}%)</td></tr>`).join("")}
</table>
<p class="note">${origin} ErgoCapture is a screening tool; results should be reviewed by a qualified ergonomist.</p>
</body></html>`;
}

/** Open the narrative in a print-ready window and start printing. */
export function printNarrative(n: Narrative, a: SessionAnalysis) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("The browser blocked the print window. Allow pop-ups for this site.");
  w.document.open();
  w.document.write(narrativeHtml(n, a));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
