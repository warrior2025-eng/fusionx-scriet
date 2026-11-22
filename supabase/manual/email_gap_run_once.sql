-- A gap between announcement emails: run ONCE in the Supabase SQL Editor (the same as supabase/migrations/0052_email_gap.sql). Safe to run again. It works as soon as it runs; no deploy is needed.
begin;
-- A gap between announcement emails.
--
-- The announcements sent to every active member (new opportunities, the week's ideas, research topics) were
-- one email each, so a member got one or two a day. Now:
--   * Each is still a website notification at once, and a phone notification as before.
--   * Their email waits: one email per member, at 9:30 IST, at most once in 3 days, listing what came since
--     the last one (a single announcement keeps its own title).
--   * Everything personal (tasks, reviews, requests, meetings, interviews, results) is emailed at once, as
--     before, and goes ahead of announcements in the queue.
--   * "One daily digest" members get announcements in the same 3-day email, not in their daily one, and no
--     instant push for them, as before.
--
-- How: the newest announcement of a member carries the waiting email (email_after = when, email_summary =
-- the lines). An older waiting one is marked handled with no send attempt, so it is not counted as sent.
--
-- One nullable column and three replaced functions; no policy or trigger changes, no rows changed by running it.
-- Safe to run again. Re-running autopilot_all_in_one.sql would undo the gap: run this again after it.

alter table notifications add column if not exists email_summary text;

create or replace function ap_notify_everyone(p_title text, p_body text, p_link text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  u record; n integer := 0;
  gap constant integer := 3; -- days between announcement emails
  line text := left(regexp_replace(p_title, '\s+', ' ', 'g'), 200);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  morning timestamptz;
  earlier text; waiting_until timestamptz; last_sent timestamptz;
begin
  -- "Run all now" announces in parallel: one at a time, or a member would get two waiting emails.
  perform pg_advisory_xact_lock(hashtext('ap_notify_everyone'));

  -- The next 9:30 in the morning, India time.
  morning := (today + time '09:30') at time zone 'Asia/Kolkata';
  if morning < now() then morning := morning + interval '1 day'; end if;

  for u in
    select p.id, coalesce(w.delivery = 'daily', false) as daily
    from profiles p join auth.users a on a.id = p.id
    left join work_preferences w on w.user_id = p.id
    where p.is_active and not (p.id = any(ap_founders_in_exams()))
  loop
    -- Take over the email that is still waiting, keeping its time (so it can't be pushed back for ever).
    with old as (
      select x.id, x.email_summary, x.email_after, x.created_at from notifications x
      where x.user_id = u.id and x.email_summary is not null and x.emailed_at is null and x.email_attempts < 5
      for update
    ), handled as (
      update notifications x set emailed_at = now(), email_attempts = 0
      from old where x.id = old.id
      returning old.email_summary, old.email_after, old.created_at
    )
    select string_agg(h.email_summary, E'\n' order by h.created_at desc), min(h.email_after)
    into earlier, waiting_until from handled h;

    if waiting_until is null then
      -- The last announcement email really sent (the links cover those sent before this migration).
      select max(x.emailed_at) into last_sent from notifications x
      where x.user_id = u.id and x.email_attempts > 0 and x.emailed_at > now() - make_interval(days => gap + 1)
        and (x.email_summary is not null or x.link in ('/opportunities', '/my-work#ideas'));
      waiting_until := greatest(morning,
        (((last_sent at time zone 'Asia/Kolkata')::date + gap) + time '09:30') at time zone 'Asia/Kolkata');
    end if;

    insert into notifications (user_id, title, body, link, email_after, email_summary, pushed_at)
    values (u.id, left(p_title, 200), left(p_body, 1000), p_link, waiting_until,
            left(concat_ws(E'\n', line, earlier), 1000), case when u.daily then now() end);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- As in 0039, with three differences: the 3-day limit counts from when an email was due (a delayed one is not
-- dropped), personal emails go first, and an announcement email lists what it holds.
create or replace function claim_notification_emails(p_limit integer default 50, p_force boolean default false)
returns table (id uuid, email text, full_name text, title text, body text, link text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select n.id
    from notifications n
    where n.emailed_at is null and n.email_attempts < 5
      and greatest(n.created_at, n.email_after) > now() - interval '3 days'
      and (n.email_after is null or n.email_after <= now())
      and (coalesce(p_force, false) or n.email_tried_at is null
           or n.email_tried_at < now() - case n.email_attempts
                when 1 then interval '15 minutes' when 2 then interval '6 hours' else interval '24 hours' end)
    order by (n.email_summary is not null), n.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update skip locked
  ), claimed as (
    update notifications n
    set emailed_at = now(), email_tried_at = now(), email_attempts = n.email_attempts + 1
    from picked
    where n.id = picked.id
    returning n.id, n.user_id, n.title, n.body, n.link, n.email_summary, position(E'\n' in n.email_summary) > 0 as several
  )
  select c.id, u.email::text, p.full_name,
         case when c.several then 'What''s new on FusionX' else c.title end,
         case when c.several then '• ' || replace(c.email_summary, E'\n', E'\n• ') else c.body end,
         case when c.several then '/notifications' else c.link end
  from claimed c
  join auth.users u on u.id = c.user_id
  left join profiles p on p.id = c.user_id
  where u.email is not null and coalesce(p.is_active, true);
end $$;

-- As in 0015, but an email that is only waiting for its time is not shown to admins as stuck in the queue.
create or replace function notification_email_stats()
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'waiting', (select count(*) from notifications
                where emailed_at is null and email_attempts < 5 and (email_after is null or email_after <= now())
                  and greatest(created_at, email_after) > now() - interval '3 days'),
    'gave_up', (select count(*) from notifications
                where emailed_at is null and email_attempts >= 5
                  and greatest(created_at, email_after) > now() - interval '3 days'),
    'sent_today', (select count(*) from notifications
                   where email_attempts > 0 and emailed_at > now() - interval '24 hours'));
end $$;

revoke all on function ap_notify_everyone(text, text, text), claim_notification_emails(integer, boolean) from public, anon, authenticated;
grant execute on function ap_notify_everyone(text, text, text), claim_notification_emails(integer, boolean) to service_role;
commit;
