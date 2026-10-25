-- Private storage buckets and their policies (P2 spec §7.3, D5).
-- Object keys start with the workspace id: project-covers/{workspace_id}/{uuid}.{jpg|png} and
-- schedule-imports/{workspace_id}/{project_id}/{uuid}.{ext}. The first path segment is compared as
-- text with the caller's workspace ids, so a malformed path is simply denied. Members read; editors
-- and owners upload and delete. There is no update policy, so objects are never overwritten.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-covers', 'project-covers', false, 5242880, array['image/jpeg', 'image/png']),
  ('schedule-imports', 'schedule-imports', false, 20971520, null);

-- project-covers
create policy project_covers_select on storage.objects for select to authenticated
  using (
    bucket_id = 'project-covers'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('viewer') as id)
  );
create policy project_covers_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-covers'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
  );
create policy project_covers_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-covers'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
  );

-- schedule-imports
create policy schedule_imports_select on storage.objects for select to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('viewer') as id)
  );
create policy schedule_imports_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
  );
create policy schedule_imports_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
  );
