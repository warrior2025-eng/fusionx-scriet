// The local test database (127.0.0.1:5433) for the smoke tests. "pg" is not a project dependency:
// FX_PG is a folder whose node_modules has it (see README.md).
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
export const STATE = path.join(os.tmpdir(), "fx-smoke-state.json");
export const state = () => JSON.parse(fs.readFileSync(STATE, "utf8"));

export async function withDb(fn) {
  const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
  await db.connect();
  try { return await fn(db); } finally { await db.end(); }
}
export const q = (sql, params = []) => withDb(async (db) => (await db.query(sql, params)).rows);
export const one = async (sql, params = []) => (await q(sql, params))[0];

/** As a signed-in person (role authenticated, their id), the way PostgREST runs a request. */
export const as = (uid, sql, params = []) => withDb(async (db) => {
  await db.query("begin");
  await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true)`, [uid]);
  const rows = (await db.query(sql, params)).rows;
  await db.query("commit");
  return rows;
});

/** Runs Autopilot at a given (mocked) time. */
export const tick = (at) => one("select autopilot_tick($1::timestamptz) r", [at]).then((x) => x.r);

/** Signs in through the real login form. */
export async function signIn(page, key, next = "/my-work") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", `${key}@example.com`);
  await page.fill("#password", "test-password");
  await page.locator("form button[type=submit]").last().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}
