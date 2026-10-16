-- Recruitment: "Task" moves to after the result.
--
-- The candidate timeline is now Applied → Shortlisted → Interview → Result →
-- Task. The old "task" stage before the interview is retired: any row still
-- in it goes back to "shortlisted" (no message is sent; nothing else moves).
--
-- A hub can now set one post-result task for the candidates selected into it:
--   recruitment_hub_tasks         one per hub: title, description, deadline,
--                                 optional link, published or not
--   recruitment_task_submissions  one per selected candidate: not started →
--                                 submitted → reviewed
-- Candidates never read these tables. They go through my_recruitment_tasks()
-- and submit_recruitment_task(), which return or accept a task only for a hub
-- the candidate is selected for, and only once the results are out. When a
-- published task meets selected candidates after the results (on publishing,
-- on saving the task, on a waitlist promotion) they get a notification once.
--
-- Run once, as one piece. Running it again changes nothing.

begin;

-- ── the old stage ──────────────────────────────────────────────────────
do $$
declare moved integer;
begin
  update recruitment_team_status set stage = 'shortlisted', stage_updated_at = now() where stage = 'task';
  get diagnostics moved = row_count;
  if moved > 0 then
    insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (null, 'retired_task_stage', 'recruitment_team_status', 'task', jsonb_build_object('note', moved || ' row(s) moved from Task back to Shortlisted'));
  end if;
  raise notice 'Task stage: % row(s) moved to shortlisted', moved;
end $$;

-- ── tables ─────────────────────────────────────────────────────────────
create table if not exists recruitment_hub_tasks (
  team_id uuid primary key references recruitment_teams(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text check (char_length(description) <= 4000),
  deadline timestamptz,
  link text check (link is null or (link ~* '^https://[^\s]+$' and char_length(link) <= 500)),
  is_published boolean not null default false,
  published_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_task_submissions (
  team_id uuid not null references recruitment_hub_tasks(team_id) on delete cascade,
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'submitted', 'reviewed')),
  link text check (link is null or (link ~* '^https://[^\s]+$' and char_length(link) <= 500)),
  notified_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  primary key (team_id, application_id)
);

drop trigger if exists trg_recruitment_hub_tasks_updated_at on recruitment_hub_tasks;
create trigger trg_recruitment_hub_tasks_updated_at before update on recruitment_hub_tasks
  for each row execute function set_updated_at();

alter table recruitment_hub_tasks enable row level security;
alter table recruitment_task_submissions enable row level security;

-- Admins only. Candidates read and submit through the functions below.
drop policy if exists "admins manage hub tasks" on recruitment_hub_tasks;
create policy "admins manage hub tasks" on recruitment_hub_tasks for all using (is_admin()) with check (is_admin());
drop policy if exists "admins manage task submissions" on recruitment_task_submissions;
create policy "admins manage task submissions" on recruitment_task_submissions for all using (is_admin()) with check (is_admin());

