-- Selecting a candidate in a hub they did not apply to.
--
-- An admin, with a reason, adds a recruitment_team_status row for that hub with
-- added_by_admin = true. The application itself stays as it was: its answers
-- and preferences are untouched. Before the results nothing is sent and the
-- candidate sees nothing of it. After the results it is a normal selection,
-- with its own Accept or Decline, notification and email.
--
-- A candidate only ever sees such a row once the results are out and only
-- while it is a selection (or one they answered): a hub they never applied to
-- must not appear as "not selected" or "in review".
--
-- No row changes here: the new columns start empty, and results already
-- published stay exactly as they are.
--
-- Run once, as one piece.

begin;

-- ── columns ────────────────────────────────────────────────────────────
alter table recruitment_team_status
  add column added_by_admin boolean not null default false,
  add column added_reason text check (added_reason is null or char_length(added_reason) <= 300);

-- moved: an admin moved them to a hub they did not apply to, and this place ended.
alter table recruitment_team_status drop constraint recruitment_team_status_decision_reason_check;
alter table recruitment_team_status add constraint recruitment_team_status_decision_reason_check
  check (decision_reason in ('absent', 'one_hub', 'override', 'declined', 'expired', 'removed', 'moved'));

-- ── the action ─────────────────────────────────────────────────────────
-- p_keep: keep the hubs they are selected in now (true), or end those places
-- and hold only this one (false). Before the results it follows the same lock
-- as any decision; after them, it tells the candidate once.
create or replace function select_unapplied_hub(p_application uuid, p_team uuid, p_reason text, p_keep boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a recruitment_applications%rowtype; c recruitment_cycles%rowtype; cur recruitment_team_status%rowtype; t recruitment_teams%rowtype;
  had boolean; why text; visible boolean; holds boolean; moved text; note text := left(trim(coalesce(p_reason, '')), 300);
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if note = '' then raise exception 'Give a reason to select someone in a hub they did not apply to'; end if;
  select * into a from recruitment_applications where id = p_application;
  if not found then raise exception 'Application not found'; end if;
  if a.status <> 'submitted' then raise exception 'This application was withdrawn'; end if;
  select * into t from recruitment_teams where id = p_team;
  if not found or t.cycle_id <> a.cycle_id then raise exception 'That hub is not in this recruitment'; end if;
  -- A share lock on the cycle: locking decisions waits for this, and the other way round.
  select * into c from recruitment_cycles where id = a.cycle_id for share;
  visible := recruitment_results_visible(c.id);
  if not visible then perform recruitment_assert_editable(c.id); end if;

  select * into cur from recruitment_team_status where application_id = p_application and team_id = p_team for update;
  had := found;
  if had and not cur.added_by_admin then raise exception 'This candidate applied to that hub'; end if;
  if had and cur.stage = 'selected' then raise exception 'This candidate is already selected in that hub'; end if;
  if had and cur.decision_reason in ('declined', 'expired') then raise exception 'This candidate already answered for that hub, or let the time pass'; end if;
  if recruitment_attendance(p_application) = 'no_show' then why := 'override'; end if;

  perform 1 from recruitment_team_status where application_id = p_application and team_id <> p_team and stage = 'selected' for update;
  holds := found;
  if holds and not p_keep then
    select string_agg(x.name, ' and ' order by s.rank) into moved
    from recruitment_team_status s join recruitment_teams x on x.id = s.team_id
    where s.application_id = p_application and s.team_id <> p_team and s.stage = 'selected';
    update recruitment_team_status set stage = 'not_selected', decision_reason = 'moved', multi_hub_allowed = false, offer_status = null,
      decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
    where application_id = p_application and team_id <> p_team and stage = 'selected';
  end if;

  if had then
    update recruitment_team_status set stage = 'selected', waitlist_rank = null, decision_reason = why, added_reason = note,
      multi_hub_allowed = holds and p_keep, offer_status = case when visible then 'pending' end, offer_responded_at = null,
      promoted_at = case when visible then now() end, added_after_results = visible,
      decided_by = auth.uid(), decided_at = now(), stage_updated_at = now()
    where application_id = p_application and team_id = p_team;
    if cur.stage = 'waitlisted' then perform recruitment_compact_waitlist(p_team); end if;
  else
    insert into recruitment_team_status (application_id, team_id, rank, stage, decision_reason, added_by_admin, added_reason,
      multi_hub_allowed, offer_status, promoted_at, added_after_results, decided_by, decided_at)
    values (p_application, p_team, (select coalesce(max(s.rank), 0) + 1 from recruitment_team_status s where s.application_id = p_application),
      'selected', why, true, note, holds and p_keep, case when visible then 'pending' end, case when visible then now() end, visible, auth.uid(), now());
  end if;

  if visible then
    insert into notifications (user_id, title, body, link)
    values (a.user_id, 'Congratulations! You have been selected in ' || t.name,
            coalesce(cur.final_note, recruitment_render('selected', a.full_name, t.name, c.title, null))
            || coalesce(' This replaces your place in ' || moved || '.', '')
            || ' Please accept or decline on your status page.', '/recruitment/status');
    -- The hub's task, if it has one (an inserted row does not reach the stage trigger).
    perform recruitment_notify_tasks(c.id);
  end if;

  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'selected_unapplied_hub', 'recruitment_applications', p_application::text,
          jsonb_build_object('note', t.name || ': ' || note
            || case when why = 'override' then ' (absent rule overridden)' else '' end
            || case when moved is not null then ' (moved from ' || moved || ')' when holds then ' (kept their other hubs)' else '' end));
  return jsonb_build_object('stage', 'selected', 'notified', visible);
