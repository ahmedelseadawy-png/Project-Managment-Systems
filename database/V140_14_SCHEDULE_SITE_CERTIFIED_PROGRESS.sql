-- V140_14 Schedule / Site / Certified / Paid progress separation
-- Safe/additive: no data drops, no automatic certification from site progress.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- P6 activity mapping to subcontractor contract items.
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id text not null,
  activity_name text not null,
  wbs_code text null,
  status text not null default 'Not Started',
  original_duration integer null,
  remaining_duration integer null,
  schedule_pct numeric(9,3) null,
  planned_start date null,
  planned_finish date null,
  actual_start date null,
  actual_finish date null,
  free_float integer null,
  total_float integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, activity_id)
);

create table if not exists public.subcontractor_contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid null,
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

alter table public.subcontractor_contract_items
  add column if not exists project_id uuid null references public.projects(id) on delete cascade,
  add column if not exists subcontractor_id uuid null references public.subcontractors(id) on delete cascade,
  add column if not exists item_description text null,
  add column if not exists trade text null,
  add column if not exists villa_no text null,
  add column if not exists building_no text null,
  add column if not exists planned_start_date date null,
  add column if not exists planned_finish_date date null,
  add column if not exists contract_type text null default 'boq',
  add column if not exists is_active boolean not null default true;

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  project_id uuid null references public.projects(id) on delete cascade,
  party_type text not null,
  party_id uuid null,
  gross_amount numeric(18,3) not null default 0,
  deductions numeric(18,3) not null default 0,
  net_amount numeric(18,3) not null default 0,
  paid_amount numeric(18,3) not null default 0,
  payment_status text not null default 'pending',
  due_date date null,
  approval_request_id uuid null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type, source_id)
);

create table if not exists public.schedule_activity_mapping (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  schedule_activity_id uuid not null references public.schedule_activities(id) on delete cascade,
  contract_item_id uuid not null references public.subcontractor_contract_items(id) on delete cascade,
  weight_percent numeric(9,3) null,
  notes text null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_activity_id, contract_item_id)
);

create index if not exists idx_schedule_activity_mapping_project
on public.schedule_activity_mapping(project_id, contract_item_id);

-- ---------------------------------------------------------------------------
-- Site progress is physical progress only. It never creates certification/payment.
-- ---------------------------------------------------------------------------
create table if not exists public.site_progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contract_item_id uuid not null references public.subcontractor_contract_items(id) on delete cascade,
  schedule_activity_id uuid null references public.schedule_activities(id) on delete set null,
  subcontractor_id uuid null references public.subcontractors(id) on delete set null,
  contract_id uuid null references public.subcontractor_contracts(id) on delete set null,
  villa_no text null,
  building_no text null,
  trade text null,
  progress_percent numeric(9,3) not null check (progress_percent >= 0 and progress_percent <= 100),
  progress_qty numeric(18,3) null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  progress_date date not null default current_date,
  notes text null,
  approved_by uuid null,
  approved_at timestamptz null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_progress_updates_contract_item
on public.site_progress_updates(contract_item_id, status, progress_date desc);

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

drop trigger if exists trg_schedule_activity_mapping_touch on public.schedule_activity_mapping;
create trigger trg_schedule_activity_mapping_touch
before update on public.schedule_activity_mapping
for each row execute function public.v140_touch_updated_at();

drop trigger if exists trg_site_progress_updates_touch on public.site_progress_updates;
create trigger trg_site_progress_updates_touch
before update on public.site_progress_updates
for each row execute function public.v140_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invoice line links and validation. QS still certifies manually.
-- ---------------------------------------------------------------------------
alter table if exists public.subcontractor_invoice_lines
  add column if not exists contract_item_id uuid null references public.subcontractor_contract_items(id) on delete set null,
  add column if not exists breakdown_item_id uuid null,
  add column if not exists contract_id uuid null references public.subcontractor_contracts(id) on delete set null,
  add column if not exists villa_no text null,
  add column if not exists building_no text null,
  add column if not exists trade text null,
  add column if not exists item_description text null,
  add column if not exists contract_qty numeric(18,3) null,
  add column if not exists previous_qty numeric(18,3) null,
  add column if not exists total_qty numeric(18,3) null,
  add column if not exists previous_amount numeric(18,3) null,
  add column if not exists total_amount numeric(18,3) null,
  add column if not exists allow_over_certification boolean not null default false,
  add column if not exists over_certification_reason text null;

