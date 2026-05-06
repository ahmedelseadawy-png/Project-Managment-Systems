-- V140_05_PROJECT_SUBCONTRACTOR_SCOPE.sql
-- Purpose:
-- Subcontractors are global master data, but project screens and dashboards must show
-- only subcontractors linked to the active project.
-- Safe to run after V140_04. Does not touch V140_01 approval functions or users.role enum.

begin;

create table if not exists public.project_subcontractors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  trade_scope text null,
  notes text null,
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_project_subcontractors unique(project_id, subcontractor_id)
);

create index if not exists idx_project_subcontractors_project on public.project_subcontractors(project_id) where is_active = true;
create index if not exists idx_project_subcontractors_subcontractor on public.project_subcontractors(subcontractor_id) where is_active = true;

-- Backfill project links from existing project-scoped data.
insert into public.project_subcontractors(project_id, subcontractor_id, trade_scope, is_active)
select distinct b.project_id, b.subcontractor_id, s.trade_scope, true
from public.subcontract_breakdown b
join public.subcontractors s on s.id = b.subcontractor_id
where b.project_id is not null and b.subcontractor_id is not null
on conflict(project_id, subcontractor_id) do update set is_active = true, updated_at = now();

insert into public.project_subcontractors(project_id, subcontractor_id, trade_scope, is_active)
select distinct c.project_id, c.subcontractor_id, s.trade_scope, true
from public.subcontractor_contracts c
join public.subcontractors s on s.id = c.subcontractor_id
where c.project_id is not null and c.subcontractor_id is not null
on conflict(project_id, subcontractor_id) do update set is_active = true, updated_at = now();

insert into public.project_subcontractors(project_id, subcontractor_id, trade_scope, is_active)
select distinct i.project_id, i.subcontractor_id, s.trade_scope, true
from public.subcontractor_invoices i
join public.subcontractors s on s.id = i.subcontractor_id
where i.project_id is not null and i.subcontractor_id is not null
on conflict(project_id, subcontractor_id) do update set is_active = true, updated_at = now();

insert into public.project_subcontractors(project_id, subcontractor_id, trade_scope, is_active)
select distinct a.project_id, a.subcontractor_id, s.trade_scope, true
from public.subcontractor_work_assignments a
join public.subcontractors s on s.id = a.subcontractor_id
where a.project_id is not null and a.subcontractor_id is not null
on conflict(project_id, subcontractor_id) do update set is_active = true, updated_at = now();

create or replace view public.v_project_subcontractors as
select
  ps.id as project_subcontractor_id,
  ps.project_id,
  ps.subcontractor_id,
  s.subcontractor_code,
  s.name,
  coalesce(ps.trade_scope, s.trade_scope) as trade_scope,
  s.contact_person,
  s.phone,
  s.email,
  s.address,
  s.tax_registration_no,
  s.commercial_reg_no,
  s.default_retention_pct,
  s.advance_amount,
  s.advance_recovery_pct,
  s.status,
  ps.is_active as project_link_active,
  ps.notes as project_link_notes,
  ps.created_at as project_link_created_at,
  ps.updated_at as project_link_updated_at
from public.project_subcontractors ps
join public.subcontractors s on s.id = ps.subcontractor_id
where ps.is_active = true;

