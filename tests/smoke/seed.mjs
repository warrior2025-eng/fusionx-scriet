// Fake people for the smoke tests, on the LOCAL test database only (run tests/meetings-polish/local/apply.mjs
// on a fresh database first). Passwords are the stand-in's fixed "test-password".
import fs from "node:fs";
import { STATE, one, q } from "./db.mjs";

export default async function seed() {
  const host = await one("select inet_server_addr()::text a, current_setting('port') p");
  if (host.p !== "5433") throw new Error("The smoke tests run only on the local test database (port 5433).");
  const person = async (key, name, skills = []) => {
    const existing = await one("select id from auth.users where email = $1", [`${key}@example.com`]);
    const id = existing?.id ?? (await one("insert into auth.users (email) values ($1) returning id", [`${key}@example.com`])).id;
    await q("insert into profiles (id, full_name, skills) values ($1, $2, $3) on conflict (id) do update set full_name = $2, skills = $3", [id, name, skills]);
    return id;
  };
  const P = {
    boss: await person("smoke-boss", "Sam Super", ["leadership"]),
    hoe: await person("smoke-hoe", "Hema Execution", ["planning"]),
    lead: await person("smoke-lead", "Lata Lead", ["design"]),
    d1: await person("smoke-d1", "Dev Designer", ["design", "canva"]),
    d2: await person("smoke-d2", "Dia Writer", ["writing", "social media"]),
    member: await person("smoke-member", "Manu Member"),
  };
  await q("insert into user_roles (user_id, role) values ($1, 'super_admin'), ($2, 'admin') on conflict do nothing", [P.boss, P.boss]);
  const group = async (slug) => (await one("select id from core_groups where slug = $1", [slug])).id;
  const core = await group("fusionx-core"), design = await group("design-branding");
  await q("insert into core_group_members (group_id, user_id, title) values ($1, $2, 'Head of Execution') on conflict do nothing", [core, P.hoe]);
  await q("insert into core_group_members (group_id, user_id, title, is_lead) values ($1, $2, 'Lead', true) on conflict do nothing", [design, P.lead]);
  for (const u of [P.d1, P.d2]) await q("insert into core_group_members (group_id, user_id) values ($1, $2) on conflict do nothing", [design, u]);
  fs.writeFileSync(STATE, JSON.stringify({ people: P }));
}