create index if not exists idx_sub_invoice_lines_contract_item
on public.subcontractor_invoice_lines(contract_item_id, invoice_id);

-- Resolve old subcontract_breakdown-backed lines to subcontractor_contract_items.
update public.subcontractor_invoice_lines l
set contract_item_id = ci.id,
    breakdown_item_id = coalesce(l.breakdown_item_id, l.breakdown_id)
from public.subcontractor_contract_items ci
where l.contract_item_id is null
  and l.breakdown_id is not null
  and ci.breakdown_item_id = l.breakdown_id;

create or replace function public.v140_prepare_and_validate_invoice_line()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
  v_prev_qty numeric := 0;
  v_current_qty numeric := 0;
  v_total_qty numeric := 0;
begin
  if new.current_qty is not null and new.current_qty < 0 then
    raise exception 'Current certified quantity cannot be negative';
  end if;

  select id, project_id, subcontractor_id, contract_id
    into v_invoice
  from public.subcontractor_invoices
  where id = new.invoice_id;

  if v_invoice.id is not null then
    new.project_id := coalesce(new.project_id, v_invoice.project_id);
    new.subcontractor_id := coalesce(new.subcontractor_id, v_invoice.subcontractor_id);
    new.contract_id := coalesce(new.contract_id, v_invoice.contract_id);
  end if;

  if new.contract_item_id is null and new.breakdown_id is not null then
    select id into new.contract_item_id
    from public.subcontractor_contract_items
    where breakdown_item_id = new.breakdown_id
    limit 1;
  end if;

  if new.contract_item_id is not null then
    select *
      into v_item
    from public.subcontractor_contract_items
    where id = new.contract_item_id;

    new.breakdown_item_id := coalesce(new.breakdown_item_id, v_item.breakdown_item_id);
    new.contract_id := coalesce(new.contract_id, v_item.contract_id);
    new.boq_item_id := coalesce(new.boq_item_id, v_item.boq_item_id);
    new.villa_no := coalesce(new.villa_no, v_item.villa_no);
    new.building_no := coalesce(new.building_no, v_item.building_no);
    new.trade := coalesce(new.trade, v_item.trade);
    new.item_description := coalesce(new.item_description, v_item.item_description, v_item.description);
    new.contract_qty := coalesce(new.contract_qty, v_item.quantity);
    new.rate := coalesce(new.rate, v_item.rate);
  end if;

  select coalesce(sum(coalesce(approved_qty, current_qty, 0)), 0)
    into v_prev_qty
  from public.subcontractor_invoice_lines
  where contract_item_id is not distinct from new.contract_item_id
    and invoice_id <> new.invoice_id
    and (new.id is null or id <> new.id);

  v_current_qty := coalesce(new.approved_qty, new.current_qty, 0);
  v_total_qty := coalesce(new.total_qty, new.new_cumulative_qty, v_prev_qty + v_current_qty);

  new.previous_qty := coalesce(new.previous_qty, v_prev_qty);
  new.current_qty := v_current_qty;
  new.approved_qty := coalesce(new.approved_qty, v_current_qty);
  new.total_qty := v_total_qty;
  new.new_cumulative_qty := coalesce(new.new_cumulative_qty, v_total_qty);
  new.current_value := round((v_current_qty * coalesce(new.rate,0))::numeric, 3);
  new.previous_amount := coalesce(new.previous_amount, round((coalesce(new.previous_qty,0) * coalesce(new.rate,0))::numeric, 3));
  new.total_amount := round((v_total_qty * coalesce(new.rate,0))::numeric, 3);
  new.cumulative_value := coalesce(new.cumulative_value, new.total_amount);

  if coalesce(new.contract_qty, 0) > 0
     and v_total_qty > new.contract_qty
     and coalesce(new.allow_over_certification, false) = false then
    raise exception 'Total certified quantity (%) cannot exceed contract quantity (%) without override', v_total_qty, new.contract_qty;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_v140_prepare_and_validate_invoice_line on public.subcontractor_invoice_lines;
