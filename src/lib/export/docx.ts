"use client";

import type { SessionAnalysis } from "../ergo/analyze";
import { RISK_COLORS } from "../ergo/risk";
import type { ReportImages } from "./images";
import { buildSections, methodsText, summaryRows } from "./reportModel";

function dataUrlBytes(url: string) {
  const b64 = url.split(",")[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportDocx(a: SessionAnalysis, images: ReportImages, title: string) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ShadingType } = d;
  const p = (text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) =>
    new Paragraph({ children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size })], spacing: { after: 80 } });
  const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) =>
    new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
  const table = (head: string[], rows: string[][], shade?: (r: number, c: number) => string | undefined) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: head.map(
            (x) =>
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: "auto", fill: "1E293B" },
                children: [new Paragraph({ children: [new TextRun({ text: x, bold: true, color: "FFFFFF", size: 18 })] })],
              }),
          ),
        }),
        ...rows.map(
          (r, ri) =>
            new TableRow({
              children: r.map((x, ci) => {
                const fill = shade?.(ri, ci);
                return new TableCell({
                  shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
                  children: [new Paragraph({ children: [new TextRun({ text: x, size: 18, color: fill ? "FFFFFF" : undefined })] })],
                });
              }),
            }),
        ),
      ],
    });
  const img = (url: string, w: number, hgt: number, type: "png" | "jpg") =>
    new Paragraph({ children: [new ImageRun({ type, data: dataUrlBytes(url), transformation: { width: w, height: hgt } })] });

  const rows = summaryRows(a);
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    p(`ErgoCapture ergonomic assessment — ${new Date(a.createdAt).toLocaleString()} — ${a.duration.toFixed(0)} s analysed, ${a.views.length} camera view(s)`, { color: "475569" }),
    p(`Overall: ${["Negligible", "Low", "Medium", "High", "Very high"][a.overall.risk]} risk. ${a.overall.headline}`, {
      bold: true,
      color: RISK_COLORS[a.overall.risk].slice(1),
      size: 26,
    }),
    h("Summary"),
    table(
      ["Method", "Result", "Risk", "Confidence"],
      rows.map((r) => [r.method, r.result, r.riskText, `${r.confLevel} (${(r.conf * 100).toFixed(0)}%)`]),
      (ri, ci) => (ci === 2 ? RISK_COLORS[rows[ri].risk].slice(1) : undefined),
    ),
    h("Recommendations"),
    ...a.recommendations.map((r, i) => p(`${i + 1}. ${r}`)),
    h("Scores over time"),
    img(images.rulaChart, 620, 136, "png"),
    img(images.rebaChart, 620, 136, "png"),
  ];
  if (images.worst.length) {
    children.push(h("Highest-risk moments"));
    for (const w of images.worst) {
      children.push(img(w.image, 420, 236, "jpg"));
      children.push(p(`${w.method} ${w.score} at ${w.t.toFixed(1)} s (confidence ${(w.conf * 100).toFixed(0)}%)`, { bold: true }));
      children.push(p(w.drivers.slice(0, 5).join("; ") || w.label, { color: "475569" }));
    }
  }
  children.push(h("Body exposure heatmap"), img(images.heatmap, 140, 294, "png"));
  children.push(p("Colours: green rarely at risk; lime > 5% of time medium risk; yellow > 25%; orange > 10% of time high risk; red > 30%.", { color: "475569" }));
  for (const s of buildSections(a)) {
    children.push(h(s.heading, HeadingLevel.HEADING_3));
    for (const t of s.paragraphs ?? []) children.push(p(t));
    if (s.table) children.push(table(s.table.head, s.table.rows));
  }
  children.push(h("Methods and limitations", HeadingLevel.HEADING_3), ...methodsText().map((t) => p(t)));
  const doc = new Document({ creator: "ErgoCapture", title, sections: [{ children }] });
  return Packer.toBlob(doc);
}
