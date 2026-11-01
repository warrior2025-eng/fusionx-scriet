-- Core members' visibility belongs to admins.
--
-- Anyone in at least one Core team has their profile, photo, bio and links shown on the
-- Core page: the three options are on when they join, and only an admin can change them.
-- Someone removed from every team keeps the values and gets the options back. Email is not
-- on profiles and these options never touch it.

-- Everyone already in a team.
update profiles p set is_profile_public = true, is_contact_public = true, show_on_core = true
where exists (select 1 from core_group_members m where m.user_id = p.id)
  and not (p.is_profile_public and p.is_contact_public and p.show_on_core);

-- Joining a team turns the three on.
create function core_member_visibility_on()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles set is_profile_public = true, is_contact_public = true, show_on_core = true
  where id = new.user_id and not (is_profile_public and is_contact_public and show_on_core);
  return new;
end $$;
create trigger trg_core_member_visibility_on after insert on core_group_members
  for each row execute function core_member_visibility_on();

-- A Core member's own direct update can't change them; the rest of the update goes through.
create function guard_core_member_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.is_profile_public is distinct from old.is_profile_public
       or new.is_contact_public is distinct from old.is_contact_public
       or new.show_on_core is distinct from old.show_on_core)
     and exists (select 1 from core_group_members m where m.user_id = old.id) then
    new.is_profile_public := old.is_profile_public;
    new.is_contact_public := old.is_contact_public;
    new.show_on_core := old.show_on_core;
  end if;
  return new;
end $$;
create trigger trg_guard_core_member_visibility before update on profiles
  for each row execute function guard_core_member_visibility();

-- The three switches in Admin → Core → Teams. is_admin() is the database side of the "team" capability.
create function core_set_member_visibility(p_user uuid, p_profile boolean, p_contact boolean, p_core boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_profile is null or p_contact is null or p_core is null then raise exception 'Choose on or off for each switch'; end if;
  if not exists (select 1 from core_group_members m where m.user_id = p_user) then
    raise exception 'This person is not in a Core team';
  end if;
  update profiles set is_profile_public = p_profile, is_contact_public = p_contact, show_on_core = p_core where id = p_user;
  insert into audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'set_core_member_visibility', 'profiles', p_user::text,
          jsonb_build_object('profile_visible', p_profile, 'links_shown', p_contact, 'on_core_page', p_core));
end $$;

-- What the public reads: now the whole bio (the form allows 600), with its line breaks. The
-- card shows the first lines with "Read more". The rest is as in 0031.
create or replace function get_core_teams()
returns table (group_id uuid, group_name text, group_description text, group_kind text, member_id uuid,
               full_name text, avatar_url text, department text, year text, bio text, title text, is_lead boolean,
               linkedin_url text, github_url text, portfolio_url text)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.description, g.kind, m.id,
         left(p.full_name, 120),
         case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end,
         left(nullif(btrim(p.department), ''), 120),
         left(nullif(btrim(p.year), ''), 20),
         left(nullif(btrim(p.bio), ''), 600),
         m.title, m.is_lead,
         case when p.is_contact_public and p.linkedin_url ~* '^https?://\S+$' then p.linkedin_url end,
         case when p.is_contact_public and p.github_url ~* '^https?://\S+$' then p.github_url end,
         case when p.is_contact_public and p.portfolio_url ~* '^https?://\S+$' then p.portfolio_url end
  from core_groups g
  join core_group_members m on m.group_id = g.id
  join profiles p on p.id = m.user_id
  where g.is_visible and m.is_visible and p.show_on_core and p.is_active
  order by g.display_order, g.created_at, m.is_lead desc, m.display_order, m.created_at;
$$;

-- What an admin reads: also the other two switches.
drop function admin_core_members();
create function admin_core_members()
returns table (member_id uuid, group_id uuid, user_id uuid, title text, is_lead boolean, is_visible boolean,
               full_name text, email text, avatar_url text, department text, year text,
               incomplete boolean, show_on_core boolean, is_profile_public boolean, is_contact_public boolean, is_active boolean, last_reminded_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select m.id, m.group_id, m.user_id, m.title, m.is_lead, m.is_visible,
         p.full_name, u.email::text, p.avatar_url, p.department, p.year,
         core_profile_incomplete(p.avatar_url, p.bio), p.show_on_core, p.is_profile_public, p.is_contact_public, p.is_active,
         (select max(o.last_reminded_at) from core_group_members o where o.user_id = m.user_id)
  from core_group_members m
  join profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  order by m.group_id, m.is_lead desc, m.display_order, m.created_at;
end $$;

revoke all on function
  core_member_visibility_on(), guard_core_member_visibility(), core_set_member_visibility(uuid, boolean, boolean, boolean), admin_core_members()
  from public, anon, authenticated;
grant execute on function core_set_member_visibility(uuid, boolean, boolean, boolean), admin_core_members() to authenticated;
