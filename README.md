# FusionX @ SCRIET

Official web platform for FusionX — Student Innovation & Research Network,
SCRIET, CCS University Meerut.

**"From Ideas to Impact." · "Don't just participate. Build."**

---

## What's actually built here

This is a real, working Next.js + Supabase codebase, not a mockup. Before you
treat any feature as done, here's the honest breakdown:

**Fully implemented — real queries, real auth, real RLS:**
- Public site: Home, About, Programs, Projects, Research & IP, Teams,
  Opportunities, Events, Founding Team, Resources, Join, Contact, Privacy,
  Terms — all reading live data from Supabase with correct empty states
  (never fake numbers or placeholder content).
- Auth: sign up, sign in, sign out, password reset request — via Supabase
  Auth, session handled through cookies, protected routes enforced in
  `proxy.ts` (Next 16's renamed `middleware.ts`).
- RBAC: `super_admin / admin / editor / faculty / mentor / member`, enforced
  in **three layers** — route gating in `proxy.ts`, role checks in
  `lib/permissions`, and Postgres Row Level Security in
  `supabase/migrations/0002_rls_policies.sql`. Never trust only one of these.
- Join FusionX: full application form, validated, stored, visible only to
  the applicant and staff, reviewable and status-updatable from
  `/admin/applications`, with a duplicate-submission guard and a honeypot
  field for basic spam resistance.
- Contact form, stored, staff-only readable.
- Admin dashboard: real metric counts (zero when empty), organization
  settings editable without a redeploy (institutional approval status,
  faculty guide, tagline, socials, announcement banner), moderation views
  for projects/events/opportunities/announcements.
- Faculty dashboard: read-oriented oversight, gated by the `faculty` role,
  does **not** imply admin rights.
- Database: full schema (23 tables) with UUIDs, timestamps, foreign keys,
  indexes, and an `organization_settings` singleton so admin-editable
  content never requires a code change.

**Scaffolded, not fully built out** — the tables, types, and RLS policies
exist and are ready to extend, but full create/edit UI wasn't built for
every single one in this pass:
- Research/IP full CRUD UI (research entries currently read-only on the
  public side; `research`, `research_authors`, `ip_records` tables and
  policies are ready)
- Project create/edit UI for members (public browse is done; owner-side
  create/edit is the natural next slice — `project_members` policies
  already support it)
- Team creation/invitation flow (browse is done; create/join UI is next)
- Event registration UI, mentor directory UI, notifications UI, audit log
  viewer UI, file uploads via Supabase Storage
- Global search across content types

If you pick this back up, each of those is a page and a server action away —
the hard part (schema, RLS, types, permission helpers) is done.

---

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack, React 19, TypeScript
  strict)
- **Styling:** Tailwind CSS v4 (CSS-first config in `app/globals.css`)
- **Backend:** Supabase (Postgres, Auth, Storage-ready, Row Level Security)
- **Validation:** Zod
- **Icons:** lucide-react
- **Deployment target:** Vercel

Note on Next.js 16: `middleware.ts` was renamed to `proxy.ts` in this
version (`export function proxy()` instead of `export function
middleware()`). This project already uses the new convention.

---

## Project structure

```
app/
  (public)/        marketing + content pages, wrapped in header/footer
  (auth)/          login, signup
  admin/           staff dashboard (role-gated in its own layout)
  faculty/         faculty oversight dashboard (role-gated)
actions/           server actions ("use server") - all writes go through these
components/
  ui/              low-level primitives (Button, Input, Badge, Section...)
  navigation/      header, footer
  forms/           client components wrapping useActionState + a server action
  admin/           admin-only interactive components
lib/
  supabase/        browser + server Supabase clients
  permissions/     RBAC helpers - always re-checked, never trust the client
  data/            read helpers (e.g. organization settings with fallback)
  validations/     Zod schemas shared by client forms and server actions
  site-config.ts   real, unfabricated static content (founders, programs...)
types/database.ts  hand-written types mirroring the schema
supabase/migrations/  run these three files in order against your project
proxy.ts           Next 16 middleware equivalent - session refresh + route gate
```

---

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in the Supabase values below
npm run dev
```

### 1. Create a Supabase project

Create a project at supabase.com (free tier is fine). From **Project
Settings -> API**, copy:

- `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY` (server-only, never
  expose to the client - used sparingly, see `lib/supabase/server.ts`)

### 2. Run the migrations

In the Supabase SQL editor (or via the CLI if you link the project), run,
**in this exact order**:

1. `supabase/migrations/0001_core_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. `supabase/migrations/0003_signup_trigger.sql`

This creates all tables, enables RLS with specific per-table policies (never
a blanket "allow authenticated" rule), and wires up automatic profile + base
role creation on sign-up.

### 3. Promote your own account

New accounts get the `member` role automatically. To reach `/admin` or
`/faculty`, grant yourself a role directly in SQL (there's intentionally no
self-service way to do this - see `user_roles` policies):

```sql
insert into user_roles (user_id, role)
values ('<your-auth-user-id>', 'super_admin');
```

### 4. Set organization details

Everything under **Admin -> Settings** (`/admin/settings`) is stored in the
`organization_settings` table and editable from the UI - chapter name,
tagline, Faculty Guide, **institutional approval status**, official email,
social links, and the site-wide announcement banner. This is deliberately
not hardcoded: approval status changes (Faculty Guide Confirmed -> Director
review pending -> Officially Approved) happen here, not in source code.

---

## Deployment (Vercel)

1. Push this repository to GitHub.
2. Import it in Vercel.
3. Add the four environment variables from `.env.example` in Vercel's
   Project Settings -> Environment Variables.
4. Deploy. Next.js builds cleanly with `next build` (verified locally with
   Turbopack) - the only thing that requires network access at build time
   is fetching Inter and Source Serif 4 from Google Fonts, which Vercel's
   build environment has.

---

## Security notes

- RLS is the real enforcement boundary. `lib/permissions` and `proxy.ts` are
  UX-layer conveniences (redirect before rendering, hide admin nav) - even
  if both were bypassed, RLS policies in `0002_rls_policies.sql` still block
  unauthorized reads/writes at the database.
- No secret keys are ever sent to the client. `SUPABASE_SERVICE_ROLE_KEY` is
  read only in server-only files and is not prefixed `NEXT_PUBLIC_*`.
- IP records (`ip_records` table) are never publicly readable, even when
  their parent project is published - visible only to the creator and
  staff.
- Forms use a honeypot field plus server-side Zod validation. For
  production, consider adding a rate limiter (e.g. Upstash's free tier) in
  front of `actions/application.ts` and `actions/contact.ts` if spam becomes
  an issue - the architecture doesn't require a paid service, but none is
  wired in by default.
- Applications have a partial unique index preventing more than one *open*
  application per email - re-applying after rejection is intentionally
  still possible.

---

## Content authenticity

Static organizational content lives only in `lib/site-config.ts` and
contains only facts that have actually been confirmed (founding members,
faculty guide, senior mentor, program names). No member counts, awards,
patents, partners, or approval statuses are hardcoded - those either come
from the database (and show a plain empty state when there's nothing yet)
or from `organization_settings`, which starts in the truthful default state
(**Faculty Guide Confirmed, Director review pending**) until an admin
updates it.

---

## Future scalability

The schema and RBAC model don't assume a single chapter. When FusionX
expands to other colleges, the natural extension is a `chapters` table with
a `chapter_id` foreign key added to the relevant tables (projects, teams,
events, etc.) - nothing in the current design has to be rebuilt for that.