create trigger trg_v140_prepare_and_validate_invoice_line
before insert or update on public.subcontractor_invoice_lines
for each row execute function public.v140_prepare_and_validate_invoice_line();

-- Create/refresh payment request when an invoice is approved. No site progress changes.
create or replace function public.v140_sync_payment_request_from_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status,'')) in ('approved','paid','partially released')
     or lower(coalesce(new.approval_status,'')) = 'approved' then
    insert into public.payment_requests(
      source_type, source_id, project_id, party_type, party_id,
      gross_amount, deductions, net_amount, paid_amount, payment_status, due_date
    )
    values (
      'subcontractor_invoice',
      new.id,
      new.project_id,
      'subcontractor',
      new.subcontractor_id,
      coalesce(new.gross_amount, 0),
      coalesce(new.retention_amount, 0) + coalesce(new.advance_recovery_amount, new.advance_recovery, 0) + coalesce(new.deductions, 0),
      coalesce(new.net_payable, new.net_amount, 0),
      coalesce(new.released_payment_amount, new.ceo_released_amount, new.total_released_payments, 0),
      case
        when coalesce(new.released_payment_amount, new.ceo_released_amount, new.total_released_payments, 0) >= coalesce(new.net_payable, new.net_amount, 0) then 'paid'
        when coalesce(new.released_payment_amount, new.ceo_released_amount, new.total_released_payments, 0) > 0 then 'partially_paid'
        else 'pending'
      end,
      coalesce(new.period_to, new.period_end)
    )
    on conflict(source_type, source_id) do update set
      gross_amount = excluded.gross_amount,
      deductions = excluded.deductions,
      net_amount = excluded.net_amount,
      paid_amount = excluded.paid_amount,
      payment_status = excluded.payment_status,
      due_date = excluded.due_date,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v140_sync_payment_request_from_invoice on public.subcontractor_invoices;
create trigger trg_v140_sync_payment_request_from_invoice
after insert or update of status, approval_status, gross_amount, net_amount, net_payable, released_payment_amount, ceo_released_amount, total_released_payments
on public.subcontractor_invoices
for each row execute function public.v140_sync_payment_request_from_invoice();

