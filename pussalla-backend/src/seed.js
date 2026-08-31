/**
 * Seeds the database with the same demo dataset used in the Incentivize
 * frontend prototype: 5 divisions, 30 employees, 11 tasks, a handful of
 * cross-assignments, and ~20 days of daily task logs.
 *
 * Run with: npm run seed
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { calcEngine } = require("./utils/calcEngine");
const { writeAudit } = require("./utils/audit");

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "Incentivize@123";

const DIVISIONS = [
  { code: "PPA", name: "Processing Plant A", description: "Poultry deboning, packing & dispatch" },
  { code: "LGT", name: "Logistics & Transport", description: "Fleet, delivery & loading operations" },
  { code: "CCU", name: "Cleaner Crew Unit", description: "Sanitation & facility upkeep" },
  { code: "HAT", name: "Hatchery", description: "Egg incubation & sorting" },
  { code: "FML", name: "Feed Mill", description: "Feed formulation & bagging" },
];

const FIRST = ["Nuwan","Kasun","Chamari","Dilani","Tharindu","Sanduni","Ruwan","Ishara","Chathura","Nadeesha","Lahiru","Hasini","Sampath","Iresha","Janaka","Nilmini","Roshan","Priyanka","Asela","Malithi","Chanaka","Vindya","Suresh","Dinusha","Buddhika","Erandi","Manoj","Thilini","Kavindu","Amaya"];
const LAST = ["Perera","Fernando","Silva","Jayasuriya","Bandara","Wickramasinghe","Gunasekara","Rathnayake","Dissanayake","Karunaratne","de Zoysa","Herath","Wijesinghe","Amarasinghe","Kodikara","Senanayake","Ekanayake","Munasinghe","Abeywardena","Rajapaksha","Weerasinghe","Gamage","Liyanage","Peiris","Wanigasekara","Alwis","Ranasinghe","Jayawardena","Kularatne","Samarasinghe"];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Clearing existing data...");
    await client.query(`TRUNCATE audit_logs, task_participants, daily_task_logs, cross_assignments, tasks, employees, divisions RESTART IDENTITY CASCADE`);

    console.log("Seeding divisions...");
    const divisionIds = {};
    for (const d of DIVISIONS) {
      const { rows } = await client.query(
        `INSERT INTO divisions (code, name, description) VALUES ($1,$2,$3) RETURNING id`,
        [d.code, d.name, d.description]
      );
      divisionIds[d.code] = rows[0].id;
    }

    console.log("Seeding employees...");
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const employeeIds = []; // parallel index -> db id
    let n = 1;
    async function addEmployee(role, divisionCode) {
      const fi = (n * 7 + 3) % FIRST.length, li = (n * 11 + 5) % LAST.length;
      const code = `EMP-${String(n).padStart(3, "0")}`;
      const name = `${FIRST[fi]} ${LAST[li]}`;
      const divId = divisionCode ? divisionIds[divisionCode] : null;
      const { rows } = await client.query(
        `INSERT INTO employees (code, name, home_division_id, role, password_hash)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [code, name, divId, role, passwordHash]
      );
      employeeIds.push(rows[0].id);
      n++;
      return rows[0].id;
    }

    await addEmployee("super_admin", null);       // EMP-001
    await addEmployee("hr", null);                 // EMP-002
    await addEmployee("admin", null);               // EMP-003
    for (const d of DIVISIONS) await addEmployee("supervisor", d.code); // EMP-004..008
    const divCycle = DIVISIONS.map((d) => d.code);
    for (let i = 0; i < 22; i++) await addEmployee("employee", divCycle[i % divCycle.length]); // EMP-009..030

    console.log(`Seeded ${employeeIds.length} employees. Default login password: "${DEFAULT_PASSWORD}"`);

    console.log("Seeding tasks...");
    const TASKS = [
      { div: "PPA", name: "Chicken Deboning (Individual)", type: 1, rate: 45, unit: "kg" },
      { div: "PPA", name: "Packing Line Output (Pool)", type: 2, rate: 18, unit: "kg" },
      { div: "PPA", name: "Processing Daily Target Bonus", type: 3, rate: 12, baseLimit: 2000, unit: "kg" },
      { div: "LGT", name: "Delivery Trips Completed", type: 1, rate: 350, unit: "trip" },
      { div: "LGT", name: "Loading Bay Team Output", type: 2, rate: 9, unit: "crate" },
      { div: "CCU", name: "Floor Area Cleaned", type: 1, rate: 6, unit: "sqm" },
      { div: "CCU", name: "Shift Cleaning Pool Bonus", type: 3, rate: 4, baseLimit: 500, unit: "sqm" },
      { div: "HAT", name: "Egg Sorting", type: 1, rate: 8, unit: "tray" },
      { div: "HAT", name: "Hatch Batch Pool", type: 2, rate: 5, unit: "egg" },
      { div: "FML", name: "Feed Bag Production", type: 1, rate: 22, unit: "bag" },
      { div: "FML", name: "Milling Batch Target Bonus", type: 3, rate: 3, baseLimit: 3000, unit: "kg" },
    ];
    const taskIds = {};
    let taskIdx = 1;
    for (const t of TASKS) {
      const code = `TSK-${String(taskIdx).padStart(3, "0")}`;
      taskIdx++;
      const { rows } = await client.query(
        `INSERT INTO tasks (code, division_id, name, task_type, rate, base_limit, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [code, divisionIds[t.div], t.name, t.type, t.rate, t.baseLimit || null, t.unit]
      );
      taskIds[t.name] = rows[0].id;
    }

    console.log("Seeding cross-assignments...");
    const hrId = employeeIds[1];
    const CROSS = [
      { emp: 24, from: "LGT", to: "CCU", date: "2026-08-06", shift: "Morning", note: "Cleaning surge before audit" },
      { emp: 30, from: "HAT", to: "PPA", date: "2026-08-07", shift: "Evening", note: "Packing line short-staffed" },
      { emp: 18, from: "FML", to: "LGT", date: "2026-08-08", shift: "Morning", note: "Extra delivery volume" },
      { emp: 26, from: "CCU", to: "PPA", date: "2026-08-09", shift: "Morning", note: "Deep-clean of chiller room complete, reassigned" },
    ];
    for (const c of CROSS) {
      await client.query(
        `INSERT INTO cross_assignments (employee_id, from_division_id, to_division_id, assignment_date, shift, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [employeeIds[c.emp - 1], divisionIds[c.from], divisionIds[c.to], c.date, c.shift, c.note, hrId]
      );
    }

    console.log("Seeding daily task logs...");
    const empId = (n1based) => employeeIds[n1based - 1];
    const supervisorFor = (divCode) => employeeIds[3 + divCycle.indexOf(divCode)];

    async function logIndividual(date, divCode, taskName, entries) {
      const taskRows = await client.query("SELECT * FROM tasks WHERE id=$1", [taskIds[taskName]]);
      const task = taskRows.rows[0];
      for (const en of entries) {
        const { total } = calcEngine(task, en.out, 1);
        const { rows } = await client.query(
          `INSERT INTO daily_task_logs (log_date, division_id, task_id, total_output, rate_snapshot, base_limit_snapshot, amount, entered_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [date, divisionIds[divCode], task.id, en.out, task.rate, task.base_limit, total, supervisorFor(divCode)]
        );
        await client.query(
          `INSERT INTO task_participants (daily_task_log_id, employee_id, share_amount) VALUES ($1,$2,$3)`,
          [rows[0].id, empId(en.e), total]
        );
      }
    }

    async function logGroup(date, divCode, taskName, totalOutput, workerNumbers) {
      const taskRows = await client.query("SELECT * FROM tasks WHERE id=$1", [taskIds[taskName]]);
      const task = taskRows.rows[0];
      const { total, perWorker } = calcEngine(task, totalOutput, workerNumbers.length);
      const { rows } = await client.query(
        `INSERT INTO daily_task_logs (log_date, division_id, task_id, total_output, rate_snapshot, base_limit_snapshot, amount, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [date, divisionIds[divCode], task.id, totalOutput, task.rate, task.base_limit, total, supervisorFor(divCode)]
      );
      for (const w of workerNumbers) {
        await client.query(
          `INSERT INTO task_participants (daily_task_log_id, employee_id, share_amount) VALUES ($1,$2,$3)`,
          [rows[0].id, empId(w), perWorker]
        );
      }
      return rows[0].id;
    }

    await logIndividual("2026-08-05", "PPA", "Chicken Deboning (Individual)", [{ e: 4, out: 62 }, { e: 5, out: 58 }]);
    await logGroup("2026-08-05", "PPA", "Packing Line Output (Pool)", 1250, [4, 5, 6]);
    await logIndividual("2026-08-05", "LGT", "Delivery Trips Completed", [{ e: 9, out: 3 }, { e: 10, out: 4 }]);
    await logIndividual("2026-08-05", "CCU", "Floor Area Cleaned", [{ e: 15, out: 180 }]);
    await logGroup("2026-08-06", "PPA", "Processing Daily Target Bonus", 2450, [4, 5, 6, 7]);
    await logGroup("2026-08-06", "LGT", "Loading Bay Team Output", 640, [9, 10, 11]);
    await logGroup("2026-08-06", "CCU", "Shift Cleaning Pool Bonus", 705, [15, 16, 24]);
    await logIndividual("2026-08-06", "HAT", "Egg Sorting", [{ e: 19, out: 95 }, { e: 20, out: 88 }]);
    const editableLogId = await logGroup("2026-08-07", "HAT", "Hatch Batch Pool", 3100, [19, 20, 21, 30]);
    await logIndividual("2026-08-07", "FML", "Feed Bag Production", [{ e: 25, out: 140 }, { e: 26, out: 132 }]);
    await logGroup("2026-08-07", "FML", "Milling Batch Target Bonus", 3650, [25, 26, 27]);
    await logIndividual("2026-08-07", "PPA", "Chicken Deboning (Individual)", [{ e: 6, out: 70 }, { e: 7, out: 61 }]);
    await logIndividual("2026-08-08", "LGT", "Delivery Trips Completed", [{ e: 11, out: 5 }, { e: 18, out: 3 }]);
    await logGroup("2026-08-08", "PPA", "Packing Line Output (Pool)", 1180, [4, 5, 6, 7]);
    await logIndividual("2026-08-08", "CCU", "Floor Area Cleaned", [{ e: 16, out: 210 }]);
    await logIndividual("2026-08-09", "HAT", "Egg Sorting", [{ e: 19, out: 101 }, { e: 21, out: 90 }]);
    const flaggedLogId = await logGroup("2026-08-09", "PPA", "Processing Daily Target Bonus", 2680, [4, 5, 6, 7, 26]);
    await logIndividual("2026-08-09", "FML", "Feed Bag Production", [{ e: 25, out: 150 }, { e: 27, out: 128 }]);
    await logGroup("2026-08-10", "LGT", "Loading Bay Team Output", 720, [9, 10, 11, 18]);
    await logGroup("2026-08-10", "CCU", "Shift Cleaning Pool Bonus", 810, [15, 16]);

    console.log("Seeding illustrative audit trail (incl. one flagged retroactive edit)...");
    await writeAudit(client, {
      action: "CREATE", entity: "tasks", entityId: taskIds["Shift Cleaning Pool Bonus"],
      divisionId: divisionIds.CCU, actorId: employeeIds[2], oldValues: null,
      newValues: { name: "Shift Cleaning Pool Bonus", rate: 4, baseLimit: 500 },
      note: "New tiered bonus task created", flagged: false,
    });
    await writeAudit(client, {
      action: "UPDATE", entity: "daily_task_logs", entityId: editableLogId,
      divisionId: divisionIds.HAT, actorId: supervisorFor("HAT"),
      oldValues: { totalOutput: 2900 }, newValues: { totalOutput: 3100 },
      note: "Corrected weigh-scale reading same evening", flagged: false,
    });
    await writeAudit(client, {
      action: "UPDATE", entity: "daily_task_logs", entityId: flaggedLogId,
      divisionId: divisionIds.PPA, actorId: supervisorFor("PPA"),
      oldValues: { totalOutput: 2350 }, newValues: { totalOutput: 2680 },
      note: "Retroactive change flagged for review", flagged: true,
    });

    await client.query("COMMIT");
    console.log("\nSeed complete.");
    console.log(`All employees share the password: ${DEFAULT_PASSWORD}`);
    console.log("Sample logins:");
    console.log("  Super Admin -> code EMP-001");
    console.log("  HR          -> code EMP-002");
    console.log("  Admin       -> code EMP-003");
    console.log("  Supervisor  -> code EMP-004 (Processing Plant A)");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
