-- Recruitment results: final decisions, a lock, a scheduled publish time,
-- public Selected and Waitlist lists, offers (accept or decline) and
-- promotion from the waitlist.
--
-- The publish time is enforced here, not in the pages: every function that
-- returns a decision or a name checks recruitment_results_visible(), which is
-- true only once the cycle's results were published, or were scheduled and
-- their time has come. Nothing else lets a candidate or a visitor read a
-- decision (recruitment_team_status stays readable by admins and the team's
-- reviewers only). A scheduled job, or the first visit after the time,
-- flips the cycle to results_published and sends the notifications, once.
--
-- The new result settings on recruitment_cycles can be changed only through
-- the functions below (a trigger refuses direct writes), so an editor cannot
-- move the publish time or unlock decisions by updating the row.
--
-- Run once, as one piece.

begin;

-- ── columns ────────────────────────────────────────────────────────────
alter table recruitment_cycles
  add column decisions_locked boolean not null default false,
  add column decisions_locked_at timestamptz,
  add column results_publish_at timestamptz,
  add column results_scheduled boolean not null default false,
  add column results_published_at timestamptz,
  -- When someone is selected in one hub, their other hub becomes not_selected,
  -- or a waitlist place there is kept.
  add column one_hub_mode text not null default 'not_selected' check (one_hub_mode in ('not_selected', 'keep_waitlisted')),
  add column show_selected_publicly boolean not null default true,
  add column show_waitlist_publicly boolean not null default true,
  add column results_banner_on boolean not null default true,
  add column results_banner_text text not null default 'Recruitment results are out. See the selected and waitlisted candidates.'
    check (char_length(results_banner_text) between 1 and 200);

alter table recruitment_team_status
  add column waitlist_rank integer check (waitlist_rank is null or waitlist_rank >= 1),
  -- absent: did not attend the interview; one_hub: selected in another hub;
  -- override: an admin kept an absent candidate in; declined / expired: the
  -- offer was turned down or not answered; removed: taken off the waitlist.
  add column decision_reason text check (decision_reason in ('absent', 'one_hub', 'override', 'declined', 'expired', 'removed')),
  add column decided_by uuid references auth.users(id) on delete set null,
  add column decided_at timestamptz,
  add column offer_status text check (offer_status in ('pending', 'accepted', 'declined', 'expired')),
  add column offer_responded_at timestamptz,
  add column promoted_at timestamptz,
  add column whatsapp_added boolean not null default false,
  add column induction_attended boolean not null default false,
  add column onboarding_notes text check (onboarding_notes is null or char_length(onboarding_notes) <= 1000);
create index idx_recruitment_team_status_waitlist on recruitment_team_status (team_id, waitlist_rank) where stage = 'waitlisted';

-- "If you are selected or waitlisted, your name and hub will be announced."
alter table recruitment_applications
  add column public_consent boolean not null default false,
  add column public_consent_at timestamptz;

