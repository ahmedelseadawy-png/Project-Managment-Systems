-- V140_13 Connected ERP workflow foundation
-- Safe/additive: reuses existing contract, invoice, procurement, finance, approval tables.

create extension if not exists pgcrypto;

create or replace function public.v140_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.erp_modules (
  module_key text primary key,
  module_label text not null,
  module_category text not null default 'Project',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.erp_modules(module_key,module_label,module_category,sort_order,is_active) values
('rfqs','RFQs','Project',72,true),
('supplier-offers','Supplier Offers','Project',73,true),
('quotation-comparison','Quotation Comparison','Project',74,true),
('workfronts','Workfronts','Project',42,true),
('payment-requests','Payment Requests','Finance',111,true)
on conflict(module_key) do update set
  module_label = excluded.module_label,
  module_category = excluded.module_category,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Contract breakdown: reuse subcontractor_contract_items and add workfront fields.
-- ---------------------------------------------------------------------------
create table if not exists public.subcontractor_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  subcontractor_id uuid null references public.subcontractors(id) on delete set null,
  subcontractor_name text null,
  contract_no text not null,
  contract_title text null,
  status text not null default 'Draft',
  scope_of_work text null,
  contract_date date null,
  start_date date null,
  end_date date null,
  currency text not null default 'EGP',
  contract_value numeric(18,3) not null default 0,
  pricing_basis text null,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subcontractor_contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.subcontractor_contracts(id) on delete cascade,
  boq_item_id uuid null,
  breakdown_item_id uuid null,
  item_code text null,
  description text not null,
  unit text null,
  quantity numeric(18,3) not null default 0,
  rate numeric(18,3) not null default 0,
  amount numeric(18,3) generated always as (quantity * rate) stored,
  sort_order integer not null default 100,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.subcontractor_contract_items
  add column if not exists project_id uuid null references public.projects(id) on delete cascade,
  add column if not exists subcontractor_id uuid null references public.subcontractors(id) on delete cascade,
  add column if not exists villa_id uuid null,
  add column if not exists building_id uuid null,
  add column if not exists villa_no text null,
  add column if not exists building_no text null,
  add column if not exists trade text null,
  add column if not exists item_description text null,
  add column if not exists contract_type text null default 'boq',
  add column if not exists planned_start_date date null,
  add column if not exists planned_finish_date date null,
  add column if not exists is_active boolean not null default true;

update public.subcontractor_contract_items ci
set
  project_id = coalesce(ci.project_id, c.project_id),
  subcontractor_id = coalesce(ci.subcontractor_id, c.subcontractor_id),
  item_description = coalesce(ci.item_description, ci.description),
  trade = coalesce(ci.trade, c.scope_of_work, s.trade_scope),
  contract_type = coalesce(ci.contract_type, c.pricing_basis, 'boq')
from public.subcontractor_contracts c
left join public.subcontractors s on s.id = c.subcontractor_id
where ci.contract_id = c.id;

update public.subcontractor_contract_items
set quantity = 1,
    rate = case when coalesce(rate,0) = 0 then coalesce(amount,0) else rate end
where lower(coalesce(contract_type,'')) in ('lump_sum','lump sum','lumpsum')
  and coalesce(quantity,0) <> 1;

create index if not exists idx_subcontractor_contract_items_project_sub
on public.subcontractor_contract_items(project_id, subcontractor_id)
where is_active = true;

create index if not exists idx_subcontractor_contract_items_contract
on public.subcontractor_contract_items(contract_id)
where is_active = true;

drop trigger if exists trg_subcontractor_contract_items_touch on public.subcontractor_contract_items;
create trigger trg_subcontractor_contract_items_touch
before update on public.subcontractor_contract_items
for each row execute function public.v140_touch_updated_at();

-- Backfill contract items from legacy subcontract_breakdown where no item exists yet.
insert into public.subcontractor_contract_items(
  contract_id,
  project_id,
  subcontractor_id,
  boq_item_id,
  breakdown_item_id,
  building_id,
  villa_id,
  building_no,
  villa_no,
  trade,
  item_code,
  description,
  item_description,
  unit,
  quantity,
  rate,
  contract_type,
  planned_start_date,
  planned_finish_date,
  notes
)
select
  c.id,
  b.project_id,
  b.subcontractor_id,
  b.boq_item_id,
  b.id,
  b.structure_id,
  b.structure_id,
  coalesce(sn.code, ps.structure_code),
  coalesce(sn.code, ps.structure_code),
  coalesce(s.trade_scope, b.project_model, 'General'),
  bi.item_code,
  coalesce(bi.description, b.assignment_key, 'Contract breakdown item'),
  coalesce(bi.description, b.assignment_key, 'Contract breakdown item'),
  coalesce(bi.unit, 'item'),
  case when lower(coalesce(b.contract_type,'')) like '%lump%' then 1 else coalesce(b.subcontract_qty, 0) end,
  case
    when lower(coalesce(b.contract_type,'')) like '%lump%' then coalesce(b.lump_sum_amount, b.contract_value, b.rate, 0)
    else coalesce(b.rate, 0)
  end,
  coalesce(nullif(b.contract_type,''), nullif(b.pricing_basis,''), 'boq'),
  null,
  null,
  b.notes
from public.subcontract_breakdown b
join public.subcontractor_contracts c
  on c.project_id = b.project_id
 and c.subcontractor_id = b.subcontractor_id
left join public.subcontractors s on s.id = b.subcontractor_id
left join public.boq_items bi on bi.id = b.boq_item_id
left join public.project_structure_nodes sn on sn.id = b.structure_id
left join public.project_structures ps on ps.id = b.structure_id
where coalesce(b.is_active, true) = true
  and not exists (
    select 1
    from public.subcontractor_contract_items ci
    where ci.breakdown_item_id = b.id
  );

create or replace view public.v_subcontractor_contract_breakdown as
select
  ci.id,
  ci.project_id,
  ci.subcontractor_id,
  ci.contract_id,
  ci.villa_id,
  ci.building_id,
  ci.villa_no,
  ci.building_no,
  coalesce(ci.trade, s.trade_scope, 'General') as trade,
  ci.boq_item_id,
  ci.item_code,
  coalesce(ci.item_description, ci.description) as item_description,
  ci.unit,
  ci.quantity,
  ci.rate,
  case
    when lower(coalesce(ci.contract_type,'')) in ('lump_sum','lump sum','lumpsum') then coalesce(ci.rate,0)
    else coalesce(ci.quantity,0) * coalesce(ci.rate,0)
  end as amount,
  coalesce(ci.contract_type, 'boq') as contract_type,
  ci.planned_start_date,
  ci.planned_finish_date,
  ci.created_by,
  ci.created_at,
  ci.updated_at
from public.subcontractor_contract_items ci
left join public.subcontractors s on s.id = ci.subcontractor_id
where coalesce(ci.is_active, true) = true;

-- ---------------------------------------------------------------------------
-- Workfront tracking: reuse subcontractor_work_assignments.
-- ---------------------------------------------------------------------------
create table if not exists public.subcontractor_work_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  contract_id uuid null references public.subcontractor_contracts(id) on delete set null,
  subcontractor_id uuid null references public.subcontractors(id) on delete cascade,
  subcontractor_name text null,
  trade text null,
  structure_id uuid null,
  building_code text null,
  building_name text null,
  status text not null default 'not_started',
  progress_percent numeric(9,3) not null default 0,
  planned_start date null,
  planned_finish date null,
  actual_start date null,
  actual_finish date null,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subcontractor_work_assignments
  add column if not exists villa_id uuid null,
  add column if not exists building_id uuid null,
  add column if not exists villa_no text null,
  add column if not exists building_no text null,
  add column if not exists planned_start_date date null,
  add column if not exists planned_finish_date date null,
  add column if not exists actual_start_date date null,
  add column if not exists actual_finish_date date null,
  add column if not exists actual_progress_percent numeric(9,3) null,
  add column if not exists planned_progress_percent numeric(9,3) null,
  add column if not exists delay_days integer null,
  add column if not exists health_status text null;

update public.subcontractor_work_assignments
set
  planned_start_date = coalesce(planned_start_date, planned_start),
  planned_finish_date = coalesce(planned_finish_date, planned_finish),
  actual_start_date = coalesce(actual_start_date, actual_start),
  actual_finish_date = coalesce(actual_finish_date, actual_finish),
  actual_progress_percent = coalesce(actual_progress_percent, progress_percent),
  building_no = coalesce(building_no, building_code),
  villa_no = coalesce(villa_no, building_code);

insert into public.subcontractor_work_assignments(
  project_id,
  contract_id,
  subcontractor_id,
  subcontractor_name,
  trade,
  structure_id,
  villa_id,
  building_id,
  villa_no,
  building_no,
  planned_start,
  planned_finish,
  planned_start_date,
  planned_finish_date,
  status,
  progress_percent,
  notes
)
select
  b.project_id,
  b.contract_id,
  b.subcontractor_id,
  s.name,
  b.trade,
  coalesce(b.villa_id, b.building_id),
  b.villa_id,
  b.building_id,
  b.villa_no,
  b.building_no,
  min(b.planned_start_date),
  max(b.planned_finish_date),
  min(b.planned_start_date),
  max(b.planned_finish_date),
  'not_started',
  0,
  'Backfilled from subcontractor contract breakdown'
from public.v_subcontractor_contract_breakdown b
left join public.subcontractors s on s.id = b.subcontractor_id
where b.project_id is not null
  and b.subcontractor_id is not null
group by b.project_id, b.contract_id, b.subcontractor_id, s.name, b.trade,
         coalesce(b.villa_id, b.building_id), b.villa_id, b.building_id, b.villa_no, b.building_no
having not exists (
  select 1
  from public.subcontractor_work_assignments a
  where a.project_id is not distinct from b.project_id
    and a.subcontractor_id is not distinct from b.subcontractor_id
    and a.contract_id is not distinct from b.contract_id
    and coalesce(a.villa_id, a.building_id, a.structure_id) is not distinct from coalesce(b.villa_id, b.building_id)
);

drop trigger if exists trg_subcontractor_work_assignments_touch on public.subcontractor_work_assignments;
create trigger trg_subcontractor_work_assignments_touch
before update on public.subcontractor_work_assignments
for each row execute function public.v140_touch_updated_at();

create or replace view public.v_subcontractor_workfronts as
with contract_values as (
  select
    project_id,
    subcontractor_id,
    contract_id,
    coalesce(villa_id, building_id) as workfront_id,
    sum(amount) as contract_value,
    sum(quantity) as contract_qty
  from public.v_subcontractor_contract_breakdown
  group by project_id, subcontractor_id, contract_id, coalesce(villa_id, building_id)
), certified as (
  select
    i.project_id,
    i.subcontractor_id,
    i.contract_id,
    coalesce(l.structure_id, l.structure_node_id) as workfront_id,
    sum(coalesce(l.current_value, l.cumulative_value, 0)) as certified_value,
    sum(coalesce(l.approved_qty, l.current_qty, 0)) as certified_qty
  from public.subcontractor_invoice_lines l
  join public.subcontractor_invoices i on i.id = l.invoice_id
  where lower(coalesce(i.status,'')) in ('approved','paid','partially released','pending finance review','pending ceo approval')
     or lower(coalesce(i.approval_status,'')) = 'approved'
  group by i.project_id, i.subcontractor_id, i.contract_id, coalesce(l.structure_id, l.structure_node_id)
), wf as (
  select
    a.id,
    a.project_id,
    a.subcontractor_id,
    a.contract_id,
    coalesce(a.villa_id, a.structure_id) as villa_id,
    coalesce(a.building_id, a.structure_id) as building_id,
    coalesce(a.villa_no, a.building_code, a.building_name) as villa_no,
    coalesce(a.building_no, a.building_code, a.building_name) as building_no,
    coalesce(a.trade, s.trade_scope, 'General') as trade,
    coalesce(a.planned_start_date, a.planned_start) as planned_start_date,
    coalesce(a.planned_finish_date, a.planned_finish) as planned_finish_date,
    coalesce(a.actual_start_date, a.actual_start) as actual_start_date,
    coalesce(a.actual_finish_date, a.actual_finish) as actual_finish_date,
    a.status as raw_status,
    a.notes,
    cv.contract_value,
    cv.contract_qty,
    cert.certified_value,
    cert.certified_qty,
    coalesce(
      a.actual_progress_percent,
      a.progress_percent,
      case
        when coalesce(cv.contract_value,0) > 0 then least(100, coalesce(cert.certified_value,0) / cv.contract_value * 100)
        when coalesce(cv.contract_qty,0) > 0 then least(100, coalesce(cert.certified_qty,0) / cv.contract_qty * 100)
        else 0
      end,
      0
    ) as actual_progress_percent
  from public.subcontractor_work_assignments a
  left join public.subcontractors s on s.id = a.subcontractor_id
  left join contract_values cv
    on cv.project_id is not distinct from a.project_id
   and cv.subcontractor_id is not distinct from a.subcontractor_id
   and cv.contract_id is not distinct from a.contract_id
   and cv.workfront_id is not distinct from coalesce(a.villa_id, a.building_id, a.structure_id)
  left join certified cert
    on cert.project_id is not distinct from a.project_id
   and cert.subcontractor_id is not distinct from a.subcontractor_id
   and cert.contract_id is not distinct from a.contract_id
   and cert.workfront_id is not distinct from coalesce(a.villa_id, a.building_id, a.structure_id)
), calc as (
  select
    wf.*,
    case
      when planned_start_date is null or planned_finish_date is null then 0
      when current_date <= planned_start_date then 0
      when current_date >= planned_finish_date then 100
      when planned_finish_date = planned_start_date then 100
      else least(100, greatest(0,
        (current_date - planned_start_date)::numeric / nullif((planned_finish_date - planned_start_date)::numeric,0) * 100
      ))
    end as planned_progress_percent
  from wf
)
select
  id,
  project_id,
  subcontractor_id,
  contract_id,
  villa_id,
  building_id,
  villa_no,
  building_no,
  trade,
  planned_start_date,
  planned_finish_date,
  actual_start_date,
  actual_finish_date,
  round(actual_progress_percent, 3) as actual_progress_percent,
  round(planned_progress_percent, 3) as planned_progress_percent,
  greatest(0, current_date - coalesce(planned_finish_date, current_date))::int as delay_days,
  case
    when lower(coalesce(raw_status,'')) = 'on hold' then 'On Hold'
    when actual_progress_percent >= 100 then 'Completed'
    when planned_start_date is not null and current_date < planned_start_date and actual_progress_percent = 0 then 'Not Started'
    when planned_start_date is not null and current_date > planned_start_date and actual_progress_percent = 0 then 'Delayed'
    when planned_finish_date is not null and current_date > planned_finish_date and actual_progress_percent < 100 then 'Delayed'
    when actual_progress_percent < planned_progress_percent - 10 then 'Delayed'
    when planned_finish_date is not null and planned_finish_date <= current_date + 7 and actual_progress_percent < 80 then 'At Risk'
    else 'Working'
  end as health_status,
  case
    when lower(coalesce(raw_status,'')) = 'on hold' then 'On Hold'
    when actual_progress_percent >= 100 then 'Completed'
    when planned_start_date is not null and current_date < planned_start_date and actual_progress_percent = 0 then 'Not Started'
    when planned_start_date is not null and current_date > planned_start_date and actual_progress_percent = 0 then 'Delayed'
    when planned_finish_date is not null and current_date > planned_finish_date and actual_progress_percent < 100 then 'Delayed'
    when actual_progress_percent < planned_progress_percent - 10 then 'Delayed'
    when planned_finish_date is not null and planned_finish_date <= current_date + 7 and actual_progress_percent < 80 then 'At Risk'
    else 'Working'
  end as status,
  notes
from calc;

drop view if exists public.v_subcontractor_dashboard cascade;
create view public.v_subcontractor_dashboard as
with dashboard_subs as (
  select distinct
    project_id,
    subcontractor_id
  from public.v_subcontractor_contract_breakdown
  where project_id is not null and subcontractor_id is not null

  union
  select distinct project_id, subcontractor_id
  from public.v_subcontractor_workfronts
  where project_id is not null and subcontractor_id is not null

  union
  select distinct project_id, subcontractor_id
  from public.subcontractor_invoices
  where project_id is not null and subcontractor_id is not null
), workfront_totals as (
  select
    project_id,
    subcontractor_id,
    max(trade) as trade,
    count(distinct coalesce(villa_id, building_id, id)) as assigned_buildings,
    count(*) filter (where status = 'Working') as working_count,
    count(*) filter (where status = 'Not Started') as not_started_count,
    count(*) filter (where status = 'Completed') as completed_count,
    count(*) filter (where status = 'Delayed') as delayed_count,
    count(*) filter (where status = 'At Risk') as at_risk_count,
    round(avg(actual_progress_percent), 3) as average_progress
  from public.v_subcontractor_workfronts
  group by project_id, subcontractor_id
), contract_totals as (
  select
    project_id,
    subcontractor_id,
    max(trade) as trade,
    sum(amount) as contract_value
  from public.v_subcontractor_contract_breakdown
  group by project_id, subcontractor_id
), invoice_totals as (
  select
    i.project_id,
    i.subcontractor_id,
    sum(coalesce(i.approved_certificate_amount, i.gross_amount, i.net_amount, 0)) as certified_value,
    sum(coalesce(i.released_payment_amount, i.ceo_released_amount, i.total_released_payments, 0)) as paid_value
  from public.subcontractor_invoices i
  where lower(coalesce(i.status,'')) not in ('draft','cancelled','rejected')
  group by i.project_id, i.subcontractor_id
), finance_totals as (
  select
    project_id,
    subcontractor_id,
    sum(coalesce(amount, 0)) filter (
      where lower(coalesce(status,'')) in ('paid','confirmed','posted','approved')
        and lower(coalesce(record_type,'')) not like '%deduction%'
    ) as paid_value
  from public.finance_records
  where subcontractor_id is not null
  group by project_id, subcontractor_id
)
select
  ds.project_id,
  ds.subcontractor_id,
  s.subcontractor_code,
  coalesce(s.name, 'Subcontractor') as subcontractor_name,
  coalesce(w.trade, ct.trade, s.trade_scope, 'General') as trade,
  coalesce(w.assigned_buildings, 0)::int as assigned_buildings,
  coalesce(w.working_count, 0)::int as working_count,
  coalesce(w.not_started_count, 0)::int as not_started_count,
  coalesce(w.completed_count, 0)::int as completed_count,
  coalesce(w.delayed_count, 0)::int as delayed_count,
  coalesce(w.at_risk_count, 0)::int as at_risk_count,
  coalesce(w.average_progress, 0)::numeric(9,3) as average_progress,
  coalesce(ct.contract_value, 0)::numeric(18,3) as contract_value,
  coalesce(it.certified_value, 0)::numeric(18,3) as certified_value,
  coalesce(ft.paid_value, it.paid_value, 0)::numeric(18,3) as paid_value,
  greatest(coalesce(it.certified_value, 0) - coalesce(ft.paid_value, it.paid_value, 0), 0)::numeric(18,3) as outstanding_value,
  case
    when coalesce(w.delayed_count,0) > 0 then 'Delayed'
    when coalesce(w.at_risk_count,0) > 0 then 'At Risk'
    when coalesce(w.assigned_buildings,0) > 0 and coalesce(w.completed_count,0) = coalesce(w.assigned_buildings,0) then 'Completed'
    when coalesce(w.assigned_buildings,0) > 0 and coalesce(w.not_started_count,0) = coalesce(w.assigned_buildings,0) then 'Not Started'
    else 'On Track'
  end as health_status,
  -- Backward-compatible aliases used by the current React dashboard.
  coalesce(w.working_count, 0)::int as working_buildings,
  coalesce(w.not_started_count, 0)::int as not_started_buildings,
  coalesce(w.completed_count, 0)::int as completed_buildings,
  0::int as paused_buildings,
  coalesce(w.delayed_count, 0)::int as delayed_buildings,
  coalesce(w.average_progress, 0)::numeric(9,3) as progress_percent,
  coalesce(it.certified_value, 0)::numeric(18,3) as certified_amount,
  coalesce(ft.paid_value, it.paid_value, 0)::numeric(18,3) as paid_amount,
  0::int as open_invoices
from dashboard_subs ds
left join public.subcontractors s on s.id = ds.subcontractor_id
left join workfront_totals w on w.project_id = ds.project_id and w.subcontractor_id = ds.subcontractor_id
left join contract_totals ct on ct.project_id = ds.project_id and ct.subcontractor_id = ds.subcontractor_id
left join invoice_totals it on it.project_id = ds.project_id and it.subcontractor_id = ds.subcontractor_id
left join finance_totals ft on ft.project_id = ds.project_id and ft.subcontractor_id = ds.subcontractor_id;

-- ---------------------------------------------------------------------------
-- Invoice/certificate and payment support.
-- ---------------------------------------------------------------------------
alter table if exists public.subcontractor_invoices
  add column if not exists period_from date null,
  add column if not exists period_to date null,
  add column if not exists previous_certified_amount numeric(18,3) null default 0,
  add column if not exists current_certified_amount numeric(18,3) null default 0,
  add column if not exists total_certified_amount numeric(18,3) null default 0,
  add column if not exists advance_recovery numeric(18,3) null default 0,
  add column if not exists deductions numeric(18,3) null default 0,
  add column if not exists payment_status text null default 'unpaid',
  add column if not exists created_by uuid null;

alter table if exists public.subcontractor_invoice_lines
  add column if not exists breakdown_item_id uuid null,
  add column if not exists villa_no text null,
  add column if not exists building_no text null,
  add column if not exists item_description text null,
  add column if not exists contract_qty numeric(18,3) null,
  add column if not exists previous_qty numeric(18,3) null,
  add column if not exists total_qty numeric(18,3) null,
  add column if not exists previous_amount numeric(18,3) null,
  add column if not exists total_amount numeric(18,3) null;

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  project_id uuid null references public.projects(id) on delete cascade,
  party_type text not null check (party_type in ('subcontractor','supplier')),
  party_id uuid null,
  gross_amount numeric(18,3) not null default 0,
  deductions numeric(18,3) not null default 0,
  net_amount numeric(18,3) not null default 0,
  paid_amount numeric(18,3) not null default 0,
  remaining_amount numeric(18,3) generated always as (greatest(net_amount - paid_amount, 0)) stored,
  payment_status text not null default 'pending' check (payment_status in ('pending','partially_paid','paid','cancelled')),
  due_date date null,
  approval_request_id uuid null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type, source_id)
);

