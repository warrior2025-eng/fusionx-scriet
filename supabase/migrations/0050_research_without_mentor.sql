-- Research topics no longer wait for a mentor. "Accept and start" on a research topic starts it at once, like a
-- project idea: a published project (shown in Projects, others can ask to join), owned by the member, with fixed
-- dated milestones over 12 weeks, so every step has a deadline in My work. Help comes from the core team.
-- Only the research branch of ap_idea_accept changes; project ideas work exactly as in migration 0045.
-- Additive only: no table or policy changes.

-- The fixed research steps: (week, title). "paper": a short paper or report; "patent": an idea to a patent filing.
create or replace function ap_research_steps(p_variation text) returns table (week integer, title text, plan_key text, sort integer)
language sql immutable as $$
  select * from (values
    (2,  'Read what is already known and note the gaps',          'research-1', 1),
    (3,  'Fix the research question and the method',              'research-2', 2),
    (8,  'Collect the data or run the experiments',               'research-3', 3),
    (10, 'Analyse the results',                                    'research-4', 4),
    (12, 'Write it up and share it (report or paper)',            'research-5', 5)
  ) v(week, title, plan_key, sort) where coalesce(p_variation, 'paper') <> 'patent'
  union all
  select * from (values
    (2,  'Search for similar patents and products (prior art)',   'patent-1', 1),
    (5,  'Write what is new about the idea (the claims, in plain words)', 'patent-2', 2),
    (9,  'Build a prototype or proof that it works',              'patent-3', 3),
    (12, 'Prepare the filing draft and review it with the core team', 'patent-4', 4)
  ) v(week, title, plan_key, sort) where p_variation = 'patent';
$$;

create or replace function ap_idea_accept(p_idea uuid, p_variation text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d idea_drafts; pid uuid; weeks integer; techs text[]; active integer; v text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into d from idea_drafts where id = p_idea and published_at is not null and deleted_at is null and not hidden;
  if d.id is null then raise exception 'This idea is no longer available.'; end if;
  if d.kind = 'research' then
    -- The same limit as any tracked project.
    select count(*) into active from projects where owner_id = auth.uid() and tracked and status not in ('completed');
    if active >= ap_num('project_limit') then raise exception 'You already track % active projects. Finish one first.', active; end if;
    v := case when p_variation = 'patent' then 'patent' else 'paper' end;
    techs := array(select btrim(x) from unnest(string_to_array(coalesce(d.data ->> 'tools', ''), ',')) x where btrim(x) <> '' limit 8);
    insert into projects (title, slug, description, owner_id, status, technologies, is_published, idea_id, domain, tracked, plan_variation, target_date)
    values (d.title, trim(both '-' from regexp_replace(lower(d.title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
            d.pitch || E'\n\nQuestion: ' || coalesce(d.data ->> 'question', '') || E'\n\nMethod: ' || coalesce(d.data ->> 'method', ''),
            auth.uid(), 'building', techs, true, d.id, 'Research', true, 'research-' || v, ap_today() + 84)
    returning id into pid;
    insert into project_milestones (project_id, title, due_on, sort, plan_key)
    select pid, s.title, ap_today() + 7 * s.week, s.sort, s.plan_key from ap_research_steps(v) s;
    delete from idea_member_states where idea_id = d.id and user_id = auth.uid();
    perform ap_project_log(pid, ap_name(auth.uid()) || ' started this research topic');
    perform ap_log('idea_research', ap_name(auth.uid()) || ' started research "' || d.title || '"', 'Accepted from My work', 'project', pid);
    perform ap_ai_refresh();
    return pid;
  end if;
  techs := array(select btrim(x) from unnest(string_to_array(coalesce(d.data ->> 'stack', ''), ',')) x where btrim(x) <> '' limit 8);
  weeks := case coalesce(nullif(p_variation, ''), 'lite') when 'ambitious' then 12 when 'standard' then 8 else 4 end;
  insert into projects (title, slug, description, owner_id, status, technologies, is_published, idea_id)
  values (d.title, trim(both '-' from regexp_replace(lower(d.title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          d.pitch || E'\n\n' || coalesce(d.data ->> 'problem', '') || E'\n\n' || coalesce(d.data ->> 'solution', ''), auth.uid(), 'building', techs, true, d.id)
  returning id into pid;
  perform ap_project_set_plan(pid, coalesce(nullif(p_variation, ''), 'lite'), ap_today() + 7 * weeks, true);
  update projects set status = 'building' where id = pid;
  delete from idea_member_states where idea_id = d.id and user_id = auth.uid();
  perform ap_log('idea_projects', ap_name(auth.uid()) || ' started "' || d.title || '"', 'Accepted from My work', 'project', pid);
  perform ap_ai_refresh();
  return pid;
end;
$$;

revoke all on function ap_idea_accept(uuid, text), ap_research_steps(text) from public, anon, authenticated;
grant execute on function ap_idea_accept(uuid, text) to authenticated;