-- Private result settings (the induction link is shared with selected candidates only).
create table recruitment_results_config (
  cycle_id uuid primary key references recruitment_cycles(id) on delete cascade,
  induction_at timestamptz,
  induction_mode text check (induction_mode in ('online', 'in_person')),
  induction_link text check (induction_link is null or induction_link ~* '^https://\S{6,300}$'),
  induction_venue text check (induction_venue is null or char_length(induction_venue) <= 300),
  induction_note text check (induction_note is null or char_length(induction_note) <= 1000),
  -- Days a selected candidate has to accept, counted from the results (or from a promotion).
  offer_days integer not null default 3 check (offer_days between 1 and 30),
  -- When on, an offer not answered in time is released automatically.
  auto_expire boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger trg_recruitment_results_config_updated_at before update on recruitment_results_config
  for each row execute function set_updated_at();

-- Two more editable messages: for an absent candidate, and the social media draft.
alter table recruitment_message_templates drop constraint recruitment_message_templates_key_check;
alter table recruitment_message_templates add constraint recruitment_message_templates_key_check
  check (key in ('submitted', 'shortlisted', 'task', 'interview', 'selected', 'waitlisted', 'not_selected', 'absent', 'social_post'));
alter table recruitment_message_templates drop constraint recruitment_message_templates_body_check;
alter table recruitment_message_templates add constraint recruitment_message_templates_body_check
  check (char_length(body) between 1 and 2000);
insert into recruitment_message_templates (key, body) values
  ('absent', 'You did not attend your interview slot, so your application could not be considered in this cycle.'),
  ('social_post', E'{cycle} results: {hub}\n\nSelected:\n{selected}\n\nWaitlist:\n{waitlist}\n\nWaitlisted candidates may be offered a seat if one becomes available.')
on conflict (key) do nothing;

-- Cycles already published before this migration count as done.
update recruitment_cycles set results_published_at = updated_at where status = 'results_published';

-- ── helpers ────────────────────────────────────────────────────────────
-- The one rule every read of a decision goes through.
create or replace function recruitment_results_visible(p_cycle uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from recruitment_cycles c
    where c.id = p_cycle and c.status <> 'draft'
      and (c.status = 'results_published' or (c.results_scheduled and c.results_publish_at is not null and now() >= c.results_publish_at)));
$$;

-- Attendance from the interview slot: attended | no_show | booked (not marked) | none (no slot).
create or replace function recruitment_attendance(p_application uuid)
returns text language sql security definer stable set search_path = public as $$
  select coalesce((
    select case b.status when 'attended' then 'attended' when 'no_show' then 'no_show' else 'booked' end
    from recruitment_slot_bookings b
    where b.application_id = p_application and b.status <> 'cancelled'
    limit 1), 'none');
$$;

-- A message template with {name}, {hub} (also {team}), {cycle} and {rank} filled in.
create or replace function recruitment_render(p_key text, p_name text, p_hub text, p_cycle text, p_rank integer)
returns text language sql security definer stable set search_path = public as $$
  select replace(replace(replace(replace(replace(t.body,
    '{name}', coalesce(nullif(trim(p_name), ''), 'there')),
    '{hub}', coalesce(p_hub, '')),
    '{team}', coalesce(p_hub, '')),
    '{cycle}', coalesce(p_cycle, '')),
    '{rank}', coalesce(p_rank::text, ''))
  from recruitment_message_templates t where t.key = p_key;
$$;

-- Waitlist ranks of a hub back to 1, 2, 3… in their current order (withdrawn applications drop out).
create or replace function recruitment_compact_waitlist(p_team uuid)
returns void language sql security definer set search_path = public as $$
  update recruitment_team_status s set waitlist_rank = r.n
  from (
    select x.application_id, row_number() over (order by x.waitlist_rank nulls last, x.stage_updated_at, x.application_id)::integer as n
    from recruitment_team_status x join recruitment_applications a on a.id = x.application_id
    where x.team_id = p_team and x.stage = 'waitlisted' and a.status = 'submitted'
  ) r
  where s.team_id = p_team and s.application_id = r.application_id and s.waitlist_rank is distinct from r.n;
$$;

-- Lets the functions in this file change the protected result columns.
create or replace function recruitment_system(p_on boolean)
returns void language sql set search_path = public as $$
  select set_config('fx.recruitment_system', case when p_on then 'on' else '' end, true);
$$;

-- Only an admin opens, closes or publishes a cycle; the result settings move
-- only through the functions in this file.
create or replace function guard_recruitment_cycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('fx.recruitment_system', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.decisions_locked := false; new.decisions_locked_at := null; new.results_scheduled := false;
    new.results_published_at := null;
    return new;
  end if;
  if auth.uid() is not null and not is_admin() and new.status is distinct from old.status then
    raise exception 'Only an admin can open, close or publish a recruitment cycle';
  end if;
  if new.status = 'results_published' and old.status <> 'results_published' then
    raise exception 'Results are published through the results controls';
  end if;
  if new.decisions_locked is distinct from old.decisions_locked
     or new.decisions_locked_at is distinct from old.decisions_locked_at
     or new.results_scheduled is distinct from old.results_scheduled
     or new.results_published_at is distinct from old.results_published_at
     or (old.results_scheduled and new.results_publish_at is distinct from old.results_publish_at) then
    raise exception 'Use the results controls to change this';
  end if;
  if (new.results_publish_at is distinct from old.results_publish_at
      or new.one_hub_mode is distinct from old.one_hub_mode
      or new.show_selected_publicly is distinct from old.show_selected_publicly
      or new.show_waitlist_publicly is distinct from old.show_waitlist_publicly
      or new.results_banner_on is distinct from old.results_banner_on
      or new.results_banner_text is distinct from old.results_banner_text)
     and auth.uid() is not null and not is_admin() then
    raise exception 'Only an admin can change the result settings';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_recruitment_cycle on recruitment_cycles;
create trigger trg_guard_recruitment_cycle before update on recruitment_cycles
  for each row execute function guard_recruitment_cycle();
create trigger trg_guard_recruitment_cycle_insert before insert on recruitment_cycles
  for each row execute function guard_recruitment_cycle();

-- Lock check for anything that changes a decision.
create or replace function recruitment_assert_editable(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if recruitment_results_visible(p_cycle) then raise exception 'Results are out. Decisions can no longer be changed here'; end if;
  if exists (select 1 from recruitment_cycles where id = p_cycle and decisions_locked) then
    raise exception 'Decisions are locked';
  end if;
end $$;

-- ── one decision ───────────────────────────────────────────────────────
-- Sets selected | waitlisted | not_selected | undecided for one hub of one
-- application, with the rules: an absent candidate is not_selected unless
-- an admin overrides it with a reason; a waitlisted candidate gets the next
-- rank; selected in one hub means the other hub is not_selected (or keeps a
-- waitlist place, by the cycle's setting).
create or replace function recruitment_apply_decision(
  p_application uuid, p_team uuid, p_decision text, p_note text, p_reason text, p_actor uuid, p_admin boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur recruitment_team_status%rowtype; app recruitment_applications%rowtype; cyc recruitment_cycles%rowtype;
  att text; why text; new_stage recruitment_stage; other record; others integer := 0; hub text; rank_now integer;
begin
  if p_decision not in ('selected', 'waitlisted', 'not_selected', 'undecided') then raise exception 'Unknown decision'; end if;
  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found then raise exception 'This application does not list that hub'; end if;
  select * into app from recruitment_applications where id = p_application;
  if app.status <> 'submitted' then raise exception 'This application is not submitted'; end if;
  -- A share lock on the cycle: locking decisions waits for a decision being saved, and the other way round.
  select * into cyc from recruitment_cycles where id = app.cycle_id for share;
  perform recruitment_assert_editable(cyc.id);
  select name into hub from recruitment_teams where id = p_team;

  att := recruitment_attendance(p_application);
  if att = 'no_show' and p_decision in ('selected', 'waitlisted') then
    if not p_admin then raise exception 'This candidate did not attend. Only an admin can override that, with a reason'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason to override the absent rule'; end if;
    why := 'override';
  elsif att = 'no_show' then
    why := 'absent';
  end if;
  new_stage := case when p_decision = 'undecided' then 'interview' else p_decision::recruitment_stage end;

  update recruitment_team_status set
    stage = new_stage,
    stage_updated_at = case when cur.stage is distinct from new_stage then now() else stage_updated_at end,
    final_note = case when p_note is null then final_note else nullif(left(trim(p_note), 1000), '') end,
    waitlist_rank = case when new_stage <> 'waitlisted' then null
                         when cur.stage = 'waitlisted' then cur.waitlist_rank
                         else (select coalesce(max(x.waitlist_rank), 0) + 1 from recruitment_team_status x
                               where x.team_id = p_team and x.stage = 'waitlisted') end,
    decision_reason = case when p_decision = 'undecided' then null else why end,
    decided_by = p_actor, decided_at = now()
  where application_id = p_application and team_id = p_team
  returning waitlist_rank into rank_now;
  if cur.stage = 'waitlisted' and new_stage <> 'waitlisted' then perform recruitment_compact_waitlist(p_team); end if;

  if new_stage = 'selected' then
    for other in
      select team_id, stage from recruitment_team_status where application_id = p_application and team_id <> p_team for update
    loop
      continue when other.stage = 'not_selected';
      continue when other.stage = 'waitlisted' and cyc.one_hub_mode = 'keep_waitlisted';
      update recruitment_team_status set stage = 'not_selected', waitlist_rank = null, decision_reason = 'one_hub',
        decided_by = p_actor, decided_at = now(), stage_updated_at = now()
      where application_id = p_application and team_id = other.team_id;
      if other.stage = 'waitlisted' then perform recruitment_compact_waitlist(other.team_id); end if;
      others := others + 1;
    end loop;
  elsif cur.stage = 'selected' then
    -- No longer selected here: a hub closed only because of this selection is undecided again.
    update recruitment_team_status set stage = 'interview', decision_reason = null, decided_by = p_actor, decided_at = now(), stage_updated_at = now()
    where application_id = p_application and team_id <> p_team and decision_reason = 'one_hub';
  end if;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (p_actor, 'set_decision', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', hub || ': ' || cur.stage::text || ' -> ' || new_stage::text
            || case when why = 'override' then ' (absent rule overridden: ' || left(trim(p_reason), 300) || ')' else '' end
            || case when others > 0 then ' (' || others || ' other hub(s) set to not selected)' else '' end));
  return jsonb_build_object('stage', new_stage, 'waitlist_rank', rank_now, 'others_changed', others);
end $$;

create or replace function set_final_decision(p_application uuid, p_team uuid, p_decision text, p_note text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (is_admin() or is_team_reviewer(p_team)) then raise exception 'FORBIDDEN'; end if;
  return recruitment_apply_decision(p_application, p_team, p_decision, p_note, p_reason, auth.uid(), is_admin());
end $$;

-- Every still-undecided application (of one hub, or all) gets this decision.
create or replace function bulk_mark_undecided(p_cycle uuid, p_team uuid default null, p_decision text default 'not_selected')
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  perform recruitment_assert_editable(p_cycle);
  if p_decision not in ('selected', 'waitlisted', 'not_selected') then raise exception 'Unknown decision'; end if;
  for r in
    select s.application_id, s.team_id
    from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
    where a.cycle_id = p_cycle and a.status = 'submitted' and s.stage not in ('selected', 'waitlisted', 'not_selected')
      and (p_team is null or s.team_id = p_team)
    order by a.submitted_at, s.rank
  loop
    perform recruitment_apply_decision(r.application_id, r.team_id, p_decision, null, null, auth.uid(), true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Moves a waitlisted candidate up (-1) or down (+1).
create or replace function move_waitlist(p_application uuid, p_team uuid, p_by integer)
returns void language plpgsql security definer set search_path = public as $$
declare cyc uuid; cur integer; other uuid;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select cycle_id into cyc from recruitment_teams where id = p_team;
  perform recruitment_assert_editable(cyc);
  perform recruitment_compact_waitlist(p_team);
  select waitlist_rank into cur from recruitment_team_status
  where application_id = p_application and team_id = p_team and stage = 'waitlisted' for update;
  if cur is null then raise exception 'This candidate is not on the waitlist'; end if;
  select application_id into other from recruitment_team_status
  where team_id = p_team and stage = 'waitlisted' and waitlist_rank = cur + sign(p_by)::integer for update;
  if other is null then return; end if;
  update recruitment_team_status set waitlist_rank = cur where application_id = other and team_id = p_team;
  update recruitment_team_status set waitlist_rank = cur + sign(p_by)::integer where application_id = p_application and team_id = p_team;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'moved_waitlist', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', 'waitlist #' || cur || ' -> #' || (cur + sign(p_by)::integer)));
end $$;

-- ── the absent rule ────────────────────────────────────────────────────
-- Marking a booking "no_show" makes every hub of that application
-- not_selected (reason absent), unless an admin overrode it. Marking it
-- back undoes exactly that.
create or replace function recruitment_absent_rule()
returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if new.status is not distinct from old.status or (new.status <> 'no_show' and old.status <> 'no_show') then return new; end if;
  if exists (select 1 from recruitment_cycles c where c.id = new.cycle_id and c.decisions_locked) or recruitment_results_visible(new.cycle_id) then
    raise exception 'Decisions are locked. Unlock them before changing attendance';
  end if;
  if new.status = 'no_show' then
    for t in
      update recruitment_team_status set stage = 'not_selected', decision_reason = 'absent', waitlist_rank = null,
        decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
      where application_id = new.application_id and coalesce(decision_reason, '') <> 'override'
      returning team_id
    loop
      perform recruitment_compact_waitlist(t);
    end loop;
  else
    update recruitment_team_status set stage = 'interview', decision_reason = null, decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
    where application_id = new.application_id and decision_reason = 'absent';
  end if;
  return new;
end $$;
create trigger trg_recruitment_absent_rule after update of status on recruitment_slot_bookings
  for each row execute function recruitment_absent_rule();

-- For no-shows marked before this migration (or any that slipped by): applied when decisions are locked.
create or replace function recruitment_sweep_absent(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update recruitment_team_status s set stage = 'not_selected', decision_reason = 'absent', waitlist_rank = null,
    decided_at = now(), stage_updated_at = now()
  from recruitment_slot_bookings b
  where b.application_id = s.application_id and b.cycle_id = p_cycle and b.status = 'no_show'
    and not (s.stage = 'not_selected' and s.decision_reason = 'absent') and coalesce(s.decision_reason, '') <> 'override';
  get diagnostics n = row_count;
  perform recruitment_compact_waitlist(t.id) from recruitment_teams t where t.cycle_id = p_cycle;
  return n;
end $$;

-- ── readiness, lock and schedule ───────────────────────────────────────
create or replace function recruitment_readiness(p_cycle uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  with st as (
    select s.*, a.full_name, a.id as app_id
    from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
    where a.cycle_id = p_cycle and a.status = 'submitted'
  ), doubles as (
    select app_id, min(full_name) as full_name from st where stage = 'selected' group by app_id having count(*) > 1
  )
  select jsonb_build_object(
    'undecided', (select count(*) from st where stage not in ('selected', 'waitlisted', 'not_selected')),
    'undecided_attended', (select count(*) from st where stage not in ('selected', 'waitlisted', 'not_selected')
                             and recruitment_attendance(app_id) = 'attended'),
    'conflicts', (select count(*) from doubles),
    'conflict_names', coalesce((select jsonb_agg(coalesce(full_name, 'Candidate') order by full_name) from doubles), '[]'::jsonb),
    'locked', (select decisions_locked from recruitment_cycles where id = p_cycle),
    'scheduled', (select results_scheduled from recruitment_cycles where id = p_cycle),
    'visible', recruitment_results_visible(p_cycle));
$$;

create or replace function results_readiness(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return recruitment_readiness(p_cycle);
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
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'unlocked_decisions', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', left(trim(p_reason), 500)));
end $$;

-- The planned date shown to candidates; it can be set before decisions are locked.
create or replace function set_results_date(p_cycle uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare c recruitment_cycles%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into c from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if c.results_scheduled then raise exception 'Results are scheduled. Use Reschedule'; end if;
  if recruitment_results_visible(p_cycle) then raise exception 'Results are already out'; end if;
  update recruitment_cycles set results_publish_at = p_at where id = p_cycle;
end $$;

create or replace function schedule_results(p_cycle uuid, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c recruitment_cycles%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into c from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if recruitment_results_visible(p_cycle) then raise exception 'Results are already out'; end if;
  if p_at is null or p_at <= now() then raise exception 'Choose a time in the future, or use Publish now'; end if;
  perform recruitment_assert_ready(p_cycle);
  perform recruitment_system(true);
  update recruitment_cycles set results_publish_at = p_at, results_scheduled = true where id = p_cycle;
  perform recruitment_system(false);
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), case when c.results_scheduled then 'rescheduled_results' else 'scheduled_results' end, 'recruitment_cycles', p_cycle::text,
          jsonb_build_object('note', to_char(p_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY, FMHH12:MI AM') || ' IST'
            || case when c.results_scheduled then ' (was ' || to_char(c.results_publish_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY, FMHH12:MI AM') || ')' else '' end));
  return jsonb_build_object('publish_at', p_at);
end $$;

create or replace function cancel_results_schedule(p_cycle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c recruitment_cycles%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into c from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if recruitment_results_visible(p_cycle) then raise exception 'Results are already out and cannot be taken back'; end if;
  if not c.results_scheduled then return; end if;
  perform recruitment_system(true);
  update recruitment_cycles set results_scheduled = false where id = p_cycle;
  perform recruitment_system(false);
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'cancelled_results_schedule', 'recruitment_cycles', p_cycle::text,
          jsonb_build_object('note', 'was ' || to_char(c.results_publish_at at time zone 'Asia/Kolkata', 'FMDD Mon YYYY, FMHH12:MI AM') || ' IST'));
end $$;

-- ── publishing ─────────────────────────────────────────────────────────
-- A candidate's overall result: selected | waitlisted | declined | expired | absent | not_selected | in_review.
create or replace function recruitment_outcome(p_application uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  with r as (
    select s.*, t.name as hub from recruitment_team_status s join recruitment_teams t on t.id = s.team_id
    where s.application_id = p_application
  )
  select coalesce(
    (select jsonb_build_object('outcome', 'selected', 'team_id', team_id, 'hub', hub) from r where stage = 'selected' order by rank limit 1),
    (select jsonb_build_object('outcome', 'waitlisted', 'team_id', team_id, 'hub', hub, 'rank', waitlist_rank) from r where stage = 'waitlisted' order by rank limit 1),
    (select jsonb_build_object('outcome', decision_reason, 'team_id', team_id, 'hub', hub) from r where decision_reason in ('declined', 'expired') order by rank limit 1),
    (select jsonb_build_object('outcome', 'in_review') from r where stage not in ('selected', 'waitlisted', 'not_selected') limit 1),
    (select jsonb_build_object('outcome', 'absent') from r where decision_reason = 'absent' limit 1),
    jsonb_build_object('outcome', 'not_selected', 'hub', (select string_agg(hub, ', ' order by rank) from r)));
$$;

-- The notification text for one candidate's result.
create or replace function recruitment_result_message(p_application uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare a recruitment_applications%rowtype; o jsonb; cyc text; note text;
begin
  select * into a from recruitment_applications where id = p_application;
  select title into cyc from recruitment_cycles where id = a.cycle_id;
  o := recruitment_outcome(p_application);
  if o ->> 'outcome' in ('selected', 'waitlisted') then
    select final_note into note from recruitment_team_status where application_id = p_application and team_id = (o ->> 'team_id')::uuid;
  end if;
  return coalesce(note, case o ->> 'outcome'
    when 'selected' then recruitment_render('selected', a.full_name, o ->> 'hub', cyc, null)
    when 'waitlisted' then recruitment_render('waitlisted', a.full_name, o ->> 'hub', cyc, (o ->> 'rank')::integer)
    when 'absent' then recruitment_render('absent', a.full_name, null, cyc, null)
    else recruitment_render('not_selected', a.full_name, o ->> 'hub', cyc, null) end, 'Your result is on your status page.');
end $$;

-- Flips a cycle whose time has come to results_published and tells every
-- applicant, once: the row lock and results_published_at make a second run
-- (or a run racing this one) do nothing.
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

-- Offers not answered in time are released (only when the cycle asks for it).
create or replace function recruitment_expire_offers(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c recruitment_cycles%rowtype; cfg recruitment_results_config%rowtype; r record; n integer := 0;
begin
  select * into cfg from recruitment_results_config where cycle_id = p_cycle;
  if not coalesce(cfg.auto_expire, false) or not recruitment_results_visible(p_cycle) then return 0; end if;
  select * into c from recruitment_cycles where id = p_cycle;
  for r in
    select s.application_id, s.team_id, a.user_id, t.name as hub
    from recruitment_team_status s
    join recruitment_applications a on a.id = s.application_id
    join recruitment_teams t on t.id = s.team_id
    where a.cycle_id = p_cycle and a.status = 'submitted' and s.stage = 'selected' and s.offer_status = 'pending'
      and coalesce(s.promoted_at, c.results_publish_at, c.results_published_at) + make_interval(days => cfg.offer_days) <= now()
    for update of s skip locked
  loop
    update recruitment_team_status set stage = 'not_selected', decision_reason = 'expired', offer_status = 'expired', stage_updated_at = now()
    where application_id = r.application_id and team_id = r.team_id;
    insert into notifications (user_id, title, body, link)
    values (r.user_id, 'Your offer has expired', 'The deadline to accept your place in ' || r.hub || ' has passed, so the seat has been released.', '/recruitment/status');
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (null, 'offer_expired', 'recruitment_applications', r.application_id::text, jsonb_build_object('note', r.hub));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function recruitment_run_cycle_jobs(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare published integer; expired integer;
begin
  published := recruitment_finalize(p_cycle);
  expired := recruitment_expire_offers(p_cycle);
  return jsonb_build_object('published', published, 'expired', expired);
end $$;

-- The scheduled job (pg_cron every minute, and the Vercel cron route):
-- closes cycles past their deadline, publishes results that are due and
-- releases expired offers. Safe to run as often as you like.
create or replace function recruitment_run_due_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare closed integer; c record; published integer := 0; expired integer := 0; r jsonb;
begin
  perform recruitment_system(true);
  with done as (
    update recruitment_cycles set status = 'closed'
    where status = 'open' and closes_at is not null and closes_at <= now()
    returning id
  ), logged as (
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    select null, 'auto_closed', 'recruitment_cycles', id::text, jsonb_build_object('note', 'registration deadline passed') from done
    returning 1
  )
  select count(*) into closed from logged;
  perform recruitment_system(false);

  for c in
    select id from recruitment_cycles
    where (results_scheduled and results_published_at is null and results_publish_at <= now())
       or (status = 'results_published' and exists (select 1 from recruitment_results_config k where k.cycle_id = recruitment_cycles.id and k.auto_expire))
  loop
    r := recruitment_run_cycle_jobs(c.id);
    published := published + (r ->> 'published')::integer;
    expired := expired + (r ->> 'expired')::integer;
  end loop;
  return jsonb_build_object('closed', closed, 'notified', published, 'expired', expired);
end $$;

-- "Publish now": schedules for this moment and publishes straight away.
create or replace function publish_results_now(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sent integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from recruitment_cycles where id = p_cycle for update;
  if not found then raise exception 'Recruitment not found'; end if;
  if recruitment_results_visible(p_cycle) then raise exception 'Results are already out'; end if;
  perform recruitment_assert_ready(p_cycle);
  perform recruitment_system(true);
  update recruitment_cycles set results_publish_at = now(), results_scheduled = true where id = p_cycle;
  perform recruitment_system(false);
  sent := recruitment_finalize(p_cycle);
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'published_results_now', 'recruitment_cycles', p_cycle::text, jsonb_build_object('note', sent || ' candidate(s) notified'));
  return jsonb_build_object('notified', sent);
end $$;

-- The old "Publish results" button goes through the same checks now.
create or replace function publish_recruitment_results(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  return (publish_results_now(p_cycle) ->> 'notified')::integer;
end $$;

-- ── what a candidate sees ──────────────────────────────────────────────
create or replace function recruitment_result_for(p_cycle uuid, p_user uuid, p_force boolean)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  c recruitment_cycles%rowtype; a recruitment_applications%rowtype; cfg recruitment_results_config%rowtype;
  sel record; deadline timestamptz; hubs jsonb; o jsonb;
begin
  select * into c from recruitment_cycles where id = p_cycle;
  if not found then return jsonb_build_object('state', 'none'); end if;
  select * into a from recruitment_applications where cycle_id = p_cycle and user_id = p_user;
  if not found or a.status <> 'submitted' then return jsonb_build_object('state', 'none'); end if;
  if not recruitment_results_visible(p_cycle) and not p_force then
    return jsonb_build_object('state', 'pending', 'publish_at', c.results_publish_at, 'scheduled', c.results_scheduled, 'consent', a.public_consent);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', s.team_id, 'team_name', t.name, 'rank', s.rank, 'decision', s.stage, 'reason', s.decision_reason,
      'waitlist_rank', s.waitlist_rank,
      'message', coalesce(s.final_note, case
        when s.stage = 'selected' then recruitment_render('selected', a.full_name, t.name, c.title, null)
        when s.stage = 'waitlisted' then recruitment_render('waitlisted', a.full_name, t.name, c.title, s.waitlist_rank)
        when s.decision_reason = 'absent' then recruitment_render('absent', a.full_name, t.name, c.title, null)
        when s.stage = 'not_selected' then recruitment_render('not_selected', a.full_name, t.name, c.title, null) end))
      order by s.rank), '[]'::jsonb)
    into hubs
  from recruitment_team_status s join recruitment_teams t on t.id = s.team_id
  where s.application_id = a.id;
  o := recruitment_outcome(a.id);

  select s.team_id, s.offer_status, s.promoted_at, t.name into sel
  from recruitment_team_status s join recruitment_teams t on t.id = s.team_id
  where s.application_id = a.id and s.stage = 'selected' order by s.rank limit 1;
  select * into cfg from recruitment_results_config where cycle_id = p_cycle;
  if sel.team_id is not null then
    deadline := coalesce(sel.promoted_at, c.results_publish_at, now()) + make_interval(days => coalesce(cfg.offer_days, 3));
  end if;

  return jsonb_build_object(
    'state', case when recruitment_results_visible(p_cycle) then 'published' else 'preview' end,
    'outcome', o ->> 'outcome', 'hub', o ->> 'hub', 'name', a.full_name, 'cycle_title', c.title,
    'consent', a.public_consent, 'hubs', hubs,
    'selected', case when sel.team_id is not null then jsonb_build_object(
      'team_id', sel.team_id, 'team_name', sel.name,
      'whatsapp_url', (select l.whatsapp_group_url from recruitment_team_links l where l.team_id = sel.team_id),
      'offer_status', sel.offer_status, 'offer_deadline', deadline,
      'can_respond', sel.offer_status = 'pending' and now() < deadline) end,
    'induction', case when sel.team_id is not null then jsonb_build_object(
      'at', cfg.induction_at, 'mode', cfg.induction_mode, 'link', cfg.induction_link,
      'venue', cfg.induction_venue, 'note', cfg.induction_note) end);
end $$;

-- The signed-in candidate's own result. Before the publish time only
-- "pending" and the date come back, never a decision.
create or replace function get_my_result(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('state', 'none'); end if;
  perform recruitment_run_cycle_jobs(p_cycle);
  return recruitment_result_for(p_cycle, auth.uid(), false);
end $$;

-- "Preview as candidate" for staff: works before the results are out.
create or replace function preview_candidate_result(p_application uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare a recruitment_applications%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into a from recruitment_applications where id = p_application;
  if not found then raise exception 'Application not found'; end if;
  return recruitment_result_for(a.cycle_id, a.user_id, true);
end $$;

create or replace function set_recruitment_consent(p_cycle uuid, p_agree boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  update recruitment_applications
  set public_consent = coalesce(p_agree, false), public_consent_at = case when coalesce(p_agree, false) then now() end
  where cycle_id = p_cycle and user_id = auth.uid() and status in ('draft', 'submitted')
    and public_consent is distinct from coalesce(p_agree, false);
  return coalesce(p_agree, false);
end $$;

-- Accept or decline the place. Declining (or missing the deadline, when
-- auto-expiry is on) frees the seat.
create or replace function respond_to_offer(p_cycle uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a recruitment_applications%rowtype; c recruitment_cycles%rowtype; s recruitment_team_status%rowtype; hub text; days integer; deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  perform recruitment_run_cycle_jobs(p_cycle);
  if not recruitment_results_visible(p_cycle) then raise exception 'Results are not out yet'; end if;
  select * into a from recruitment_applications where cycle_id = p_cycle and user_id = auth.uid() and status = 'submitted';
  if not found then raise exception 'Application not found'; end if;
  select * into s from recruitment_team_status where application_id = a.id and stage = 'selected' order by rank limit 1 for update;
  if not found then raise exception 'There is no offer to answer'; end if;
  if s.offer_status is distinct from 'pending' then raise exception 'You have already answered this offer'; end if;
  select * into c from recruitment_cycles where id = p_cycle;
  select coalesce((select offer_days from recruitment_results_config where cycle_id = p_cycle), 3) into days;
  deadline := coalesce(s.promoted_at, c.results_publish_at) + make_interval(days => days);
  if now() >= deadline then raise exception 'The deadline to answer has passed'; end if;
  select name into hub from recruitment_teams where id = s.team_id;

  if p_accept then
    update recruitment_team_status set offer_status = 'accepted', offer_responded_at = now()
    where application_id = a.id and team_id = s.team_id;
  else
    update recruitment_team_status set stage = 'not_selected', decision_reason = 'declined', offer_status = 'declined',
      offer_responded_at = now(), stage_updated_at = now()
    where application_id = a.id and team_id = s.team_id;
  end if;
  insert into notifications (user_id, title, body, link)
  values (auth.uid(), case when p_accept then 'You accepted your place' else 'You declined your place' end,
          case when p_accept then 'You accepted your place in ' || hub || '.' else 'You declined your place in ' || hub || '. Thank you for letting us know.' end,
          '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), case when p_accept then 'accepted_offer' else 'declined_offer' end, 'recruitment_applications', a.id::text, jsonb_build_object('note', hub));
  return jsonb_build_object('offer_status', case when p_accept then 'accepted' else 'declined' end);
end $$;

-- ── after the results: waitlist and onboarding ─────────────────────────
create or replace function promote_waitlisted(p_application uuid, p_team uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur recruitment_team_status%rowtype; a recruitment_applications%rowtype; c recruitment_cycles%rowtype;
  hub text; other record; was integer;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found or cur.stage <> 'waitlisted' then raise exception 'This candidate is not on the waitlist'; end if;
  select * into a from recruitment_applications where id = p_application;
  if a.status <> 'submitted' then raise exception 'This application was withdrawn'; end if;
  select * into c from recruitment_cycles where id = a.cycle_id;
  if not recruitment_results_visible(c.id) then raise exception 'Before the results are out, change the decision on the board instead'; end if;
  if exists (select 1 from recruitment_team_status where application_id = p_application and team_id <> p_team and stage = 'selected') then
    raise exception 'This candidate already holds a place in another hub';
  end if;
  select name into hub from recruitment_teams where id = p_team;
  was := cur.waitlist_rank;

  update recruitment_team_status set stage = 'selected', waitlist_rank = null, promoted_at = now(), offer_status = 'pending',
    offer_responded_at = null, decision_reason = null, decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
  where application_id = p_application and team_id = p_team;
  perform recruitment_compact_waitlist(p_team);
  for other in select team_id, stage from recruitment_team_status where application_id = p_application and team_id <> p_team for update loop
    continue when other.stage = 'not_selected';
    continue when other.stage = 'waitlisted' and c.one_hub_mode = 'keep_waitlisted';
    update recruitment_team_status set stage = 'not_selected', waitlist_rank = null, decision_reason = 'one_hub', decided_at = now(), stage_updated_at = now()
    where application_id = p_application and team_id = other.team_id;
    if other.stage = 'waitlisted' then perform recruitment_compact_waitlist(other.team_id); end if;
  end loop;

  insert into notifications (user_id, title, body, link)
  values (a.user_id, 'You have been offered a place', coalesce(cur.final_note, recruitment_render('selected', a.full_name, hub, c.title, null))
          || ' Please accept or decline on your status page.', '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'promoted_from_waitlist', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', hub || ': waitlist #' || coalesce(was::text, '?') || ' -> selected'));
  return jsonb_build_object('stage', 'selected');
end $$;

create or replace function remove_from_waitlist(p_application uuid, p_team uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare cur recruitment_team_status%rowtype; a recruitment_applications%rowtype; hub text;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason'; end if;
  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found or cur.stage <> 'waitlisted' then raise exception 'This candidate is not on the waitlist'; end if;
  select * into a from recruitment_applications where id = p_application;
  if not recruitment_results_visible(a.cycle_id) then raise exception 'Before the results are out, change the decision on the board instead'; end if;
  select name into hub from recruitment_teams where id = p_team;
  update recruitment_team_status set stage = 'not_selected', waitlist_rank = null, decision_reason = 'removed',
    decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
  where application_id = p_application and team_id = p_team;
  perform recruitment_compact_waitlist(p_team);
  insert into notifications (user_id, title, body, link)
  values (a.user_id, 'Recruitment update', 'You are no longer on the waitlist for ' || hub || '.', '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'removed_from_waitlist', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', hub || ': ' || left(trim(p_reason), 300)));
end $$;

create or replace function set_onboarding(p_application uuid, p_team uuid, p_whatsapp boolean, p_induction boolean, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  update recruitment_team_status set whatsapp_added = coalesce(p_whatsapp, false), induction_attended = coalesce(p_induction, false),
    onboarding_notes = nullif(left(trim(p_notes), 1000), '')
  where application_id = p_application and team_id = p_team and stage = 'selected';
  if not found then raise exception 'This candidate is not selected for that hub'; end if;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'updated_onboarding', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', 'WhatsApp ' || case when p_whatsapp then 'yes' else 'no' end || ', induction ' || case when p_induction then 'yes' else 'no' end));
end $$;

-- ── the public lists ───────────────────────────────────────────────────
-- Names and hubs only (and the waitlist rank): never contact details,
-- scores, notes or anyone not selected. A name appears only with consent;
-- the others are counted as "+ N more".
create or replace function recruitment_public_results_for(p_cycle uuid, p_force boolean)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare c recruitment_cycles%rowtype; hubs jsonb;
begin
  select * into c from recruitment_cycles where id = p_cycle and status <> 'draft';
  if not found then return jsonb_build_object('state', 'none'); end if;
  if not recruitment_results_visible(p_cycle) and not p_force then
    return jsonb_build_object('state', 'pending', 'cycle_title', c.title, 'publish_at', c.results_publish_at, 'scheduled', c.results_scheduled);
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

  return jsonb_build_object(
    'state', case when recruitment_results_visible(p_cycle) then 'published' else 'preview' end,
    'cycle_title', c.title, 'publish_at', c.results_publish_at,
    'show_selected', c.show_selected_publicly, 'show_waitlist', c.show_waitlist_publicly, 'hubs', hubs);
end $$;

create or replace function get_public_results(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare jobs jsonb;
begin
  jobs := recruitment_run_cycle_jobs(p_cycle);
  return recruitment_public_results_for(p_cycle, false) || jsonb_build_object('just_published', (jobs ->> 'published')::integer > 0);
end $$;

create or replace function preview_public_results(p_cycle uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return recruitment_public_results_for(p_cycle, true);
end $$;

-- ── existing functions, now behind the publish time and the lock ───────
create or replace function my_recruitment_status(p_cycle uuid)
returns table (team_id uuid, team_name text, rank smallint, stage text, stage_updated_at timestamptz,
               interview_at timestamptz, interview_location text, final_note text, results_out boolean)
language sql security definer stable set search_path = public as $$
  select s.team_id, t.name, s.rank,
         case when not recruitment_results_visible(c.id) and s.stage in ('selected', 'waitlisted', 'not_selected')
              then 'in_review' else s.stage::text end,
         s.stage_updated_at,
         case when s.stage = 'interview' or recruitment_results_visible(c.id) then s.interview_at end,
         case when s.stage = 'interview' or recruitment_results_visible(c.id) then s.interview_location end,
         case when recruitment_results_visible(c.id) then s.final_note end,
         recruitment_results_visible(c.id)
  from recruitment_applications a
  join recruitment_cycles c on c.id = a.cycle_id
  join recruitment_team_status s on s.application_id = a.id
  join recruitment_teams t on t.id = s.team_id
  where a.cycle_id = p_cycle and a.user_id = auth.uid() and a.status = 'submitted'
  order by s.rank;
$$;

create or replace function recruitment_whatsapp_link(p_team uuid)
returns text language sql security definer stable set search_path = public as $$
  select l.whatsapp_group_url
  from recruitment_team_links l
  where l.team_id = p_team and (
    is_admin()
    or exists (
      select 1
      from recruitment_team_status s
      join recruitment_applications a on a.id = s.application_id
      where s.team_id = p_team and s.stage = 'selected' and a.user_id = auth.uid()
        and a.status = 'submitted' and recruitment_results_visible(a.cycle_id)));
$$;

-- Moving stages from the review screen: refused once decisions are locked;
-- a final stage goes through the same rules as the decisions board.
create or replace function set_recruitment_stage(
  p_application uuid, p_team uuid, p_stage recruitment_stage,
  p_interview_at timestamptz default null, p_interview_location text default null, p_final_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); app recruitment_applications%rowtype; cyc recruitment_cycles%rowtype;
  cur recruitment_team_status%rowtype; team_name text; changed boolean;
begin
  if uid is null or not (is_admin() or is_team_reviewer(p_team)) then raise exception 'FORBIDDEN'; end if;
  select * into app from recruitment_applications where id = p_application;
  if not found then raise exception 'Application not found'; end if;
  perform recruitment_assert_editable(app.cycle_id);
  if p_stage in ('selected', 'waitlisted', 'not_selected') then
    return recruitment_apply_decision(p_application, p_team, p_stage::text, coalesce(p_final_note, ''), null, uid, is_admin());
  end if;

  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found then raise exception 'This application does not list that team'; end if;
  if app.status <> 'submitted' then raise exception 'This application is not submitted'; end if;
  select * into cyc from recruitment_cycles where id = app.cycle_id;
  select name into team_name from recruitment_teams where id = p_team;

  changed := cur.stage is distinct from p_stage
    or (p_stage = 'interview' and (cur.interview_at is distinct from p_interview_at
                                   or cur.interview_location is distinct from p_interview_location));
  update recruitment_team_status set
    stage = p_stage,
    stage_updated_at = case when cur.stage is distinct from p_stage then now() else stage_updated_at end,
    interview_at = p_interview_at,
    interview_location = nullif(left(p_interview_location, 300), ''),
    final_note = nullif(left(p_final_note, 1000), ''),
    waitlist_rank = null,
    decision_reason = null
  where application_id = p_application and team_id = p_team;
  if cur.stage = 'waitlisted' then perform recruitment_compact_waitlist(p_team); end if;

  if changed and p_stage in ('shortlisted', 'task', 'interview') then
    insert into notifications (user_id, title, body, link)
    values (app.user_id, 'Recruitment update', recruitment_message(p_stage::text, app.full_name, team_name, cyc.title), '/recruitment/status');
  end if;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (uid, 'set_stage', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', team_name || ': ' || cur.stage::text || ' -> ' || p_stage::text));
  return jsonb_build_object('stage', p_stage);
end $$;

-- Withdrawing is allowed until the results are out; a waitlist closes the gap.
create or replace function withdraw_recruitment_application(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cyc recruitment_cycles%rowtype; app recruitment_applications%rowtype;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into cyc from recruitment_cycles where id = p_cycle;
  if not found then raise exception 'Recruitment not found'; end if;
  if cyc.status = 'results_published' or recruitment_results_visible(p_cycle) then raise exception 'Results are already out'; end if;
  select * into app from recruitment_applications where cycle_id = p_cycle and user_id = uid for update;
  if not found or app.status <> 'submitted' then return jsonb_build_object('status', 'withdrawn'); end if;
  update recruitment_applications set status = 'withdrawn' where id = app.id;
  update recruitment_slot_bookings set status = 'cancelled' where application_id = app.id and status = 'booked';
  perform recruitment_compact_waitlist(s.team_id) from recruitment_team_status s where s.application_id = app.id and s.stage = 'waitlisted';
  return jsonb_build_object('status', 'withdrawn');
end $$;

-- No-shows already marked on open cycles count as absent from now on.
do $$
declare c record;
begin
  for c in select id from recruitment_cycles where status <> 'results_published' and not decisions_locked loop
    perform recruitment_sweep_absent(c.id);
  end loop;
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  recruitment_results_visible(uuid), recruitment_attendance(uuid), recruitment_render(text, text, text, text, integer),
  recruitment_compact_waitlist(uuid), recruitment_system(boolean), recruitment_assert_editable(uuid),
  recruitment_apply_decision(uuid, uuid, text, text, text, uuid, boolean), set_final_decision(uuid, uuid, text, text, text),
  bulk_mark_undecided(uuid, uuid, text), move_waitlist(uuid, uuid, integer), recruitment_absent_rule(), recruitment_sweep_absent(uuid),
  recruitment_readiness(uuid), results_readiness(uuid), recruitment_assert_ready(uuid), lock_decisions(uuid), unlock_decisions(uuid, text),
  set_results_date(uuid, timestamptz), schedule_results(uuid, timestamptz), cancel_results_schedule(uuid),
  recruitment_outcome(uuid), recruitment_result_message(uuid), recruitment_finalize(uuid), recruitment_expire_offers(uuid),
  recruitment_run_cycle_jobs(uuid), recruitment_run_due_jobs(), publish_results_now(uuid),
  recruitment_result_for(uuid, uuid, boolean), get_my_result(uuid), preview_candidate_result(uuid), set_recruitment_consent(uuid, boolean),
  respond_to_offer(uuid, boolean), promote_waitlisted(uuid, uuid), remove_from_waitlist(uuid, uuid, text),
  set_onboarding(uuid, uuid, boolean, boolean, text), recruitment_public_results_for(uuid, boolean), get_public_results(uuid),
  preview_public_results(uuid)
  from public, anon, authenticated;
grant execute on function recruitment_results_visible(uuid), get_public_results(uuid) to anon, authenticated;
grant execute on function
  set_final_decision(uuid, uuid, text, text, text), bulk_mark_undecided(uuid, uuid, text), move_waitlist(uuid, uuid, integer),
  results_readiness(uuid), lock_decisions(uuid), unlock_decisions(uuid, text), set_results_date(uuid, timestamptz),
  schedule_results(uuid, timestamptz), cancel_results_schedule(uuid), publish_results_now(uuid),
  get_my_result(uuid), preview_candidate_result(uuid), set_recruitment_consent(uuid, boolean), respond_to_offer(uuid, boolean),
  promote_waitlisted(uuid, uuid), remove_from_waitlist(uuid, uuid, text), set_onboarding(uuid, uuid, boolean, boolean, text),
  preview_public_results(uuid)
  to authenticated;
grant execute on function recruitment_run_due_jobs() to service_role;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table recruitment_results_config enable row level security;
create policy "admins manage result settings" on recruitment_results_config for all using (is_admin()) with check (is_admin());

commit;
