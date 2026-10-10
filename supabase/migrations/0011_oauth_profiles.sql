-- Google and GitHub sign-in: new accounts get a proper name and photo.
--
-- Replaces handle_new_user (last defined in 0008). It still runs once, when an
-- account is created, so later sign-ins never touch a profile and a photo the
-- user uploaded is never overwritten. The sign-up switch is kept.
--
--   full_name  <- full_name, else name, else the part of the email before @
--   avatar_url <- avatar_url, else picture (https only)

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  photo text := coalesce(nullif(meta->>'avatar_url', ''), nullif(meta->>'picture', ''));
begin
  if not coalesce((select signup_enabled from public.organization_settings where id), true) then
    raise exception 'Sign-up is currently closed';
  end if;

  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(trim(meta->>'full_name'), ''),
      nullif(trim(meta->>'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'
    ), 120),
    case when photo like 'https://%' then photo end
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'member');

  return new;
end;
$$;
