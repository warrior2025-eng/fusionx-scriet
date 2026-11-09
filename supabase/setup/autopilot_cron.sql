-- FusionX Autopilot, every 5 minutes (run in the Supabase SQL editor AFTER migration 0042).
-- Same setup as meeting_reminders_cron.sql: pg_cron runs inside the database, pg_net calls the website.
-- Running it again replaces the jobs; nothing is duplicated.

-- ── Part A: the engine itself (needs only pg_cron) ─────────────────────
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'fx-autopilot';
select cron.schedule('fx-autopilot', '*/15 * * * *', $$ select public.autopilot_tick(); $$);

-- ── Part B: emails and phone notifications at once ─────────────────────
-- Uses the 'fx_cron_secret' already in the vault for the other jobs.
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'fx-autopilot-send';
select cron.schedule(
  'fx-autopilot-send',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://fxscriet.com/api/cron/autopilot',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret'))
  );
  $$
);

-- ── Check ──────────────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job where jobname like 'fx-autopilot%';