create index if not exists idx_payment_requests_project on public.payment_requests(project_id, payment_status);

drop trigger if exists trg_payment_requests_touch on public.payment_requests;
create trigger trg_payment_requests_touch
before update on public.payment_requests
for each row execute function public.v140_touch_updated_at();

insert into public.payment_requests(
  source_type,
  source_id,
  project_id,
  party_type,
  party_id,
  gross_amount,
  deductions,
  net_amount,
  paid_amount,
  payment_status,
  due_date
)
select
  'subcontractor_invoice',
  i.id,
  i.project_id,
  'subcontractor',
  i.subcontractor_id,
  coalesce(i.gross_amount,0),
  coalesce(i.retention_amount,0) + coalesce(i.advance_recovery_amount, i.advance_recovery,0) + coalesce(i.deductions,0),
  coalesce(i.net_payable, i.net_amount, 0),
  coalesce(i.released_payment_amount, i.ceo_released_amount, i.total_released_payments, 0),
  case
    when coalesce(i.released_payment_amount, i.ceo_released_amount, i.total_released_payments, 0) >= coalesce(i.net_payable, i.net_amount, 0) then 'paid'
    when coalesce(i.released_payment_amount, i.ceo_released_amount, i.total_released_payments, 0) > 0 then 'partially_paid'
    else 'pending'
  end,
  i.period_end