-- Dashboard view now starts from project_subcontractors, then augments from contracts,
-- IMPORTANT: existing V140_04 view column order is preserved; subcontractor_code is appended at the end to avoid PostgreSQL view column rename errors.
-- work assignments, invoices, and breakdown. This prevents global subcontractors from
-- leaking into a project dashboard.
create or replace view public.v_subcontractor_dashboard as
with project_subs_raw as (
  select ps.project_id, ps.subcontractor_id, s.subcontractor_code,
         coalesce(s.name, 'Subcontractor') as subcontractor_name,
         coalesce(ps.trade_scope, s.trade_scope, 'General') as trade
  from public.project_subcontractors ps
  join public.subcontractors s on s.id = ps.subcontractor_id
  where ps.is_active = true

  union all
  select c.project_id, c.subcontractor_id, s.subcontractor_code,
         coalesce(s.name, c.subcontractor_name, 'Subcontractor') as subcontractor_name,
         coalesce(s.trade_scope, 'General') as trade
  from public.subcontractor_contracts c
  left join public.subcontractors s on s.id = c.subcontractor_id
  where c.project_id is not null and c.subcontractor_id is not null

  union all
  select a.project_id, a.subcontractor_id, s.subcontractor_code,
         coalesce(s.name, a.subcontractor_name, 'Subcontractor') as subcontractor_name,
         coalesce(a.trade, s.trade_scope, 'General') as trade
  from public.subcontractor_work_assignments a
  left join public.subcontractors s on s.id = a.subcontractor_id
  where a.project_id is not null and a.subcontractor_id is not null

  union all
  select i.project_id, i.subcontractor_id, s.subcontractor_code,
         coalesce(s.name, 'Subcontractor') as subcontractor_name,
         coalesce(s.trade_scope, 'General') as trade
  from public.subcontractor_invoices i
  left join public.subcontractors s on s.id = i.subcontractor_id
  where i.project_id is not null and i.subcontractor_id is not null

  union all
  select b.project_id, b.subcontractor_id, s.subcontractor_code,
         coalesce(s.name, 'Subcontractor') as subcontractor_name,
         coalesce(s.trade_scope, 'General') as trade
  from public.subcontract_breakdown b
  left join public.subcontractors s on s.id = b.subcontractor_id
  where b.project_id is not null and b.subcontractor_id is not null and coalesce(b.is_active, true) = true
), project_subs as (
  select project_id, subcontractor_id,
         max(subcontractor_code) as subcontractor_code,
         max(subcontractor_name) as subcontractor_name,
         max(trade) as trade
  from project_subs_raw
  group by project_id, subcontractor_id
), contract_totals as (
  select project_id, subcontractor_id, count(*) contracts_count, sum(coalesce(contract_value,0)) contract_value
  from public.subcontractor_contracts
  where project_id is not null and subcontractor_id is not null
  group by project_id, subcontractor_id
), assignment_totals as (
  select project_id, subcontractor_id,
    count(*) assigned_buildings,
    count(*) filter(where status='in_progress') working_buildings,
    count(*) filter(where status='not_started') not_started_buildings,
    count(*) filter(where status='completed') completed_buildings,
    count(*) filter(where status='paused') paused_buildings,
    count(*) filter(where status='delayed') delayed_buildings,
    round(avg(coalesce(progress_percent,0)),3) progress_percent
  from public.subcontractor_work_assignments
  where project_id is not null and subcontractor_id is not null
  group by project_id, subcontractor_id
), invoice_totals as (
  select i.project_id, i.subcontractor_id,
    sum(coalesce(i.net_payable,i.net_amount,i.gross_amount,0)) certified_amount,
    sum(coalesce(i.released_payment_amount,i.ceo_released_amount,0)) paid_amount,
    count(*) filter(where coalesce(i.status,'') not in ('Approved','Paid','Cancelled','Rejected')) open_invoices
  from public.subcontractor_invoices i
  where i.project_id is not null and i.subcontractor_id is not null
  group by i.project_id, i.subcontractor_id
)
select
  ps.project_id,
  ps.subcontractor_id,
  ps.subcontractor_name,
  coalesce(ps.trade,'General') trade,
  coalesce(a.assigned_buildings,0) assigned_buildings,
  coalesce(a.working_buildings,0) working_buildings,
  coalesce(a.not_started_buildings,0) not_started_buildings,
  coalesce(a.completed_buildings,0) completed_buildings,
  coalesce(a.paused_buildings,0) paused_buildings,
  coalesce(a.delayed_buildings,0) delayed_buildings,
  coalesce(a.progress_percent,0) progress_percent,
  coalesce(ct.contracts_count,0) contracts_count,
  coalesce(ct.contract_value,0) contract_value,
  coalesce(it.certified_amount,0) certified_amount,
  coalesce(it.paid_amount,0) paid_amount,
  coalesce(it.open_invoices,0) open_invoices,
  case
    when coalesce(a.assigned_buildings,0)=0 then 'Not Started'
    when coalesce(a.delayed_buildings,0)>0 then 'Delayed'
    when coalesce(a.progress_percent,0)>=90 then 'On Track'
    when coalesce(a.progress_percent,0)>=50 then 'Needs Attention'
    when coalesce(a.progress_percent,0)>0 then 'In Progress'
    else 'Not Started'
  end health_status,
  ps.subcontractor_code
from project_subs ps
left join assignment_totals a on a.project_id = ps.project_id and a.subcontractor_id = ps.subcontractor_id
left join contract_totals ct on ct.project_id = ps.project_id and ct.subcontractor_id = ps.subcontractor_id
left join invoice_totals it on it.project_id = ps.project_id and it.subcontractor_id = ps.subcontractor_id;

alter table public.project_subcontractors enable row level security;

drop policy if exists project_subcontractors_auth_all on public.project_subcontractors;
create policy project_subcontractors_auth_all on public.project_subcontractors
for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.project_subcontractors to authenticated;
grant select on public.v_project_subcontractors to authenticated;
grant select on public.v_subcontractor_dashboard to authenticated;

notify pgrst, 'reload schema';

commit;
