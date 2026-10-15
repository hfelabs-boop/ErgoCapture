"use client";

import { drawFrame, type DrawOptions } from "../draw";
import { MEASURE_DEFS, type MeasureKey } from "../ergo/measures";
import type { PhotoAnalysis, PhotoResult } from "../ergo/photos";
import { confidenceLevel, RISK_COLORS, RISK_NAMES } from "../ergo/risk";
import { pdfSafe } from "./pdf";

/** Reports for still-photo assessments: PDF, Word, CSV and a print view. */

export const PHOTO_ANGLES: MeasureKey[] = [
  "trunkFlex",
  "trunkSide",
  "trunkTwist",
  "neckFlex",
  "shoulderElevL",
  "shoulderElevR",
  "elbowFlexL",
  "elbowFlexR",
  "wristFlexL",
  "wristFlexR",
  "kneeFlexL",
  "kneeFlexR",
];
const DEF = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d])) as Record<MeasureKey, (typeof MEASURE_DEFS)[number]>;

export const photoConfidence = (it: PhotoResult) => Math.min(it.rula?.conf ?? 0, it.reba?.conf ?? 0, it.owas?.conf ?? 0);

export function photoDrivers(it: PhotoResult, n = 5) {
  return [...new Set([...(it.reba?.drivers ?? []), ...(it.rula?.drivers ?? []), ...(it.owas?.drivers ?? [])])].slice(0, n);
}

/** The photo with face blur (optional) and the risk-coloured skeleton, as a JPEG data URL. */
export async function renderPhotoImage(it: PhotoResult, url: string, privacy: DrawOptions, maxW = 900): Promise<string> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const w = Math.min(maxW, it.width || img.naturalWidth);
  const h = Math.round((w * (it.height || img.naturalHeight)) / (it.width || img.naturalWidth));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawFrame(c.getContext("2d")!, img, it.image, it.found ? it.m : null, w, h, { ...privacy, lineWidth: Math.max(3, w / 220) });
  return c.toDataURL("image/jpeg", 0.85);
}

const num = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "");

