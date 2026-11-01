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

// PUT /api/daily-logs/:id   body: { totalOutput }
// Recomputes the amount/shares and writes an audit entry. Edits made on a
// calendar day AFTER the log's own date are automatically flagged for the
// Super Admin audit dashboard as a possible month-end manipulation.
router.put("/:id", requireAuth, requireRole("supervisor"), async (req, res) => {
  const { id } = req.params;
  const { totalOutput } = req.body;
  if (totalOutput == null) return res.status(400).json({ error: "totalOutput is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: logRows } = await client.query("SELECT * FROM daily_task_logs WHERE id=$1", [id]);
    const before = logRows[0];
    if (!before) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }

    const { rows: taskRows } = await client.query("SELECT * FROM tasks WHERE id=$1", [before.task_id]);
    const task = taskRows[0];

    const { rows: participantRows } = await client.query(
      "SELECT employee_id FROM task_participants WHERE daily_task_log_id=$1", [id]
    );
    const workerCount = participantRows.length;
    if (task.task_type === 4) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Type 4 (fixed daily rate) entries have no output to edit. Delete and re-log the entry to change who was present." });
    }
    const { total, perWorker } = calcEngine(task, totalOutput, workerCount);

    const { rows } = await client.query(
      `UPDATE daily_task_logs SET total_output=$1, amount=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [totalOutput, total, id]
    );
    const after = rows[0];

    await client.query(
      "UPDATE task_participants SET share_amount=$1 WHERE daily_task_log_id=$2",
      [perWorker, id]
    );

    const { rows: todayRows } = await client.query("SELECT CURRENT_DATE AS today");
    const today = String(todayRows[0].today).slice(0, 10);
    const logDate = String(before.log_date).slice(0, 10);
    const flagged = logDate !== today;

    await writeAudit(client, {
      action: "UPDATE", entity: "daily_task_logs", entityId: after.id, divisionId: after.division_id,
      actorId: req.user.id,
      oldValues: { totalOutput: before.total_output, amount: before.amount },
      newValues: { totalOutput: after.total_output, amount: after.amount },
      note: flagged ? "Retroactive edit made after the original log date" : "Same-day correction",
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
