const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");
const { calcEngine } = require("../utils/calcEngine");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();

// GET /api/daily-logs?date=2026-08-11&divisionId=1&subDivisionId=2&page=1&limit=50
router.get("/", requireAuth, async (req, res) => {
  const { page, limit, offset } = parsePagination(req);
  const { date, divisionId, subDivisionId } = req.query;
  const clauses = [];
  const params = [];
  if (date) { params.push(date); clauses.push(`l.log_date = $${params.length}`); }
  if (divisionId) { params.push(divisionId); clauses.push(`l.division_id = $${params.length}`); }
  if (subDivisionId) { params.push(subDivisionId); clauses.push(`l.sub_division_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const baseSelect = `FROM daily_task_logs l
     JOIN tasks t ON t.id = l.task_id
     LEFT JOIN task_participants p ON p.daily_task_log_id = l.id
     ${where}`;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT l.*, t.name AS task_name, t.unit, t.task_type,
       COALESCE(json_agg(json_build_object('employeeId', p.employee_id, 'share', p.share_amount))
         FILTER (WHERE p.id IS NOT NULL), '[]') AS participants
       ${baseSelect}
       GROUP BY l.id, t.name, t.unit, t.task_type
       ORDER BY l.log_date DESC, l.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(DISTINCT l.id)::int AS total ${baseSelect}`, params),
  ]);
  res.json({ rows, page, limit, total: countRows[0].total });
});

/**
 * POST /api/daily-logs
 * body: {
 *   date, divisionId, taskId,
 *   entries: [{ employeeId, output }]   // Type 1 - one or more individual rows
 *   OR
 *   totalOutput, participantIds: [ids]  // Type 2 / Type 3 - one pooled row
 *   participantIds: [ids]               // Type 4 - fixed rate each, one row
 * }
 */
