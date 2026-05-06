-- ============================================================
-- SQL_FIX_V140_06_DISCIPLINE_VIEW_DEPENDENCY.sql
-- Use only if V140_06 failed with:
--   cannot alter type of a column used by a view or rule
--
-- Root cause: discipline columns are already TEXT in V140. The failing
-- ALTER TYPE was unnecessary; old fixed-list CHECK constraints are the
-- only blocker for custom disciplines.
-- ============================================================

begin;

-- Drop fixed-list CHECK constraints that mention discipline.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as table_name, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.boq_items'::regclass, 'public.technical_records'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%discipline%'
  loop
    execute format('alter table %s drop constraint if exists %I', r.table_name, r.conname);
  end loop;
end $$;

commit;
