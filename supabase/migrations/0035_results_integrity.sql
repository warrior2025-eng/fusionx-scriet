-- Results integrity: a decision changes only when someone means it to.
--
-- 1. A saved decision says what it was changing from; a row that moved since is refused.
-- 2. Every change to a decision is logged here, whichever function made it.
-- 3. Locking keeps a snapshot, and the database refuses any change while locked.
--    Publishing refuses if the decisions differ from the snapshot.
-- 4. A super admin can correct published results to the official list.
-- 5. A results poster, and the public list hidden some days after publishing.
--
-- No decision or result changes here. Corrections happen only through the admin tool.

begin;

-- ── columns ────────────────────────────────────────────────────────────
alter table recruitment_cycles
  add column results_poster_url text check (results_poster_url is null or results_poster_url ~* '^https?://\S+$'),
  add column results_poster_alt text check (results_poster_alt is null or char_length(results_poster_alt) <= 200),
  add column results_poster_only boolean not null default false,
  add column results_hide_after_days integer not null default 5 check (results_hide_after_days between 1 and 365),
  -- An admin's "Hide now" or "Show again", over the clock.
  add column results_public_override text check (results_public_override in ('hidden', 'shown'));

alter table recruitment_team_status drop constraint recruitment_team_status_decision_reason_check;
alter table recruitment_team_status add constraint recruitment_team_status_decision_reason_check
  check (decision_reason in ('absent', 'one_hub', 'override', 'declined', 'expired', 'removed', 'moved', 'correction'));

-- The new settings, like the other result settings, are for admins.
create function guard_recruitment_cycle_public()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.results_poster_url is distinct from old.results_poster_url
       or new.results_poster_alt is distinct from old.results_poster_alt
       or new.results_poster_only is distinct from old.results_poster_only
       or new.results_hide_after_days is distinct from old.results_hide_after_days
       or new.results_public_override is distinct from old.results_public_override) then
    raise exception 'Only an admin can change the result settings';
  end if;
  return new;
end $$;
create trigger trg_guard_recruitment_cycle_public before update on recruitment_cycles
  for each row execute function guard_recruitment_cycle_public();

-- ── what a row's decision is ───────────────────────────────────────────
create function recruitment_decision_of(p_stage recruitment_stage)
returns text language sql immutable as $$
  select case when p_stage in ('selected', 'waitlisted', 'not_selected') then p_stage::text else 'undecided' end;
$$;

create function recruitment_decision_label(p_decision text)
returns text language sql immutable as $$
  select case p_decision when 'selected' then 'Selected' when 'waitlisted' then 'Waitlisted' when 'not_selected' then 'Not selected' else 'Undecided' end;
$$;

-- ── the history ────────────────────────────────────────────────────────
create table recruitment_decision_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  team_id uuid not null references recruitment_teams(id) on delete cascade,
  from_decision text,
  to_decision text not null,
  by_user uuid references auth.users(id) on delete set null,
  at timestamptz not null default now(),
  source text not null,
  -- The hub whose save caused this, when it was another hub.
  origin_team_id uuid references recruitment_teams(id) on delete set null
);
create index idx_recruitment_decision_log_row on recruitment_decision_log (application_id, team_id, at desc);

alter table recruitment_decision_log enable row level security;
create policy "admins read the decision history" on recruitment_decision_log for select using (is_admin());
-- No write policies: only the trigger below writes it.
revoke all on recruitment_decision_log from anon;

-- Written for every change, so no function can change a decision without leaving a line.
create function recruitment_log_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  before_decision text := case when tg_op = 'UPDATE' then recruitment_decision_of(old.stage) end;
  after_decision text := recruitment_decision_of(new.stage);
  asked text := nullif(current_setting('fx.decision_source', true), '');
  origin uuid := nullif(current_setting('fx.decision_origin', true), '')::uuid;
  source text;