-- ── notifying ──────────────────────────────────────────────────────────
-- Selected candidates of a hub with a published task, after the results, who
-- have not been told yet: a submission row ("not started") and one notification.
create or replace function recruitment_notify_tasks(p_cycle uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- Admins, the scheduled job, and the results being published (which may run on a candidate's visit, as the system).
  if auth.uid() is not null and not is_admin() and coalesce(current_setting('fx.recruitment_system', true), '') <> 'on' then
    return 0;
  end if;
  if not recruitment_results_visible(p_cycle) then return 0; end if;
  with fresh as (
    insert into recruitment_task_submissions (team_id, application_id, user_id, notified_at)
    select k.team_id, a.id, a.user_id, now()
    from recruitment_hub_tasks k
    join recruitment_teams t on t.id = k.team_id and t.cycle_id = p_cycle
    join recruitment_team_status s on s.team_id = k.team_id and s.stage = 'selected'
    join recruitment_applications a on a.id = s.application_id and a.status = 'submitted'
    where k.is_published
    on conflict (team_id, application_id) do nothing
    returning team_id, user_id
  ), told as (
    insert into notifications (user_id, title, body, link)
    select f.user_id, 'Your hub has shared a task',
           t.name || ': ' || k.title
             || case when k.deadline is not null
                     then '. Please complete it by ' || to_char(k.deadline at time zone 'Asia/Kolkata', 'FMDD FMMonth, FMHH12:MI AM') || ' IST.'
                     else '.' end,
           '/recruitment/status'
    from fresh f join recruitment_hub_tasks k on k.team_id = f.team_id join recruitment_teams t on t.id = f.team_id
    returning 1
  )
  select count(*) into n from told;
  return n;
end $$;

-- When the results come out (scheduled or "publish now"), and when someone is
-- selected after that (a waitlist promotion).
create or replace function recruitment_tasks_on_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.results_published_at is not null and old.results_published_at is null
     or new.status = 'results_published' and old.status <> 'results_published' then
    perform recruitment_notify_tasks(new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_recruitment_tasks_on_publish on recruitment_cycles;
create trigger trg_recruitment_tasks_on_publish after update on recruitment_cycles
  for each row execute function recruitment_tasks_on_publish();

create or replace function recruitment_tasks_on_selected()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'selected' and old.stage is distinct from 'selected' then
    perform recruitment_notify_tasks((select cycle_id from recruitment_applications where id = new.application_id));
  end if;
  return new;
end $$;
drop trigger if exists trg_recruitment_tasks_on_selected on recruitment_team_status;
create trigger trg_recruitment_tasks_on_selected after update of stage on recruitment_team_status
  for each row execute function recruitment_tasks_on_selected();

-- ── the candidate's side ───────────────────────────────────────────────
-- The tasks of the hubs this person is selected for, once the results are out. Nothing otherwise.
create or replace function my_recruitment_tasks(p_cycle uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'team_id', k.team_id, 'team_name', t.name, 'title', k.title, 'description', k.description,
           'deadline', k.deadline, 'link', k.link,
           'status', coalesce(x.status, 'not_started'), 'submission_link', x.link, 'submitted_at', x.submitted_at)
           order by s.rank), '[]'::jsonb)
  from recruitment_applications a
  join recruitment_team_status s on s.application_id = a.id and s.stage = 'selected'
  join recruitment_hub_tasks k on k.team_id = s.team_id and k.is_published
  join recruitment_teams t on t.id = k.team_id
  left join recruitment_task_submissions x on x.team_id = k.team_id and x.application_id = a.id
  where a.cycle_id = p_cycle and a.user_id = auth.uid() and a.status = 'submitted'
    and recruitment_results_visible(p_cycle);
$$;

-- "Mark as submitted", with an optional link. A reviewed task stays reviewed.
create or replace function submit_recruitment_task(p_team uuid, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare app recruitment_applications%rowtype; link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if link is not null and (link !~* '^https://[^\s]+$' or char_length(link) > 500) then
    raise exception 'Use a full link that starts with https://';
  end if;
  select a.* into app
  from recruitment_applications a
  join recruitment_team_status s on s.application_id = a.id and s.team_id = p_team and s.stage = 'selected'
  join recruitment_hub_tasks k on k.team_id = p_team and k.is_published
  where a.user_id = auth.uid() and a.status = 'submitted' and recruitment_results_visible(a.cycle_id);
  if not found then raise exception 'There is no task for you in this hub'; end if;
  insert into recruitment_task_submissions (team_id, application_id, user_id, status, link, submitted_at)
  values (p_team, app.id, auth.uid(), 'submitted', link, now())
  on conflict (team_id, application_id) do update
    set link = excluded.link, submitted_at = now(),
        status = case when recruitment_task_submissions.status = 'reviewed' then 'reviewed' else 'submitted' end;
end $$;

revoke all on function recruitment_notify_tasks(uuid), recruitment_tasks_on_publish(), recruitment_tasks_on_selected() from public, anon;
revoke all on function my_recruitment_tasks(uuid), submit_recruitment_task(uuid, text) from public, anon;
grant execute on function recruitment_notify_tasks(uuid), my_recruitment_tasks(uuid), submit_recruitment_task(uuid, text) to authenticated;

commit;
