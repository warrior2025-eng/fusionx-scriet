-- FusionX Autopilot schedules (run in the Supabase SQL editor AFTER the migrations). Running it again replaces
-- the jobs; nothing is duplicated. pg_cron runs in UTC; the IST times are in the comments (IST = UTC + 5:30).
-- Uses the 'fx_cron_secret' already in the vault for the other jobs.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── The engine itself, every 15 minutes (needs only pg_cron) ───────────
select cron.unschedule(jobid) from cron.job where jobname = 'fx-autopilot';
select cron.schedule('fx-autopilot', '*/15 * * * *', $$ select public.autopilot_tick(); $$);

-- ── Website jobs ───────────────────────────────────────────────────────
-- One helper per call: GET https://fxscriet.com/api/cron/autopilot[?job=…] with the secret.
select cron.unschedule(jobid) from cron.job where jobname in
  ('fx-autopilot-send', 'fx-autopilot-tools', 'fx-autopilot-opportunities', 'fx-autopilot-cleanup', 'fx-autopilot-ai', 'fx-autopilot-ideas', 'fx-autopilot-research');

-- Emails and phone notifications, every 5 minutes.
select cron.schedule('fx-autopilot-send', '*/5 * * * *', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);
-- Tools Library, 6:00 IST daily (00:30 UTC).
select cron.schedule('fx-autopilot-tools', '30 0 * * *', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot?job=tools',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);
-- Opportunities, 7:00 IST daily (01:30 UTC).
select cron.schedule('fx-autopilot-opportunities', '30 1 * * *', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot?job=opportunities',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);
-- Deadline clean-up and 7-day purge, 00:05 IST daily (18:35 UTC the day before).
select cron.schedule('fx-autopilot-cleanup', '35 18 * * *', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot?job=cleanup',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);
-- FusionX AI knowledge refresh, 7:30 IST daily (02:00 UTC).
select cron.schedule('fx-autopilot-ai', '0 2 * * *', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot?job=ai',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);
-- Project ideas, Sunday 9:00 IST (03:30 UTC Sunday).
select cron.schedule('fx-autopilot-ideas', '30 3 * * 0', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot?job=ideas',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);
-- Research topics: every Sunday 9:10 IST; the website runs it only on the first Sunday of the month.
select cron.schedule('fx-autopilot-research', '40 3 * * 0', $$
  select net.http_get(url := 'https://fxscriet.com/api/cron/autopilot?job=research',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fx_cron_secret')),
    timeout_milliseconds := 290000);
$$);

-- ── Check ──────────────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job where jobname like 'fx-autopilot%' order by jobname;