router.post("/", requireAuth, requireRole("supervisor"), async (req, res) => {
  const { date, divisionId, taskId, entries } = req.body;
  let { totalOutput, participantIds } = req.body;
  if (!date || !divisionId || !taskId) {
    return res.status(400).json({ error: "date, divisionId and taskId are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: taskRows } = await client.query("SELECT * FROM tasks WHERE id=$1 AND active=true", [taskId]);
    const task = taskRows[0];
    if (!task) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Task not found" }); }

    const created = [];

    if (task.task_type === 1) {
      if (!Array.isArray(entries) || !entries.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "entries[] is required for a Type 1 task" });
      }
      for (const en of entries) {
        const { total } = calcEngine(task, en.output, 1);
        const { rows } = await client.query(
          `INSERT INTO daily_task_logs
            (log_date, division_id, sub_division_id, task_id, total_output, rate_snapshot, base_limit_snapshot, amount, entered_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [date, divisionId, task.sub_division_id, taskId, en.output, task.rate, task.base_limit, total, req.user.id]
        );
        const log = rows[0];
        await client.query(
          `INSERT INTO task_participants (daily_task_log_id, employee_id, share_amount) VALUES ($1,$2,$3)`,
          [log.id, en.employeeId, total]
        );
        await writeAudit(client, {
          action: "CREATE", entity: "daily_task_logs", entityId: log.id, divisionId,
          actorId: req.user.id, oldValues: null, newValues: log, note: "Daily individual output logged",
        });
        created.push(log);
      }
    } else {
      const isFixedRate = task.task_type === 4;
      const uniqueIds = Array.isArray(participantIds) ? [...new Set(participantIds.map(Number))] : [];
      if (!uniqueIds.length || (!isFixedRate && !totalOutput)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: isFixedRate
            ? "participantIds[] is required for a Type 4 (fixed daily rate) task"
            : "totalOutput and participantIds[] are required for Type 2/3 tasks",
        });
      }
      // A pooled task is logged once per day: a second entry would pay everyone twice.
      const { rows: dupRows } = await client.query(
        "SELECT id FROM daily_task_logs WHERE task_id=$1 AND log_date=$2 LIMIT 1", [taskId, date]
      );
      if (dupRows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "This task is already logged for that date. Edit or delete the existing entry instead." });
      }
      // Type 4 records the headcount as its output so reports show "N persons".
      const effectiveOutput = isFixedRate ? uniqueIds.length : totalOutput;
      participantIds = uniqueIds;
      totalOutput = effectiveOutput;
      const { total, perWorker } = calcEngine(task, totalOutput, participantIds.length);
      const { rows } = await client.query(
        `INSERT INTO daily_task_logs
          (log_date, division_id, sub_division_id, task_id, total_output, rate_snapshot, base_limit_snapshot, amount, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [date, divisionId, task.sub_division_id, taskId, totalOutput, task.rate, task.base_limit, total, req.user.id]
      );
      const log = rows[0];
      for (const empId of participantIds) {
        await client.query(
          `INSERT INTO task_participants (daily_task_log_id, employee_id, share_amount) VALUES ($1,$2,$3)`,
          [log.id, empId, perWorker]
        );
      }
      await writeAudit(client, {
        action: "CREATE", entity: "daily_task_logs", entityId: log.id, divisionId,
        actorId: req.user.id, oldValues: null, newValues: log, note: "Group task output logged",
      });
      created.push(log);
    }

    await client.query("COMMIT");
    res.status(201).json(created);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to save daily log(s)" });
  } finally {
    client.release();
  }
});

// PUT /api/daily-logs/:id   body: { totalOutput?, participantIds? }
// Change the units (birds / kg / output) and/or who took part, then recompute
// every share. Type 1 (individual) entries only take a new output; Type 4
// (fixed daily rate) entries only take a new participant list (the headcount
// becomes the output). Edits made on a calendar day AFTER the log's own date
// are flagged for the Super Admin audit dashboard.
router.put("/:id", requireAuth, requireRole("supervisor"), async (req, res) => {
  const { id } = req.params;
  const { totalOutput, participantIds, logDate: newDateRaw } = req.body;
  if (totalOutput == null && participantIds == null && newDateRaw == null) {
    return res.status(400).json({ error: "Nothing to update: send totalOutput, participantIds and/or logDate" });
  }
  if (newDateRaw != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(newDateRaw))) {
    return res.status(400).json({ error: "logDate must be YYYY-MM-DD" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: logRows } = await client.query("SELECT * FROM daily_task_logs WHERE id=$1 FOR UPDATE", [id]);
    const before = logRows[0];
    if (!before) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }

    const { rows: participantRows } = await client.query(
      "SELECT employee_id FROM task_participants WHERE daily_task_log_id=$1 ORDER BY employee_id", [id]
    );
    const beforeIds = participantRows.map((r) => Number(r.employee_id));

    // Calculate with the rate/base limit captured when the entry was made.
    const { rows: taskRows } = await client.query("SELECT task_type FROM tasks WHERE id=$1", [before.task_id]);
    const task = {
      task_type: Number(taskRows[0].task_type),
      rate: before.rate_snapshot,
      base_limit: before.base_limit_snapshot,
    };

    if (task.task_type === 1 && participantIds != null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Individual (Type 1) entries belong to one person — delete and re-log to change the employee." });
    }

    let nextIds = beforeIds;
    if (participantIds != null) {
      if (!Array.isArray(participantIds)) { await client.query("ROLLBACK"); return res.status(400).json({ error: "participantIds must be an array" }); }
      nextIds = [...new Set(participantIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!nextIds.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "At least one participant is required" }); }
      const { rows: found } = await client.query("SELECT id FROM employees WHERE id = ANY($1::int[])", [nextIds]);
      if (found.length !== nextIds.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "One or more selected employees no longer exist" }); }
    }

    let nextOutput = totalOutput != null ? Number(totalOutput) : Number(before.total_output);
    if (task.task_type === 4) nextOutput = nextIds.length;
    if (!Number.isFinite(nextOutput) || nextOutput < 0) { await client.query("ROLLBACK"); return res.status(400).json({ error: "totalOutput must be a number ≥ 0" }); }

    const nextDate = newDateRaw != null ? String(newDateRaw) : String(before.log_date).slice(0, 10);
    // Pooled tasks are logged once per task per day: moving onto a day that
    // already has this task would pay everyone twice.
    if (task.task_type !== 1 && nextDate !== String(before.log_date).slice(0, 10)) {
      const { rows: clash } = await client.query(
        "SELECT id FROM daily_task_logs WHERE task_id=$1 AND log_date=$2 AND id<>$3 LIMIT 1",
        [before.task_id, nextDate, id]
      );
      if (clash[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `This task is already logged on ${nextDate}. Edit that entry instead.` });
      }
    }

    const { total, perWorker } = calcEngine(task, nextOutput, nextIds.length);

    const { rows } = await client.query(
      `UPDATE daily_task_logs SET total_output=$1, amount=$2, log_date=$3, updated_at=now() WHERE id=$4 RETURNING *`,
      [nextOutput, total, nextDate, id]
    );
    const after = rows[0];

    if (participantIds != null) {
      await client.query("DELETE FROM task_participants WHERE daily_task_log_id=$1", [id]);
      await client.query(
        `INSERT INTO task_participants (daily_task_log_id, employee_id, share_amount)
         SELECT $1, unnest($2::int[]), $3`,
        [id, nextIds, perWorker]
      );
    } else {
      await client.query("UPDATE task_participants SET share_amount=$1 WHERE daily_task_log_id=$2", [perWorker, id]);
    }

    const { rows: todayRows } = await client.query("SELECT CURRENT_DATE AS today");
    const today = String(todayRows[0].today).slice(0, 10);
    const logDate = String(before.log_date).slice(0, 10);
    const flagged = logDate !== today;

    const added = nextIds.filter((x) => !beforeIds.includes(x));
    const removed = beforeIds.filter((x) => !nextIds.includes(x));
    await writeAudit(client, {
      action: "UPDATE", entity: "daily_task_logs", entityId: after.id, divisionId: after.division_id,
      actorId: req.user.id,
      oldValues: { logDate: String(before.log_date).slice(0, 10), totalOutput: before.total_output, amount: before.amount, participantIds: beforeIds },
      newValues: { logDate: nextDate, totalOutput: after.total_output, amount: after.amount, participantIds: nextIds, added, removed },
      note: (flagged ? "Retroactive edit made after the original log date" : "Same-day correction")
        + (added.length || removed.length ? ` (participants +${added.length}/-${removed.length})` : "")
        + (nextDate !== logDate ? ` (date ${logDate} → ${nextDate})` : ""),
      flagged,
    });

    await client.query("COMMIT");
    res.json(after);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to update log" });
  } finally {
    client.release();
  }
});

router.delete("/:id", requireAuth, requireRole("supervisor"), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM daily_task_logs WHERE id=$1", [id]);
    if (!rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    await client.query("DELETE FROM daily_task_logs WHERE id=$1", [id]);
    await writeAudit(client, {
      action: "DELETE", entity: "daily_task_logs", entityId: Number(id), divisionId: rows[0].division_id,
      actorId: req.user.id, oldValues: rows[0], newValues: null, note: "Log entry removed by supervisor",
    });
    await client.query("COMMIT");
    res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to delete log" });
  } finally {
    client.release();
  }
});

module.exports = router;