from public.subcontractor_invoices i
where lower(coalesce(i.status,'')) in ('approved','paid','partially released')
on conflict(source_type, source_id) do update set
  gross_amount = excluded.gross_amount,
  deductions = excluded.deductions,
  net_amount = excluded.net_amount,
  paid_amount = excluded.paid_amount,
  payment_status = excluded.payment_status,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Procurement RFQ: add requested field names and requested award function.
-- ---------------------------------------------------------------------------
alter table if exists public.procurement_rfqs
  add column if not exists description text null,
  add column if not exists required_date date null,
  add column if not exists selected_offer_id uuid null,
  add column if not exists awarded_at timestamptz null,
  add column if not exists awarded_by text null;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.procurement_rfqs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.procurement_rfqs drop constraint if exists %I', c.conname);
  end loop;
end $$;

update public.procurement_rfqs
set required_date = coalesce(required_date, due_date),
    status = case
      when lower(coalesce(status,'')) in ('supplier selected','awarded') then 'awarded'
      when lower(coalesce(status,'')) in ('issued','sent') then 'sent'
      when lower(coalesce(status,'')) in ('cancelled','canceled') then 'cancelled'
      when lower(coalesce(status,'')) in ('under_comparison','under comparison') then 'under_comparison'
      else coalesce(nullif(lower(status),''), 'draft')
    end;

