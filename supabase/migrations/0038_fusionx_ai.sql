-- FusionX AI: the chat assistant on public pages (app/api/fusionx-ai).
--
-- ai_settings: one row, set in Admin → Settings → FusionX AI. Readable by anyone,
--   because everything in it is shown publicly anyway (the welcome, the suggestions,
--   the "extra public facts" the assistant may repeat). Only admins change it.
-- ai_hits: one row per question, for the per-visitor limit and the daily cap. Keyed by
--   a keyed hash of the address and an anonymous id; nothing that names a person.
--   Nobody reads or writes it directly: only the server, through ai_take_turn.
-- ai_questions: optional log of questions (no address, no name, no email), for
--   improving the facts. Admins read it; rows older than 30 days are deleted.

begin;

create table ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  welcome text not null default 'Hi! I''m FusionX AI. Ask me about FusionX: the hubs, events, how to join, or the Core team.'
    check (char_length(welcome) between 1 and 500),
  suggestions text[] not null default array['What is FusionX?', 'What are the FusionX Hubs?', 'How do I join?', 'Upcoming events']
    check (cardinality(suggestions) <= 6),
  extra_facts text not null default '' check (char_length(extra_facts) <= 8000),
  visitor_limit integer not null default 15 check (visitor_limit between 1 and 100),
  daily_cap integer not null default 400 check (daily_cap between 1 and 5000),
  log_questions boolean not null default true,
  knowledge_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into ai_settings (id) values (true);
create trigger trg_ai_settings_updated_at before update on ai_settings for each row execute function set_updated_at();
alter table ai_settings enable row level security;
create policy "ai settings are publicly readable" on ai_settings for select using (true);
create policy "only admins update ai settings" on ai_settings for update using (is_admin()) with check (is_admin());

create table ai_hits (
  id bigserial primary key,
  key_hash text not null,
  at timestamptz not null default now()
);
create index idx_ai_hits_key on ai_hits (key_hash, at);
create index idx_ai_hits_at on ai_hits (at);
alter table ai_hits enable row level security;

create table ai_questions (
  id bigserial primary key,
  question text not null check (char_length(question) <= 500),
  outcome text not null check (outcome in ('answered', 'dont_know', 'declined', 'fallback', 'resting')),
  created_at timestamptz not null default now()
);
create index idx_ai_questions_at on ai_questions (created_at desc);
alter table ai_questions enable row level security;
create policy "admins read ai questions" on ai_questions for select using (is_admin());

-- One question from one visitor: within their limit for the last 10 minutes and the day's cap
-- (India time)? Counts it if so.
create function ai_take_turn(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s ai_settings%rowtype;
  mine integer;
  today integer;
begin
  select * into s from ai_settings where id;
  if not found or not s.enabled then return jsonb_build_object('ok', false, 'reason', 'off'); end if;
  if random() < 0.02 then delete from ai_hits where at < now() - interval '2 days'; end if;
  select count(*) into mine from ai_hits where key_hash = p_key and at > now() - interval '10 minutes';
  if mine >= s.visitor_limit then return jsonb_build_object('ok', false, 'reason', 'visitor'); end if;
  select count(*) into today from ai_hits where at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
  if today >= s.daily_cap then return jsonb_build_object('ok', false, 'reason', 'daily'); end if;
  insert into ai_hits (key_hash) values (left(p_key, 128));
  return jsonb_build_object('ok', true);
end $$;

create function ai_log_question(p_question text, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select log_questions from ai_settings where id), false) then return; end if;
  insert into ai_questions (question, outcome) values (left(btrim(p_question), 500), p_outcome);
  delete from ai_questions where created_at < now() - interval '30 days';
end $$;

revoke all on ai_hits, ai_questions from anon;
revoke all on function ai_take_turn(text), ai_log_question(text, text) from public, anon, authenticated;
grant execute on function ai_take_turn(text), ai_log_question(text, text) to service_role;

commit;
