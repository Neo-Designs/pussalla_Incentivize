const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      }
);

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

async function ensureSchema() {
  try {
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;`);
    const { rows: nullTasks } = await pool.query(
      `SELECT id FROM tasks WHERE code IS NULL OR code = '' ORDER BY id`
    );
    for (const t of nullTasks) {
      const taskCode = `TSK-${String(t.id).padStart(3, "0")}`;
      await pool.query(`UPDATE tasks SET code = $1 WHERE id = $2`, [taskCode, t.id]);
    }
  } catch (err) {
    console.error("Schema initialization check error:", err.message);
  }
}

ensureSchema();

module.exports = { pool, ensureSchema };