-- ---------------------------------------------------------------------------
-- Progress summary views.
-- ---------------------------------------------------------------------------
create or replace view public.v_contract_item_progress_summary as
with item_base as (
  select
    ci.id as contract_item_id,
    ci.project_id,
    ci.subcontractor_id,
    ci.contract_id,
    ci.item_code,
    coalesce(ci.item_description, ci.description) as item_description,
    ci.trade,
    ci.villa_no,
    ci.building_no,
    ci.quantity as contract_qty,
    ci.rate,
    case
      when lower(coalesce(ci.contract_type,'')) in ('lump_sum','lump sum','lumpsum') then coalesce(ci.rate,0)
      else coalesce(ci.quantity,0) * coalesce(ci.rate,0)
    end as contract_value,
    ci.planned_start_date as item_planned_start,
    ci.planned_finish_date as item_planned_finish
  from public.subcontractor_contract_items ci
  where coalesce(ci.is_active, true) = true
), mapped_schedule as (
  select
    m.contract_item_id,
    min(sa.planned_start) as planned_start_date,
    max(sa.planned_finish) as planned_finish_date,
    avg(coalesce(sa.schedule_pct, 0)) as schedule_activity_progress
  from public.schedule_activity_mapping m
  join public.schedule_activities sa on sa.id = m.schedule_activity_id
  group by m.contract_item_id
), latest_site as (
  select distinct on (contract_item_id)
    contract_item_id,
    progress_percent as site_progress_percent,
    progress_qty as site_progress_qty,
    progress_date as latest_site_progress_date
  from public.site_progress_updates
  where status = 'approved'
  order by contract_item_id, progress_date desc, created_at desc
), certified as (
  select
    l.contract_item_id,
    sum(coalesce(l.approved_qty, l.current_qty, 0)) as certified_qty,
    sum(coalesce(l.current_value, coalesce(l.approved_qty, l.current_qty, 0) * coalesce(l.rate, 0), 0)) as certified_value
  from public.subcontractor_invoice_lines l
  join public.subcontractor_invoices i on i.id = l.invoice_id
  where l.contract_item_id is not null
    and (
      lower(coalesce(i.status,'')) in ('approved','paid','partially released')
      or lower(coalesce(i.approval_status,'')) = 'approved'
    )
  group by l.contract_item_id
), paid as (
  select
    l.contract_item_id,
    sum(coalesce(pr.paid_amount, 0) * (
      coalesce(l.current_value,0) / nullif(inv.invoice_value,0)
    )) as paid_value
  from public.subcontractor_invoice_lines l
  join public.subcontractor_invoices i on i.id = l.invoice_id
  join public.payment_requests pr on pr.source_type = 'subcontractor_invoice' and pr.source_id = i.id
  join (
    select invoice_id, sum(coalesce(current_value,0)) as invoice_value
    from public.subcontractor_invoice_lines
    group by invoice_id
  ) inv on inv.invoice_id = l.invoice_id
  where l.contract_item_id is not null
  group by l.contract_item_id
)
select
  b.contract_item_id,
  b.project_id,
  b.subcontractor_id,
  b.contract_id,
  b.item_code,
  b.item_description,
  b.trade,
  b.villa_no,
  b.building_no,
  b.contract_qty,
  b.rate,
  b.contract_value,
  coalesce(ms.planned_start_date, b.item_planned_start) as planned_start_date,
  coalesce(ms.planned_finish_date, b.item_planned_finish) as planned_finish_date,
  case
    when coalesce(ms.planned_start_date, b.item_planned_start) is null
      or coalesce(ms.planned_finish_date, b.item_planned_finish) is null then 0
    when current_date <= coalesce(ms.planned_start_date, b.item_planned_start) then 0
    when current_date >= coalesce(ms.planned_finish_date, b.item_planned_finish) then 100
    when coalesce(ms.planned_finish_date, b.item_planned_finish) = coalesce(ms.planned_start_date, b.item_planned_start) then 100
    else least(100, greatest(0,
      (current_date - coalesce(ms.planned_start_date, b.item_planned_start))::numeric
      / nullif((coalesce(ms.planned_finish_date, b.item_planned_finish) - coalesce(ms.planned_start_date, b.item_planned_start))::numeric, 0)
      * 100
    ))
  end::numeric(9,3) as planned_progress_percent,
  coalesce(ls.site_progress_percent, 0)::numeric(9,3) as site_progress_percent,
  coalesce(c.certified_value, 0)::numeric(18,3) as certified_value,
  case when coalesce(b.contract_value,0) > 0 then least(100, coalesce(c.certified_value,0) / b.contract_value * 100) else 0 end::numeric(9,3) as certified_progress_percent,
  coalesce(p.paid_value, 0)::numeric(18,3) as paid_value,
  case when coalesce(b.contract_value,0) > 0 then least(100, coalesce(p.paid_value,0) / b.contract_value * 100) else 0 end::numeric(9,3) as paid_progress_percent,
  coalesce(c.certified_value, 0) - coalesce(p.paid_value, 0) as outstanding_value,
  ls.latest_site_progress_date,
  (ms.contract_item_id is not null) as has_p6_mapping,
  (ls.contract_item_id is not null) as has_site_progress
from item_base b
left join mapped_schedule ms on ms.contract_item_id = b.contract_item_id
left join latest_site ls on ls.contract_item_id = b.contract_item_id
left join certified c on c.contract_item_id = b.contract_item_id
left join paid p on p.contract_item_id = b.contract_item_id;

