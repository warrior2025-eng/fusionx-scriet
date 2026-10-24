-- The interview reminders, every minute (run in the Supabase SQL editor AFTER migration 0027).
-- Free on Supabase: pg_cron runs inside the database; pg_net lets it call the website.
--
-- Part A is enough for the in-app reminders. Part B also sends their emails at once
-- (otherwise the emails go out with the next panel check, every 15–30 seconds, while a
-- panel member has the interview room open).

-- ── Part A: the reminders (needs only pg_cron) ─────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'fx-interview-reminders';
select cron.schedule('fx-interview-reminders', '* * * * *', $$ select public.send_interview_reminders(); $$);

-- ── Part B (optional): send the emails too, by calling the website every minute ──
-- 1. Make sure CRON_SECRET is set in Vercel (Production) and redeployed.
-- 2. Store the same value in the database vault (type it here yourself; never paste it in a chat):
--      select vault.create_secret('<the CRON_SECRET value>', 'fx_cron_secret');
-- 3. Then run:
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'fx-interview-reminder-emails';
select cron.schedule(
  'fx-interview-reminder-emails',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://fxscriet.com/api/cron/interview-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret'))
  );
  $$
);

-- ── Check ──────────────────────────────────────────────────────────────
-- The jobs:
--   select jobname, schedule, active from cron.job where jobname like 'fx-interview%';
-- Their last runs (status should be "succeeded"):
--   select j.jobname, d.status, d.start_time, d.return_message
--   from cron.job_run_details d join cron.job j on j.jobid = d.jobid
--   where j.jobname like 'fx-interview%' order by d.start_time desc limit 10;
-- Reminders sent today:
--   select count(*) from recruitment_slot_bookings where reminder_sent_at::date = current_date;
-- After the interviews, to stop them:
--   select cron.unschedule(jobid) from cron.job where jobname like 'fx-interview%';
