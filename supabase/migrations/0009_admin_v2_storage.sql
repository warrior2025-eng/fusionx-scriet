-- Admin v2, step 3 of 4: storage.
--
-- Two new public-read buckets, writable by admins only, and size / type
-- limits on every bucket so the rules hold even for a direct API upload.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('team-photos', 'team-photos', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('site-assets', 'site-assets', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do nothing;

update storage.buckets
  set file_size_limit = 4194304,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id in ('project-images', 'event-posters');

update storage.buckets
  set file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'avatars';

create policy "team photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'team-photos');

create policy "admins upload team photos"
  on storage.objects for insert
  with check (bucket_id = 'team-photos' and is_admin());

create policy "admins update team photos"
  on storage.objects for update
  using (bucket_id = 'team-photos' and is_admin())
  with check (bucket_id = 'team-photos' and is_admin());

create policy "admins delete team photos"
  on storage.objects for delete
  using (bucket_id = 'team-photos' and is_admin());

create policy "site assets are publicly readable"
  on storage.objects for select
  using (bucket_id = 'site-assets');

create policy "admins upload site assets"
  on storage.objects for insert
  with check (bucket_id = 'site-assets' and is_admin());

create policy "admins update site assets"
  on storage.objects for update
  using (bucket_id = 'site-assets' and is_admin())
  with check (bucket_id = 'site-assets' and is_admin());

create policy "admins delete site assets"
  on storage.objects for delete
  using (bucket_id = 'site-assets' and is_admin());

commit;
