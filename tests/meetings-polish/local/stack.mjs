// A stand-in for the Supabase API in front of the local test Postgres:
//   /rest/v1/*     -> PostgREST (the real one), which enforces row level security
//   /auth/v1/*     -> a tiny sign-in service for the fake test accounts
//   /storage/v1/*  -> accepts uploads and hands out "signed" links (storage rules are tested in SQL)
// Test use only. Usage: node stack.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import os from "node:os";
import path from "node:path";
// "pg" is not a project dependency: FX_PG is a folder whose node_modules has it.
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");

const SECRET = "local-test-secret-local-test-secret-0123456789";
const PORT = 54321, REST = 3055;
const pool = new pg.Pool({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres", max: 4 });

const b64 = (v) => Buffer.from(v).toString("base64url");
const sign = (payload) => {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" })), body = b64(JSON.stringify(payload));
  return `${head}.${body}.${crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
const verify = (token) => {
  const [head, body, sig] = String(token ?? "").split(".");
  if (!sig || crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url") !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims;
};
const far = 4102444800;
export const KEYS = { anon: sign({ role: "anon", iss: "local", exp: far }), service: sign({ role: "service_role", iss: "local", exp: far }) };
fs.writeFileSync(process.env.FX_STACK_KEYS ?? path.join(os.tmpdir(), "fx-stack-keys.json"), JSON.stringify({ url: `http://127.0.0.1:${PORT}`, ...KEYS }));


const userJson = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.created_at, phone: "",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {}, identities: [],
  created_at: u.created_at, updated_at: u.created_at,
});
const session = (u) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: sign({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, exp, iss: "local" }),
    token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `refresh.${u.id}`, user: userJson(u),
  };
};
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });
const bearer = (req) => verify(String(req.headers.authorization ?? "").replace(/^Bearer /i, ""));
const files = new Map();
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

http.createServer(async (req, res) => {
  try {
    // Test only: a network delay like a server far from the database.
    if (process.env.FX_LATENCY) await new Promise((r) => setTimeout(r, Number(process.env.FX_LATENCY)));
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    if (p.startsWith("/rest/v1")) {
      const body = await readBody(req);
      const headers = { ...req.headers, host: `127.0.0.1:${REST}` };
      delete headers["content-length"];
      const upstream = await fetch(`http://127.0.0.1:${REST}${p.slice("/rest/v1".length) || "/"}${url.search}`, {
        method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      });
      const out = Buffer.from(await upstream.arrayBuffer());
      const h = Object.fromEntries(upstream.headers);
      delete h["content-encoding"]; delete h["transfer-encoding"]; delete h["content-length"];
      res.writeHead(upstream.status, h); return res.end(out);
    }

    if (p === "/auth/v1/token") {
      const data = JSON.parse((await readBody(req)).toString() || "{}");
      const grant = url.searchParams.get("grant_type");
      const { rows } = grant === "refresh_token"
        ? await pool.query("select * from auth.users where id::text = $1", [String(data.refresh_token ?? "").replace("refresh.", "")])
        : await pool.query("select * from auth.users where lower(email) = lower($1)", [data.email ?? ""]);
      if (!rows[0] || (grant === "password" && data.password !== "test-password")) return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      return json(res, 200, session(rows[0]));
    }
    if (p === "/auth/v1/user") {
      const claims = bearer(req);
      const { rows } = claims?.sub ? await pool.query("select * from auth.users where id = $1", [claims.sub]) : { rows: [] };
      return rows[0] ? json(res, 200, userJson(rows[0])) : json(res, 401, { message: "invalid JWT" });
    }
    if (p === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    if (p === "/auth/v1/admin/users") {
      if (bearer(req)?.role !== "service_role") return json(res, 401, { message: "not allowed" });
      const { rows } = await pool.query("select * from auth.users order by created_at");
      return json(res, 200, { users: rows.map(userJson), aud: "authenticated" });
    }

    // core-teams storage
    if (p.startsWith("/storage/v1/object/public/")) {
      const key = decodeURIComponent(p.slice("/storage/v1/object/public/".length));
      if (key.startsWith("avatars/demo/")) {
        const name = key.split("/").pop().replace(/\.svg$/, "");
        const hue = [...name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
        res.writeHead(200, { "Content-Type": "image/svg+xml" });
        return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="hsl(' + hue + ',55%,45%)"/><circle cx="100" cy="78" r="38" fill="#fff" opacity=".9"/><ellipse cx="100" cy="176" rx="66" ry="52" fill="#fff" opacity=".9"/></svg>');
      }
      if (!files.has(key)) return json(res, 404, { message: "not found" });
      res.writeHead(200, { "Content-Type": key.endsWith(".webp") ? "image/webp" : "image/png" });
      return res.end(files.get(key));
    }
    if (p.startsWith("/storage/v1/object/list/")) {
      const bucket = p.slice("/storage/v1/object/list/".length);
      const data = JSON.parse((await readBody(req)).toString() || "{}");
      const start = bucket + "/" + data.prefix + "/";
      return json(res, 200, [...files.keys()].filter((k) => k.startsWith(start)).map((k) => ({ name: k.slice(start.length), id: k })));
    }
    if (req.method === "DELETE" && p.startsWith("/storage/v1/object/")) {
      const bucket = p.slice("/storage/v1/object/".length);
      const data = JSON.parse((await readBody(req)).toString() || "{}");
      for (const name of data.prefixes ?? []) files.delete(bucket + "/" + name);
      return json(res, 200, (data.prefixes ?? []).map((name) => ({ name })));
    }
    if (p.startsWith("/storage/v1/object/sign/")) {
      const key = decodeURIComponent(p.slice("/storage/v1/object/sign/".length));
      if (req.method === "GET") { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(files.get(key) ?? PDF); }
      return bearer(req) ? json(res, 200, { signedURL: `/object/sign/${key}?token=local-test` }) : json(res, 400, { message: "not allowed" });
    }
    if (p.startsWith("/storage/v1/object/")) {
      const claims = bearer(req);
      const key = decodeURIComponent(p.slice("/storage/v1/object/".length));
      const [, owner] = key.split("/");
      const adminBucket = ["team-photos", "site-assets", "event-posters", "project-images"].includes(key.split("/")[0]);
      if (!claims?.sub || (!adminBucket && owner !== claims.sub)) return json(res, 400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      {
        const raw = await readBody(req);
        const boundary = /boundary=(.+)$/.exec(String(req.headers["content-type"] ?? ""))?.[1];
        let stored = raw;
        if (boundary) {
          // The part that has a file: from the blank line after its headers to the next boundary.
          const mark = Buffer.from("--" + boundary);
          let at = raw.indexOf(mark);
          while (at >= 0) {
            const next = raw.indexOf(mark, at + mark.length);
            if (next < 0) break;
            const head = raw.indexOf("\r\n\r\n", at);
            if (raw.subarray(at, head).toString("latin1").includes("filename=")) { stored = raw.subarray(head + 4, next - 2); break; }
            at = next;
          }
        }
        files.set(key, Buffer.from(stored));
      }
      return json(res, 200, { Key: key, Id: crypto.randomUUID() });
    }
    json(res, 404, { message: `not handled: ${p}` });
  } catch (error) {
    json(res, 500, { message: String(error?.message ?? error) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`local Supabase stand-in on http://127.0.0.1:${PORT}`));
