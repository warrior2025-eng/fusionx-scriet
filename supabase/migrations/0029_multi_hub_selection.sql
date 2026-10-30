-- Selecting one candidate in more than one hub.
--
-- By default nothing changes: selected in one hub closes the other hubs. An
-- admin can allow more than one hub for a whole cycle (one_hub_mode =
-- 'allow_multiple') or for one candidate ("Keep both" on the board, stored in
-- recruitment_team_status.multi_hub_allowed). Wherever the one-hub rule is
-- checked, it is skipped for those candidates (recruitment_multi_hub_ok).
--
-- After the results, an admin can select a selected candidate in another hub
-- they applied to (select_additional_hub). That is a normal selection in that
-- hub, with its own Accept or Decline. Each selected hub stands on its own.
--
-- No row changes here: the new column starts false, and results already
-- published stay exactly as they are.
--
-- Run once, as one piece.

begin;

-- ── columns ────────────────────────────────────────────────────────────
alter table recruitment_cycles drop constraint recruitment_cycles_one_hub_mode_check;
alter table recruitment_cycles add constraint recruitment_cycles_one_hub_mode_check
  check (one_hub_mode in ('not_selected', 'keep_waitlisted', 'allow_multiple'));

alter table recruitment_team_status
  -- An admin chose "Keep both" when selecting this candidate in this hub.
  add column multi_hub_allowed boolean not null default false,
  -- Selected in this hub after the results were out (select_additional_hub).
  add column added_after_results boolean not null default false;

-- ── the rule ───────────────────────────────────────────────────────────
-- May this candidate hold a place in more than one hub?
create or replace function recruitment_multi_hub_ok(p_application uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
      select 1 from recruitment_applications a join recruitment_cycles c on c.id = a.cycle_id
      where a.id = p_application and c.one_hub_mode = 'allow_multiple')
    or exists (
      select 1 from recruitment_team_status s
      where s.application_id = p_application and s.multi_hub_allowed and s.stage = 'selected');
$$;

-- ── one decision ───────────────────────────────────────────────────────
-- p_hubs is the admin's answer when the candidate is already selected in
-- another hub: 'keep' (both stay selected) or 'move' (the one-hub rule). With
-- no answer, the cycle's setting and the candidate's earlier choice decide.
drop function recruitment_apply_decision(uuid, uuid, text, text, text, uuid, boolean);
create function recruitment_apply_decision(
  p_application uuid, p_team uuid, p_decision text, p_note text, p_reason text, p_actor uuid, p_admin boolean,
  p_hubs text default null, p_hubs_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur recruitment_team_status%rowtype; app recruitment_applications%rowtype; cyc recruitment_cycles%rowtype;
  att text; why text; new_stage recruitment_stage; other record; others integer := 0; hub text; rank_now integer; keep boolean;
begin
  if p_decision not in ('selected', 'waitlisted', 'not_selected', 'undecided') then raise exception 'Unknown decision'; end if;
  if p_hubs is not null and p_hubs not in ('keep', 'move') then raise exception 'Unknown choice'; end if;
  if p_hubs = 'keep' and not p_admin then raise exception 'Only an admin can keep a candidate in more than one hub'; end if;
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
  keep := coalesce(p_hubs = 'keep', recruitment_multi_hub_ok(p_application));

  update recruitment_team_status set
    stage = new_stage,
    stage_updated_at = case when cur.stage is distinct from new_stage then now() else stage_updated_at end,
    final_note = case when p_note is null then final_note else nullif(left(trim(p_note), 1000), '') end,
    waitlist_rank = case when new_stage <> 'waitlisted' then null
                         when cur.stage = 'waitlisted' then cur.waitlist_rank
                         else (select coalesce(max(x.waitlist_rank), 0) + 1 from recruitment_team_status x
                               where x.team_id = p_team and x.stage = 'waitlisted') end,
    decision_reason = case when p_decision = 'undecided' then null else why end,
    multi_hub_allowed = case when new_stage <> 'selected' or p_hubs = 'move' then false
                             when p_hubs = 'keep' then true
                             else cur.multi_hub_allowed and keep end,
    decided_by = p_actor, decided_at = now()
  where application_id = p_application and team_id = p_team
  returning waitlist_rank into rank_now;
  if cur.stage = 'waitlisted' and new_stage <> 'waitlisted' then perform recruitment_compact_waitlist(p_team); end if;

  if new_stage = 'selected' then
    if not keep then
      for other in
        select team_id, stage from recruitment_team_status where application_id = p_application and team_id <> p_team for update
      loop
        continue when other.stage = 'not_selected';
        continue when other.stage = 'waitlisted' and cyc.one_hub_mode = 'keep_waitlisted';
        update recruitment_team_status set stage = 'not_selected', waitlist_rank = null, decision_reason = 'one_hub', multi_hub_allowed = false,
          decided_by = p_actor, decided_at = now(), stage_updated_at = now()
        where application_id = p_application and team_id = other.team_id;
        if other.stage = 'waitlisted' then perform recruitment_compact_waitlist(other.team_id); end if;
        others := others + 1;
      end loop;
    end if;
  elsif cur.stage = 'selected' then
    -- No longer selected here: a hub closed only because of this selection is undecided again,
    -- unless the candidate still holds a place in another hub.
    update recruitment_team_status set stage = 'interview', decision_reason = null, decided_by = p_actor, decided_at = now(), stage_updated_at = now()
    where application_id = p_application and team_id <> p_team and decision_reason = 'one_hub'
      and not exists (select 1 from recruitment_team_status x where x.application_id = p_application and x.team_id <> p_team and x.stage = 'selected');
  end if;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (p_actor, 'set_decision', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', hub || ': ' || cur.stage::text || ' -> ' || new_stage::text
            || case when why = 'override' then ' (absent rule overridden: ' || left(trim(p_reason), 300) || ')' else '' end
            || case when others > 0 then ' (' || others || ' other hub(s) set to not selected)' else '' end
            || case when p_hubs = 'keep' then ' (kept in more than one hub' || coalesce(': ' || nullif(left(trim(p_hubs_reason), 300), ''), '') || ')' else '' end));
  return jsonb_build_object('stage', new_stage, 'waitlist_rank', rank_now, 'others_changed', others);