begin
  if before_decision is not distinct from after_decision then return new; end if;
  source := case
    when asked = 'correction' then 'correction'
    when new.decision_reason = 'one_hub' or (tg_op = 'UPDATE' and old.decision_reason = 'one_hub' and new.decision_reason is null and origin is distinct from new.team_id) then 'one_hub'
    when new.decision_reason = 'moved' then 'move'
    when new.decision_reason = 'absent' or (tg_op = 'UPDATE' and old.decision_reason = 'absent' and new.decision_reason is null and asked is null) then 'absent'
    when new.decision_reason = 'declined' then 'offer'
    when new.decision_reason = 'expired' then 'expired'
    when new.decision_reason = 'removed' then 'removed'
    when asked is not null then asked
    when new.added_by_admin or new.added_after_results then 'select_another'
    when tg_op = 'UPDATE' and new.promoted_at is distinct from old.promoted_at then 'promote'
    when tg_op = 'UPDATE' and new.offer_status is distinct from old.offer_status then 'offer'
    else 'review' end;
  insert into recruitment_decision_log (application_id, team_id, from_decision, to_decision, by_user, source, origin_team_id)
  values (new.application_id, new.team_id, before_decision, after_decision, auth.uid(), source,
          case when origin is distinct from new.team_id then origin end);
  return new;
end $$;
create trigger trg_recruitment_log_decision after insert or update on recruitment_team_status
  for each row execute function recruitment_log_decision();

-- ── locked means locked ────────────────────────────────────────────────
-- At the database, whoever is asking and whichever function is doing it. After the results
-- are out the lock has done its job: offers, promotions and corrections go on.
create function recruitment_guard_locked_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cyc uuid;
begin
  if tg_op = 'UPDATE' and recruitment_decision_of(old.stage) = recruitment_decision_of(new.stage) then return new; end if;
  select a.cycle_id into cyc from recruitment_applications a where a.id = new.application_id;
  if exists (select 1 from recruitment_cycles c where c.id = cyc and c.decisions_locked) and not recruitment_results_visible(cyc) then
    raise exception 'Decisions are locked. Unlock them first, with a reason';
  end if;
  return new;
end $$;
create trigger trg_recruitment_guard_locked_decision before insert or update on recruitment_team_status
  for each row execute function recruitment_guard_locked_decision();

-- ── saving one decision ────────────────────────────────────────────────
-- p_expected is the value the row was showing. If it has moved since, nothing is overwritten.
drop function set_final_decision(uuid, uuid, text, text, text, text, text);
create function set_final_decision(
  p_application uuid, p_team uuid, p_decision text, p_note text default null, p_reason text default null,
  p_hubs text default null, p_hubs_reason text default null, p_expected text default null, p_source text default 'board')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  now_is recruitment_stage;
begin
  if auth.uid() is null or not (is_admin() or is_team_reviewer(p_team)) then raise exception 'FORBIDDEN'; end if;
  if p_source not in ('board', 'bulk') then raise exception 'Unknown source'; end if;
  select stage into now_is from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if found and p_expected is not null and recruitment_decision_of(now_is) <> p_expected then
    raise exception 'This row changed since you opened the page (now: %). Reload to see the latest.', recruitment_decision_label(recruitment_decision_of(now_is));
  end if;
  perform set_config('fx.decision_source', p_source, true);
  perform set_config('fx.decision_origin', p_team::text, true);
  return recruitment_apply_decision(p_application, p_team, p_decision, p_note, p_reason, auth.uid(), is_admin(), p_hubs, p_hubs_reason);
end $$;

create or replace function bulk_mark_undecided(p_cycle uuid, p_team uuid default null, p_decision text default 'not_selected')
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  perform recruitment_assert_editable(p_cycle);
  if p_decision not in ('selected', 'waitlisted', 'not_selected') then raise exception 'Unknown decision'; end if;
  perform set_config('fx.decision_source', 'bulk', true);
  for r in
    select s.application_id, s.team_id
    from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
    where a.cycle_id = p_cycle and a.status = 'submitted' and s.stage not in ('selected', 'waitlisted', 'not_selected')
      and (p_team is null or s.team_id = p_team)
    order by a.submitted_at, s.rank
  loop
    perform set_config('fx.decision_origin', r.team_id::text, true);
    perform recruitment_apply_decision(r.application_id, r.team_id, p_decision, null, null, auth.uid(), true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Moved on from any page: is what this board shows still what is stored?
create function results_board_stamp(p_cycle uuid)
returns timestamptz language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select max(l.at) from recruitment_decision_log l join recruitment_applications a on a.id = l.application_id where a.cycle_id = p_cycle);
end $$;