export function photosCsv(pa: PhotoAnalysis): string {
  const head = [
    "photo",
    "person_found",
    "rula",
    "rula_conf",
    "rula_quality",
    "rula_level_stability",
    "reba",
    "reba_conf",
    "reba_quality",
    "reba_level_stability",
    "owas_code",
    "owas_ac",
    "owas_conf",
    "owas_quality",
    "owas_level_stability",
    "view_yaw_deg",
    ...MEASURE_DEFS.flatMap((d) => [d.key, `${d.key}_conf`]),
    "drivers",
  ];
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = pa.items.map((it) =>
    [
      q(it.name),
      it.found ? 1 : 0,
      it.rula?.score ?? "",
      num(it.rula?.conf ?? NaN, 2),
      num(it.rula?.quality ?? NaN, 2),
      num(it.rula?.levelStability ?? NaN, 2),
      it.reba?.score ?? "",
      num(it.reba?.conf ?? NaN, 2),
      num(it.reba?.quality ?? NaN, 2),
      num(it.reba?.levelStability ?? NaN, 2),
      it.owas?.parts.code ?? "",
      it.owas?.score ?? "",
      num(it.owas?.conf ?? NaN, 2),
      num(it.owas?.quality ?? NaN, 2),
      num(it.owas?.levelStability ?? NaN, 2),
      num(it.m.viewYaw, 0),
      ...MEASURE_DEFS.flatMap((d) => [num(it.m.m[d.key], d.unit === "m" ? 3 : 1), num(it.m.c[d.key], 2)]),
      q(photoDrivers(it, 8).join("; ")),
    ].join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

const angleRows = (it: PhotoResult) =>
  PHOTO_ANGLES.map((k) => [DEF[k].label, Number.isFinite(it.m.m[k]) ? `${it.m.m[k].toFixed(0)}${DEF[k].unit}` : "–", confidenceLevel(it.m.c[k])]);

const summaryRows = (pa: PhotoAnalysis) =>
  pa.items.map((it) =>
    it.found
      ? [it.name, String(it.rula!.score), String(it.reba!.score), `AC${it.owas!.score}`, RISK_NAMES[it.reba!.risk], `${confidenceLevel(photoConfidence(it))} (${Math.round(photoConfidence(it) * 100)}%)`]
      : [it.name, "–", "–", "–", "No person found", "–"],
  );

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export async function exportPhotosPdf(pa: PhotoAnalysis, images: Record<string, string>, title: string) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(pdfSafe(title), M, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(pdfSafe(`ErgoCapture photo assessment  |  ${new Date(pa.createdAt).toLocaleString()}  |  ${pa.items.length} photo(s)  |  ${pa.source}`), M, 21);
  let y = 34;
  doc.setFillColor(...hex(RISK_COLORS[pa.overallRisk]));
  doc.roundedRect(M, y, W - 2 * M, 11, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(pdfSafe(`Highest risk across photos: ${RISK_NAMES[pa.overallRisk]}`), M + 3, y + 7);
  y += 16;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Photo", "RULA", "REBA", "OWAS", "Risk (REBA)", "Confidence"]],
    body: summaryRows(pa).map((r) => r.map(pdfSafe)),
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  y = lastY() + 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  for (const n of pa.notes) {
    const lines = doc.splitTextToSize(pdfSafe(`• ${n}`), W - 2 * M);
    if (y + lines.length * 4 > H - M) {
      doc.addPage();
      y = M;
    }
    doc.text(lines, M, y);
    y += lines.length * 3.8 + 1;
  }
  // One page per photo, highest risk first.
  const order = [...pa.ranked, ...pa.items.map((_, i) => i).filter((i) => !pa.ranked.includes(i))];
  for (const i of order) {
    const it = pa.items[i];
    doc.addPage();
    y = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(it.name), M, y + 5);
    y += 9;
    const img = images[it.id];
    if (img) {
      const ratio = (it.height || 3) / (it.width || 4);
      const iw = Math.min(W - 2 * M, 150 / ratio);
      const ih = iw * ratio;
      doc.addImage(img, "JPEG", M, y, iw, ih);
      y += ih + 4;
    }
    if (!it.found) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("No person was found in this photo.", M, y + 4);
      continue;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Method", "Score", "Action", "Confidence"]],
      body: [
        ["RULA", String(it.rula!.score), pdfSafe(it.rula!.label), `${confidenceLevel(it.rula!.conf)} (${Math.round(it.rula!.conf * 100)}%)`],
        ["REBA", String(it.reba!.score), pdfSafe(it.reba!.label), `${confidenceLevel(it.reba!.conf)} (${Math.round(it.reba!.conf * 100)}%)`],
        ["OWAS", `AC${it.owas!.score}`, pdfSafe(it.owas!.label), `${confidenceLevel(it.owas!.conf)} (${Math.round(it.owas!.conf * 100)}%)`],
      ],
      styles: { fontSize: 8.5, cellPadding: 1.4 },
      headStyles: { fillColor: [51, 65, 85] },
    });
    y = lastY() + 3;
    const drivers = photoDrivers(it);
    if (drivers.length) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(pdfSafe(`Why: ${drivers.join("; ")}`), W - 2 * M);
      doc.text(lines, M, y + 3);
      y += lines.length * 4 + 3;
    }
    if (y < H - 60)
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [["Angle", "Value", "Confidence"]],
        body: angleRows(it).map((r) => r.map(pdfSafe)),
        styles: { fontSize: 7.5, cellPadding: 1 },
        headStyles: { fillColor: [100, 116, 139] },
      });
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`ErgoCapture  |  page ${p} of ${pages}`, W - M, H - 6, { align: "right" });
  }
  return doc.output("blob");
}

