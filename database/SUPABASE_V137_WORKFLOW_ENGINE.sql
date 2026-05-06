----------------------------------------------------------------
-- V137 Workflow Engine: Procurement + Inventory + Finance Basics
-- Safe migration. Run after SUPABASE_SETUP_BUNDLE.sql.
----------------------------------------------------------------

create extension if not exists pgcrypto;

-- 1) Workflow audit log
create table if not exists public.workflow_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null,
  entity_type text not null,
  entity_table text null,
  entity_id uuid not null,
  reference_no text null,
  action text not null,
  from_status text null,
  to_status text null,
  action_by uuid null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflow_actions_project on public.workflow_actions(project_id, created_at desc);
create index if not exists idx_workflow_actions_entity on public.workflow_actions(entity_type, entity_id, created_at desc);

-- 2) Add common workflow columns to operational tables
alter table if exists public.procurement_records
  add column if not exists workflow_status text default 'Draft',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_reason text,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid,
  add column if not exists workflow_notes text;

alter table if exists public.inventory_grn_lines
  add column if not exists workflow_status text default 'Draft',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_reason text,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid,
  add column if not exists workflow_notes text;

alter table if exists public.inventory_issue_lines
  add column if not exists status text default 'Draft',
  add column if not exists workflow_status text default 'Draft',
  add column if not exists unit_rate numeric default 0,
  add column if not exists amount numeric default 0,
  add column if not exists is_subcontractor_charge boolean default false,
  add column if not exists subcontractor_id uuid null,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_reason text,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid,
  add column if not exists workflow_notes text;

alter table if exists public.finance_records
  add column if not exists workflow_status text default 'Pending',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_reason text,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid,
  add column if not exists workflow_notes text;

-- 3) Backfill existing approved/posted records so current data keeps working
update public.procurement_records
set workflow_status = case
  when status::text in ('Delivered') then 'Posted'
  when status::text in ('PO Issued','Partially Delivered') then 'Ordered'
  when status::text in ('Cancelled','Delayed') then status::text
  else coalesce(workflow_status, 'Draft')
end
where workflow_status is null;

update public.inventory_grn_lines
set workflow_status = case when coalesce(status,'Posted') = 'Posted' then 'Posted' else coalesce(workflow_status,'Draft') end
where workflow_status is null;

update public.inventory_issue_lines
set workflow_status = case when coalesce(status,'Draft') = 'Posted' then 'Posted' else coalesce(workflow_status,'Draft') end
where workflow_status is null;

update public.finance_records
set workflow_status = case
  when lower(coalesce(status,'')) in ('confirmed','posted') then 'Posted'
  when lower(coalesce(status,'')) = 'cancelled' then 'Cancelled'
  when lower(coalesce(status,'')) = 'reviewed' then 'Reviewed'
  else coalesce(workflow_status, 'Pending')
end
where workflow_status is null;

-- 4) Issue line amount calculation
create or replace function public.inventory_set_issue_amount_v137()
returns trigger as $$
begin
  new.amount := coalesce(new.amount, coalesce(new.issued_qty,0) * coalesce(new.unit_rate,0));
  if coalesce(new.amount,0) = 0 then
    new.amount := coalesce(new.issued_qty,0) * coalesce(new.unit_rate,0);
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_set_issue_amount_v137 on public.inventory_issue_lines;
create trigger trg_inventory_set_issue_amount_v137
before insert or update on public.inventory_issue_lines
for each row execute function public.inventory_set_issue_amount_v137();

-- 5) Stock must be affected only by Posted movements.
drop view if exists public.v_inventory_stock cascade;
create view public.v_inventory_stock as
with movements as (
  select
    g.project_id,
    g.resource_code,
    g.material,
    g.boq_item_id,
    g.structure_id,
    g.location_id,
    g.unit,
    sum(coalesce(g.received_qty,0)) as received_qty,
    0::numeric as issued_qty,
    sum(coalesce(g.amount, coalesce(g.received_qty,0) * coalesce(g.unit_rate,0))) as received_amount
  from public.inventory_grn_lines g
  where coalesce(g.status,'Draft') = 'Posted'
  group by g.project_id, g.resource_code, g.material, g.boq_item_id, g.structure_id, g.location_id, g.unit

  union all

  select
    i.project_id,
    i.resource_code,
    i.material,
    i.boq_item_id,
    i.structure_id,
    i.location_id,
    i.unit,
    0::numeric as received_qty,
    sum(coalesce(i.issued_qty,0)) as issued_qty,
    0::numeric as received_amount
  from public.inventory_issue_lines i
  where coalesce(i.status,'Draft') = 'Posted'
  group by i.project_id, i.resource_code, i.material, i.boq_item_id, i.structure_id, i.location_id, i.unit
), grouped as (
  select
    project_id,
    resource_code,
    material,
    boq_item_id,
    structure_id,
    location_id,
    unit,
    sum(received_qty) as received_qty,
    sum(issued_qty) as issued_qty,
    sum(received_amount) as received_amount,
    case when sum(received_qty) > 0 then sum(received_amount) / nullif(sum(received_qty),0) else 0 end as avg_unit_rate
  from movements
  group by project_id, resource_code, material, boq_item_id, structure_id, location_id, unit
)
select
  g.*,
  b.item_code as boq_item_code,
  b.description as boq_description,
  ps.code as structure_code,
  ps.name as structure_name,
  il.code as location_code,
  il.name as location_name,
  (g.received_qty - g.issued_qty) as stock_qty,
  (g.received_qty - g.issued_qty) * g.avg_unit_rate as stock_value