alter table public.procurement_rfqs
  add constraint procurement_rfqs_status_v140_13_chk
  check (status in ('draft','sent','under_comparison','awarded','cancelled'));

alter table if exists public.procurement_quotation_offers
  add column if not exists supplier_id uuid null,
  add column if not exists supplier_contact text null,
  add column if not exists offer_amount numeric(18,3) null,
  add column if not exists currency text not null default 'EGP',
  add column if not exists offer_notes text null,
  add column if not exists attachment_url text null;

update public.procurement_quotation_offers
set offer_amount = coalesce(offer_amount, total_amount),
    offer_notes = coalesce(offer_notes, notes);

alter table if exists public.procurement_quotation_offer_items
  add column if not exists item_name text null;

update public.procurement_quotation_offer_items
set item_name = coalesce(item_name, description);

drop function if exists public.select_procurement_quotation_offer(uuid, text);

create or replace function public.select_procurement_quotation_offer(
  p_offer_id uuid,
  p_reason text
)
returns public.procurement_quotation_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.procurement_quotation_offers%rowtype;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Selection reason is required';
  end if;

  select * into v_offer
  from public.procurement_quotation_offers
  where id = p_offer_id;

  if not found then
    raise exception 'Quotation offer not found';
  end if;

  update public.procurement_quotation_offers
     set is_selected = false,
         selection_reason = null,
         selected_at = null,
         selected_by = null
   where rfq_id = v_offer.rfq_id
     and id <> p_offer_id;

  update public.procurement_quotation_offers
     set is_selected = true,
         selection_reason = btrim(p_reason),
         selected_at = now(),
         selected_by = coalesce(auth.uid()::text, selected_by)
   where id = p_offer_id
   returning * into v_offer;

  update public.procurement_rfqs
     set selected_offer_id = p_offer_id,
         status = 'awarded',
         awarded_at = now(),
         awarded_by = auth.uid()::text
   where id = v_offer.rfq_id;

  return v_offer;
