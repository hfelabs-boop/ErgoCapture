"use client";

import type { SessionAnalysis } from "../ergo/analyze";
import { CONFIDENCE_COLORS, RISK_COLORS } from "../ergo/risk";
import type { ReportImages } from "./images";
import { buildSections, methodsText, summaryRows } from "./reportModel";

/** Helvetica in jsPDF is WinAnsi-encoded: map characters it cannot render. */
export function pdfSafe(s: string) {
  return s
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/→/g, "->")
    .replace(/✓/g, "OK")
    .replace(/✗/g, "X")
    .replace(/∞/g, "inf")
    .replace(/−/g, "-")
    .replace(/≈/g, "~")
    .replace(/·/g, "x");
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export async function exportPdf(a: SessionAnalysis, images: ReportImages, title: string) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = M;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (t: string, size = 13) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(t), M, y + 5);
    y += 9;
  };
  const para = (t: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(pdfSafe(t), W - 2 * M);
    ensure(lines.length * size * 0.42 + 2);
    doc.text(lines, M, y + 3.5);
    y += lines.length * size * 0.42 + 2;
  };

  // Cover
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(pdfSafe(title), M, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    pdfSafe(`ErgoCapture ergonomic assessment  |  ${new Date(a.createdAt).toLocaleString()}  |  ${a.duration.toFixed(0)} s analysed, ${a.views.length} camera view(s)`),
    M,
    21,
  );
  y = 34;
  const [r, g, b] = hex(RISK_COLORS[a.overall.risk]);
  doc.setFillColor(r, g, b);
  doc.roundedRect(M, y, W - 2 * M, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(pdfSafe(`Overall: ${["Negligible", "Low", "Medium", "High", "Very high"][a.overall.risk]} risk. ${a.overall.headline}`), M + 3, y + 7.5);
  y += 17;

  heading("Summary");
  const rows = summaryRows(a);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Method", "Result", "Risk", "Confidence"]],
    body: rows.map((r) => [r.method, pdfSafe(r.result), pdfSafe(r.riskText), `${r.confLevel} (${(r.conf * 100).toFixed(0)}%)`]),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" }, 2: { cellWidth: 38 }, 3: { cellWidth: 26 } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const row = rows[d.row.index];
      if (d.column.index === 2) {
        d.cell.styles.fillColor = hex(RISK_COLORS[row.risk]);
        d.cell.styles.textColor = row.risk === 1 || row.risk === 2 ? [30, 30, 30] : [255, 255, 255];
      }
      if (d.column.index === 3) d.cell.styles.textColor = hex(CONFIDENCE_COLORS[row.confLevel]);
    },
  });
  y = lastY() + 6;

  heading("Recommendations");
  a.recommendations.forEach((rec, i) => para(`${i + 1}. ${rec}`));
  y += 2;

  const cw = W - 2 * M;
  ensure(cw * 0.22 * 2 + 16);
  heading("Scores over time");
  doc.addImage(images.rulaChart, "PNG", M, y, cw, cw * 0.22);
  y += cw * 0.22 + 2;
  doc.addImage(images.rebaChart, "PNG", M, y, cw, cw * 0.22);
  y += cw * 0.22 + 4;

  // Worst moments
  if (images.worst.length) {
    ensure((W - 2 * M - 6) / 2 * 0.5625 + 36);
    heading("Highest-risk moments");
    const iw = (W - 2 * M - 6) / 2;
    images.worst.forEach((w, i) => {
      const col = i % 2;
      const ih = iw * 0.5625;
      if (col === 0) ensure(ih + 26);
      const x = M + col * (iw + 6);
      doc.addImage(w.image, "JPEG", x, y, iw, ih);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafe(`${w.method} ${w.score} at ${w.t.toFixed(1)} s (confidence ${(w.conf * 100).toFixed(0)}%)`), x, y + ih + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(pdfSafe(w.drivers.slice(0, 4).join("; ") || w.label), iw);
      doc.text(lines.slice(0, 3), x, y + ih + 8);
      if (col === 1 || i === images.worst.length - 1) y += ih + 22;
    });
  }

  // Body heatmap + details
  ensure(90);
  heading("Body exposure heatmap");
  doc.addImage(images.heatmap, "PNG", M, y, 38, 80);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const legend = [
    ["Green", "rarely at risk"],
    ["Lime", "> 5% of time medium risk"],
    ["Yellow", "> 25% of time medium risk"],
    ["Orange", "> 10% of time high risk"],
    ["Red", "> 30% of time high risk"],
  ];
  legend.forEach(([c, t], i) => doc.text(`${c}: ${t}`, M + 44, y + 6 + i * 5));
  y += 86;

  for (const s of buildSections(a)) {
    heading(s.heading, 11);
    for (const p of s.paragraphs ?? []) para(p);
    if (s.table) {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [s.table.head.map(pdfSafe)],
        body: s.table.rows.map((r) => r.map(pdfSafe)),
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        headStyles: { fillColor: [51, 65, 85] },
      });
      y = lastY() + 5;
    }
  }
  heading("Methods and limitations", 11);
  methodsText().forEach((t) => para(t));

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`ErgoCapture  |  page ${p} of ${pages}`, W - M, H - 6, { align: "right" });
  }
  return doc.output("blob");
}
