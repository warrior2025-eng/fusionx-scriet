-- Which photo a public card shows:
--   1. a photo an admin set for that card (Admin → Mentors, or the person's website-section entry),
--   2. otherwise the member's own profile photo (their upload, or else the automatic Google/GitHub one),
--   3. otherwise initials (no photo).
-- profiles.avatar_url holds the member's upload when they made one; the automatic photo only
-- fills it while it is empty and they have never chosen a photo themselves (avatar_set_by_user).

alter table profiles add column if not exists avatar_set_by_user boolean not null default false;

-- Photos already uploaded to our avatars bucket were chosen by their owner.
update profiles set avatar_set_by_user = true
where avatar_url like '%/storage/v1/object/public/avatars/%' and not avatar_set_by_user;

-- As in 0039, with the admin photo first.
create or replace function get_public_mentors()
returns table (id uuid, full_name text, avatar_url text, department text, year text, bio text, title text,
               expertise text[], availability text, show_on_core boolean,
               linkedin_url text, github_url text, portfolio_url text)
language sql security definer stable set search_path = public as $$
  select m.id,
         left(coalesce(p.full_name, m.name), 120),
         case when m.photo_path ~* '^https?://\S+$' then m.photo_path
              when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end,
         left(nullif(btrim(p.department), ''), 120),
         left(nullif(btrim(p.year), ''), 20),
         left(coalesce(nullif(btrim(p.bio), ''), nullif(btrim(m.bio), '')), 1000),
         m.role_title, m.expertise, m.availability, m.show_on_core,
         case when p.id is null then case when m.linkedin_url ~* '^https?://\S+$' then m.linkedin_url end
              when p.is_contact_public and p.linkedin_url ~* '^https?://\S+$' then p.linkedin_url end,
         case when p.is_contact_public and p.github_url ~* '^https?://\S+$' then p.github_url end,
         case when p.is_contact_public and p.portfolio_url ~* '^https?://\S+$' then p.portfolio_url end
  from mentors m
  left join profiles p on p.id = m.user_id
  where m.is_published and (m.user_id is null or p.is_active)
  order by m.display_order, m.created_at;
$$;

-- The photo an admin set for this person's card, if any: their mentor entry, or a visible
-- website-section entry (Admin → Team) linked to their account.
create function admin_card_photo(p_user uuid)
returns text language sql security definer stable set search_path = public as $$
  select coalesce(
    (select m.photo_path from mentors m where m.user_id = p_user and m.photo_path ~* '^https?://\S+$'
       order by m.is_published desc, m.display_order limit 1),
    (select o.photo_path from org_people o where o.linked_profile_id = p_user and o.is_visible and o.photo_path ~* '^https?://\S+$'
       order by o.display_order limit 1));
$$;

-- As in 0034, with an admin-set photo first.
create or replace function get_core_teams()
returns table (group_id uuid, group_name text, group_description text, group_kind text, member_id uuid,
               full_name text, avatar_url text, department text, year text, bio text, title text, is_lead boolean,
               linkedin_url text, github_url text, portfolio_url text)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.description, g.kind, m.id,
         left(p.full_name, 120),
         coalesce(admin_card_photo(p.id), case when p.avatar_url ~* '^https?://\S+$' then p.avatar_url end),
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

-- For /profile: whether the FusionX team set the photo on my card.
create function my_card_has_admin_photo()
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and admin_card_photo(auth.uid()) is not null;
$$;

revoke all on function admin_card_photo(uuid), my_card_has_admin_photo() from public, anon, authenticated;
grant execute on function my_card_has_admin_photo() to authenticated;