end $$;

-- ── what a candidate sees ──────────────────────────────────────────────
-- A row added by an admin shows only while it is a selection, or one they answered.
create or replace function recruitment_candidate_sees(p_added boolean, p_stage recruitment_stage, p_reason text)
returns boolean language sql immutable set search_path = public as $$
  select not p_added or p_stage = 'selected' or coalesce(p_reason, '') in ('declined', 'expired');
$$;

create or replace function recruitment_outcome(p_application uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  with r as (
    select s.*, t.name as hub from recruitment_team_status s join recruitment_teams t on t.id = s.team_id
    where s.application_id = p_application and recruitment_candidate_sees(s.added_by_admin, s.stage, s.decision_reason)
  )
  select coalesce(
    (select jsonb_build_object('outcome', 'selected', 'team_id', team_id, 'hub', hub) from r where stage = 'selected' order by rank limit 1),
    (select jsonb_build_object('outcome', 'waitlisted', 'team_id', team_id, 'hub', hub, 'rank', waitlist_rank) from r where stage = 'waitlisted' order by rank limit 1),
    (select jsonb_build_object('outcome', decision_reason, 'team_id', team_id, 'hub', hub) from r where decision_reason in ('declined', 'expired') order by rank limit 1),
    (select jsonb_build_object('outcome', 'in_review') from r where stage not in ('selected', 'waitlisted', 'not_selected') limit 1),
    (select jsonb_build_object('outcome', 'absent') from r where decision_reason = 'absent' limit 1),
    jsonb_build_object('outcome', 'not_selected', 'hub', (select string_agg(hub, ', ' order by rank) from r)));
$$;

-- As in 0029, leaving out the rows above.
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
  where s.application_id = a.id and recruitment_candidate_sees(s.added_by_admin, s.stage, s.decision_reason);
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

-- The candidate's own hubs. Before the results a row added by an admin stays
-- hidden, so the status page cannot give the decision away.
drop function my_recruitment_status(uuid);
create function my_recruitment_status(p_cycle uuid)
returns table (team_id uuid, team_name text, rank smallint, stage text, stage_updated_at timestamptz,
               interview_at timestamptz, interview_location text, final_note text, results_out boolean, added_by_admin boolean)
language sql security definer stable set search_path = public as $$
  select s.team_id, t.name, s.rank,
         case when not recruitment_results_visible(c.id) and s.stage in ('selected', 'waitlisted', 'not_selected')
              then 'in_review' else s.stage::text end,
         s.stage_updated_at,
         case when s.stage = 'interview' or recruitment_results_visible(c.id) then s.interview_at end,
         case when s.stage = 'interview' or recruitment_results_visible(c.id) then s.interview_location end,
         case when recruitment_results_visible(c.id) then s.final_note end,
         recruitment_results_visible(c.id),
         s.added_by_admin
  from recruitment_applications a
  join recruitment_cycles c on c.id = a.cycle_id
  join recruitment_team_status s on s.application_id = a.id
  join recruitment_teams t on t.id = s.team_id
  where a.cycle_id = p_cycle and a.user_id = auth.uid() and a.status = 'submitted'
    and (not s.added_by_admin or (recruitment_results_visible(c.id) and recruitment_candidate_sees(s.added_by_admin, s.stage, s.decision_reason)))
  order by s.rank;
$$;

-- ── who may call what ──────────────────────────────────────────────────
revoke all on function
  select_unapplied_hub(uuid, uuid, text, boolean),
  recruitment_candidate_sees(boolean, recruitment_stage, text),
  my_recruitment_status(uuid)
  from public, anon, authenticated;
grant execute on function
  select_unapplied_hub(uuid, uuid, text, boolean),
  my_recruitment_status(uuid)
  to authenticated;

commit;
