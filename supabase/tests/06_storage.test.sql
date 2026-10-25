begin;
\ir _helpers.psql
select plan(1);
select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('project-covers', 'schedule-imports') order by id $$,
  $$ values ('project-covers'::text, false, 5242880::bigint, array['image/jpeg', 'image/png']::text[]), ('schedule-imports', false, 20971520::bigint, null::text[]) $$,
  'two private buckets with their limits');
select * from finish();
rollback;
