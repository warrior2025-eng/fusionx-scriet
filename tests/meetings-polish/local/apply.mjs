// Applies stubs.sql and every migration to the local test Postgres (127.0.0.1:5433). Test use only:
// never point this at a real Supabase project.
//   node tests/meetings-polish/local/apply.mjs [migrations dir]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// "pg" is not a project dependency: FX_PG is a folder whose node_modules has it.
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ?? path.join(here, "../../../supabase/migrations");
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
await db.connect();
await db.query(fs.readFileSync(path.join(here, "stubs.sql"), "utf8"));
let last = "";
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.query(fs.readFileSync(path.join(dir, f), "utf8"));
    last = f;
  } catch (e) {
    console.log(`ERROR in ${f}: ${e.message}`);
    await db.end();
    process.exit(1);
  }
}
console.log("applied through", last);
await db.end();