end $$;

drop function set_final_decision(uuid, uuid, text, text, text);
create function set_final_decision(
  p_application uuid, p_team uuid, p_decision text, p_note text default null, p_reason text default null,
  p_hubs text default null, p_hubs_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (is_admin() or is_team_reviewer(p_team)) then raise exception 'FORBIDDEN'; end if;
  return recruitment_apply_decision(p_application, p_team, p_decision, p_note, p_reason, auth.uid(), is_admin(), p_hubs, p_hubs_reason);
end $$;

-- ── readiness ──────────────────────────────────────────────────────────
-- Only a duplicate that is not allowed blocks scheduling and publishing.
create or replace function recruitment_readiness(p_cycle uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  with st as (
    select s.*, a.full_name, a.id as app_id
    from recruitment_team_status s join recruitment_applications a on a.id = s.application_id
    where a.cycle_id = p_cycle and a.status = 'submitted'
  ), doubles as (
    select app_id, min(full_name) as full_name, recruitment_multi_hub_ok(app_id) as allowed
    from st where stage = 'selected' group by app_id having count(*) > 1
  )
  select jsonb_build_object(
    'undecided', (select count(*) from st where stage not in ('selected', 'waitlisted', 'not_selected')),
    'undecided_attended', (select count(*) from st where stage not in ('selected', 'waitlisted', 'not_selected')
                             and recruitment_attendance(app_id) = 'attended'),
    'conflicts', (select count(*) from doubles where not allowed),
    'conflict_names', coalesce((select jsonb_agg(coalesce(full_name, 'Candidate') order by full_name) from doubles where not allowed), '[]'::jsonb),
    'multi_hub', (select count(*) from doubles where allowed),
    'selected_people', (select count(distinct app_id) from st where stage = 'selected'),
    'selected_places', (select count(*) from st where stage = 'selected'),
    'locked', (select decisions_locked from recruitment_cycles where id = p_cycle),
    'scheduled', (select results_scheduled from recruitment_cycles where id = p_cycle),
    'visible', recruitment_results_visible(p_cycle));
$$;

-- ── the result message and what a candidate sees ───────────────────────
create or replace function recruitment_result_message(p_application uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare a recruitment_applications%rowtype; o jsonb; cyc text; note text; both_hubs text; places integer;
begin
  select * into a from recruitment_applications where id = p_application;
  select title into cyc from recruitment_cycles where id = a.cycle_id;
  o := recruitment_outcome(p_application);
  -- Selected in more than one hub: one message that names them all.
  select count(*), string_agg(t.name, ' and ' order by s.rank) into places, both_hubs
  from recruitment_team_status s join recruitment_teams t on t.id = s.team_id
  where s.application_id = p_application and s.stage = 'selected';
  if places > 1 then
    return coalesce(recruitment_render('selected', a.full_name, both_hubs, cyc, null), 'Your result is on your status page.');
  end if;
  if o ->> 'outcome' in ('selected', 'waitlisted') then
    select final_note into note from recruitment_team_status where application_id = p_application and team_id = (o ->> 'team_id')::uuid;
  end if;
  return coalesce(note, case o ->> 'outcome'
    when 'selected' then recruitment_render('selected', a.full_name, o ->> 'hub', cyc, null)
    when 'waitlisted' then recruitment_render('waitlisted', a.full_name, o ->> 'hub', cyc, (o ->> 'rank')::integer)
    when 'absent' then recruitment_render('absent', a.full_name, null, cyc, null)
    else recruitment_render('not_selected', a.full_name, o ->> 'hub', cyc, null) end, 'Your result is on your status page.');
end $$;

-- As before, plus selected_hubs: every selected hub with its own message,
-- WhatsApp link and Accept or Decline. `selected` stays the first of them.
create or replace function recruitment_result_for(p_cycle uuid, p_user uuid, p_force boolean)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  c recruitment_cycles%rowtype; a recruitment_applications%rowtype; cfg recruitment_results_config%rowtype;
  sel record; deadline timestamptz; hubs jsonb; places jsonb; o jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', s.team_id, 'team_name', t.name,
      'whatsapp_url', (select l.whatsapp_group_url from recruitment_team_links l where l.team_id = s.team_id),
      'offer_status', s.offer_status, 'offer_deadline', d.at,
      'can_respond', s.offer_status = 'pending' and now() < d.at)
      order by s.rank), '[]'::jsonb)
    into places
  from recruitment_team_status s
  join recruitment_teams t on t.id = s.team_id
  cross join lateral (select coalesce(s.promoted_at, c.results_publish_at, now()) + make_interval(days => coalesce(cfg.offer_days, 3)) as at) d
  where s.application_id = a.id and s.stage = 'selected';

  return jsonb_build_object(
    'state', case when recruitment_results_visible(p_cycle) then 'published' else 'preview' end,
    'outcome', o ->> 'outcome', 'hub', o ->> 'hub', 'name', a.full_name, 'cycle_title', c.title,
    'consent', a.public_consent, 'hubs', hubs, 'selected_hubs', places,
    'selected', case when sel.team_id is not null then jsonb_build_object(
      'team_id', sel.team_id, 'team_name', sel.name,
      'whatsapp_url', (select l.whatsapp_group_url from recruitment_team_links l where l.team_id = sel.team_id),
      'offer_status', sel.offer_status, 'offer_deadline', deadline,
      'can_respond', sel.offer_status = 'pending' and now() < deadline) end,
    'induction', case when sel.team_id is not null then jsonb_build_object(
      'at', cfg.induction_at, 'mode', cfg.induction_mode, 'link', cfg.induction_link,
      'venue', cfg.induction_venue, 'note', cfg.induction_note) end);
