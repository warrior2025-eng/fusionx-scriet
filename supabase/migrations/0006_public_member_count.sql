-- One public number for the home page: how many students have joined.
--
-- Why a function: the profiles RLS policy lets a visitor see only public
-- profiles, a member those plus their own, and staff all of them, so a plain
-- count(*) on profiles gave three different answers depending on who was
-- looking. This returns the same number to everyone.
--
-- It returns a count only. Never rows, names, emails or ids. No RLS policy is
-- changed: an anonymous select on profiles still returns only public profiles.
--
-- What is counted: accounts that have verified their email, excluding anyone
-- who holds the faculty or mentor role (they are not students). Admins and
-- editors are students here, so they are counted.

create or replace function public.get_member_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null
    and not exists (
      select 1
      from public.user_roles r
      where r.user_id = p.id
        and r.role in ('faculty', 'mentor')
    );
$$;

revoke all on function public.get_member_count() from public;
grant execute on function public.get_member_count() to anon, authenticated;
