Meeting room polish tests: the local stack they run against
==============================================================

Everything here is local and fake: a fresh Postgres, made-up people, LiveKit's dev
server and keys that exist only on this machine. Nothing touches the real Supabase
project or LiveKit Cloud.

Needs: Node 22+, Google Chrome, PostgreSQL 16 binaries, PostgREST (v12+), the LiveKit
server binary, and the "pg" npm package somewhere outside the project
(npm i --prefix <some folder> pg, then set FX_PG=<some folder> for every script here).

1. Database (port 5433)
     initdb -D <data dir> -U postgres -A trust -E UTF8 --locale=C
     pg_ctl -D <data dir> -o "-p 5433" -l pg.log start
     node tests/meetings-polish/local/apply.mjs

2. PostgREST (port 3055), with these environment variables:
     PGRST_DB_URI=postgres://postgres@127.0.0.1:5433/postgres
     PGRST_DB_SCHEMAS=public
     PGRST_DB_ANON_ROLE=anon
     PGRST_JWT_SECRET=local-test-secret-local-test-secret-0123456789
     PGRST_SERVER_PORT=3055
     PGRST_SERVER_HOST=127.0.0.1
   (On Windows, PostgREST needs the Postgres bin folder on PATH for libpq.dll.)

3. The Supabase stand-in (port 54321): node tests/meetings-polish/local/stack.mjs
   It writes the local keys to %TEMP%/fx-stack-keys.json (or FX_STACK_KEYS).

4. LiveKit (port 7880):
     LIVEKIT_KEYS="fxkey: fx-local-livekit-secret-NEVER-IN-CLIENT-0123456789"
     livekit-server --bind 127.0.0.1 --node-ip 127.0.0.1

5. Extra participants (port 3077): node tests/meetings-polish/local/bots.mjs <project dir>

6. The app (port 3100), built and started with:
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon from fx-stack-keys.json>
     SUPABASE_SERVICE_ROLE_KEY=<service from fx-stack-keys.json>
     NEXT_PUBLIC_SITE_URL=http://localhost:3100
     RESEND_API_KEY=            (empty: no email is sent)
     LIVEKIT_URL=ws://127.0.0.1:7880
     LIVEKIT_API_KEY=fxkey
     LIVEKIT_API_SECRET=fx-local-livekit-secret-NEVER-IN-CLIENT-0123456789
     CRON_SECRET=local-cron-secret
     npx next build && npx next start -p 3100

7. The tests: node tests/meetings-polish/run.mjs <project dir> <output dir>
   Each run needs a fresh database (step 1 again). The GIFs go to the output dir.