end $$;

-- Accept or decline one place. Answering one hub leaves every other hub as it is.
-- Without p_team: the first selected hub, as before.
drop function respond_to_offer(uuid, boolean);
create function respond_to_offer(p_cycle uuid, p_accept boolean, p_team uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a recruitment_applications%rowtype; c recruitment_cycles%rowtype; s recruitment_team_status%rowtype; hub text; days integer; deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  perform recruitment_run_cycle_jobs(p_cycle);
  if not recruitment_results_visible(p_cycle) then raise exception 'Results are not out yet'; end if;
  select * into a from recruitment_applications where cycle_id = p_cycle and user_id = auth.uid() and status = 'submitted';
  if not found then raise exception 'Application not found'; end if;
  select * into s from recruitment_team_status where application_id = a.id and stage = 'selected' and (p_team is null or team_id = p_team)
  order by rank limit 1 for update;
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

-- ── after the results ──────────────────────────────────────────────────
create or replace function promote_waitlisted(p_application uuid, p_team uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur recruitment_team_status%rowtype; a recruitment_applications%rowtype; c recruitment_cycles%rowtype;
  hub text; other record; was integer; allowed boolean;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found or cur.stage <> 'waitlisted' then raise exception 'This candidate is not on the waitlist'; end if;
  select * into a from recruitment_applications where id = p_application;
  if a.status <> 'submitted' then raise exception 'This application was withdrawn'; end if;
  select * into c from recruitment_cycles where id = a.cycle_id;
  if not recruitment_results_visible(c.id) then raise exception 'Before the results are out, change the decision on the board instead'; end if;
  allowed := recruitment_multi_hub_ok(p_application);
  if not allowed and exists (select 1 from recruitment_team_status where application_id = p_application and team_id <> p_team and stage = 'selected') then
    raise exception 'This candidate already holds a place in another hub';
  end if;
  select name into hub from recruitment_teams where id = p_team;
  was := cur.waitlist_rank;

  update recruitment_team_status set stage = 'selected', waitlist_rank = null, promoted_at = now(), offer_status = 'pending',
    offer_responded_at = null, decision_reason = null, decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
  where application_id = p_application and team_id = p_team;
  perform recruitment_compact_waitlist(p_team);
  if not allowed then
    for other in select team_id, stage from recruitment_team_status where application_id = p_application and team_id <> p_team for update loop
      continue when other.stage = 'not_selected';
      continue when other.stage = 'waitlisted' and c.one_hub_mode = 'keep_waitlisted';
      update recruitment_team_status set stage = 'not_selected', waitlist_rank = null, decision_reason = 'one_hub', decided_at = now(), stage_updated_at = now()
      where application_id = p_application and team_id = other.team_id;
      if other.stage = 'waitlisted' then perform recruitment_compact_waitlist(other.team_id); end if;
    end loop;
  end if;

  insert into notifications (user_id, title, body, link)
  values (a.user_id, 'You have been offered a place', coalesce(cur.final_note, recruitment_render('selected', a.full_name, hub, c.title, null))
          || ' Please accept or decline on your status page.', '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'promoted_from_waitlist', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', hub || ': waitlist #' || coalesce(was::text, '?') || ' -> selected'));
  return jsonb_build_object('stage', 'selected');
end $$;

-- "Select in another hub": a normal selection in one more hub they applied to,
-- for someone already selected. Only after the results; before that the board
-- decides. A hub they declined or let expire is closed.
create or replace function select_additional_hub(p_application uuid, p_team uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur recruitment_team_status%rowtype; a recruitment_applications%rowtype; c recruitment_cycles%rowtype; hub text; why text;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  if not found then raise exception 'This application does not list that hub'; end if;
  select * into a from recruitment_applications where id = p_application;
  if a.status <> 'submitted' then raise exception 'This application was withdrawn'; end if;
  select * into c from recruitment_cycles where id = a.cycle_id;
  if not recruitment_results_visible(c.id) then raise exception 'Before the results are out, change the decision on the board instead'; end if;
  if cur.stage = 'selected' then raise exception 'This candidate is already selected in that hub'; end if;
  if cur.decision_reason in ('declined', 'expired') then raise exception 'This candidate already answered for that hub, or let the time pass'; end if;
  if not exists (select 1 from recruitment_team_status where application_id = p_application and team_id <> p_team and stage = 'selected') then
    raise exception 'This candidate is not selected in another hub';
  end if;
  if recruitment_attendance(p_application) = 'no_show' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason to override the absent rule'; end if;
    why := 'override';
  end if;
  select name into hub from recruitment_teams where id = p_team;

  update recruitment_team_status set stage = 'selected', waitlist_rank = null, promoted_at = now(), offer_status = 'pending',
    offer_responded_at = null, decision_reason = why, multi_hub_allowed = true, added_after_results = true,
    decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
  where application_id = p_application and team_id = p_team;
  if cur.stage = 'waitlisted' then perform recruitment_compact_waitlist(p_team); end if;

  insert into notifications (user_id, title, body, link)
  values (a.user_id, 'Congratulations! You have been selected in ' || hub,
          coalesce(cur.final_note, recruitment_render('selected', a.full_name, hub, c.title, null))
          || ' Please accept or decline on your status page.', '/recruitment/status');
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'selected_additional_hub', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', hub || ': ' || cur.stage::text || ' -> selected'
            || case when why = 'override' then ' (absent rule overridden: ' || left(trim(p_reason), 300) || ')' else '' end));
  return jsonb_build_object('stage', 'selected');
