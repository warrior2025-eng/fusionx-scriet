-- File storage: project images and event posters.
-- Buckets are public-read (images need to render on public pages without
-- a signed URL) but writes are locked down by role/ownership below.

insert into storage.buckets (id, name, public)
values
  ('project-images', 'project-images', true),
  ('event-posters', 'event-posters', true)
on conflict (id) do nothing;

-- project-images: any signed-in member can upload, but only into a path
-- prefixed with their own user id (enforced by convention in the upload
-- code: `${user.id}/...`), and only staff/the uploader can remove it.

create policy "project images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'project-images');

create policy "members upload their own project images"
  on storage.objects for insert
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners and staff delete project images"
  on storage.objects for delete
  using (
    bucket_id = 'project-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_staff())
  );

-- event-posters: staff-only, since only staff create events.

create policy "event posters are publicly readable"
  on storage.objects for select
  using (bucket_id = 'event-posters');

create policy "staff upload event posters"
  on storage.objects for insert
  with check (bucket_id = 'event-posters' and is_staff());

create policy "staff delete event posters"
  on storage.objects for delete
  using (bucket_id = 'event-posters' and is_staff());