drop view if exists public.v_subcontractor_workfronts cascade;
create view public.v_subcontractor_workfronts as
select
  contract_item_id as id,
  project_id,
  subcontractor_id,
  contract_id,
  null::uuid as villa_id,
  null::uuid as building_id,
  villa_no,
  building_no,
  trade,
  planned_start_date,
  planned_finish_date,
  null::date as actual_start_date,
  null::date as actual_finish_date,
  site_progress_percent as actual_progress_percent,
  planned_progress_percent,
  greatest(0, current_date - coalesce(planned_finish_date, current_date))::int as delay_days,
  case
    when site_progress_percent >= 100 then 'Completed'
    when planned_start_date is not null and current_date < planned_start_date and site_progress_percent = 0 then 'Not Started'
    when planned_start_date is not null and current_date > planned_start_date and site_progress_percent = 0 then 'Delayed'
    when planned_finish_date is not null and current_date > planned_finish_date and site_progress_percent < 100 then 'Delayed'
    when site_progress_percent < planned_progress_percent - 10 then 'Delayed'
    when planned_finish_date is not null and planned_finish_date <= current_date + 7 and site_progress_percent < 80 then 'At Risk'
    else 'Working'
  end as health_status,
  case
    when site_progress_percent >= 100 then 'Completed'
    when planned_start_date is not null and current_date < planned_start_date and site_progress_percent = 0 then 'Not Started'
    when planned_start_date is not null and current_date > planned_start_date and site_progress_percent = 0 then 'Delayed'
    when planned_finish_date is not null and current_date > planned_finish_date and site_progress_percent < 100 then 'Delayed'
    when site_progress_percent < planned_progress_percent - 10 then 'Delayed'
    when planned_finish_date is not null and planned_finish_date <= current_date + 7 and site_progress_percent < 80 then 'At Risk'
    else 'Working'
  end as status,
  null::text as notes,
  site_progress_percent,
  certified_progress_percent,
  paid_progress_percent,
  contract_value,
  certified_value,
  paid_value,
  outstanding_value
from public.v_contract_item_progress_summary;

drop view if exists public.v_subcontractor_dashboard cascade;
create view public.v_subcontractor_dashboard as
select
  ps.project_id,
  ps.subcontractor_id,
  s.subcontractor_code,
  coalesce(s.name, 'Subcontractor') as subcontractor_name,
  coalesce(max(ps.trade), s.trade_scope, 'General') as trade,
  count(distinct ps.contract_item_id)::int as assigned_buildings,
  count(*) filter (where wf.status = 'Working')::int as working_count,
  count(*) filter (where wf.status = 'Not Started')::int as not_started_count,
  count(*) filter (where wf.status = 'Completed')::int as completed_count,
  count(*) filter (where wf.status = 'Delayed')::int as delayed_count,
  count(*) filter (where wf.status = 'At Risk')::int as at_risk_count,
  round(avg(ps.site_progress_percent),3)::numeric(9,3) as average_progress,
  round(avg(ps.planned_progress_percent),3)::numeric(9,3) as planned_progress_percent,
  round(avg(ps.site_progress_percent),3)::numeric(9,3) as site_progress_percent,
  case when sum(ps.contract_value) > 0 then least(100, sum(ps.certified_value) / sum(ps.contract_value) * 100) else 0 end::numeric(9,3) as certified_progress_percent,
  case when sum(ps.contract_value) > 0 then least(100, sum(ps.paid_value) / sum(ps.contract_value) * 100) else 0 end::numeric(9,3) as paid_progress_percent,
  sum(ps.contract_value)::numeric(18,3) as contract_value,
  sum(ps.certified_value)::numeric(18,3) as certified_value,
  sum(ps.paid_value)::numeric(18,3) as paid_value,
  sum(ps.outstanding_value)::numeric(18,3) as outstanding_value,
  case
    when count(*) filter (where wf.status = 'Delayed') > 0 then 'Delayed'
    when count(*) filter (where wf.status = 'At Risk') > 0 then 'At Risk'
    when count(*) > 0 and count(*) filter (where wf.status = 'Completed') = count(*) then 'Completed'
    when count(*) > 0 and count(*) filter (where wf.status = 'Not Started') = count(*) then 'Not Started'
    else 'On Track'
  end as health_status,
  count(*) filter (where wf.status = 'Working')::int as working_buildings,
  count(*) filter (where wf.status = 'Not Started')::int as not_started_buildings,
  count(*) filter (where wf.status = 'Completed')::int as completed_buildings,
  0::int as paused_buildings,
  count(*) filter (where wf.status = 'Delayed')::int as delayed_buildings,
  round(avg(ps.site_progress_percent),3)::numeric(9,3) as progress_percent,
  sum(ps.certified_value)::numeric(18,3) as certified_amount,
  sum(ps.paid_value)::numeric(18,3) as paid_amount,
  0::int as open_invoices