end $$;

-- ── the public lists ───────────────────────────────────────────────────
-- As before, plus the totals: people count once, places once per hub.
create or replace function recruitment_public_results_for(p_cycle uuid, p_force boolean)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare c recruitment_cycles%rowtype; hubs jsonb; people integer; places integer;
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

  select count(distinct s.application_id), count(*) into people, places
  from recruitment_team_status s
  join recruitment_applications a on a.id = s.application_id
  join recruitment_teams t on t.id = s.team_id
  where t.cycle_id = p_cycle and t.is_visible and s.stage = 'selected' and a.status = 'submitted';

  return jsonb_build_object(
    'state', case when recruitment_results_visible(p_cycle) then 'published' else 'preview' end,
    'cycle_title', c.title, 'publish_at', c.results_publish_at,
    'show_selected', c.show_selected_publicly, 'show_waitlist', c.show_waitlist_publicly, 'hubs', hubs,
    'selected_people', people, 'selected_places', places);
end $$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  recruitment_multi_hub_ok(uuid),
  recruitment_apply_decision(uuid, uuid, text, text, text, uuid, boolean, text, text),
  set_final_decision(uuid, uuid, text, text, text, text, text),
  respond_to_offer(uuid, boolean, uuid),
  select_additional_hub(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function
  set_final_decision(uuid, uuid, text, text, text, text, text),
  respond_to_offer(uuid, boolean, uuid),
  select_additional_hub(uuid, uuid, text)
  to authenticated;

commit;
