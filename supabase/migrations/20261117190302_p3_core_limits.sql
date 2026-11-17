-- Phase 3 core: limits for the owner's projects (P3 core spec §5.10, D67). Earlier migrations are
-- never edited; this one raises the schedule-imports bucket to 50 MB per file and widens the two
-- schedules checks that bound an import: the stored original's size (1 byte to 50 MB) and the
-- activity count (0 to 50,000). Each check keeps its name: the old one is dropped by the name
-- PostgreSQL gave it in p3_core_schedules and p3_core_imports, and the new one is added in the
-- same statement. No function is created or replaced, so there is nothing to revoke.

-- 1. The bucket (P2 storage migration: 20 MB).
update storage.buckets set file_size_limit = 52428800 where id = 'schedule-imports';

-- 2. The column checks (§4.6, §5.10).
alter table public.schedules
  drop constraint schedules_activity_count_check,
  add constraint schedules_activity_count_check check (activity_count between 0 and 50000),
  drop constraint schedules_source_file_size_check,
  add constraint schedules_source_file_size_check
    check (source_file_size between 1 and 52428800);
