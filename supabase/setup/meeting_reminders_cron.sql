-- The meeting reminders, every minute (run in the Supabase SQL editor AFTER migration 0032).
-- Same setup as interview_reminders_cron.sql: pg_cron runs inside the database, pg_net calls the website.
--
-- Part A writes the reminders 10 minutes before, and closes meetings nobody ended.
-- Part B also sends the emails at once.

-- ── Part A (needs only pg_cron) ────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'fx-meeting-reminders';
select cron.schedule('fx-meeting-reminders', '* * * * *', $$ select public.send_meeting_reminders(); $$);

-- ── Part B: send the emails too ────────────────────────────────────────
-- Uses the 'fx_cron_secret' already in the vault for the interview reminders. If it is not there yet:
--      select vault.create_secret('<the CRON_SECRET value>', 'fx_cron_secret');
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'fx-meeting-reminder-emails';
select cron.schedule(
  'fx-meeting-reminder-emails',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://fxscriet.com/api/cron/meeting-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret'))
  );
  $$
);

-- ── Check ──────────────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job where jobname like 'fx-meeting%';
