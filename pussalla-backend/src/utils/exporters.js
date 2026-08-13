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

// Render a payslip PDF to the response stream. `data` has employee + items.
function sendPayslipPdf(res, data) {
  const {
    company = "Pussalla Farms",
    employeeCode, employeeName, divisionName, month,
    items = [], taskBreakdown = [], grandTotal = 0,
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

  // Per-task subtotals
  if (taskBreakdown.length) {
    doc.fontSize(12).fillColor("#590707").text("Per-task summary", { underline: true });
    doc.moveDown(0.2);
    taskBreakdown.forEach((t) => {
      doc.fontSize(10).fillColor("#04090C");
      doc.text(`${t.task}`, { continued: true, width: 360 });
      doc.text(`Rs. ${Number(t.total).toFixed(2)}`, { align: "right" });
    });
    doc.moveDown(0.6);
  }

  // Line items
  doc.fontSize(12).fillColor("#590707").text("Daily entries", { underline: true });
  doc.moveDown(0.2);
  items.forEach((it) => {
    doc.fontSize(9).fillColor("#04090C");
    const left = `${String(it.date).slice(0, 10)}  ${it.task}`;
    doc.text(left, { continued: true, width: 400 });
    doc.text(`Rs. ${Number(it.amount).toFixed(2)}`, { align: "right" });
  });

  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#CDC7BD").lineWidth(1).stroke();
  doc.moveDown(0.4);
  doc.fontSize(14).fillColor("#590707");
  doc.text("Total incentive payout", { continued: true, width: 400 });
  doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, { align: "right" });

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor("#736D66");
  doc.text("This is a system-generated payslip. discrepancies should be raised with HR.", { align: "center" });

  doc.end();
}

module.exports = { toCsv, sendCsv, sendPayslipPdf };
