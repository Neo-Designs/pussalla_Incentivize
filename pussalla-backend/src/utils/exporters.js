const PDFDocument = require("pdfkit");

// Build a CSV string from an array of row arrays.
// Values containing commas, quotes or newlines are quoted/escaped.
function toCsv(rows) {
  return rows
    .map((r) => r.map((cell) => {
      const s = cell == null ? "" : String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
}

function sendCsv(res, filename, rows) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

// Render a payslip PDF to the response stream. `data` has employee + items + grid.
function sendPayslipPdf(res, data) {
  const {
    company = "Incentivize",
    employeeCode, employeeName, divisionName, month,
    items = [], taskBreakdown = [], grandTotal = 0,
    dates = [], gridRows = [],
  } = data;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="payslip-${employeeCode}-${month}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).fillColor("#590707").text(company, { align: "left" });
  doc.fontSize(10).fillColor("#736D66").text("Incentive Payslip", { align: "left" });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#CDC7BD").lineWidth(1).stroke();
  doc.moveDown(0.6);

  // Employee meta
  doc.fillColor("#04090C").fontSize(11);
  doc.text(`Employee: ${employeeName}`, 50, doc.y, { continued: true });
  doc.text(`   Code: ${employeeCode}`, { align: "right" });
  doc.text(`Division: ${divisionName || "—"}`, 50, doc.y, { continued: true });
  doc.text(`   Period: ${month}`, { align: "right" });
  doc.moveDown(0.8);

  // Task x date grid — the primary breakdown. Rendered as a compact table.
  if (gridRows.length) {
    doc.fontSize(12).fillColor("#590707").text("Daily task breakdown (rows = tasks, columns = dates)", { underline: true });
    doc.moveDown(0.3);

    const pageW = 545 - 50; // usable width between margins
    const labelW = 150;
    const totalW = 65;
    const gridW = pageW - labelW - totalW;
    const colCount = dates.length;
    const colW = colCount > 0 ? gridW / colCount : 0;
    const rowH = 16;

    const rowTop = doc.y;
    // Header row: "Task" + day numbers + "Total"
    doc.fontSize(7).fillColor("#590707");
    doc.text("Task", 50, rowTop, { width: labelW });
    dates.forEach((d, i) => {
      const day = d.slice(8);
      doc.text(day, 50 + labelW + i * colW, rowTop, { width: colW, align: "center" });
    });
    doc.text("Total", 50 + labelW + gridW, rowTop, { width: totalW, align: "right" });

    let yy = rowTop + rowH;
    doc.moveTo(50, yy).lineTo(545, yy).strokeColor("#E4DED4").lineWidth(0.5).stroke();

    gridRows.forEach((t) => {
      doc.fontSize(7).fillColor("#04090C");
      doc.text(t.task.length > 22 ? t.task.slice(0, 21) + "…" : t.task, 50, yy, { width: labelW });
      dates.forEach((d, i) => {
        const amt = t.days[d];
        if (amt) doc.text(Number(amt).toFixed(0), 50 + labelW + i * colW, yy, { width: colW, align: "center" });
      });
      const rowTotal = Object.values(t.days).reduce((s, v) => s + v, 0);
      doc.fillColor("#590707").text(Number(rowTotal).toFixed(2), 50 + labelW + gridW, yy, { width: totalW, align: "right" });
      doc.fillColor("#04090C");
      yy += rowH;
    });

    doc.moveTo(50, yy).lineTo(545, yy).strokeColor("#CDC7BD").lineWidth(1).stroke();
    yy += 4;
    doc.fontSize(9).fillColor("#590707");
    doc.text("Total incentive payout", 50, yy, { width: labelW + gridW, continued: false });
    doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, 50 + labelW + gridW, yy, { width: totalW, align: "right" });
    doc.moveDown(2.2);
  } else if (taskBreakdown.length) {
    // Fallback: per-task subtotals when no grid was supplied.
    doc.fontSize(12).fillColor("#590707").text("Per-task summary", { underline: true });
    doc.moveDown(0.2);
    taskBreakdown.forEach((t) => {
      doc.fontSize(10).fillColor("#04090C");
      doc.text(`${t.task}`, { continued: true, width: 360 });
      doc.text(`Rs. ${Number(t.total).toFixed(2)}`, { align: "right" });
    });
    doc.moveDown(0.6);
  }

  // Daily line items (detailed ledger).
  if (items.length) {
    doc.fontSize(12).fillColor("#590707").text("Daily entries", { underline: true });
    doc.moveDown(0.2);
    items.forEach((it) => {
      doc.fontSize(9).fillColor("#04090C");
      const left = `${String(it.date).slice(0, 10)}  ${it.task}`;
      doc.text(left, { continued: true, width: 400 });
      doc.text(`Rs. ${Number(it.amount).toFixed(2)}`, { align: "right" });
    });
    doc.moveDown(0.8);
  }

  if (!gridRows.length) {
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#CDC7BD").lineWidth(1).stroke();
    doc.moveDown(0.4);
    doc.fontSize(14).fillColor("#590707");
    doc.text("Total incentive payout", { continued: true, width: 400 });
    doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, { align: "right" });
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor("#736D66");
  doc.text("This is a system-generated payslip. Discrepancies should be raised with HR.", { align: "center" });

  doc.end();
}

module.exports = { toCsv, sendCsv, sendPayslipPdf };