end;
$$;

create or replace function public.procurement_select_quotation_offer(
  p_offer_id uuid,
  p_reason text,
  p_selected_by text default null
)
returns public.procurement_quotation_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.procurement_quotation_offers%rowtype;
begin
  v_offer := public.select_procurement_quotation_offer(p_offer_id, p_reason);
  if p_selected_by is not null then
    update public.procurement_quotation_offers
       set selected_by = p_selected_by
     where id = p_offer_id
     returning * into v_offer;
    update public.procurement_rfqs
       set awarded_by = p_selected_by
     where id = v_offer.rfq_id;
  end if;
  return v_offer;
end;
$$;

-- Later-ready purchase/procurement structure.
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  rfq_id uuid null references public.procurement_rfqs(id) on delete set null,
  selected_offer_id uuid null references public.procurement_quotation_offers(id) on delete set null,
  po_no text not null,
  supplier_id uuid null,
  supplier_name text null,
  po_date date not null default current_date,
  currency text not null default 'EGP',
  total_amount numeric(18,3) not null default 0,
  status text not null default 'draft',
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_name text null,
  description text not null,
  unit text null,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,3) not null default 0,
  total_price numeric(18,3) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  purchase_order_id uuid null references public.purchase_orders(id) on delete set null,
  supplier_id uuid null,
  supplier_name text null,
  invoice_no text not null,
  invoice_date date null,
  gross_amount numeric(18,3) not null default 0,
  deductions numeric(18,3) not null default 0,
  net_amount numeric(18,3) not null default 0,
  approval_status text null default 'draft',
  payment_status text null default 'unpaid',
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Approval assignments and financial audit log.
-- ---------------------------------------------------------------------------
create table if not exists public.document_approval_steps (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  document_id uuid not null,
  approval_request_id uuid null references public.approval_requests(id) on delete cascade,
  step_order integer not null,
  action_type text not null check (action_type in ('review','approve')),
  assigned_user_id uuid null,
  assigned_user_name text null,
  assigned_user_email text null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','skipped')),
  comments text null,
  acted_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(document_type, document_id, step_order)
);

