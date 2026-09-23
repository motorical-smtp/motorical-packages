// packages/motorical-mcp/eval/db.js
//
// Read-only ground truth. The eval must be able to ask the platform what
// actually happened, independently of what the agent said happened.
// Runs from the Mac over the tailnet, or on ovh24 against localhost.
import pg from 'pg';

export async function connect() {
  const pool = new pg.Pool({
    connectionString: process.env.EVAL_DATABASE_URL,
    max: 2,
  });
  return {
    async oneOrNone(sql, params) {
      const r = await pool.query(sql, params);
      return r.rows[0] ?? null;
    },
    close: () => pool.end(),
  };
}