-- ── the snapshot ───────────────────────────────────────────────────────
create table recruitment_lock_snapshots (
  cycle_id uuid primary key references recruitment_cycles(id) on delete cascade,
  decisions jsonb not null,
  taken_at timestamptz not null default now(),
  taken_by uuid references auth.users(id) on delete set null
);
alter table recruitment_lock_snapshots enable row level security;
create policy "admins read the lock snapshot" on recruitment_lock_snapshots for select using (is_admin());
revoke all on recruitment_lock_snapshots from anon;

create function recruitment_decisions_now(p_cycle uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_object_agg(s.application_id::text || ':' || s.team_id::text, recruitment_decision_of(s.stage)), '{}'::jsonb)
  from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
  where a.cycle_id = p_cycle and a.status = 'submitted';
$$;

-- What differs from the snapshot. Someone who withdrew after locking is not a difference.
create function recruitment_snapshot_diff(p_cycle uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('application_id', s.application_id, 'team_id', s.team_id, 'name', a.full_name, 'hub', t.name,
      'locked', coalesce(k.decisions ->> (s.application_id::text || ':' || s.team_id::text), 'none'), 'now', recruitment_decision_of(s.stage))
      order by t.name, a.full_name), '[]'::jsonb)
  from recruitment_lock_snapshots k
  join recruitment_applications a on a.cycle_id = k.cycle_id and a.status = 'submitted'
  join recruitment_team_status s on s.application_id = a.id
  join recruitment_teams t on t.id = s.team_id
  where k.cycle_id = p_cycle
    and (k.decisions ->> (s.application_id::text || ':' || s.team_id::text)) is distinct from recruitment_decision_of(s.stage);
$$;