function dataUrlBytes(url: string) {
  const bin = atob(url.split(",")[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportPhotosDocx(pa: PhotoAnalysis, images: Record<string, string>, title: string) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ShadingType } = d;
  const p = (text: string, color?: string) => new Paragraph({ children: [new TextRun({ text, color, size: 20 })], spacing: { after: 80 } });
  const table = (head: string[], rows: string[][]) =>
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
        ...rows.map((r) => new TableRow({ children: r.map((x) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: x, size: 18 })] })] })) })),
      ],
    });
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    p(`ErgoCapture photo assessment — ${new Date(pa.createdAt).toLocaleString()} — ${pa.items.length} photo(s) — ${pa.source}`, "475569"),
    new Paragraph({
      children: [new TextRun({ text: `Highest risk across photos: ${RISK_NAMES[pa.overallRisk]}`, bold: true, size: 26, color: RISK_COLORS[pa.overallRisk].slice(1) })],
    }),
    new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2 }),
    table(["Photo", "RULA", "REBA", "OWAS", "Risk (REBA)", "Confidence"], summaryRows(pa)),
    ...pa.notes.map((n) => p(`• ${n}`, "475569")),
  ];
  const order = [...pa.ranked, ...pa.items.map((_, i) => i).filter((i) => !pa.ranked.includes(i))];
  for (const i of order) {
    const it = pa.items[i];
    children.push(new Paragraph({ text: it.name, heading: HeadingLevel.HEADING_2, pageBreakBefore: true }));
    const img = images[it.id];
    if (img) {
      const w = 560;
      const h = Math.round((w * (it.height || 3)) / (it.width || 4));
      children.push(new Paragraph({ children: [new ImageRun({ type: "jpg", data: dataUrlBytes(img), transformation: { width: w, height: h } })] }));
    }
    if (!it.found) {
      children.push(p("No person was found in this photo."));
      continue;
    }
    children.push(
      table(
        ["Method", "Score", "Action", "Confidence"],
        [
          ["RULA", String(it.rula!.score), it.rula!.label, `${confidenceLevel(it.rula!.conf)} (${Math.round(it.rula!.conf * 100)}%)`],
          ["REBA", String(it.reba!.score), it.reba!.label, `${confidenceLevel(it.reba!.conf)} (${Math.round(it.reba!.conf * 100)}%)`],
          ["OWAS", `AC${it.owas!.score}`, it.owas!.label, `${confidenceLevel(it.owas!.conf)} (${Math.round(it.owas!.conf * 100)}%)`],
        ],
      ),
    );
    const drivers = photoDrivers(it);
    if (drivers.length) children.push(p(`Why: ${drivers.join("; ")}`));
    children.push(table(["Angle", "Value", "Confidence"], angleRows(it)));
  }
  return Packer.toBlob(new Document({ creator: "ErgoCapture", title, sections: [{ children }] }));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function printPhotos(pa: PhotoAnalysis, images: Record<string, string>, title: string) {
  const order = [...pa.ranked, ...pa.items.map((_, i) => i).filter((i) => !pa.ranked.includes(i))];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body{font:10.5pt/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;max-width:800px;margin:24px auto;padding:0 16px}
  h1{font-size:19pt;margin:0} h2{font-size:13pt;margin:0 0 6px} .meta,.note{color:#64748b;font-size:9pt}
  table{border-collapse:collapse;width:100%;font-size:9pt;margin:6px 0} td,th{border-bottom:1px solid #e2e8f0;padding:3px 6px;text-align:left}
  th{color:#64748b} .photo{break-inside:avoid;margin-top:22px} img{max-width:100%;border-radius:6px}
  .badge{display:inline-block;padding:2px 10px;border-radius:99px;color:#fff;font-weight:600}
  @media print{body{margin:0} button{display:none} .photo{break-before:page}}
</style></head><body><button onclick="print()" style="float:right">Print</button>
<h1>${esc(title)}</h1><div class="meta">${new Date(pa.createdAt).toLocaleString()} · ${pa.items.length} photo(s) · ${esc(pa.source)}</div>
<p><span class="badge" style="background:${RISK_COLORS[pa.overallRisk]}">Highest risk across photos: ${RISK_NAMES[pa.overallRisk]}</span></p>
<table><tr><th>Photo</th><th>RULA</th><th>REBA</th><th>OWAS</th><th>Risk (REBA)</th><th>Confidence</th></tr>
${summaryRows(pa).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>
${pa.notes.map((n) => `<p class="note">• ${esc(n)}</p>`).join("")}
${order
  .map((i) => {
    const it = pa.items[i];
    return `<div class="photo"><h2>${esc(it.name)}</h2>${images[it.id] ? `<img src="${images[it.id]}">` : ""}${
      it.found
        ? `<table><tr><th>Method</th><th>Score</th><th>Action</th><th>Confidence</th></tr>
      <tr><td>RULA</td><td>${it.rula!.score}</td><td>${esc(it.rula!.label)}</td><td>${confidenceLevel(it.rula!.conf)} (${Math.round(it.rula!.conf * 100)}%)</td></tr>
      <tr><td>REBA</td><td>${it.reba!.score}</td><td>${esc(it.reba!.label)}</td><td>${confidenceLevel(it.reba!.conf)} (${Math.round(it.reba!.conf * 100)}%)</td></tr>
      <tr><td>OWAS</td><td>AC${it.owas!.score}</td><td>${esc(it.owas!.label)}</td><td>${confidenceLevel(it.owas!.conf)} (${Math.round(it.owas!.conf * 100)}%)</td></tr></table>
      ${photoDrivers(it).length ? `<p><b>Why:</b> ${esc(photoDrivers(it).join("; "))}</p>` : ""}`
        : "<p>No person was found in this photo.</p>"
    }</div>`;
  })
  .join("")}
<p class="note">ErgoCapture is a screening tool; results should be reviewed by a qualified ergonomist.</p></body></html>`;
  const w = window.open("", "_blank");
  if (!w) throw new Error("The browser blocked the print window. Allow pop-ups for this site.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