create index if not exists idx_document_approval_steps_document
on public.document_approval_steps(document_type, document_id, step_order);

create table if not exists public.financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid null,
  action text not null check (action in ('insert','update','delete')),
  old_data jsonb null,
  new_data jsonb null,
  changed_by text null default auth.uid()::text,
  changed_at timestamptz not null default now()
);

create or replace function public.v140_financial_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.financial_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'insert', null, to_jsonb(new), auth.uid()::text);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.financial_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new), auth.uid()::text);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.financial_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, old.id, 'delete', to_jsonb(old), null, auth.uid()::text);
    return old;
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'subcontractor_contracts',
    'subcontractor_contract_items',
    'subcontractor_invoices',
    'subcontractor_invoice_lines',
    'procurement_rfqs',
    'procurement_quotation_offers',
    'payment_requests'
  ]
  loop
    execute format('drop trigger if exists trg_v140_financial_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_v140_financial_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.v140_financial_audit_trigger()', t);
  end loop;
end $$;

-- RLS/grants: project-scoped policies are prepared without removing existing dev policies.
alter table public.payment_requests enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.document_approval_steps enable row level security;
alter table public.financial_audit_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'payment_requests',
    'purchase_orders',
    'purchase_order_items',
    'supplier_invoices',
    'document_approval_steps',
    'financial_audit_log'
  ]
  loop
    execute format('drop policy if exists "%1$s_auth_all" on public.%1$s', t);
    execute format('create policy "%1$s_auth_all" on public.%1$s for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

grant select on public.v_subcontractor_contract_breakdown to authenticated;
grant select on public.v_subcontractor_workfronts to authenticated;
grant select on public.v_subcontractor_dashboard to authenticated;
grant execute on function public.select_procurement_quotation_offer(uuid, text) to authenticated;
grant execute on function public.procurement_select_quotation_offer(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