from grouped g
left join public.boq_items b on b.id = g.boq_item_id
left join public.project_structure_nodes ps on ps.id = g.structure_id
left join public.inventory_locations il on il.id = g.location_id;

-- 6) Cost control also reads Posted movements only.
drop view if exists public.v_inventory_cost_control cascade;
create view public.v_inventory_cost_control as
with grn as (
  select
    procurement_id,
    sum(coalesce(received_qty,0)) as received_qty,
    sum(coalesce(amount,0)) as received_amount,
    max(received_date) as last_received_date
  from public.inventory_grn_lines
  where procurement_id is not null
    and coalesce(status,'Draft') = 'Posted'
  group by procurement_id
), issue_match as (
  select
    pr.id as procurement_id,
    sum(coalesce(i.issued_qty,0)) as issued_qty,
    sum(coalesce(i.amount,0)) as issued_amount
  from public.procurement_records pr
  left join public.inventory_issue_lines i
    on i.project_id = pr.project_id
   and coalesce(i.resource_code,'') = coalesce(pr.resource_code,'')
   and i.boq_item_id is not distinct from pr.boq_item_id
   and (i.structure_id is not distinct from pr.structure_id or i.structure_id = any(coalesce(pr.structure_ids, array[]::uuid[])))
   and coalesce(i.status,'Draft') = 'Posted'
  group by pr.id
)
select
  pr.project_id,
  pr.id as procurement_id,
  pr.pr_no,
  pr.material,
  pr.resource_code,
  pr.boq_item_id,
  b.item_code as boq_item_code,
  b.description as boq_description,
  pr.structure_id,
  ps.code as structure_code,
  ps.name as structure_name,
  pr.required_qty,
  pr.unit,
  pr.budget_unit_rate,
  coalesce(pr.budget_amount, coalesce(pr.required_qty,0) * coalesce(pr.budget_unit_rate,0)) as budget_amount,
  coalesce(grn.received_qty,0) as received_qty,
  coalesce(grn.received_amount,0) as received_amount,
  coalesce(issue_match.issued_qty,0) as issued_qty,
  coalesce(issue_match.issued_amount,0) as issued_amount,
  greatest(coalesce(pr.required_qty,0) - coalesce(grn.received_qty,0), 0) as remaining_to_receive,
  coalesce(grn.received_amount,0) - coalesce(pr.budget_amount, coalesce(pr.required_qty,0) * coalesce(pr.budget_unit_rate,0), 0) as budget_variance_amount,
  grn.last_received_date,
  pr.status,
  pr.workflow_status,
  pr.structure_ids,
  coalesce(array_length(pr.structure_ids,1), pr.structure_count, case when pr.structure_id is not null then 1 else 0 end) as structure_count
from public.procurement_records pr
left join grn on grn.procurement_id = pr.id
left join issue_match on issue_match.procurement_id = pr.id
left join public.boq_items b on b.id = pr.boq_item_id
left join public.project_structure_nodes ps on ps.id = pr.structure_id;

-- 7) Procurement delivery sync must count Posted GRNs only.
create or replace function public.inventory_refresh_procurement(p_procurement_id uuid)
returns void as $$
declare
  v_received numeric := 0;
  v_required numeric := 0;
  v_latest date;
begin
  if p_procurement_id is null then
    return;
  end if;

  select coalesce(sum(received_qty),0), max(received_date)
    into v_received, v_latest
  from public.inventory_grn_lines
  where procurement_id = p_procurement_id
    and coalesce(status,'Draft') = 'Posted';

  select coalesce(required_qty,0)
    into v_required
  from public.procurement_records
  where id = p_procurement_id;

  update public.procurement_records
  set
    actual_delivery = case when v_received > 0 then v_latest else actual_delivery end,
    status = case
      when status::text = 'Cancelled' then status
      when v_required > 0 and v_received >= v_required then 'Delivered'
      when v_received > 0 then 'Partially Delivered'
      else status
    end,
    workflow_status = case
      when v_required > 0 and v_received >= v_required then 'Posted'
      when v_received > 0 then 'Ordered'
      else workflow_status
    end
  where id = p_procurement_id;
end;
$$ language plpgsql security definer;

-- 8) Pending tasks view for reporting / future mobile app.
drop view if exists public.v_workflow_pending_tasks;
create view public.v_workflow_pending_tasks as
select project_id, 'procurement'::text as entity_type, id as entity_id, pr_no as reference_no, material as title,
       workflow_status, status::text as operational_status, pr_date as target_date, budget_amount as amount
from public.procurement_records
where lower(coalesce(workflow_status,status::text,'draft')) not in ('posted','confirmed','delivered','cancelled','canceled','rejected','closed')
union all
select project_id, 'grn'::text, id, grn_no, material, workflow_status, status, received_date, amount
from public.inventory_grn_lines
where lower(coalesce(workflow_status,status,'draft')) not in ('posted','confirmed','delivered','cancelled','canceled','rejected','closed')
union all
select project_id, 'issue'::text, id, issue_no, material, workflow_status, status, issue_date, amount
from public.inventory_issue_lines
where lower(coalesce(workflow_status,status,'draft')) not in ('posted','confirmed','delivered','cancelled','canceled','rejected','closed')
union all
select project_id, 'finance'::text, id, coalesce(reference,payment_voucher_no,receipt_voucher_no,'FIN'), coalesce(description,record_type), workflow_status, status, payment_date, amount
from public.finance_records
where lower(coalesce(workflow_status,status,'pending')) not in ('posted','confirmed','delivered','cancelled','canceled','rejected','closed');

comment on table public.workflow_actions is 'V137 audit log for workflow transitions across procurement, inventory and finance.';