from public.v_contract_item_progress_summary ps
left join public.v_subcontractor_workfronts wf on wf.id = ps.contract_item_id
left join public.subcontractors s on s.id = ps.subcontractor_id
group by ps.project_id, ps.subcontractor_id, s.subcontractor_code, s.name, s.trade_scope;

-- ---------------------------------------------------------------------------
-- Reports and warning indicators.
-- ---------------------------------------------------------------------------
create or replace view public.v_progress_warning_report as
select
  project_id,
  subcontractor_id,
  contract_id,
  contract_item_id,
  item_code,
  item_description,
  villa_no,
  building_no,
  trade,
  warning_type,
  warning_message
from (
  select *, 'site_gt_certified' as warning_type,
    'Site progress is higher than certified progress' as warning_message
  from public.v_contract_item_progress_summary
  where site_progress_percent > certified_progress_percent + 5

  union all
  select *, 'certified_gt_site' as warning_type,
    'Certified progress is higher than approved site progress' as warning_message
  from public.v_contract_item_progress_summary
  where certified_progress_percent > site_progress_percent + 5

  union all
  select *, 'missing_p6_mapping' as warning_type,
    'Contract item has no P6 activity mapping' as warning_message
  from public.v_contract_item_progress_summary
  where has_p6_mapping = false

  union all
  select *, 'missing_site_progress' as warning_type,
    'Contract item has no approved site progress update' as warning_message
  from public.v_contract_item_progress_summary
  where has_site_progress = false
) x;

create or replace view public.v_invoice_line_link_warnings as
select
  i.project_id,
  i.subcontractor_id,
  i.contract_id,
  l.invoice_id,
  i.invoice_no,
  l.id as invoice_line_id,
  l.contract_item_id,
  l.breakdown_item_id,
  coalesce(l.item_description, l.remarks, 'Invoice line') as item_description,
  case
    when l.contract_item_id is null then 'invoice_line_missing_contract_item'
    when coalesce(l.current_value,0) > 0 and l.contract_item_id is null then 'certified_amount_without_contract_item'
    else 'ok'
  end as warning_type
from public.subcontractor_invoice_lines l
join public.subcontractor_invoices i on i.id = l.invoice_id
where l.contract_item_id is null;

create or replace view public.v_schedule_site_certified_paid_report as
select * from public.v_contract_item_progress_summary;

create or replace view public.v_uncertified_executed_work_report as
select
  *,
  greatest(site_progress_percent - certified_progress_percent, 0) as uncertified_progress_percent,
  greatest((site_progress_percent - certified_progress_percent) / 100 * contract_value, 0) as estimated_uncertified_value
from public.v_contract_item_progress_summary
where site_progress_percent > certified_progress_percent + 5;

create or replace view public.v_certified_unpaid_report as
select
  *
from public.v_contract_item_progress_summary
where certified_value > paid_value;

create or replace view public.v_invoice_lines_missing_contract_item_report as
select * from public.v_invoice_line_link_warnings;

alter table public.schedule_activity_mapping enable row level security;
alter table public.site_progress_updates enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['schedule_activity_mapping','site_progress_updates']
  loop
    execute format('drop policy if exists "%1$s_auth_all" on public.%1$s', t);
    execute format('create policy "%1$s_auth_all" on public.%1$s for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

grant select on public.v_contract_item_progress_summary to authenticated;
grant select on public.v_subcontractor_workfronts to authenticated;
grant select on public.v_subcontractor_dashboard to authenticated;
grant select on public.v_progress_warning_report to authenticated;
grant select on public.v_invoice_line_link_warnings to authenticated;
grant select on public.v_schedule_site_certified_paid_report to authenticated;
grant select on public.v_uncertified_executed_work_report to authenticated;
grant select on public.v_certified_unpaid_report to authenticated;
grant select on public.v_invoice_lines_missing_contract_item_report to authenticated;

notify pgrst, 'reload schema';
