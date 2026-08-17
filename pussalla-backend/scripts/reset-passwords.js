// Reset every employee's password to a single known value (default
// Incentivize@123). Use this to migrate an existing database off the old
// "Pussalla@123" password after the rebrand, without re-seeding.
//
//   PASSWORD=Incentivize@123 npm run reset-passwords
//
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../src/db");
const PASSWORD = process.env.PASSWORD || process.env.SEED_DEFAULT_PASSWORD || "Incentivize@123";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const { rowCount } = await pool.query(
    "UPDATE employees SET password_hash = $1, updated_at = now() WHERE password_hash IS DISTINCT FROM $1",
    [hash]
  );
  console.log(`Reset passwords for ${rowCount} employee(s). New login password: "${PASSWORD}"`);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to reset passwords:", err.message);
  process.exit(1);
});
