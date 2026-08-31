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

  // Usable text width between the 50pt left/right margins on A4.
  const pageW = 545 - 50;

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

  // Task x date grid — a compact "attendance" overview: one check mark per day
  // a task was done (matching the on-screen matrix). The detailed itemized
  // table below carries the exact units / rate / earnings, so the grid only
  // needs a legible mark. Marks are drawn as vector strokes (PDFKit's default
  // Helvetica has no ✓ glyph) and columns are sized to fit the page so day
  // numbers and marks never wrap or leak past the right margin, even for
  // 31-day months.
  if (gridRows.length) {
    const labelW = 130;
    const totalW = 55;
    const gridW = pageW - labelW - totalW;
    const colCount = dates.length;
    const colW = colCount > 0 ? gridW / colCount : 0;
    const rowH = 16;
    const gridLeft = 50 + labelW;
    const tickColor = "#2E7D32"; // pussalla green

    // Draw a small green check mark centred in the cell at (cx, cy).
    const drawTick = (cx, cy) => {
      const s = 4;
      doc.save().strokeColor(tickColor).lineWidth(1.4)
        .moveTo(cx - s, cy)
        .lineTo(cx - s / 3, cy + s / 1.6)
        .lineTo(cx + s, cy - s / 1.4)
        .stroke().restore();
    };

    doc.fontSize(12).fillColor("#590707").text("Daily task breakdown", 50, doc.y, { underline: true, width: pageW });
    doc.fontSize(7).fillColor("#736D66").text("Rows = tasks, columns = days (1–last). A ✓ marks a day the task was done; full units / rate / earnings are listed in the table below.", 50, doc.y, { width: pageW });
    doc.moveDown(0.3);

    const rowTop = doc.y;
    // Header row: "Task" + day numbers + "Total"
    doc.fontSize(7).fillColor("#590707");
    doc.text("Task", 50, rowTop, { width: labelW });
    dates.forEach((d, i) => {
      doc.text(String(d), gridLeft + i * colW, rowTop, { width: colW, align: "center" });
    });
    doc.text("Total", gridLeft + gridW, rowTop, { width: totalW, align: "right" });

    let yy = rowTop + rowH;
    doc.moveTo(50, yy).lineTo(545, yy).strokeColor("#E4DED4").lineWidth(0.5).stroke();

    gridRows.forEach((t) => {
      if (yy > 760) { doc.addPage(); yy = doc.y; }
      doc.fontSize(7).fillColor("#04090C");
      doc.text(t.task.length > 20 ? t.task.slice(0, 19) + "…" : t.task, 50, yy, { width: labelW });
      dates.forEach((d, i) => {
        if (t.days[d]) drawTick(gridLeft + i * colW + colW / 2, yy + rowH / 2);
      });
      const rowTotal = Object.values(t.days).reduce((s, v) => s + (typeof v === "number" ? v : Number(v.amount)), 0);
      doc.fillColor("#590707").text(Number(rowTotal).toFixed(2), gridLeft + gridW, yy, { width: totalW, align: "right" });
      doc.fillColor("#04090C");
      yy += rowH;
    });

    doc.moveTo(50, yy).lineTo(545, yy).strokeColor("#CDC7BD").lineWidth(1).stroke();
    yy += 4;
    doc.fontSize(9).fillColor("#590707");
    doc.text("Total incentive payout", 50, yy, { width: labelW + gridW });
    doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, gridLeft + gridW, yy, { width: totalW, align: "right" });
    doc.moveDown(2.2);
  } else if (taskBreakdown.length) {
    // Fallback: per-task subtotals when no grid was supplied.
    doc.fontSize(12).fillColor("#590707").text("Per-task summary", 50, doc.y, { underline: true, width: pageW });
    doc.moveDown(0.2);
    taskBreakdown.forEach((t) => {
      doc.fontSize(10).fillColor("#04090C");
      doc.text(`${t.task}`, 50, doc.y, { continued: true, width: 360 });
      doc.text(`Rs. ${Number(t.total).toFixed(2)}`, { align: "right" });
    });
    doc.moveDown(0.6);
  }

  // Detailed itemized breakdown — a clean table (no checkmarks) listing every
  // day's work: date, task, units completed, incentive rate, daily earnings.
  // Sums into the grand total at the bottom. Every cell is drawn with an
  // explicit width within [50, 545] so text/numbers never clip or leak past
  // the right edge, and rows paginate instead of running off the page.
  if (items.length) {
    const colDate = 50;
    const colTask = 110;
    const colUnits = 55;
    const colCount = 45;
    const colRate = 55;
    const colSplit = 55;
    const colLimit = 55;
    const colEarn = pageW - colDate - colTask - colUnits - colCount - colRate - colSplit - colLimit; // 70
    const colX = {
      date: 50,
      task: 50 + colDate,
      units: 50 + colDate + colTask,
      count: 50 + colDate + colTask + colUnits,
      rate: 50 + colDate + colTask + colUnits + colCount,
      split: 50 + colDate + colTask + colUnits + colCount + colRate,
      limit: 50 + colDate + colTask + colUnits + colCount + colRate + colSplit,
      earn: 50 + colDate + colTask + colUnits + colCount + colRate + colSplit + colLimit,
    };
    const rowH = 15;
    const headColor = "#590707";
    const lineColor = "#E4DED4";

    const headTop = doc.y;
    doc.fontSize(12).fillColor(headColor).text("Detailed daily breakdown", 50, headTop, { underline: true, width: pageW });
    doc.fontSize(7).fillColor("#736D66").text("Itemized per-day work: dates, task code/name, units, task count, rate per unit, divided amongst, base limit, and daily earnings.", 50, doc.y, { width: pageW });
    doc.moveDown(0.3);

    let yy = doc.y;
    // Header row
    doc.fontSize(7).fillColor(headColor);
    doc.text("Date", colX.date, yy, { width: colDate });
    doc.text("Task", colX.task, yy, { width: colTask });
    doc.text("Units", colX.units, yy, { width: colUnits, align: "right" });
    doc.text("Tasks Logged", colX.count, yy, { width: colCount, align: "right" });
    doc.text("Rate / Unit", colX.rate, yy, { width: colRate, align: "right" });
    doc.text("Divided", colX.split, yy, { width: colSplit, align: "center" });
    doc.text("Base Limit", colX.limit, yy, { width: colLimit, align: "right" });
    doc.text("Daily Earnings", colX.earn, yy, { width: colEarn, align: "right" });
    yy += rowH;
    doc.moveTo(50, yy).lineTo(545, yy).strokeColor(lineColor).lineWidth(0.5).stroke();

    items.forEach((it) => {
      if (yy > 760) { doc.addPage(); yy = doc.y; }
      doc.fontSize(7).fillColor("#04090C");
      doc.text(String(it.date).slice(0, 10), colX.date, yy, { width: colDate });
      const tLabel = `${it.taskCode ? "[" + it.taskCode + "] " : ""}${it.task}`;
      const tn = tLabel.length > 20 ? tLabel.slice(0, 19) + "…" : tLabel;
      doc.text(tn, colX.task, yy, { width: colTask });
      doc.text(`${Number(it.output).toFixed(1)} ${it.unit || ""}`, colX.units, yy, { width: colUnits, align: "right" });
      doc.text(String(it.count || 1), colX.count, yy, { width: colCount, align: "right" });
      doc.text(`Rs. ${Number(it.rate).toFixed(2)}`, colX.rate, yy, { width: colRate, align: "right" });
      const isGroup = it.taskType === 2 || it.taskType === 3;
      doc.text(isGroup ? `${it.participantCount || 1} worker(s)` : "—", colX.split, yy, { width: colSplit, align: "center" });
      doc.text(it.taskType === 3 && it.baseLimit != null ? `${it.baseLimit} ${it.unit || ""}` : "—", colX.limit, yy, { width: colLimit, align: "right" });
      doc.fillColor(headColor).text(`Rs. ${Number(it.amount).toFixed(2)}`, colX.earn, yy, { width: colEarn, align: "right" });
      doc.fillColor("#04090C");
      yy += rowH;
    });

    doc.moveTo(50, yy).lineTo(545, yy).strokeColor("#CDC7BD").lineWidth(1).stroke();
    // Print total footer
    if (!gridRows.length) {
      yy += 4;
      doc.fontSize(9).fillColor(headColor);
      doc.text("Monthly Total Earnings", colX.date, yy, { width: colDate + colTask + colUnits + colCount + colRate + colSplit + colLimit });
      doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, colX.earn, yy, { width: colEarn, align: "right" });
    }
    doc.moveDown(2.2);
  }

  if (!gridRows.length && !items.length) {
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#CDC7BD").lineWidth(1).stroke();
    doc.moveDown(0.4);
    doc.fontSize(14).fillColor("#590707");
    doc.text("Total incentive payout", 50, doc.y, { continued: true, width: pageW });
    doc.text(`Rs. ${Number(grandTotal).toFixed(2)}`, { align: "right" });
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor("#736D66");
  doc.text("This is a system-generated payslip. Discrepancies should be raised with HR.", { align: "center" });

  doc.end();
}

module.exports = { toCsv, sendCsv, sendPayslipPdf };
