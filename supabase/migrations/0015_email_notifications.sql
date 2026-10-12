-- Email for notifications.
--
-- Every row in `notifications` can also be sent to the person's email. The
-- site's server asks for a batch of unsent rows (claim_notification_emails),
-- sends them through the email provider, and hands back any that failed
-- (release_notification_emails) so they are tried again. Only the server's
-- service role can call those two functions: they return email addresses.
--
-- Because a notification now leaves the site as an email, writing one
-- directly is limited to staff. Until now any signed-in person could insert
-- a notification for anyone; the site itself never did that (members'
-- notifications are written by database functions), so nothing changes for
-- ordinary use.
--
-- Run once, as one piece.

begin;

alter table notifications
  add column emailed_at timestamptz,
  add column email_attempts smallint not null default 0;

-- What already exists counts as handled: no old notification is emailed.
update notifications set emailed_at = created_at;

create index idx_notifications_email_pending on notifications (created_at) where emailed_at is null;

-- A member may mark their own notifications read, but not touch the email
-- bookkeeping (resetting it would make the site send the email again).
create or replace function guard_notification_email_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.emailed_at := old.emailed_at;
    new.email_attempts := old.email_attempts;
  end if;
  return new;
end $$;
create trigger trg_guard_notification_email_columns before update on notifications
  for each row execute function guard_notification_email_columns();

-- Takes up to p_limit unsent notifications (at most three days old, tried
-- fewer than five times), marks them as sent, and returns them with the
-- address to send to. Two calls at the same moment never get the same row.
-- Rows for people with no email, or a deactivated account, are marked and
-- left out.
create or replace function claim_notification_emails(p_limit integer default 50)
returns table (id uuid, email text, full_name text, title text, body text, link text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select n.id
    from notifications n
    where n.emailed_at is null and n.email_attempts < 5 and n.created_at > now() - interval '3 days'
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    for update skip locked
  ), claimed as (
    update notifications n
    set emailed_at = now(), email_attempts = n.email_attempts + 1
    from picked
    where n.id = picked.id
    returning n.id, n.user_id, n.title, n.body, n.link
  )
  select c.id, u.email::text, p.full_name, c.title, c.body, c.link
  from claimed c
  join auth.users u on u.id = c.user_id
  left join profiles p on p.id = c.user_id
  where u.email is not null and coalesce(p.is_active, true);
end $$;

-- Puts notifications back in the queue after a failed send.
create or replace function release_notification_emails(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update notifications set emailed_at = null where id = any (p_ids);
$$;

-- Numbers for the admin panel. Counts only.
create or replace function notification_email_stats()
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'waiting', (select count(*) from notifications
                where emailed_at is null and email_attempts < 5 and created_at > now() - interval '3 days'),
    'gave_up', (select count(*) from notifications
                where emailed_at is null and email_attempts >= 5 and created_at > now() - interval '3 days'),
    'sent_today', (select count(*) from notifications
                   where email_attempts > 0 and emailed_at > now() - interval '24 hours'));
end $$;

revoke all on function
  claim_notification_emails(integer), release_notification_emails(uuid[]),
  notification_email_stats(), guard_notification_email_columns()
  from public, anon, authenticated;
grant execute on function claim_notification_emails(integer), release_notification_emails(uuid[]) to service_role;
grant execute on function notification_email_stats() to authenticated;

-- Direct inserts: staff only (see the note at the top).
drop policy "system inserts notifications" on notifications;
create policy "staff insert notifications" on notifications for insert with check (is_staff());

commit;
