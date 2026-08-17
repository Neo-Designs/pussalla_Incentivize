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
    const pageW = 545 - 50; // usable width between margins
    const labelW = 150;
    const totalW = 65;
    const gridW = pageW - labelW - totalW;
    const colCount = dates.length;
    const colW = colCount > 0 ? gridW / colCount : 0;
    const rowH = 16;

    doc.fontSize(12).fillColor("#590707").text("Daily task breakdown (rows = tasks, columns = dates)", { underline: true });
    doc.fontSize(7).fillColor("#736D66").text("Each cell shows the number of times the task was done and the payout: count×amount (e.g. 2×90 = done twice, Rs. 90 total).", { width: pageW });
    doc.moveDown(0.3);

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
        const cell = t.days[d];
        if (cell) {
          const count = cell.count || (typeof cell === "number" ? null : 0);
          const amt = typeof cell === "number" ? cell : Number(cell.amount);
          const label = count && count > 1 ? `${count}×${amt.toFixed(0)}` : `${amt.toFixed(0)}`;
          doc.text(label, 50 + labelW + i * colW, yy, { width: colW, align: "center" });
        }
      });
      const rowTotal = Object.values(t.days).reduce((s, v) => s + (typeof v === "number" ? v : Number(v.amount)), 0);
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

  // Detailed itemized breakdown — a clean table (no checkmarks) listing every
  // day's work: date, task, units completed, incentive rate, daily earnings.
  // Sums into the grand total at the bottom.
  if (items.length) {
    const pageW = 545 - 50;
    const colDate = 70;
    const colTask = 165;
    const colUnits = 80;
    const colRate = 80;
    const colEarn = pageW - colDate - colTask - colUnits - colRate;
    const rowH = 15;
    const headColor = "#590707";
    const lineColor = "#E4DED4";

    doc.fontSize(12).fillColor(headColor).text("Detailed daily breakdown", { underline: true });
    doc.fontSize(7).fillColor("#736D66").text("Itemized per-day work: units completed, the incentive rate snapshot, and earnings for each task.", { width: pageW });
    doc.moveDown(0.3);

    let yy = doc.y;
    // Header row
    doc.fontSize(8).fillColor(headColor);
    doc.text("Date", 50, yy, { width: colDate });
    doc.text("Task", 50 + colDate, yy, { width: colTask });
    doc.text("Units", 50 + colDate + colTask, yy, { width: colUnits, align: "right" });
    doc.text("Rate", 50 + colDate + colTask + colUnits, yy, { width: colRate, align: "right" });
    doc.text("Earnings", 50 + colDate + colTask + colUnits + colRate, yy, { width: colEarn, align: "right" });
    yy += rowH;
    doc.moveTo(50, yy).lineTo(545, yy).strokeColor(lineColor).lineWidth(0.5).stroke();

    items.forEach((it) => {
      if (yy > 760) { doc.addPage(); yy = doc.y; }
      doc.fontSize(8).fillColor("#04090C");
      doc.text(String(it.date).slice(0, 10), 50, yy, { width: colDate });
      const tn = it.task.length > 30 ? it.task.slice(0, 29) + "…" : it.task;
      doc.text(tn, 50 + colDate, yy, { width: colTask });
      doc.text(`${Number(it.output).toFixed(2)} ${it.unit || ""}`, 50 + colDate + colTask, yy, { width: colUnits, align: "right" });
      doc.text(`Rs. ${Number(it.rate).toFixed(2)}`, 50 + colDate + colTask + colUnits, yy, { width: colRate, align: "right" });
      doc.fillColor(headColor).text(`Rs. ${Number(it.amount).toFixed(2)}`, 50 + colDate + colTask + colUnits + colRate, yy, { width: colEarn, align: "right" });
      doc.fillColor("#04090C");
      yy += rowH;
    });

    doc.moveTo(50, yy).lineTo(545, yy).strokeColor("#CDC7BD").lineWidth(1).stroke();
    // Only print a total footer here when the grid table above did not already
    // print one (avoids a duplicate "Total incentive payout" line).
    if (!gridRows.length) {
      yy += 4;
      doc.fontSize(9).fillColor(headColor);
      doc.text("Total incentive payout", 50, yy, { width: colDate + colTask + colUnits + colRate });
      doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, 50 + colDate + colTask + colUnits + colRate, yy, { width: colEarn, align: "right" });
    }
    doc.moveDown(2.2);
  }

  if (!gridRows.length && !items.length) {
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
