# Smoke tests

These are Playwright tests for the whole site, including FusionX Autopilot. They run only against the local stack: a fresh local Postgres, the Supabase stand-in, and the app built against them. Every person in them is fake. Nothing here touches the real Supabase project.

## Run

The local stack is described in `tests/meetings-polish/local/README.txt`. LiveKit is not needed.

1. **Database.** Create a fresh database on port 5433, then apply every migration:

   ```sh
   node tests/meetings-polish/local/apply.mjs
   ```

2. **PostgREST.** Start it on port 3055.

3. **Supabase stand-in.** Start it on port 54321:

   ```sh
   node tests/meetings-polish/local/stack.mjs
   ```

4. **The app.** Build it and start it on port 3100. Set these environment variables:

   - the local keys from the stand-in
   - `CRON_SECRET=local-cron-secret`
   - `NEXT_PUBLIC_SITE_URL=http://localhost:3100`

5. **The tests.** Run these two commands:

   ```sh
   npm run test:autopilot
   npm run test:smoke
   ```

   - `test:autopilot` runs the engine checks in SQL with a mocked time.
   - `test:smoke` runs the browser tests in the Chrome already installed on the machine.
   - `node tests/autopilot/people.mjs` and `node tests/autopilot/outcomes.mjs` run the engine checks for PR 2 and PR 3.

   Build the app with `AI_GEMINI_BASE=http://127.0.0.1:4010` and any `GEMINI_API_KEY`. The tests start a local AI stand-in there (`mock-ai.mjs`), so no real AI or website is called.

Each run needs a fresh database (step 1 again). `FX_PG` must point to a folder whose `node_modules` has the `pg` package. `pg` is not a project dependency.

## What is covered

- **Sign-in and profile:** signing in and saving a profile.
- **Command Center:**
  - Today: approve a prepared mission, then "Approve all safe items".
  - Every tab loads.
  - Change plan: preview, then apply. Finished work is kept.
- **My work:**
  - Accept a task and submit its proof.
  - A peer approves it, and it becomes a contribution.
- **Control:** the master switch pauses the jobs, and a run at a mocked time does nothing.
- **Other pages:** a meeting room loads, and the public home page has no internal words.
- **App install:** the manifest and the service worker.
- **Phone notifications:**
  - The server makes its own push keys.
  - The private key is in no browser file.
  - A push reaches the subscribed test browser. This needs internet, because Chrome uses Google's push service.
- **WhatsApp:** the "Copy WhatsApp update" text.
- **People (PR 2):**
  - Open seat: opened by a lead, applied for by a community member, then accepted.
  - A community member sees only their own task and can take one community task.
  - A pitch is submitted and another member votes.
  - A project is created with a plan; a milestone done with proof sets its status.
- **Outcomes (PR 3):**
  - Now building, /impact and story pages contain no internal words.
  - The story page summary, the share card page and its 1200×627 image, and skill badges.
  - The verify page shows a certificate as valid, then as revoked.
  - The Outcomes tab loads and the Impact Report downloads as a PDF.
  - The Idea Engine makes 3 complete project ideas and 3 research topics with no invented DOIs. The radar keeps only items with an official link and an open deadline, merges repeats, sorts by value, and logs the grounding fallback.
  - The Near Meerut and Closing soon filters.
  - Analytics count only public pages.
