-- ============================================================
-- V140_06_DISCIPLINE_LIBRARY.sql
-- Purpose:
--   Make BOQ disciplines project-configurable and use them as
--   contract trades in Smart Breakdown.
-- Safe/additive:
--   - Does NOT touch V140_01 approval workflow.
--   - Does NOT change public.users.role enum.
--   - Does NOT delete business data.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.v140_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.project_disciplines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_disciplines_name_not_empty check (length(trim(name)) > 0),
  constraint uq_project_disciplines_project_name unique(project_id, name)
);

create index if not exists idx_project_disciplines_project_active
  on public.project_disciplines(project_id, sort_order, name)
  where is_active = true;

drop trigger if exists trg_project_disciplines_updated_at on public.project_disciplines;
create trigger trg_project_disciplines_updated_at
before update on public.project_disciplines
for each row execute function public.v140_touch_updated_at();

-- Drop old fixed-list CHECK constraints that lock discipline to a hard-coded list.
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

-- Important: do NOT ALTER TYPE here. In V140 base schema, discipline is already text;
-- only old CHECK constraints were blocking custom values. ALTER TYPE fails when
-- dependent views like v_technical_overdue use technical_records.*.
-- If a future legacy database has discipline as a real enum, handle it with a
-- dedicated migration that drops/recreates dependent views first.

insert into public.project_disciplines(project_id, name, sort_order, is_active)
select p.id, d.name, d.sort_order, true
from public.projects p
cross join (values
  ('Structural', 10),
  ('Architectural', 20),
  ('MEP', 30),
  ('Civil', 40),
  ('Infrastructure', 50),
  ('Landscaping', 60),
  ('Fit-Out', 70),
  ('Facade', 80),
  ('Other', 900)
) as d(name, sort_order)
on conflict(project_id, name) do update set is_active = true, sort_order = excluded.sort_order, updated_at = now();

insert into public.project_disciplines(project_id, name, sort_order, is_active)
select distinct b.project_id, trim(b.discipline), 100, true
from public.boq_items b
where b.project_id is not null
  and b.discipline is not null
  and length(trim(b.discipline)) > 0
on conflict(project_id, name) do update set is_active = true, updated_at = now();

create or replace view public.v_project_discipline_usage as
select
  pd.project_id,
  pd.id as discipline_id,
  pd.name,
  pd.sort_order,
  pd.is_active,
  count(b.id) as boq_items_count
from public.project_disciplines pd
left join public.boq_items b
  on b.project_id = pd.project_id
 and lower(trim(b.discipline)) = lower(trim(pd.name))
group by pd.project_id, pd.id, pd.name, pd.sort_order, pd.is_active;

commit;