create function results_snapshot_diff(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return recruitment_snapshot_diff(p_cycle);
end $$;

create or replace function lock_decisions(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare swept integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if recruitment_results_visible(p_cycle) then raise exception 'Results are already out'; end if;
  swept := recruitment_sweep_absent(p_cycle);
  perform recruitment_system(true);
  update recruitment_cycles set decisions_locked = true, decisions_locked_at = now() where id = p_cycle;
  perform recruitment_system(false);
  insert into recruitment_lock_snapshots (cycle_id, decisions, taken_by)
  values (p_cycle, recruitment_decisions_now(p_cycle), auth.uid())
  on conflict (cycle_id) do update set decisions = excluded.decisions, taken_at = now(), taken_by = excluded.taken_by;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'locked_decisions', 'recruitment_cycles', p_cycle::text,
          jsonb_build_object('note', case when swept > 0 then swept || ' absent decision(s) applied' else 'locked' end));
  return recruitment_readiness(p_cycle);
end $$;

create or replace function unlock_decisions(p_cycle uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c recruitment_cycles%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for unlocking'; end if;
  select * into c from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if recruitment_results_visible(p_cycle) then raise exception 'Results are already out'; end if;
  if c.results_scheduled then raise exception 'Cancel the schedule first'; end if;
  perform recruitment_system(true);
  update recruitment_cycles set decisions_locked = false, decisions_locked_at = null where id = p_cycle;
  perform recruitment_system(false);
  delete from recruitment_lock_snapshots where cycle_id = p_cycle;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'unlocked_decisions', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', left(trim(p_reason), 500)));
end $$;

create or replace function recruitment_assert_ready(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb := recruitment_readiness(p_cycle); c recruitment_cycles%rowtype;
begin
  select * into c from recruitment_cycles where id = p_cycle;
  if c.status = 'draft' then raise exception 'A draft cycle has no results'; end if;
  if c.status = 'open' and (c.closes_at is null or c.closes_at > now()) then raise exception 'Registration is still open. Close it first'; end if;
  if not (r ->> 'locked')::boolean then raise exception 'Lock decisions first'; end if;
  if (r ->> 'conflicts')::integer > 0 then
    raise exception '% candidate(s) are selected in two hubs. Keep one hub for each first', r ->> 'conflicts';
  end if;
  if (r ->> 'undecided')::integer > 0 then
    raise exception '% decision(s) are still undecided. Decide them, or mark the rest, first', r ->> 'undecided';
  end if;
  if jsonb_array_length(recruitment_snapshot_diff(p_cycle)) > 0 then
    raise exception 'Decisions changed after locking. Review again.';
  end if;
end $$;

-- At the publish time. A snapshot that no longer matches stops it and tells the admins.
create or replace function recruitment_finalize(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c recruitment_cycles%rowtype; r record; sent integer := 0;
begin
  if not exists (select 1 from recruitment_cycles where id = p_cycle and results_scheduled and results_published_at is null
                 and results_publish_at is not null and results_publish_at <= now()) then
    return 0;
  end if;
  select * into c from recruitment_cycles where id = p_cycle for update skip locked;
  if not found or c.results_published_at is not null then return 0; end if;

  if jsonb_array_length(recruitment_snapshot_diff(p_cycle)) > 0 then
    perform recruitment_system(true);
    update recruitment_cycles set results_scheduled = false where id = p_cycle;
    perform recruitment_system(false);
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (null, 'results_publish_refused', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', 'Decisions changed after locking'));
    insert into notifications (user_id, title, body, link)
    select r2.user_id, 'Results were not published', 'Decisions changed after locking. Review again.', '/admin/recruitment/' || p_cycle || '/results'
    from user_roles r2 where r2.role in ('admin', 'super_admin');
    return 0;
  end if;

  perform recruitment_system(true);
  update recruitment_cycles set status = 'results_published', results_published_at = now() where id = p_cycle;
  perform recruitment_system(false);
  update recruitment_team_status s set offer_status = 'pending'
  from recruitment_applications a
  where a.id = s.application_id and a.cycle_id = p_cycle and a.status = 'submitted' and s.stage = 'selected' and s.offer_status is null;

  for r in select a.id, a.user_id from recruitment_applications a where a.cycle_id = p_cycle and a.status = 'submitted' loop
    insert into notifications (user_id, title, body, link)
    values (r.user_id, 'Recruitment results are out', recruitment_result_message(r.id), '/recruitment/status');
    sent := sent + 1;
  end loop;

  -- Recorded as the system: the first visit after the time may be what triggered it.
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (null, 'results_published', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', sent || ' candidate(s) notified'));
  return sent;
end $$;

-- ── the public page ────────────────────────────────────────────────────
create function recruitment_public_hidden(c recruitment_cycles)
returns boolean language sql stable as $$
  select case c.results_public_override when 'hidden' then true when 'shown' then false
    else coalesce(c.results_published_at, c.results_publish_at) + make_interval(days => c.results_hide_after_days) <= now() end;
$$;

create or replace function recruitment_public_results_for(p_cycle uuid, p_force boolean)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare c recruitment_cycles%rowtype; hubs jsonb; people integer; places integer;
begin
  select * into c from recruitment_cycles where id = p_cycle and status <> 'draft';
  if not found then return jsonb_build_object('state', 'none'); end if;
  if not recruitment_results_visible(p_cycle) and not p_force then
    return jsonb_build_object('state', 'pending', 'cycle_title', c.title, 'publish_at', c.results_publish_at, 'scheduled', c.results_scheduled);
  end if;
  if not p_force and coalesce(recruitment_public_hidden(c), false) then
    return jsonb_build_object('state', 'hidden', 'cycle_title', c.title, 'publish_at', c.results_publish_at);
  end if;

  select coalesce(jsonb_agg(h order by h_order, h_name), '[]'::jsonb) into hubs
  from (
    select t.display_order as h_order, t.name as h_name, jsonb_build_object(
      'team_id', t.id, 'name', t.name, 'emoji', t.emoji,
      'selected', case when c.show_selected_publicly then coalesce((
          select jsonb_agg(trim(a.full_name) order by lower(trim(a.full_name)))
          from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
          where s.team_id = t.id and s.stage = 'selected' and a.status = 'submitted' and a.public_consent
            and coalesce(trim(a.full_name), '') <> ''), '[]'::jsonb) else '[]'::jsonb end,
      'selected_total', (select count(*) from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
          where s.team_id = t.id and s.stage = 'selected' and a.status = 'submitted'),
      'waitlist', case when c.show_waitlist_publicly then coalesce((
          select jsonb_agg(jsonb_build_object('name', trim(a.full_name), 'rank', s.waitlist_rank) order by s.waitlist_rank)
          from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
          where s.team_id = t.id and s.stage = 'waitlisted' and a.status = 'submitted' and a.public_consent
            and coalesce(trim(a.full_name), '') <> ''), '[]'::jsonb) else '[]'::jsonb end,
      'waitlist_total', (select count(*) from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
          where s.team_id = t.id and s.stage = 'waitlisted' and a.status = 'submitted')
    ) as h
    from recruitment_teams t where t.cycle_id = p_cycle and t.is_visible
  ) x;

  select count(distinct s.application_id), count(*) into people, places
  from recruitment_team_status s
  join recruitment_applications a on a.id = s.application_id
  join recruitment_teams t on t.id = s.team_id
  where t.cycle_id = p_cycle and t.is_visible and s.stage = 'selected' and a.status = 'submitted';

  return jsonb_build_object(
    'state', case when recruitment_results_visible(p_cycle) then 'published' else 'preview' end,
    'cycle_title', c.title, 'publish_at', c.results_publish_at,
    'show_selected', c.show_selected_publicly, 'show_waitlist', c.show_waitlist_publicly, 'hubs', hubs,
    'selected_people', people, 'selected_places', places,
    'poster', case when c.results_poster_url is not null then jsonb_build_object('url', c.results_poster_url, 'alt', c.results_poster_alt, 'only', c.results_poster_only) end);
end $$;

-- "Hide now" and "Show again". Null goes back to the clock.
create function results_set_public_override(p_cycle uuid, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_value is not null and p_value not in ('hidden', 'shown') then raise exception 'Unknown choice'; end if;
  update recruitment_cycles set results_public_override = p_value where id = p_cycle;
  if not found then raise exception 'Recruitment not found'; end if;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'set_results_public', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', coalesce(p_value, 'by the clock')));
end $$;

-- ── correcting published results ───────────────────────────────────────
create table recruitment_official_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 120),
  -- [{ "hub": "Design & Branding", "names": ["…"] }]
  hubs jsonb not null,
  created_at timestamptz not null default now()
);
alter table recruitment_official_lists enable row level security;
create policy "super admins read official lists" on recruitment_official_lists for select using (is_super_admin());
revoke all on recruitment_official_lists from anon;

insert into recruitment_official_lists (name, hubs) values ('Official selection list 2026', '[
  {"hub": "Projects, Research & Startups", "names": ["Swarashtra Singh", "Vaishnavi Srivastava", "Yatipriya", "Akriti Singh", "Anurag Prajapati", "Md Asad Ayan", "Babli Singh", "Prachi Kuntal", "Priya Maity", "Anushka Gupta", "Neha Ponia", "Aditya Raj Srivastava"]},
  {"hub": "FusionX Event Crew", "names": ["Ayush Kumar Chawala", "Priya Maity", "Anushka Gupta", "Shubham Vishwakarma"]},
  {"hub": "Competitions & Opportunities", "names": ["Anuj Chaudhary", "Ayush Suryavanshi", "Gaurav Raj", "Swarashtra Singh"]},
  {"hub": "Design & Branding", "names": ["Tanya Tiwari", "Satyam Kandu", "Aryan"]}
]'::jsonb);

-- p_items: [{ application_id, team_id, from, to }], to being selected or not_selected.
-- p_notices: [{ application_id, message }], only for people in p_items and only those chosen.
-- All of it or none of it. Ignores the one-hub rule: the list decides.
create function apply_result_corrections(p_cycle uuid, p_reason text, p_items jsonb, p_notices jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  why text := left(trim(coalesce(p_reason, '')), 500);
  item jsonb; app recruitment_applications%rowtype; cur recruitment_team_status%rowtype;
  hub text; going text; had boolean; was text; told integer := 0; changed integer := 0; n jsonb;
begin
  if not is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if why = '' then raise exception 'Give a reason for the corrections'; end if;
  if not recruitment_results_visible(p_cycle) then raise exception 'Corrections are for results that are out'; end if;
  perform set_config('fx.decision_source', 'correction', true);

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    going := item ->> 'to';
    if going not in ('selected', 'not_selected') then raise exception 'Unknown decision'; end if;
    select * into app from recruitment_applications where id = (item ->> 'application_id')::uuid and cycle_id = p_cycle;
    if not found or app.status <> 'submitted' then raise exception 'One of these candidates is no longer in this recruitment'; end if;
    select t.name into hub from recruitment_teams t where t.id = (item ->> 'team_id')::uuid and t.cycle_id = p_cycle;
    if hub is null then raise exception 'One of these hubs is not in this recruitment'; end if;

    select * into cur from recruitment_team_status where application_id = app.id and team_id = (item ->> 'team_id')::uuid for update;
    had := found;
    was := case when had then recruitment_decision_of(cur.stage) else 'none' end;
    if was is distinct from item ->> 'from' then
      raise exception '% in %: this row changed since you opened the page (now: %). Reload to see the latest.', app.full_name, hub, recruitment_decision_label(was);
    end if;

    if not had then
      if going = 'not_selected' then continue; end if;
      insert into recruitment_team_status (application_id, team_id, rank, stage, added_by_admin, added_reason, offer_status, promoted_at, added_after_results, decided_by, decided_at)
      values (app.id, (item ->> 'team_id')::uuid, (select coalesce(max(s.rank), 0) + 1 from recruitment_team_status s where s.application_id = app.id),
              'selected', true, left(why, 300), 'pending', now(), true, auth.uid(), now());
    elsif going = 'selected' then
      update recruitment_team_status set stage = 'selected', waitlist_rank = null, decision_reason = null, offer_status = 'pending', offer_responded_at = null,
        promoted_at = now(), added_after_results = true, decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
      where application_id = app.id and team_id = cur.team_id;
      if cur.stage = 'waitlisted' then perform recruitment_compact_waitlist(cur.team_id); end if;
    else
      update recruitment_team_status set stage = 'not_selected', waitlist_rank = null, decision_reason = 'correction', offer_status = null, offer_responded_at = null,
        multi_hub_allowed = false, decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
      where application_id = app.id and team_id = cur.team_id;
    end if;
    changed := changed + 1;

    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'corrected_result', 'recruitment_applications', app.id::text,
            jsonb_build_object('note', hub || ': ' || was || ' -> ' || going || ' (' || why || ')'));
  end loop;

  -- Everyone the list keeps in two hubs may hold both.
  update recruitment_team_status s set multi_hub_allowed = true
  where s.stage = 'selected' and s.application_id in (select (i ->> 'application_id')::uuid from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i)
    and (select count(*) from recruitment_team_status x where x.application_id = s.application_id and x.stage = 'selected') > 1;

  for n in select * from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) loop
    continue when not exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i where i ->> 'application_id' = n ->> 'application_id');
    select * into app from recruitment_applications where id = (n ->> 'application_id')::uuid and cycle_id = p_cycle;
    continue when not found or coalesce(trim(n ->> 'message'), '') = '';
    insert into notifications (user_id, title, body, link)
    values (app.user_id, 'Correction to your recruitment result', left(trim(n ->> 'message'), 1000), '/recruitment/status');
    told := told + 1;
  end loop;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'applied_result_corrections', 'recruitment_cycles', p_cycle::text,
          jsonb_build_object('note', changed || ' change(s), ' || told || ' told: ' || why));
  return jsonb_build_object('changed', changed, 'told', told);
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  guard_recruitment_cycle_public(), recruitment_decision_of(recruitment_stage), recruitment_decision_label(text), recruitment_log_decision(), recruitment_guard_locked_decision(),
  set_final_decision(uuid, uuid, text, text, text, text, text, text, text), results_board_stamp(uuid), recruitment_decisions_now(uuid),
  recruitment_snapshot_diff(uuid), results_snapshot_diff(uuid), recruitment_public_hidden(recruitment_cycles), results_set_public_override(uuid, text),
  apply_result_corrections(uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  set_final_decision(uuid, uuid, text, text, text, text, text, text, text), results_board_stamp(uuid), results_snapshot_diff(uuid),
  results_set_public_override(uuid, text), apply_result_corrections(uuid, text, jsonb, jsonb)
  to authenticated;

commit;
