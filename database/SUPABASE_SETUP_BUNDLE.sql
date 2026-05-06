-- PCS V134 Database SQL Bundle
-- Run needed sections carefully in Supabase SQL editor.


----------------------------------------------------------------
-- FILE: storage-buckets.sql
----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists "attachments_public_read" on storage.objects;
create policy "attachments_public_read"
on storage.objects for select to public
using (bucket_id = 'attachments');

drop policy if exists "attachments_public_insert" on storage.objects;
create policy "attachments_public_insert"
on storage.objects for insert to public
with check (bucket_id = 'attachments');

drop policy if exists "attachments_public_update" on storage.objects;
create policy "attachments_public_update"
on storage.objects for update to public
using (bucket_id = 'attachments')
with check (bucket_id = 'attachments');

drop policy if exists "attachments_public_delete" on storage.objects;
create policy "attachments_public_delete"
on storage.objects for delete to public
using (bucket_id = 'attachments');


----------------------------------------------------------------
-- FILE: supabase/project_controls_schema.sql
----------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  project_name text not null,
  client text,
  location text,
  contract_value numeric(18,2),
  start_date date,
  end_date date,
  status text not null default 'Planning' check (status in ('Planning','Active','On Hold','Completed','Cancelled')),
  report_month date,
  default_retention_pct numeric(5,2) not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  full_name text not null,
  role text not null default 'Viewer' check (role in ('Admin','Project Manager','QS Engineer','Technical Engineer','Site Engineer','Procurement Officer','Finance','Viewer')),
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_users (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'Viewer' check (role in ('Admin','Project Manager','QS Engineer','Technical Engineer','Site Engineer','Procurement Officer','Finance','Viewer')),
  assigned_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create table if not exists public.project_structures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid null references public.project_structures(id) on delete cascade,
  structure_code text not null,
  structure_name text not null,
  structure_type text not null check (structure_type in ('Phase','Building','Villa')),
  level_no integer not null default 1,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, structure_code)
);

create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  subcontractor_code text not null unique,
  name text not null,
  trade_scope text,
  contact_person text,
  phone text,
  email text,
  address text,
  tax_registration_no text,
  commercial_reg_no text,
  default_retention_pct numeric(5,2) not null default 0,
  advance_amount numeric(18,2),
  advance_recovery_pct numeric(5,2),
  status text not null default 'Active' check (status in ('Active','Inactive','Blacklisted')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  structure_id uuid null references public.project_structures(id) on delete set null,
  item_code text not null,
  description text not null,
  work_type text,
  unit text not null,
  boq_qty numeric(18,3) not null default 0,
  client_rate numeric(18,2),
  client_budget numeric(18,2),
  chapter text,
  discipline text check (discipline in ('Structural','Architectural','MEP','Civil','Landscaping','Fit-Out','Facade','Infrastructure','Other')),
  csi_ref text,
  wbs_code text,
  source_note text,
  is_provisional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, item_code)
);

create table if not exists public.subcontract_breakdown (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  boq_item_id uuid not null references public.boq_items(id) on delete cascade,
  structure_id uuid null references public.project_structures(id) on delete set null,
  assignment_key text not null,
  project_model text,
  subcontract_qty numeric(18,3) not null default 0,
  rate numeric(18,2) not null default 0,
  contract_value numeric(18,2) generated always as (round((subcontract_qty * rate)::numeric, 2)) stored,
  client_rate numeric(18,2),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subcontract_breakdown_project on public.subcontract_breakdown(project_id);
create index if not exists idx_subcontract_breakdown_subcontractor on public.subcontract_breakdown(subcontractor_id);

create table if not exists public.qs_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  breakdown_id uuid not null references public.subcontract_breakdown(id) on delete cascade,
  assignment_key text not null,
  cert_no integer not null,
  period_end date not null,
  boq_qty numeric(18,3) not null default 0,
  actual_survey_qty numeric(18,3),
  effective_pay_qty numeric(18,3) generated always as (coalesce(actual_survey_qty, boq_qty)) stored,
  notes text,
  submitted_by uuid,
  submitted_at timestamptz,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Approved','Rejected','Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, breakdown_id, cert_no)
);
create index if not exists idx_qs_entries_project on public.qs_entries(project_id);
create index if not exists idx_qs_entries_breakdown on public.qs_entries(breakdown_id);
create index if not exists idx_qs_entries_cert on public.qs_entries(project_id, cert_no);

create table if not exists public.qs_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  qs_entry_id uuid not null references public.qs_entries(id) on delete cascade,
  status text not null check (status in ('Draft','Submitted','Approved','Rejected','Cancelled')),
  reviewed_by uuid,
  review_date timestamptz,
  approved_qty numeric(18,3),
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  structure_id uuid null references public.project_structures(id) on delete set null,
  cert_no integer not null,
  period_end date not null,
  gross_amount numeric(18,2) not null default 0,
  retention_pct numeric(5,2) not null default 0,
  retention_amount numeric(18,2) not null default 0,
  advance_recovery numeric(18,2) not null default 0,
  deductions numeric(18,2) not null default 0,
  penalties numeric(18,2) not null default 0,
  other_additions numeric(18,2) not null default 0,
  previously_paid numeric(18,2) not null default 0,
  net_payable numeric(18,2) not null default 0,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Approved','Paid','Cancelled')),
  generated_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, subcontractor_id, cert_no)
);

create table if not exists public.certificate_lines (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  breakdown_id uuid not null references public.subcontract_breakdown(id) on delete cascade,
  qs_entry_id uuid null references public.qs_entries(id) on delete set null,
  line_no integer not null,
  assignment_key text not null,
  contract_qty numeric(18,3) not null default 0,
  actual_survey_qty numeric(18,3),
  effective_pay_qty numeric(18,3) not null default 0,
  previous_qty numeric(18,3) not null default 0,
  current_qty numeric(18,3) not null default 0,
  cumulative_qty numeric(18,3) generated always as (coalesce(previous_qty,0) + coalesce(current_qty,0)) stored,
  remaining_qty numeric(18,3) generated always as (greatest(coalesce(contract_qty,0) - (coalesce(previous_qty,0) + coalesce(current_qty,0)), 0)) stored,
  rate numeric(18,2) not null default 0,
  previous_value numeric(18,2) generated always as (round((coalesce(previous_qty,0) * rate)::numeric, 2)) stored,
  current_value numeric(18,2) generated always as (round((coalesce(current_qty,0) * rate)::numeric, 2)) stored,
  cumulative_value numeric(18,2) generated always as (round(((coalesce(previous_qty,0) + coalesce(current_qty,0)) * rate)::numeric, 2)) stored,
  warning text,
  created_at timestamptz not null default now()
);

create table if not exists public.technical_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid null references public.subcontractors(id) on delete set null,
  record_type text not null check (record_type in ('RFI','MIR','Material Submittal','Shop Drawing','Method Statement','Technical Query','NCR','Inspection Request')),
  reference_no text not null,
  subject text not null,
  discipline text check (discipline in ('Structural','Architectural','MEP','Civil','Landscaping','Fit-Out','Facade','Infrastructure','Other')),
  revision_no text,
  submission_date date,
  due_date date,
  response_date date,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Under Review','Approved','Approved with Comments','Rejected','Closed','Overdue')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  responsible_person text,
  comments text,
  attachment_url text,
  rejection_reason text,
  boq_item_id uuid null references public.boq_items(id) on delete set null,
  structure_id uuid null references public.project_structures(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurement_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  pr_no text not null,
  material text not null,
  boq_item_id uuid null references public.boq_items(id) on delete set null,
  structure_id uuid null references public.project_structures(id) on delete set null,
  project_model text,
  required_qty numeric(18,3),
  unit text,
  supplier text,
  pr_date date,
  rfq_date date,
  po_date date,
  po_number text,
  po_value numeric(18,2),
  planned_delivery date,
  actual_delivery date,
  notes text,
  status text not null default 'PR Raised' check (status in ('PR Raised','RFQ Issued','PO Issued','Partially Delivered','Delivered','Cancelled','Delayed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.variations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid null references public.subcontractors(id) on delete set null,
  boq_item_id uuid null references public.boq_items(id) on delete set null,
  vo_no text not null,
  description text not null,
  structure_id uuid null references public.project_structures(id) on delete set null,
  type text not null check (type in ('Addition','Omission','Substitution','Acceleration','Provisional Sum')),
  qty_impact numeric(18,3),
  unit text,
  rate numeric(18,2),
  financial_impact numeric(18,2) generated always as (case when qty_impact is null or rate is null then null else round((qty_impact * rate)::numeric, 2) end) stored,
  time_impact_days integer,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Under Review','Approved','Rejected','Partially Approved')),
  approved_value numeric(18,2),
  submitted_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, vo_no)
);


-- V138 SQL compatibility fix:
-- PostgreSQL/Supabase cannot change an existing VIEW column type using CREATE OR REPLACE VIEW
-- (example: numeric -> numeric(18,2)). Dropping and recreating project views avoids 42P16.
drop view if exists public.v_commercial_summary cascade;
create view public.v_commercial_summary as
select
  sb.project_id,
  sb.subcontractor_id,
  s.subcontractor_code,
  s.name as subcontractor_name,
  coalesce(sum(sb.contract_value), 0)::numeric(18,2) as total_contract_value,
  coalesce(sum(case when c.status in ('Draft','Submitted','Approved','Paid') then c.gross_amount else 0 end), 0)::numeric(18,2) as total_certified_gross,
  coalesce(sum(case when c.status = 'Paid' then c.net_payable else 0 end), 0)::numeric(18,2) as total_net_paid,
  (coalesce(sum(sb.contract_value), 0) - coalesce(sum(case when c.status in ('Draft','Submitted','Approved','Paid') then c.gross_amount else 0 end), 0))::numeric(18,2) as remaining_value,
  case when coalesce(sum(sb.contract_value), 0) = 0 then 0 else round((coalesce(sum(case when c.status in ('Draft','Submitted','Approved','Paid') then c.gross_amount else 0 end), 0) / nullif(sum(sb.contract_value),0)) * 100, 2) end::numeric(18,2) as achievement_pct
from public.subcontract_breakdown sb
join public.subcontractors s on s.id = sb.subcontractor_id
left join public.certificates c on c.project_id = sb.project_id and c.subcontractor_id = sb.subcontractor_id
group by sb.project_id, sb.subcontractor_id, s.subcontractor_code, s.name;

drop view if exists public.v_certificate_summary cascade;
create view public.v_certificate_summary as
select
  c.project_id,
  c.subcontractor_id,
  s.subcontractor_code,
  s.name as subcontractor_name,
  count(*)::int as total_certificates,
  coalesce(sum(c.gross_amount),0)::numeric(18,2) as total_gross,
  coalesce(sum(c.retention_amount),0)::numeric(18,2) as total_retention,
  coalesce(sum(case when c.status = 'Paid' then c.net_payable else 0 end),0)::numeric(18,2) as total_net_paid,
  coalesce(max(c.cert_no),0)::int as latest_cert_no,
  max(c.period_end)::date as latest_period
from public.certificates c
join public.subcontractors s on s.id = c.subcontractor_id
group by c.project_id, c.subcontractor_id, s.subcontractor_code, s.name;

drop view if exists public.v_pending_approvals cascade;
create view public.v_pending_approvals as
select
  q.id,
  q.project_id,
  p.project_name,
  sb.subcontractor_id,
  s.name as subcontractor_name,
  q.assignment_key,
  q.cert_no,
  q.period_end,
  q.boq_qty,
  q.actual_survey_qty,
  q.effective_pay_qty,
  q.status,
  q.submitted_at
from public.qs_entries q
join public.projects p on p.id = q.project_id
join public.subcontract_breakdown sb on sb.id = q.breakdown_id
join public.subcontractors s on s.id = sb.subcontractor_id
where q.status = 'Submitted';

drop view if exists public.v_technical_overdue cascade;
create view public.v_technical_overdue as
select
  tr.*,
  greatest((current_date - tr.due_date), 0)::int as days_overdue,
  p.project_name,
  s.name as subcontractor_name
from public.technical_records tr
join public.projects p on p.id = tr.project_id
left join public.subcontractors s on s.id = tr.subcontractor_id
where tr.due_date is not null
  and tr.due_date < current_date
  and tr.status not in ('Approved','Approved with Comments','Closed');

drop view if exists public.v_dashboard_kpis cascade;
create view public.v_dashboard_kpis as
with contract_sum as (
  select project_id, coalesce(sum(contract_value),0)::numeric(18,2) as total_subcontract_value
  from public.subcontract_breakdown
  group by project_id
), cert_sum as (
  select project_id, coalesce(sum(gross_amount),0)::numeric(18,2) as total_certified_value
  from public.certificates
  where status in ('Draft','Submitted','Approved','Paid')
  group by project_id
), tech_sum as (
  select project_id,
    count(*) filter (where status not in ('Approved','Approved with Comments','Closed'))::int as technical_open,
    count(*) filter (where due_date is not null and due_date < current_date and status not in ('Approved','Approved with Comments','Closed'))::int as technical_overdue
  from public.technical_records
  group by project_id
), proc_sum as (
  select project_id,
    count(*) filter (where status = 'Delayed')::int as procurement_delayed
  from public.procurement_records
  group by project_id
), pending_sum as (
  select project_id,
    count(*) filter (where status = 'Submitted')::int as pending_approvals
  from public.qs_entries
  group by project_id
)
select
  p.id as project_id,
  p.project_name,
  p.status as project_status,
  coalesce(cs.total_subcontract_value,0)::numeric(18,2) as total_subcontract_value,
  coalesce(ct.total_certified_value,0)::numeric(18,2) as total_certified_value,
  (coalesce(cs.total_subcontract_value,0) - coalesce(ct.total_certified_value,0))::numeric(18,2) as remaining_value,
  coalesce(ts.technical_open,0)::int as technical_open,
  coalesce(ts.technical_overdue,0)::int as technical_overdue,
  coalesce(ps.procurement_delayed,0)::int as procurement_delayed,
  coalesce(pas.pending_approvals,0)::int as pending_approvals
from public.projects p
left join contract_sum cs on cs.project_id = p.id
left join cert_sum ct on ct.project_id = p.id
left join tech_sum ts on ts.project_id = p.id
left join proc_sum ps on ps.project_id = p.id
left join pending_sum pas on pas.project_id = p.id;

-- Dev-friendly RLS defaults for immediate app use.
alter table public.projects enable row level security;
alter table public.users enable row level security;
alter table public.project_users enable row level security;
alter table public.project_structures enable row level security;
alter table public.subcontractors enable row level security;
alter table public.boq_items enable row level security;
alter table public.subcontract_breakdown enable row level security;
alter table public.qs_entries enable row level security;
alter table public.qs_approvals enable row level security;
alter table public.certificates enable row level security;
alter table public.certificate_lines enable row level security;
alter table public.technical_records enable row level security;
alter table public.procurement_records enable row level security;
alter table public.variations enable row level security;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','users','project_users','project_structures','subcontractors','boq_items','subcontract_breakdown','qs_entries','qs_approvals','certificates','certificate_lines','technical_records','procurement_records','variations']
  LOOP
    EXECUTE format('drop policy if exists "%1$s_select_all_dev" on public.%1$s', t);
    EXECUTE format('create policy "%1$s_select_all_dev" on public.%1$s for select to public using (true)', t, t);
    EXECUTE format('drop policy if exists "%1$s_insert_all_dev" on public.%1$s', t);
    EXECUTE format('create policy "%1$s_insert_all_dev" on public.%1$s for insert to public with check (true)', t, t);
    EXECUTE format('drop policy if exists "%1$s_update_all_dev" on public.%1$s', t);
    EXECUTE format('create policy "%1$s_update_all_dev" on public.%1$s for update to public using (true) with check (true)', t, t);
    EXECUTE format('drop policy if exists "%1$s_delete_all_dev" on public.%1$s', t);
    EXECUTE format('create policy "%1$s_delete_all_dev" on public.%1$s for delete to public using (true)', t, t);
  END LOOP;
END $$;


----------------------------------------------------------------
-- FILE: supabase/project_structure.sql
----------------------------------------------------------------
create table if not exists public.project_structures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('Phase','Building','Villa')),
  parent_id uuid null references public.project_structures(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, code)
);

alter table public.project_structures enable row level security;

drop policy if exists "project_structures_select_all_dev" on public.project_structures;
create policy "project_structures_select_all_dev"
on public.project_structures for select to public using (true);
drop policy if exists "project_structures_insert_all_dev" on public.project_structures;
create policy "project_structures_insert_all_dev"
on public.project_structures for insert to public with check (true);
drop policy if exists "project_structures_update_all_dev" on public.project_structures;
create policy "project_structures_update_all_dev"
on public.project_structures for update to public using (true) with check (true);
drop policy if exists "project_structures_delete_all_dev" on public.project_structures;
create policy "project_structures_delete_all_dev"
on public.project_structures for delete to public using (true);

alter table public.boq_items add column if not exists structure_id uuid null references public.project_structures(id);
alter table public.subcontract_breakdown add column if not exists structure_id uuid null references public.project_structures(id);
alter table public.qs_entries add column if not exists structure_id uuid null references public.project_structures(id);
alter table public.certificates add column if not exists structure_id uuid null references public.project_structures(id);
alter table public.technical_records add column if not exists structure_id uuid null references public.project_structures(id);
alter table public.procurement_records add column if not exists structure_id uuid null references public.project_structures(id);
alter table public.variations add column if not exists structure_id uuid null references public.project_structures(id);


----------------------------------------------------------------
-- FILE: supabase/rls_dev_open_policies.sql
----------------------------------------------------------------
alter table public.projects disable row level security;
alter table public.boq_items disable row level security;
alter table public.subcontractors disable row level security;
alter table public.subcontract_breakdown disable row level security;
alter table public.qs_entries disable row level security;
alter table public.qs_approvals disable row level security;
alter table public.certificates disable row level security;
alter table public.certificate_lines disable row level security;
alter table public.technical_records disable row level security;
alter table public.procurement_records disable row level security;
alter table public.variations disable row level security;


----------------------------------------------------------------
-- FILE: SUPABASE_FIX_CUMULATIVE_TRIGGER.sql
----------------------------------------------------------------
-- ============================================================
-- FIX: "New cumulative quantity cannot exceed BOQ quantity"
-- The trigger was using strict > comparison which fails on
-- floating point rounding (e.g. 9.5 + 9.5 = 19.0000000001)
-- and also blocked 100% completion (= boq_qty is valid)
-- ============================================================

-- Option 1: Drop the trigger entirely (recommended if you track
-- cumulative qty in the app, not the DB)
DROP TRIGGER IF EXISTS check_cumulative_qty ON subcontractor_invoice_lines;
DROP FUNCTION IF EXISTS check_cumulative_qty_fn() CASCADE;

-- Option 2 (alternative): Replace trigger with tolerance-aware version
-- Uncomment below if you want to KEEP the check but with tolerance:
/*
CREATE OR REPLACE FUNCTION check_cumulative_qty_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_boq_qty numeric;
  v_cum_qty numeric;
  v_tolerance numeric := 0.01; -- allow 0.01 unit tolerance for floating point
BEGIN
  v_boq_qty := COALESCE(NEW.boq_qty, 0);
  v_cum_qty := COALESCE(NEW.new_cumulative_qty, 0);
  
  -- Allow up to 100% + tolerance (floating point safety)
  IF v_boq_qty > 0 AND v_cum_qty > (v_boq_qty + v_tolerance) THEN
    RAISE EXCEPTION 'New cumulative quantity (%) cannot exceed BOQ quantity (%) by more than %',
      v_cum_qty, v_boq_qty, v_tolerance;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_cumulative_qty
  BEFORE INSERT OR UPDATE ON subcontractor_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION check_cumulative_qty_fn();
*/

-- Also: round new_cumulative_qty to avoid float precision issues
-- Run this if you want to clean up any existing rows:
UPDATE subcontractor_invoice_lines
SET new_cumulative_qty = ROUND(COALESCE(new_cumulative_qty, 0)::numeric, 3)
WHERE new_cumulative_qty IS NOT NULL;

SELECT 'Fix applied: cumulative qty trigger dropped/updated' as result;


----------------------------------------------------------------
-- FILE: SUPABASE_FIX_QTO_STRUCTURE_FK.sql
----------------------------------------------------------------
-- Fix QS/QTO structure foreign key after moving to the new Project Structure tree
-- Run this once in Supabase SQL Editor if QS entry shows:
-- insert or update on table "qto_lines" violates foreign key constraint "qto_lines_structure_id_fkey"

ALTER TABLE public.qto_lines
  DROP CONSTRAINT IF EXISTS qto_lines_structure_id_fkey;

ALTER TABLE public.qto_lines
  ADD CONSTRAINT qto_lines_structure_id_fkey
  FOREIGN KEY (structure_id)
  REFERENCES public.project_structure_nodes(id)
  ON DELETE SET NULL;


----------------------------------------------------------------
-- FILE: SUPABASE_V101_COMMERCIAL_SCREENS_BBS.sql
----------------------------------------------------------------
-- SUPABASE_V101_COMMERCIAL_SCREENS_BBS.sql
-- Safe migration for v101 Commercial Screens + BBS table.

create extension if not exists "pgcrypto";

-- Make sure v100 commercial tables exist (safe if already created)
create table if not exists public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  budget_code text,
  description text,
  discipline text,
  budget_amount numeric default 0,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.cost_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  boq_item_id uuid,
  structure_node_id uuid,
  resource_code text,
  transaction_date date default current_date,
  description text,
  qty numeric default 0,
  unit text,
  rate numeric default 0,
  amount numeric generated always as (coalesce(qty,0) * coalesce(rate,0)) stored,
  source text,
  created_at timestamp default now()
);

create table if not exists public.cashflow_forecast (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  period_month date not null,
  planned_revenue numeric default 0,
  planned_cost numeric default 0,
  actual_revenue numeric default 0,
  actual_cost numeric default 0,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(project_id, period_month)
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  claim_no text,
  title text not null,
  claim_type text,
  status text default 'Draft',
  description text,
  submitted_amount numeric default 0,
  approved_amount numeric default 0,
  submission_date date,
  approval_date date,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.claim_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.claims(id) on delete cascade,
  boq_item_id uuid,
  structure_node_id uuid,
  description text,
  qty numeric default 0,
  unit text,
  rate numeric default 0,
  amount numeric generated always as (coalesce(qty,0) * coalesce(rate,0)) stored,
  notes text,
  created_at timestamp default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  status text default 'Pending',
  requested_by uuid,
  approved_by uuid,
  requested_at timestamp default now(),
  approved_at timestamp,
  notes text
);

create table if not exists public.approval_logs (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid references public.approvals(id) on delete cascade,
  action text not null,
  actor_id uuid,
  notes text,
  created_at timestamp default now()
);

-- BBS main table: same QS-style entry concept, but for reinforcement bar bending schedule.
create table if not exists public.bbs_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  structure_node_id uuid,
  boq_item_id uuid,
  bar_mark text,
  dia_mm numeric default 0,
  shape_code text,
  qty numeric default 0,
  length_m numeric default 0,
  unit_weight_kg_m numeric default 0,
  total_weight_kg numeric default 0,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists idx_bbs_lines_project on public.bbs_lines(project_id);
create index if not exists idx_bbs_lines_structure on public.bbs_lines(structure_node_id);
create index if not exists idx_bbs_lines_boq on public.bbs_lines(boq_item_id);

-- Updated at helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bbs_lines_updated_at on public.bbs_lines;
create trigger trg_bbs_lines_updated_at
before update on public.bbs_lines
for each row execute function public.set_updated_at();

-- Optional basic RLS enablement. Policies can be tightened later.
alter table public.bbs_lines enable row level security;
drop policy if exists "allow all bbs_lines" on public.bbs_lines;
create policy "allow all bbs_lines" on public.bbs_lines for all using (true) with check (true);


----------------------------------------------------------------
-- FILE: SUPABASE_V102_COMMERCIAL_LOGIC_BBS.sql
----------------------------------------------------------------
-- V102 Commercial Logic + BBS safe migration
-- Budget is calculated in UI from Cost Sheet/Tender Breakdown.
-- Actual cost is calculated in UI from subcontractor_invoices.
-- Cashflow actuals are populated from client invoices and subcontractor invoices.

create extension if not exists "pgcrypto";

-- BBS now stores entered steel tonnage and calculates steel ratio against Effective QS Qty.
create table if not exists public.bbs_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  structure_node_id uuid,
  boq_item_id uuid,
  steel_qty_ton numeric default 0,
  effective_qs_qty numeric default 0,
  steel_ratio_ton_m3 numeric default 0,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table public.bbs_lines
add column if not exists steel_qty_ton numeric default 0,
add column if not exists effective_qs_qty numeric default 0,
add column if not exists steel_ratio_ton_m3 numeric default 0,
add column if not exists updated_at timestamp default now();

-- Keep old BBS columns if they exist; no data is dropped.
create index if not exists idx_bbs_lines_project_id on public.bbs_lines(project_id);
create index if not exists idx_bbs_lines_boq_item_id on public.bbs_lines(boq_item_id);
create index if not exists idx_bbs_lines_structure_node_id on public.bbs_lines(structure_node_id);

-- Cashflow table must support actual values populated from invoices.
create table if not exists public.cashflow_forecast (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  period_month date not null,
  planned_revenue numeric default 0,
  planned_cost numeric default 0,
  actual_revenue numeric default 0,
  actual_cost numeric default 0,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(project_id, period_month)
);

alter table public.cashflow_forecast
add column if not exists actual_revenue numeric default 0,
add column if not exists actual_cost numeric default 0,
add column if not exists updated_at timestamp default now();

-- Claims kept; approvals UI removed in V102.
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  claim_no text,
  title text not null,
  claim_type text,
  status text default 'Draft',
  description text,
  submitted_amount numeric default 0,
  approved_amount numeric default 0,
  submission_date date,
  approval_date date,
  created_at timestamp default now(),
  updated_at timestamp default now()
);


----------------------------------------------------------------
-- FILE: SUPABASE_V104_REAL_COST_CONTROL.sql
----------------------------------------------------------------
-- SUPABASE_V104_REAL_COST_CONTROL.sql
-- Safe migration for Cost Control Engineer workflow.
-- Adds actual material cost linking and invoice line linking to BOQ / Structure / Resource.

create extension if not exists "pgcrypto";

-- Material actual costs used by Cost Control / Cashflow.
create table if not exists public.material_control (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  boq_item_id uuid,
  structure_node_id uuid,
  structure_id uuid,
  resource_code text,
  code text,
  description text,
  qty numeric default 0,
  quantity numeric default 0,
  unit text,
  rate numeric default 0,
  unit_rate numeric default 0,
  amount numeric default 0,
  total_cost numeric default 0,
  actual_cost numeric default 0,
  transaction_date date default current_date,
  source text default 'Material Actual',
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table public.material_control
add column if not exists project_id uuid,
add column if not exists boq_item_id uuid,
add column if not exists structure_node_id uuid,
add column if not exists structure_id uuid,
add column if not exists resource_code text,
add column if not exists code text,
add column if not exists description text,
add column if not exists qty numeric default 0,
add column if not exists quantity numeric default 0,
add column if not exists unit text,
add column if not exists rate numeric default 0,
add column if not exists unit_rate numeric default 0,
add column if not exists amount numeric default 0,
add column if not exists total_cost numeric default 0,
add column if not exists actual_cost numeric default 0,
add column if not exists transaction_date date default current_date,
add column if not exists source text default 'Material Actual',
add column if not exists notes text,
add column if not exists created_at timestamp default now(),
add column if not exists updated_at timestamp default now();

-- Actual subcontractor invoice line linking.
alter table public.subcontractor_invoice_lines
add column if not exists boq_item_id uuid,
add column if not exists structure_node_id uuid,
add column if not exists resource_code text;

-- Tender breakdown linking.
alter table public.tender_items
add column if not exists boq_item_id uuid,
add column if not exists structure_node_id uuid,
add column if not exists structure_id uuid,
add column if not exists resource_code text;

-- Helpful indexes.
create index if not exists idx_material_control_project on public.material_control(project_id);
create index if not exists idx_material_control_boq on public.material_control(boq_item_id);
create index if not exists idx_material_control_structure_node on public.material_control(structure_node_id);
create index if not exists idx_material_control_resource on public.material_control(resource_code);
create index if not exists idx_sub_invoice_lines_boq on public.subcontractor_invoice_lines(boq_item_id);
create index if not exists idx_sub_invoice_lines_structure_node on public.subcontractor_invoice_lines(structure_node_id);
create index if not exists idx_sub_invoice_lines_resource on public.subcontractor_invoice_lines(resource_code);

-- Optional RLS open policy for development. Tighten later for production roles.
alter table public.material_control enable row level security;
drop policy if exists "allow all material_control" on public.material_control;
create policy "allow all material_control" on public.material_control for all using (true) with check (true);


----------------------------------------------------------------
-- FILE: SUPABASE_V109_SUBCONTRACTOR_INVOICES.sql
----------------------------------------------------------------
-- SUPABASE_V109_SUBCONTRACTOR_INVOICES.sql
-- Safe rebuild for subcontractor invoice previous quantity logic.
-- Run once in Supabase SQL Editor. Does not drop data.

create extension if not exists "pgcrypto";

-- Required columns / compatibility
alter table public.subcontractor_invoices
add column if not exists status text default 'Draft',
add column if not exists retention_pct numeric default 5,
add column if not exists retention_amount numeric default 0,
add column if not exists net_amount numeric default 0,
add column if not exists gross_amount numeric default 0,
add column if not exists updated_at timestamp with time zone default now();

alter table public.subcontractor_invoice_lines
add column if not exists previous_cumulative_qty numeric default 0,
add column if not exists current_qty numeric default 0,
add column if not exists new_cumulative_qty numeric default 0,
add column if not exists current_work_pct numeric default 0,
add column if not exists current_value numeric default 0,
add column if not exists cumulative_value numeric default 0,
add column if not exists approved_qty numeric default 0,
add column if not exists amount numeric default 0,
add column if not exists resource_code text;

-- Make sure structure_id references the new project_structure_nodes table.
alter table public.subcontractor_invoice_lines
  drop constraint if exists subcontractor_invoice_lines_structure_id_fkey;

alter table public.subcontractor_invoice_lines
  add constraint subcontractor_invoice_lines_structure_id_fkey
  foreign key (structure_id)
  references public.project_structure_nodes(id)
  on delete set null;

-- Parse numeric order from invoice_no like INV-ABC-003 => 3.
create or replace function public.invoice_no_sort_v109(p_invoice_no text)
returns integer as $$
declare
  v_match text;
begin
  v_match := substring(coalesce(p_invoice_no,'') from '(\d+)\s*$');
  if v_match is null then
    return 0;
  end if;
  return v_match::integer;
end;
$$ language plpgsql immutable;

-- Previous cumulative for ONE invoice line.
create or replace function public.get_previous_cumulative_qty_v109(
  p_project_id uuid,
  p_subcontractor_id uuid,
  p_breakdown_id uuid,
  p_boq_item_id uuid,
  p_structure_id uuid,
  p_current_invoice_id uuid
)
returns numeric as $$
declare
  v_prev numeric;
begin
  select sil.new_cumulative_qty
  into v_prev
  from public.subcontractor_invoice_lines sil
  join public.subcontractor_invoices si on si.id = sil.invoice_id
  join public.subcontractor_invoices cur on cur.id = p_current_invoice_id
  where sil.project_id = p_project_id
    and sil.subcontractor_id = p_subcontractor_id
    and coalesce(si.status,'Draft') <> 'Cancelled'
    and si.id <> p_current_invoice_id
    and public.invoice_no_sort_v109(si.invoice_no) < public.invoice_no_sort_v109(cur.invoice_no)
    and (
      (p_breakdown_id is not null and sil.breakdown_id = p_breakdown_id)
      or (
        p_breakdown_id is null
        and sil.boq_item_id = p_boq_item_id
        and (
          (p_structure_id is null and sil.structure_id is null)
          or sil.structure_id = p_structure_id
        )
      )
    )
  order by public.invoice_no_sort_v109(si.invoice_no) desc, si.period_end desc nulls last, si.created_at desc nulls last
  limit 1;

  return coalesce(v_prev, 0);
end;
$$ language plpgsql stable;

-- Previous cumulative for all lines of one current invoice. Used by frontend cache.
create or replace function public.get_previous_invoice_lines_v109(p_current_invoice_id uuid)
returns table (
  breakdown_id uuid,
  boq_item_id uuid,
  structure_id uuid,
  previous_cumulative_qty numeric
) as $$
begin
  return query
  with cur as (
    select id, project_id, subcontractor_id, invoice_no
    from public.subcontractor_invoices
    where id = p_current_invoice_id
  ), ranked as (
    select distinct on (sil.breakdown_id, sil.boq_item_id, sil.structure_id)
      sil.breakdown_id,
      sil.boq_item_id,
      sil.structure_id,
      coalesce(sil.new_cumulative_qty,0) as previous_cumulative_qty,
      public.invoice_no_sort_v109(si.invoice_no) as sort_no,
      si.period_end,
      si.created_at
    from public.subcontractor_invoice_lines sil
    join public.subcontractor_invoices si on si.id = sil.invoice_id
    join cur on cur.project_id = sil.project_id and cur.subcontractor_id = sil.subcontractor_id
    where si.id <> cur.id
      and coalesce(si.status,'Draft') <> 'Cancelled'
      and public.invoice_no_sort_v109(si.invoice_no) < public.invoice_no_sort_v109(cur.invoice_no)
    order by sil.breakdown_id, sil.boq_item_id, sil.structure_id,
             public.invoice_no_sort_v109(si.invoice_no) desc,
             si.period_end desc nulls last,
             si.created_at desc nulls last
  )
  select ranked.breakdown_id, ranked.boq_item_id, ranked.structure_id, ranked.previous_cumulative_qty
  from ranked;
end;
$$ language plpgsql stable;

-- Trigger: DB is the source of truth for Previous/New/Values.
create or replace function public.set_invoice_line_quantities_v109()
returns trigger as $$
declare
  v_prev numeric;
  v_rate numeric;
  v_boq_qty numeric;
  v_current numeric;
  v_new numeric;
begin
  v_prev := public.get_previous_cumulative_qty_v109(
    new.project_id,
    new.subcontractor_id,
    new.breakdown_id,
    new.boq_item_id,
    new.structure_id,
    new.invoice_id
  );

  v_boq_qty := coalesce(new.boq_qty, 0);
  v_rate := coalesce(new.rate, 0);
  v_current := coalesce(new.current_qty, new.approved_qty, 0);

  -- Do not allow cumulative to exceed BOQ qty when BOQ qty exists.
  if v_boq_qty > 0 and v_prev + v_current > v_boq_qty then
    v_current := greatest(v_boq_qty - v_prev, 0);
  end if;

  v_new := v_prev + v_current;

  new.previous_cumulative_qty := round(v_prev::numeric, 3);
  new.current_qty := round(v_current::numeric, 3);
  new.approved_qty := round(v_current::numeric, 3);
  new.new_cumulative_qty := round(v_new::numeric, 3);
  new.current_value := round((v_current * v_rate)::numeric, 2);
  new.cumulative_value := round((v_new * v_rate)::numeric, 2);
  new.amount := new.current_value;
  if v_boq_qty > 0 then
    new.current_work_pct := round(((v_current / v_boq_qty) * 100)::numeric, 3);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_invoice_line_quantities_v109 on public.subcontractor_invoice_lines;
create trigger trg_set_invoice_line_quantities_v109
before insert or update on public.subcontractor_invoice_lines
for each row execute function public.set_invoice_line_quantities_v109();

create index if not exists idx_v109_invoice_lookup
on public.subcontractor_invoices(project_id, subcontractor_id, invoice_no, status);

create index if not exists idx_v109_invoice_line_lookup
on public.subcontractor_invoice_lines(project_id, subcontractor_id, breakdown_id, boq_item_id, structure_id, invoice_id);


----------------------------------------------------------------
-- FILE: SUPABASE_V110_RETENTION_SYSTEM.sql
----------------------------------------------------------------
-- SUPABASE_V110_RETENTION_SYSTEM.sql
-- Safe add-on over v109. Does NOT drop or reset any existing data.

create extension if not exists "pgcrypto";

alter table public.subcontractor_invoices
add column if not exists invoice_type text default 'progress',
add column if not exists retention_released_amount numeric default 0,
add column if not exists retention_release_ref text;

-- Make old invoices explicit progress invoices.
update public.subcontractor_invoices
set invoice_type = 'progress'
where invoice_type is null;

-- Optional safety check. Kept NOT VALID to avoid breaking old dirty data.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subcontractor_invoices_invoice_type_chk'
  ) then
    alter table public.subcontractor_invoices
    add constraint subcontractor_invoices_invoice_type_chk
    check (invoice_type in ('progress','retention_release','final')) not valid;
  end if;
end $$;

-- Retention balance by project/subcontractor.
drop view if exists public.v_subcontractor_retention_balance cascade;
create view public.v_subcontractor_retention_balance as
with inv as (
  select
    project_id,
    subcontractor_id,
    coalesce(invoice_type,'progress') as invoice_type,
    coalesce(status,'Draft') as status,
    coalesce(retention_amount,0) as retention_amount,
    coalesce(net_amount,gross_amount,0) as release_amount
  from public.subcontractor_invoices
  where coalesce(status,'Draft') <> 'Cancelled'
)
select
  project_id,
  subcontractor_id,
  sum(case when invoice_type <> 'retention_release' then retention_amount else 0 end) as retention_held,
  sum(case when invoice_type = 'retention_release' then release_amount else 0 end) as retention_released,
  greatest(
    sum(case when invoice_type <> 'retention_release' then retention_amount else 0 end)
    - sum(case when invoice_type = 'retention_release' then release_amount else 0 end),
    0
  ) as retention_balance
from inv
group by project_id, subcontractor_id;

create index if not exists idx_v110_subcontractor_invoices_retention
on public.subcontractor_invoices(project_id, subcontractor_id, invoice_type, status);


----------------------------------------------------------------
-- FILE: SUPABASE_V111_UNIFIED_RETENTION_CERTIFICATE.sql
----------------------------------------------------------------
-- V111 Unified retention inside the normal subcontractor invoice
-- Safe migration: adds columns only; does not drop or reset data.

alter table public.subcontractor_invoices
add column if not exists retention_release_amount numeric default 0,
add column if not exists retention_release_remarks text,
add column if not exists previous_paid_amount numeric default 0,
add column if not exists final_payable_amount numeric default 0;

-- Backfill safe defaults
update public.subcontractor_invoices
set retention_release_amount = coalesce(retention_release_amount, 0),
    previous_paid_amount = coalesce(previous_paid_amount, 0),
    final_payable_amount = coalesce(final_payable_amount, coalesce(net_amount,0))
where retention_release_amount is null
   or previous_paid_amount is null
   or final_payable_amount is null;

-- Available retention should be based on APPROVED invoices only.
drop view if exists public.v_subcontractor_retention_balance cascade;
create view public.v_subcontractor_retention_balance as
select
  project_id,
  subcontractor_id,
  sum(coalesce(retention_amount, 0)) as total_retention_held,
  sum(coalesce(retention_release_amount, 0)) as total_retention_released,
  greatest(
    sum(coalesce(retention_amount, 0)) - sum(coalesce(retention_release_amount, 0)),
    0
  ) as available_retention
from public.subcontractor_invoices
where lower(coalesce(status,'')) = 'approved'
group by project_id, subcontractor_id;

-- Payment certificate summary view aligned with the certificate format.
drop view if exists public.v_subcontractor_invoice_payment_summary cascade;
create view public.v_subcontractor_invoice_payment_summary as
select
  si.id as invoice_id,
  si.project_id,
  si.subcontractor_id,
  si.invoice_no,
  si.period_end,
  si.status,
  coalesce(si.gross_amount, 0) as gross_works,
  coalesce(si.retention_amount, 0) as retention_deduction,
  coalesce(si.retention_release_amount, 0) as retention_release,
  (
    coalesce(si.gross_amount, 0)
    - coalesce(si.retention_amount, 0)
    + coalesce(si.retention_release_amount, 0)
  ) as net_certificate_value,
  coalesce((
    select sum(coalesce(prev.net_amount, 0))
    from public.subcontractor_invoices prev
    where prev.project_id = si.project_id
      and prev.subcontractor_id = si.subcontractor_id
      and lower(coalesce(prev.status,'')) = 'approved'
      and prev.id <> si.id
      and coalesce(prev.period_end, prev.invoice_date, prev.created_at::date) < coalesce(si.period_end, si.invoice_date, si.created_at::date)
  ), 0) as previous_paid,
  (
    coalesce(si.gross_amount, 0)
    - coalesce(si.retention_amount, 0)
    + coalesce(si.retention_release_amount, 0)
  ) as final_payable
from public.subcontractor_invoices si;


----------------------------------------------------------------
-- FILE: SUPABASE_V112_FINAL_PAYABLE_CERTIFICATE.sql
----------------------------------------------------------------
-- V112 Final Payable + Professional Certificate SQL
-- Safe migration: adds certificate summary columns only. No reset/drop.

alter table public.subcontractor_invoices
add column if not exists previous_paid_amount numeric default 0,
add column if not exists net_payable numeric default 0,
add column if not exists retention_release_amount numeric default 0,
add column if not exists retention_release_remarks text,
add column if not exists retention_amount numeric default 0,
add column if not exists gross_amount numeric default 0,
add column if not exists updated_at timestamp with time zone default now();

-- Optional view: certificate summary by invoice.
drop view if exists public.v_subcontractor_certificate_summary cascade;
create view public.v_subcontractor_certificate_summary as
select
  si.id as invoice_id,
  si.project_id,
  si.subcontractor_id,
  si.invoice_no,
  si.status,
  coalesce(si.gross_amount, 0) as cumulative_gross_amount,
  coalesce(si.retention_amount, 0) as retention_deduction,
  coalesce(si.retention_release_amount, 0) as retention_release_amount,
  coalesce(si.previous_paid_amount, 0) as previous_paid_amount,
  coalesce(si.net_payable, si.net_amount, 0) as final_payable,
  coalesce(si.gross_amount, 0)
    - coalesce(si.retention_amount, 0)
    + coalesce(si.retention_release_amount, 0) as net_certificate_value
from public.subcontractor_invoices si;

create index if not exists idx_subcontractor_invoices_prev_paid_lookup
on public.subcontractor_invoices(project_id, subcontractor_id, status, invoice_no);


----------------------------------------------------------------
-- FILE: SUPABASE_V113_FINAL_PAYMENT_ENGINE.sql
----------------------------------------------------------------
-- V113 Final Payment Engine
-- Safe migration: no data reset. Adds/keeps fields used by final payable certificate logic.

alter table public.subcontractor_invoices
add column if not exists gross_amount numeric default 0,
add column if not exists retention_pct numeric default 0,
add column if not exists retention_amount numeric default 0,
add column if not exists retention_release_amount numeric default 0,
add column if not exists retention_release_remarks text,
add column if not exists previous_paid_amount numeric default 0,
add column if not exists net_payable numeric default 0,
add column if not exists net_amount numeric default 0,
add column if not exists updated_at timestamp with time zone default now();

-- Helper to sort invoice numbers like INV-ABC-003.
create or replace function public.invoice_no_sort(p_invoice_no text)
returns numeric as $$
declare
  v text;
begin
  v := substring(coalesce(p_invoice_no,'') from '([0-9]+)$');
  if v is null or v = '' then return 0; end if;
  return v::numeric;
end;
$$ language plpgsql immutable;

-- Per invoice previous paid should only include approved/paid invoices before the current invoice.
drop view if exists public.v_subcontractor_certificate_summary cascade;
create view public.v_subcontractor_certificate_summary as
select
  si.id as invoice_id,
  si.project_id,
  si.subcontractor_id,
  si.invoice_no,
  si.invoice_date,
  si.period_end,
  si.status,
  coalesce(si.gross_amount, 0) as cumulative_gross_amount,
  coalesce(si.retention_amount, 0) as retention_deduction,
  coalesce(si.retention_release_amount, 0) as retention_release_amount,
  coalesce((
    select sum(coalesce(prev.net_payable, prev.net_amount, 0))
    from public.subcontractor_invoices prev
    where prev.project_id = si.project_id
      and prev.subcontractor_id = si.subcontractor_id
      and lower(coalesce(prev.status,'')) in ('approved','paid')
      and prev.id <> si.id
      and (
        public.invoice_no_sort(prev.invoice_no) < public.invoice_no_sort(si.invoice_no)
        or (
          public.invoice_no_sort(prev.invoice_no) = public.invoice_no_sort(si.invoice_no)
          and coalesce(prev.period_end, prev.invoice_date, prev.created_at::date) < coalesce(si.period_end, si.invoice_date, si.created_at::date)
        )
      )
  ), 0) as previous_paid_amount,
  coalesce(si.gross_amount, 0)
    - coalesce(si.retention_amount, 0)
    + coalesce(si.retention_release_amount, 0) as net_certificate_value,
  greatest(
    coalesce(si.gross_amount, 0)
      - coalesce(si.retention_amount, 0)
      + coalesce(si.retention_release_amount, 0)
      - coalesce((
        select sum(coalesce(prev.net_payable, prev.net_amount, 0))
        from public.subcontractor_invoices prev
        where prev.project_id = si.project_id
          and prev.subcontractor_id = si.subcontractor_id
          and lower(coalesce(prev.status,'')) in ('approved','paid')
          and prev.id <> si.id
          and (
            public.invoice_no_sort(prev.invoice_no) < public.invoice_no_sort(si.invoice_no)
            or (
              public.invoice_no_sort(prev.invoice_no) = public.invoice_no_sort(si.invoice_no)
              and coalesce(prev.period_end, prev.invoice_date, prev.created_at::date) < coalesce(si.period_end, si.invoice_date, si.created_at::date)
            )
          )
      ), 0),
    0
  ) as final_payable
from public.subcontractor_invoices si;

-- Retention balance is held retention minus released retention from approved/paid invoices.
drop view if exists public.v_retention_balance cascade;
create view public.v_retention_balance as
select
  project_id,
  subcontractor_id,
  sum(coalesce(retention_amount,0)) as total_retention_deducted,
  sum(coalesce(retention_release_amount,0)) as total_retention_released,
  sum(coalesce(retention_amount,0)) - sum(coalesce(retention_release_amount,0)) as available_retention_balance
from public.subcontractor_invoices
where lower(coalesce(status,'')) in ('approved','paid')
group by project_id, subcontractor_id;

create index if not exists idx_subcontractor_invoices_payment_engine
on public.subcontractor_invoices(project_id, subcontractor_id, status, invoice_no, period_end);


----------------------------------------------------------------
-- FILE: SUPABASE_V117_CERTIFICATE_PAYMENTS.sql
----------------------------------------------------------------
-- V117 / V115 complete certificate + payments safe migration
create extension if not exists "pgcrypto";

create table if not exists public.subcontractor_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  subcontractor_id uuid,
  invoice_id uuid,
  payment_date date default current_date,
  amount numeric not null default 0,
  method text,
  reference text,
  notes text,
  created_at timestamp with time zone default now()
);

alter table public.subcontractor_invoices
add column if not exists invoice_date date default current_date,
add column if not exists total_deductions numeric default 0,
add column if not exists retention_amount numeric default 0,
add column if not exists retention_release_amount numeric default 0,
add column if not exists previous_paid_amount numeric default 0,
add column if not exists final_payable numeric default 0;

drop view if exists public.v_certificate_summary cascade;
drop view if exists public.v_previous_paid_real cascade;

create view public.v_previous_paid_real as
select
  si.id as invoice_id,
  coalesce((
    select sum(p.amount)
    from public.subcontractor_payments p
    join public.subcontractor_invoices prev on prev.id = p.invoice_id
    where p.subcontractor_id = si.subcontractor_id
      and prev.status = 'approved'
      and prev.invoice_no < si.invoice_no
  ),0) as previous_paid
from public.subcontractor_invoices si;

create view public.v_certificate_summary as
select
  si.id,
  si.project_id,
  si.subcontractor_id,
  si.invoice_no,
  si.invoice_date,
  si.status,
  coalesce(sum(sil.cumulative_value),0) as gross,
  coalesce(si.retention_amount,0) as retention,
  coalesce(si.total_deductions,0) as deductions,
  coalesce(si.retention_release_amount,0) as retention_release,
  (
    coalesce(sum(sil.cumulative_value),0)
    - coalesce(si.retention_amount,0)
    - coalesce(si.total_deductions,0)
    + coalesce(si.retention_release_amount,0)
  ) as after_deductions,
  coalesce(pp.previous_paid,0) as previous_paid,
  (
    (
      coalesce(sum(sil.cumulative_value),0)
      - coalesce(si.retention_amount,0)
      - coalesce(si.total_deductions,0)
      + coalesce(si.retention_release_amount,0)
    )
    - coalesce(pp.previous_paid,0)
  ) as final_payable
from public.subcontractor_invoices si
left join public.subcontractor_invoice_lines sil on sil.invoice_id = si.id
left join public.v_previous_paid_real pp on pp.invoice_id = si.id
group by
  si.id,
  si.project_id,
  si.subcontractor_id,
  si.invoice_no,
  si.invoice_date,
  si.status,
  si.retention_amount,
  si.total_deductions,
  si.retention_release_amount,
  pp.previous_paid;


----------------------------------------------------------------
-- FILE: SUPABASE_V120_ENTERPRISE_FINANCE_CERTIFICATE_LINK.sql
----------------------------------------------------------------
-- V120 Enterprise Finance ↔ Certificate Link
-- Safe migration: can be run more than once.

create extension if not exists pgcrypto;

create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  subcontractor_id uuid null,
  invoice_id uuid null,
  invoice_no text null,
  record_type text not null default 'Payment',
  amount numeric(18,3) not null default 0,
  payment_date date not null default current_date,
  payment_method text null default 'Transfer',
  reference text null,
  bank_name text null,
  cost_center_id uuid null,
  description text null,
  notes text null,
  status text not null default 'Confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_records add column if not exists project_id uuid;
alter table public.finance_records add column if not exists subcontractor_id uuid;
alter table public.finance_records add column if not exists invoice_id uuid;
alter table public.finance_records add column if not exists invoice_no text;
alter table public.finance_records add column if not exists record_type text default 'Payment';
alter table public.finance_records add column if not exists amount numeric(18,3) default 0;
alter table public.finance_records add column if not exists payment_date date default current_date;
alter table public.finance_records add column if not exists payment_method text default 'Transfer';
alter table public.finance_records add column if not exists reference text;
alter table public.finance_records add column if not exists bank_name text;
alter table public.finance_records add column if not exists cost_center_id uuid;
alter table public.finance_records add column if not exists description text;
alter table public.finance_records add column if not exists notes text;
alter table public.finance_records add column if not exists status text default 'Confirmed';
alter table public.finance_records add column if not exists created_at timestamptz default now();
alter table public.finance_records add column if not exists updated_at timestamptz default now();

create index if not exists idx_finance_records_project on public.finance_records(project_id);
create index if not exists idx_finance_records_subcontractor on public.finance_records(subcontractor_id);
create index if not exists idx_finance_records_invoice_id on public.finance_records(invoice_id);
create index if not exists idx_finance_records_invoice_no on public.finance_records(invoice_no);
create index if not exists idx_finance_records_payment_date on public.finance_records(payment_date);
create index if not exists idx_finance_records_status_type on public.finance_records(status, record_type);

alter table public.subcontractor_invoices add column if not exists previous_paid_amount numeric(18,3) default 0;
alter table public.subcontractor_invoices add column if not exists net_payable numeric(18,3) default 0;
alter table public.subcontractor_invoices add column if not exists retention_release_amount numeric(18,3) default 0;
alter table public.subcontractor_invoices add column if not exists retention_release_remarks text;

drop view if exists public.v_certificate_finance_summary cascade;
create view public.v_certificate_finance_summary as
select
  i.id as invoice_id,
  i.project_id,
  i.subcontractor_id,
  i.invoice_no,
  coalesce(sum(fr.amount) filter (
    where lower(coalesce(fr.record_type, '')) = 'payment'
      and lower(coalesce(fr.status, 'confirmed')) not in ('cancelled', 'canceled', 'rejected', 'void')
  ), 0) as paid_amount
from public.subcontractor_invoices i
left join public.finance_records fr
  on fr.project_id = i.project_id
 and (
      fr.invoice_id = i.id
      or (fr.invoice_no is not null and lower(trim(fr.invoice_no)) = lower(trim(i.invoice_no)))
 )
group by i.id, i.project_id, i.subcontractor_id, i.invoice_no;



----------------------------------------------------------------
-- FILE: SUPABASE_V122_FINANCE_PENALTIES_DEDUCTIONS_LINK.sql
----------------------------------------------------------------
-- V122 Finance Penalties / Deductions link to Payment Certificates
-- Safe migration: adds only optional columns used for enterprise certificate linking.

ALTER TABLE IF EXISTS public.finance_records
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_no text NULL,
  ADD COLUMN IF NOT EXISTS final_payable numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_finance_records_invoice_id
  ON public.finance_records(invoice_id);

CREATE INDEX IF NOT EXISTS idx_finance_records_subcontractor_type_status_date
  ON public.finance_records(subcontractor_id, record_type, status, payment_date);

COMMENT ON COLUMN public.finance_records.invoice_id IS
  'Optional link to a subcontractor payment certificate/invoice. Used to avoid double counting payments, penalties and deductions.';


----------------------------------------------------------------
-- FILE: SUPABASE_V124_SUBCONTRACTOR_WORK_TYPE.sql
----------------------------------------------------------------
-- V124: Add subcontractor work type / trade scope
alter table public.subcontractors
  add column if not exists trade_scope text;

comment on column public.subcontractors.trade_scope is 'Subcontractor work type, e.g. Excavation, Concrete, Finishing, MEP';


----------------------------------------------------------------
-- FILE: SUPABASE_V125_BOQ_SYSTEM_ALIGNMENT.sql
----------------------------------------------------------------
-- V125: BOQ system alignment
-- Adds work_type so BOQ items can follow the same trade/work-scope logic used by subcontractors.

alter table public.boq_items
  add column if not exists work_type text;

create index if not exists idx_boq_items_project_work_type
  on public.boq_items(project_id, work_type);

-- Optional backfill from discipline for old BOQ rows.
update public.boq_items
set work_type = case
  when work_type is not null then work_type
  when discipline = 'Structural' then 'Concrete / خرسانات'
  when discipline = 'Civil' then 'Excavation / حفر'
  when discipline = 'MEP' then 'MEP / كهرباء وميكانيكا'
  when discipline = 'Infrastructure' then 'Infrastructure / مرافق'
  when discipline = 'Landscaping' then 'Landscape / لاندسكيب'
  when discipline = 'Architectural' then 'Finishing / تشطيبات'
  else 'Other / أخرى'
end
where work_type is null;


----------------------------------------------------------------
-- FILE: SUPABASE_V126_FINANCE_ACCOUNTING_REGISTER.sql
----------------------------------------------------------------
-- V126 Finance Accounting Register + subcontractor-linked deductions
-- Safe migration. Adds optional accounting-sheet fields to finance_records.

ALTER TABLE IF EXISTS public.finance_records
  ADD COLUMN IF NOT EXISTS receipt_voucher_no text NULL,
  ADD COLUMN IF NOT EXISTS payment_voucher_no text NULL,
  ADD COLUMN IF NOT EXISTS cheque_no text NULL,
  ADD COLUMN IF NOT EXISTS payee_name text NULL,
  ADD COLUMN IF NOT EXISTS accounting_direction text NULL,
  ADD COLUMN IF NOT EXISTS analysis text NULL,
  ADD COLUMN IF NOT EXISTS disbursement_entity text NULL;

CREATE INDEX IF NOT EXISTS idx_finance_records_deduction_subcontractor
  ON public.finance_records(project_id, subcontractor_id, record_type, status, payment_date)
  WHERE record_type IN ('Deduction', 'Penalty');

CREATE INDEX IF NOT EXISTS idx_finance_records_accounting_direction
  ON public.finance_records(project_id, accounting_direction);

COMMENT ON COLUMN public.finance_records.subcontractor_id IS
  'For Deduction/Penalty records, linking the subcontractor makes the amount automatically deduct from that subcontractor payment certificate calculations.';
COMMENT ON COLUMN public.finance_records.receipt_voucher_no IS 'Accounting receipt voucher number, matching site cash sheet column: اذن استلام.';
COMMENT ON COLUMN public.finance_records.payment_voucher_no IS 'Accounting payment voucher number, matching site cash sheet column: اذن صرف.';
COMMENT ON COLUMN public.finance_records.accounting_direction IS 'Accounting direction / التوجيه المحاسبي from site accounting sheet.';
COMMENT ON COLUMN public.finance_records.disbursement_entity IS 'Disbursement entity / جهة الصرف from site accounting sheet.';


----------------------------------------------------------------
-- FILE: SUPABASE_V128_PROCUREMENT_TENDER_COST_SHEET_LINK.sql
----------------------------------------------------------------
-- V128 Procurement Tender / Cost Sheet Link
-- Fixes V127 error: b.client_budget does not exist.
-- Budget in Procurement = Tender Breakdown / Cost Sheet budget, not BOQ client_budget.

alter table public.procurement_records
  add column if not exists resource_id uuid null,
  add column if not exists resource_code text null,
  add column if not exists budget_unit_rate numeric default 0,
  add column if not exists budget_amount numeric default 0;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='cost_library') then
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_schema='public'
        and table_name='procurement_records'
        and constraint_name='procurement_records_resource_id_fkey'
    ) then
      alter table public.procurement_records
        add constraint procurement_records_resource_id_fkey
        foreign key (resource_id) references public.cost_library(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_procurement_records_resource_id on public.procurement_records(resource_id);
create index if not exists idx_procurement_records_boq_item_id on public.procurement_records(boq_item_id);
create index if not exists idx_procurement_records_structure_id on public.procurement_records(structure_id);

drop view if exists public.v_procurement_register cascade;
create view public.v_procurement_register as
with tender_budget as (
  select
    ti.project_id,
    ti.boq_item_id,
    trim(split_part(coalesce(ti.description,''), '—', 1)) as resource_code,
    max(ti.unit_rate) filter (where ti.category = 'Material') as budget_unit_rate_from_tender,
    sum(coalesce(ti.qty,0) * coalesce(ti.unit_rate,0)) filter (where ti.category = 'Material') as budget_amount_from_tender
  from public.tender_items ti
  group by ti.project_id, ti.boq_item_id, trim(split_part(coalesce(ti.description,''), '—', 1))
)
select
  pr.*,
  cl.code as library_code,
  cl.description as library_description,
  b.item_code as boq_item_code,
  b.description as boq_description,
  b.boq_qty,
  b.unit as boq_unit,
  tb.budget_unit_rate_from_tender,
  tb.budget_amount_from_tender,
  ps.code as structure_code,
  ps.name as structure_name,
  coalesce(pr.budget_unit_rate, tb.budget_unit_rate_from_tender, cl.default_rate, 0) as calculated_budget_unit_rate,
  coalesce(pr.budget_amount, pr.required_qty * coalesce(pr.budget_unit_rate, tb.budget_unit_rate_from_tender, cl.default_rate, 0), tb.budget_amount_from_tender, 0) as calculated_budget_amount
from public.procurement_records pr
left join public.cost_library cl on cl.id = pr.resource_id
left join public.boq_items b on b.id = pr.boq_item_id
left join tender_budget tb
  on tb.project_id = pr.project_id
 and tb.boq_item_id = pr.boq_item_id
 and tb.resource_code = coalesce(pr.resource_code, cl.code)
left join public.project_structure_nodes ps on ps.id = pr.structure_id;


----------------------------------------------------------------
-- FILE: SUPABASE_V129_PROCUREMENT_MODEL_BOQ_MULTI_STRUCTURE.sql
----------------------------------------------------------------
-- V129 Procurement Model BOQ Multi-Structure Link
-- BOQ base is per model, while procurement can be for one villa or a group of villas/structures.
-- Required Qty = model_boq_qty × structure_count.

alter table public.procurement_records
  add column if not exists structure_ids uuid[] null,
  add column if not exists structure_count integer default 0,
  add column if not exists model_boq_qty numeric default 0;

create index if not exists idx_procurement_records_structure_ids_gin
  on public.procurement_records using gin (structure_ids);

create or replace function public.procurement_set_structure_summary()
returns trigger as $$
begin
  if new.structure_ids is not null and array_length(new.structure_ids, 1) > 0 then
    new.structure_count := array_length(new.structure_ids, 1);
    new.structure_id := new.structure_ids[1];
  elsif new.structure_id is not null then
    new.structure_ids := array[new.structure_id];
    new.structure_count := 1;
  else
    new.structure_count := coalesce(new.structure_count, 0);
  end if;

  if coalesce(new.model_boq_qty, 0) = 0 and coalesce(new.structure_count, 0) > 0 then
    new.model_boq_qty := coalesce(new.required_qty, 0) / nullif(new.structure_count, 0);
  end if;

  if coalesce(new.budget_amount, 0) = 0 then
    new.budget_amount := coalesce(new.required_qty, 0) * coalesce(new.budget_unit_rate, 0);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_procurement_set_structure_summary on public.procurement_records;
create trigger trg_procurement_set_structure_summary
before insert or update on public.procurement_records
for each row execute function public.procurement_set_structure_summary();

drop view if exists public.v_procurement_register cascade;
create view public.v_procurement_register as
with tender_budget as (
  select
    ti.project_id,
    ti.boq_item_id,
    trim(split_part(coalesce(ti.description,''), '—', 1)) as resource_code,
    max(ti.unit_rate) filter (where ti.category = 'Material') as budget_unit_rate_from_tender,
    max(ti.qty) filter (where ti.category = 'Material') as model_qty_from_tender,
    sum(coalesce(ti.qty,0) * coalesce(ti.unit_rate,0)) filter (where ti.category = 'Material') as model_budget_amount_from_tender
  from public.tender_items ti
  group by ti.project_id, ti.boq_item_id, trim(split_part(coalesce(ti.description,''), '—', 1))
)
select
  pr.*,
  cl.code as library_code,
  cl.description as library_description,
  b.item_code as boq_item_code,
  b.description as boq_description,
  b.boq_qty,
  b.unit as boq_unit,
  tb.budget_unit_rate_from_tender,
  tb.model_qty_from_tender,
  tb.model_budget_amount_from_tender,
  ps.code as first_structure_code,
  ps.name as first_structure_name,
  coalesce(pr.model_boq_qty, tb.model_qty_from_tender, b.boq_qty, 0) as calculated_model_qty,
  coalesce(pr.structure_count, array_length(pr.structure_ids,1), case when pr.structure_id is null then 0 else 1 end, 0) as calculated_structure_count,
  coalesce(pr.required_qty, coalesce(pr.model_boq_qty, tb.model_qty_from_tender, b.boq_qty, 0) * greatest(coalesce(pr.structure_count, array_length(pr.structure_ids,1), case when pr.structure_id is null then 0 else 1 end, 1),1), 0) as calculated_required_qty,
  coalesce(pr.budget_unit_rate, tb.budget_unit_rate_from_tender, cl.default_rate, 0) as calculated_budget_unit_rate,
  coalesce(pr.budget_amount, coalesce(pr.required_qty,0) * coalesce(pr.budget_unit_rate, tb.budget_unit_rate_from_tender, cl.default_rate, 0), 0) as calculated_budget_amount
from public.procurement_records pr
left join public.cost_library cl on cl.id = pr.resource_id
left join public.boq_items b on b.id = pr.boq_item_id
left join tender_budget tb
  on tb.project_id = pr.project_id
 and tb.boq_item_id = pr.boq_item_id
 and tb.resource_code = coalesce(pr.resource_code, cl.code)
left join public.project_structure_nodes ps on ps.id = pr.structure_id;


----------------------------------------------------------------
-- FILE: SUPABASE_V130_1_STRUCTURE_IDS_FIX.sql
----------------------------------------------------------------
-- V130.1 Fix: adds missing procurement_records.structure_ids before creating Inventory Cost Control view.
-- Run this if V130 stopped with: column pr.structure_ids does not exist.

-- V130.2 Safety Fix: if old procurement rows contain a created_by value that does not exist
-- in Supabase auth.users, any UPDATE on procurement_records can fail with
-- procurement_records_created_by_fkey. Clear only invalid audit values before V130 backfills.
do $$
begin
  if to_regclass('auth.users') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'procurement_records'
         and column_name = 'created_by'
     ) then
    update public.procurement_records pr
       set created_by = null
     where pr.created_by is not null
       and not exists (select 1 from auth.users au where au.id = pr.created_by);
  end if;
end $$;

-- Compatibility fix: V129 made procurement BOQ model-based and allowed choosing one villa or multiple villas.
-- Some databases only have structure_id, so V130 must create structure_ids before using it.
alter table public.procurement_records
  add column if not exists structure_ids uuid[] null,
  add column if not exists structure_count integer default 0,
  add column if not exists model_boq_qty numeric default 0;

create index if not exists idx_procurement_records_structure_ids_gin
  on public.procurement_records using gin (structure_ids);

create or replace function public.procurement_set_structure_summary()
returns trigger as $$
begin
  if new.structure_ids is not null and array_length(new.structure_ids, 1) > 0 then
    new.structure_count := array_length(new.structure_ids, 1);
    new.structure_id := new.structure_ids[1];
  elsif new.structure_id is not null then
    new.structure_ids := array[new.structure_id];
    new.structure_count := 1;
  else
    new.structure_count := coalesce(new.structure_count, 0);
  end if;

  if coalesce(new.model_boq_qty, 0) = 0 and coalesce(new.structure_count, 0) > 0 then
    new.model_boq_qty := coalesce(new.required_qty, 0) / nullif(new.structure_count, 0);
  end if;

  if coalesce(new.budget_amount, 0) = 0 then
    new.budget_amount := coalesce(new.required_qty, 0) * coalesce(new.budget_unit_rate, 0);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_procurement_set_structure_summary on public.procurement_records;
create trigger trg_procurement_set_structure_summary
before insert or update on public.procurement_records
for each row execute function public.procurement_set_structure_summary();

-- Backfill existing old records so multi-structure logic works even if they were created before V129/V130.
update public.procurement_records
set
  structure_ids = case
    when structure_ids is null and structure_id is not null then array[structure_id]
    else structure_ids
  end,
  structure_count = case
    when coalesce(structure_count,0) = 0 and structure_ids is not null then array_length(structure_ids, 1)
    when coalesce(structure_count,0) = 0 and structure_id is not null then 1
    else structure_count
  end
where structure_ids is null or coalesce(structure_count,0) = 0;

drop view if exists public.v_inventory_cost_control cascade;
create view public.v_inventory_cost_control as
with grn as (
  select
    procurement_id,
    sum(coalesce(received_qty,0)) as received_qty,
    sum(coalesce(amount,0)) as received_amount,
    max(received_date) as last_received_date
  from public.inventory_grn_lines
  where procurement_id is not null and coalesce(status,'Posted') <> 'Cancelled'
  group by procurement_id
), issue_match as (
  select
    pr.id as procurement_id,
    sum(coalesce(i.issued_qty,0)) as issued_qty
  from public.procurement_records pr
  left join public.inventory_issue_lines i
    on i.project_id = pr.project_id
   and coalesce(i.resource_code,'') = coalesce(pr.resource_code,'')
   and i.boq_item_id is not distinct from pr.boq_item_id
   and (i.structure_id is not distinct from pr.structure_id or i.structure_id = any(coalesce(pr.structure_ids, array[]::uuid[])))
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
  greatest(coalesce(pr.required_qty,0) - coalesce(grn.received_qty,0), 0) as remaining_to_receive,
  coalesce(grn.received_amount,0) - coalesce(pr.budget_amount, coalesce(pr.required_qty,0) * coalesce(pr.budget_unit_rate,0), 0) as budget_variance_amount,
  grn.last_received_date,
  pr.status
from public.procurement_records pr
left join grn on grn.procurement_id = pr.id
left join issue_match on issue_match.procurement_id = pr.id
left join public.boq_items b on b.id = pr.boq_item_id
left join public.project_structure_nodes ps on ps.id = pr.structure_id;



----------------------------------------------------------------
-- FILE: SUPABASE_V130_2_CREATED_BY_FK_FIX.sql
----------------------------------------------------------------
-- V130.2 Safety Fix: if old procurement rows contain a created_by value that does not exist
-- in Supabase auth.users, any UPDATE on procurement_records can fail with
-- procurement_records_created_by_fkey. Clear only invalid audit values before V130 backfills.
do $$
begin
  if to_regclass('auth.users') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'procurement_records'
         and column_name = 'created_by'
     ) then
    update public.procurement_records pr
       set created_by = null
     where pr.created_by is not null
       and not exists (select 1 from auth.users au where au.id = pr.created_by);
  end if;
end $$;


----------------------------------------------------------------
-- FILE: SUPABASE_V130_3_PROCUREMENT_CREATED_BY_HARD_FIX.sql
----------------------------------------------------------------
-- V130.3 HARD FIX: procurement_records.created_by must not block Procurement / Inventory updates.
-- Cause: some databases have procurement_records_created_by_fkey pointing to a users table
-- that does not contain the current app user id. Any INSERT/UPDATE on procurement_records then fails.
-- Decision: created_by is audit metadata, so we remove its blocking FK and keep the column nullable.

do $$
declare
  r record;
begin
  if to_regclass('public.procurement_records') is not null then
    -- Drop any foreign key constraint attached to procurement_records.created_by, whatever it references.
    for r in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'procurement_records'
        and con.contype = 'f'
        and exists (
          select 1
          from unnest(con.conkey) as ck(attnum)
          join pg_attribute att on att.attrelid = rel.oid and att.attnum = ck.attnum
          where att.attname = 'created_by'
        )
    loop
      execute format('alter table public.procurement_records drop constraint if exists %I', r.conname);
    end loop;

    -- Make the audit column safe for old/imported/demo data.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'procurement_records'
        and column_name = 'created_by'
    ) then
      alter table public.procurement_records alter column created_by drop not null;
      alter table public.procurement_records alter column created_by drop default;
      -- Keep old data if valid; clear it only to avoid future conflicts in environments with mixed users.
      update public.procurement_records set created_by = null where created_by is not null;
    end if;
  end if;
end $$;


----------------------------------------------------------------
-- FILE: SUPABASE_V130_4_PROCUREMENT_STATUS_ENUM_FIX.sql
----------------------------------------------------------------
-- V130.4 Fix: procurement_status enum empty-string error
-- Problem fixed:
--   invalid input value for enum procurement_status: ""
-- Cause:
--   Previous trigger function used coalesce(status,'') while status is an enum.
--   PostgreSQL tries to cast '' to procurement_status and fails.

-- 1) Make sure the procurement enum contains the statuses used by Procurement / GRN sync.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'procurement_status'
  ) THEN
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'PR Raised';
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'RFQ Issued';
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'PO Issued';
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'Partially Delivered';
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'Delivered';
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'Cancelled';
    ALTER TYPE public.procurement_status ADD VALUE IF NOT EXISTS 'Delayed';
  END IF;
END $$;

-- 2) Safe default for new procurement records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'procurement_records'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.procurement_records
      ALTER COLUMN status SET DEFAULT 'PR Raised'::public.procurement_status;

    UPDATE public.procurement_records
      SET status = 'PR Raised'::public.procurement_status
    WHERE status IS NULL;
  END IF;
END $$;

-- 3) Replace the GRN -> Procurement status refresh function with enum-safe logic.
CREATE OR REPLACE FUNCTION public.inventory_refresh_procurement(p_procurement_id uuid)
RETURNS void AS $$
DECLARE
  v_received numeric := 0;
  v_required numeric := 0;
  v_latest date;
BEGIN
  IF p_procurement_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(received_qty),0), max(received_date)
    INTO v_received, v_latest
  FROM public.inventory_grn_lines
  WHERE procurement_id = p_procurement_id
    AND coalesce(status,'Posted') <> 'Cancelled';

  SELECT coalesce(required_qty,0)
    INTO v_required
  FROM public.procurement_records
  WHERE id = p_procurement_id;

  UPDATE public.procurement_records
  SET
    actual_delivery = CASE WHEN v_received > 0 THEN v_latest ELSE actual_delivery END,
    status = CASE
      WHEN status::text = 'Cancelled' THEN status
      WHEN v_required > 0 AND v_received >= v_required THEN 'Delivered'::public.procurement_status
      WHEN v_received > 0 THEN 'Partially Delivered'::public.procurement_status
      ELSE coalesce(status, 'PR Raised'::public.procurement_status)
    END
  WHERE id = p_procurement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Recreate trigger safely.
DROP TRIGGER IF EXISTS trg_inventory_sync_procurement_status ON public.inventory_grn_lines;
CREATE TRIGGER trg_inventory_sync_procurement_status
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_grn_lines
FOR EACH ROW EXECUTE FUNCTION public.inventory_sync_procurement_status();


----------------------------------------------------------------
-- FILE: SUPABASE_V130_INVENTORY_GRN_STOCK_COST_CONTROL.sql
----------------------------------------------------------------
-- V130.3 HARD FIX: procurement_records.created_by is audit metadata and must not block updates.
-- Drop any FK on procurement_records.created_by before V130 backfills / triggers update the table.
do $$
declare
  r record;
begin
  if to_regclass('public.procurement_records') is not null then
    for r in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'procurement_records'
        and con.contype = 'f'
        and exists (
          select 1
          from unnest(con.conkey) as ck(attnum)
          join pg_attribute att on att.attrelid = rel.oid and att.attnum = ck.attnum
          where att.attname = 'created_by'
        )
    loop
      execute format('alter table public.procurement_records drop constraint if exists %I', r.conname);
    end loop;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'procurement_records'
        and column_name = 'created_by'
    ) then
      alter table public.procurement_records alter column created_by drop not null;
      alter table public.procurement_records alter column created_by drop default;
      update public.procurement_records set created_by = null where created_by is not null;
    end if;
  end if;
end $$;

-- V130 Inventory / Stores + Procurement + BOQ Cost Control
-- Adds GRN, Issue, Stock balance, and live cost-control views.


-- V130.2 Safety Fix: if old procurement rows contain a created_by value that does not exist
-- in Supabase auth.users, any UPDATE on procurement_records can fail with
-- procurement_records_created_by_fkey. Clear only invalid audit values before V130 backfills.
do $$
begin
  if to_regclass('auth.users') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'procurement_records'
         and column_name = 'created_by'
     ) then
    update public.procurement_records pr
       set created_by = null
     where pr.created_by is not null
       and not exists (select 1 from auth.users au where au.id = pr.created_by);
  end if;
end $$;

-- Compatibility fix: V129 made procurement BOQ model-based and allowed choosing one villa or multiple villas.
-- Some databases only have structure_id, so V130 must create structure_ids before using it.
alter table public.procurement_records
  add column if not exists structure_ids uuid[] null,
  add column if not exists structure_count integer default 0,
  add column if not exists model_boq_qty numeric default 0;

create index if not exists idx_procurement_records_structure_ids_gin
  on public.procurement_records using gin (structure_ids);

create or replace function public.procurement_set_structure_summary()
returns trigger as $$
begin
  if new.structure_ids is not null and array_length(new.structure_ids, 1) > 0 then
    new.structure_count := array_length(new.structure_ids, 1);
    new.structure_id := new.structure_ids[1];
  elsif new.structure_id is not null then
    new.structure_ids := array[new.structure_id];
    new.structure_count := 1;
  else
    new.structure_count := coalesce(new.structure_count, 0);
  end if;

  if coalesce(new.model_boq_qty, 0) = 0 and coalesce(new.structure_count, 0) > 0 then
    new.model_boq_qty := coalesce(new.required_qty, 0) / nullif(new.structure_count, 0);
  end if;

  if coalesce(new.budget_amount, 0) = 0 then
    new.budget_amount := coalesce(new.required_qty, 0) * coalesce(new.budget_unit_rate, 0);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_procurement_set_structure_summary on public.procurement_records;
create trigger trg_procurement_set_structure_summary
before insert or update on public.procurement_records
for each row execute function public.procurement_set_structure_summary();

-- Backfill existing old records so multi-structure logic works even if they were created before V129/V130.
update public.procurement_records
set
  structure_ids = case
    when structure_ids is null and structure_id is not null then array[structure_id]
    else structure_ids
  end,
  structure_count = case
    when coalesce(structure_count,0) = 0 and structure_ids is not null then array_length(structure_ids, 1)
    when coalesce(structure_count,0) = 0 and structure_id is not null then 1
    else structure_count
  end
where structure_ids is null or coalesce(structure_count,0) = 0;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  location_type text default 'Main Store',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, code)
);

create table if not exists public.inventory_grn_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  grn_no text not null,
  procurement_id uuid null references public.procurement_records(id) on delete set null,
  resource_id uuid null,
  resource_code text null,
  material text not null,
  boq_item_id uuid null references public.boq_items(id) on delete set null,
  structure_id uuid null references public.project_structure_nodes(id) on delete set null,
  location_id uuid null references public.inventory_locations(id) on delete set null,
  received_qty numeric not null default 0,
  unit text,
  unit_rate numeric not null default 0,
  amount numeric not null default 0,
  supplier text,
  received_date date not null default current_date,
  delivery_note_no text,
  status text not null default 'Posted',
  notes text,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_issue_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_no text not null,
  resource_code text null,
  material text not null,
  boq_item_id uuid null references public.boq_items(id) on delete set null,
  structure_id uuid null references public.project_structure_nodes(id) on delete set null,
  location_id uuid null references public.inventory_locations(id) on delete set null,
  issued_qty numeric not null default 0,
  unit text,
  issue_date date not null default current_date,
  issue_to text,
  cost_center_id uuid null,
  notes text,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_locations_project on public.inventory_locations(project_id);
create index if not exists idx_inventory_grn_project on public.inventory_grn_lines(project_id);
create index if not exists idx_inventory_grn_procurement on public.inventory_grn_lines(procurement_id);
create index if not exists idx_inventory_grn_resource_boq_structure on public.inventory_grn_lines(project_id, resource_code, boq_item_id, structure_id, location_id);
create index if not exists idx_inventory_issue_project on public.inventory_issue_lines(project_id);
create index if not exists idx_inventory_issue_resource_boq_structure on public.inventory_issue_lines(project_id, resource_code, boq_item_id, structure_id, location_id);

create or replace function public.inventory_set_grn_amount()
returns trigger as $$
begin
  new.amount := coalesce(new.received_qty, 0) * coalesce(new.unit_rate, 0);
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_set_grn_amount on public.inventory_grn_lines;
create trigger trg_inventory_set_grn_amount
before insert or update on public.inventory_grn_lines
for each row execute function public.inventory_set_grn_amount();

create or replace function public.inventory_set_issue_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_set_issue_updated_at on public.inventory_issue_lines;
create trigger trg_inventory_set_issue_updated_at
before insert or update on public.inventory_issue_lines
for each row execute function public.inventory_set_issue_updated_at();

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
  where coalesce(g.status,'Posted') <> 'Cancelled'
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

drop view if exists public.v_inventory_cost_control cascade;
create view public.v_inventory_cost_control as
with grn as (
  select
    procurement_id,
    sum(coalesce(received_qty,0)) as received_qty,
    sum(coalesce(amount,0)) as received_amount,
    max(received_date) as last_received_date
  from public.inventory_grn_lines
  where procurement_id is not null and coalesce(status,'Posted') <> 'Cancelled'
  group by procurement_id
), issue_match as (
  select
    pr.id as procurement_id,
    sum(coalesce(i.issued_qty,0)) as issued_qty
  from public.procurement_records pr
  left join public.inventory_issue_lines i
    on i.project_id = pr.project_id
   and coalesce(i.resource_code,'') = coalesce(pr.resource_code,'')
   and i.boq_item_id is not distinct from pr.boq_item_id
   and (i.structure_id is not distinct from pr.structure_id or i.structure_id = any(coalesce(pr.structure_ids, array[]::uuid[])))
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
  greatest(coalesce(pr.required_qty,0) - coalesce(grn.received_qty,0), 0) as remaining_to_receive,
  coalesce(grn.received_amount,0) - coalesce(pr.budget_amount, coalesce(pr.required_qty,0) * coalesce(pr.budget_unit_rate,0), 0) as budget_variance_amount,
  grn.last_received_date,
  pr.status
from public.procurement_records pr
left join grn on grn.procurement_id = pr.id
left join issue_match on issue_match.procurement_id = pr.id
left join public.boq_items b on b.id = pr.boq_item_id
left join public.project_structure_nodes ps on ps.id = pr.structure_id;

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
    and coalesce(status,'Posted') <> 'Cancelled';

  select coalesce(required_qty,0)
    into v_required
  from public.procurement_records
  where id = p_procurement_id;

  update public.procurement_records
  set
    actual_delivery = case when v_received > 0 then v_latest else actual_delivery end,
    status = case
      when status::text = 'Cancelled' then status
      when v_required > 0 and v_received >= v_required then 'Delivered'::public.procurement_status
      when v_received > 0 then 'Partially Delivered'::public.procurement_status
      else coalesce(status, 'PR Raised'::public.procurement_status)
    end
  where id = p_procurement_id;
end;
$$ language plpgsql security definer;

create or replace function public.inventory_sync_procurement_status()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    perform public.inventory_refresh_procurement(old.procurement_id);
    return old;
  end if;

  if TG_OP = 'UPDATE' and old.procurement_id is distinct from new.procurement_id then
    perform public.inventory_refresh_procurement(old.procurement_id);
  end if;

  perform public.inventory_refresh_procurement(new.procurement_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_sync_procurement_status on public.inventory_grn_lines;
create trigger trg_inventory_sync_procurement_status
after insert or update or delete on public.inventory_grn_lines
for each row execute function public.inventory_sync_procurement_status();

-- Optional safety guard: prevents issuing more than current available stock for same material / BOQ / structure / store.
create or replace function public.inventory_guard_issue_stock()
returns trigger as $$
declare
  v_available numeric := 0;
begin
  select coalesce(stock_qty,0)
    into v_available
  from public.v_inventory_stock
  where project_id = new.project_id
    and coalesce(resource_code,'') = coalesce(new.resource_code,'')
    and coalesce(material,'') = coalesce(new.material,'')
    and boq_item_id is not distinct from new.boq_item_id
    and structure_id is not distinct from new.structure_id
    and location_id is not distinct from new.location_id
  limit 1;

  if TG_OP = 'UPDATE'
    and old.project_id = new.project_id
    and coalesce(old.resource_code,'') = coalesce(new.resource_code,'')
    and coalesce(old.material,'') = coalesce(new.material,'')
    and old.boq_item_id is not distinct from new.boq_item_id
    and old.structure_id is not distinct from new.structure_id
    and old.location_id is not distinct from new.location_id then
    v_available := v_available + coalesce(old.issued_qty,0);
  end if;

  if coalesce(new.issued_qty,0) > coalesce(v_available,0) + 0.0001 then
    raise exception 'Not enough stock. Available %, requested %', coalesce(v_available,0), coalesce(new.issued_qty,0);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_guard_issue_stock on public.inventory_issue_lines;
create trigger trg_inventory_guard_issue_stock
before insert or update on public.inventory_issue_lines
for each row execute function public.inventory_guard_issue_stock();


----------------------------------------------------------------
-- FILE: SUPABASE_V132_1_VIEW_COLUMN_ORDER_FIX.sql
----------------------------------------------------------------
-- V132.1 Fix: keep v_inventory_cost_control view column order compatible with existing Postgres view.
-- Run this after the V132 error: cannot change name of view column "required_qty" to "structure_ids".
-- This does NOT delete data. It recreates the view with the old column order and appends the new columns at the end.

drop view if exists public.v_inventory_cost_control cascade;
create view public.v_inventory_cost_control as
WITH grn AS (
  SELECT
    procurement_id,
    SUM(COALESCE(received_qty,0)) AS received_qty,
    SUM(COALESCE(amount,0)) AS received_amount,
    MAX(received_date) AS last_received_date
  FROM public.inventory_grn_lines
  WHERE procurement_id IS NOT NULL AND COALESCE(status,'Posted') <> 'Cancelled'
  GROUP BY procurement_id
), issue_match AS (
  SELECT
    pr.id AS procurement_id,
    SUM(COALESCE(i.issued_qty,0)) AS issued_qty,
    SUM(COALESCE(i.amount,0)) AS issued_amount
  FROM public.procurement_records pr
  LEFT JOIN public.inventory_issue_lines i
    ON i.project_id = pr.project_id
   AND COALESCE(i.resource_code,'') = COALESCE(pr.resource_code,'')
   AND i.boq_item_id IS NOT DISTINCT FROM pr.boq_item_id
   AND (
      i.structure_id IS NOT DISTINCT FROM pr.structure_id
      OR i.structure_id = ANY(COALESCE(pr.structure_ids, ARRAY[]::uuid[]))
   )
  GROUP BY pr.id
)
SELECT
  pr.project_id,
  pr.id AS procurement_id,
  pr.pr_no,
  pr.material,
  pr.resource_code,
  pr.boq_item_id,
  b.item_code AS boq_item_code,
  b.description AS boq_description,
  pr.structure_id,
  ps.code AS structure_code,
  ps.name AS structure_name,
  -- Keep old V130/V131 column order from here to avoid Postgres view rename error
  pr.required_qty,
  pr.unit,
  pr.budget_unit_rate,
  COALESCE(pr.budget_amount, COALESCE(pr.required_qty,0) * COALESCE(pr.budget_unit_rate,0)) AS budget_amount,
  COALESCE(grn.received_qty,0) AS received_qty,
  COALESCE(grn.received_amount,0) AS received_amount,
  COALESCE(issue_match.issued_qty,0) AS issued_qty,
  GREATEST(COALESCE(pr.required_qty,0) - COALESCE(grn.received_qty,0), 0) AS remaining_to_receive,
  COALESCE(grn.received_amount,0) - COALESCE(pr.budget_amount, COALESCE(pr.required_qty,0) * COALESCE(pr.budget_unit_rate,0), 0) AS budget_variance_amount,
  grn.last_received_date,
  pr.status,
  -- V132 new columns appended safely
  pr.structure_ids,
  pr.structure_count,
  COALESCE(issue_match.issued_amount,0) AS issued_amount
FROM public.procurement_records pr
LEFT JOIN grn ON grn.procurement_id = pr.id
LEFT JOIN issue_match ON issue_match.procurement_id = pr.id
LEFT JOIN public.boq_items b ON b.id = pr.boq_item_id
LEFT JOIN public.project_structure_nodes ps ON ps.id = pr.structure_id;

COMMENT ON COLUMN public.inventory_issue_lines.is_subcontractor_charge IS
  'When true, the app creates a confirmed Finance Deduction linked to subcontractor_id so it appears automatically in the subcontractor certificate.';
COMMENT ON COLUMN public.inventory_issue_lines.amount IS
  'Issue value used for subcontractor deduction and cost control. Defaults to issued_qty × unit_rate.';


----------------------------------------------------------------
-- FILE: SUPABASE_V132_2_ISSUE_AMOUNT_COLUMN_FIX.sql
----------------------------------------------------------------
-- V132.2 Fix: inventory issue amount column missing.
-- Run this after the error: column i.amount does not exist.
-- This does NOT delete data.
-- It safely adds the issue costing columns, backfills amount, then recreates v_inventory_cost_control.

-- 1) Make sure V132 issue-costing columns exist before the view references them.
ALTER TABLE IF EXISTS public.inventory_issue_lines
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid NULL REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_subcontractor_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finance_record_id uuid NULL;

-- 2) Backfill issue amount for old rows.
UPDATE public.inventory_issue_lines
SET amount = COALESCE(NULLIF(amount,0), COALESCE(issued_qty,0) * COALESCE(unit_rate,0))
WHERE amount IS NULL OR amount = 0;

-- 3) Keep amount updated automatically on future issue rows.
CREATE OR REPLACE FUNCTION public.inventory_set_issue_amount()
RETURNS trigger AS $$
BEGIN
  NEW.amount := COALESCE(NEW.amount, 0);
  IF NEW.amount = 0 THEN
    NEW.amount := COALESCE(NEW.issued_qty,0) * COALESCE(NEW.unit_rate,0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_set_issue_amount ON public.inventory_issue_lines;
CREATE TRIGGER trg_inventory_set_issue_amount
BEFORE INSERT OR UPDATE ON public.inventory_issue_lines
FOR EACH ROW EXECUTE FUNCTION public.inventory_set_issue_amount();

CREATE INDEX IF NOT EXISTS idx_inventory_issue_subcontractor_charge
  ON public.inventory_issue_lines(project_id, subcontractor_id, is_subcontractor_charge, issue_date);

-- 4) Recreate cost control view with old column order + V132 columns appended at the end.
drop view if exists public.v_inventory_cost_control cascade;
create view public.v_inventory_cost_control as
WITH grn AS (
  SELECT
    procurement_id,
    SUM(COALESCE(received_qty,0)) AS received_qty,
    SUM(COALESCE(amount,0)) AS received_amount,
    MAX(received_date) AS last_received_date
  FROM public.inventory_grn_lines
  WHERE procurement_id IS NOT NULL AND COALESCE(status,'Posted') <> 'Cancelled'
  GROUP BY procurement_id
), issue_match AS (
  SELECT
    pr.id AS procurement_id,
    SUM(COALESCE(i.issued_qty,0)) AS issued_qty,
    SUM(COALESCE(i.amount, COALESCE(i.issued_qty,0) * COALESCE(i.unit_rate,0), 0)) AS issued_amount
  FROM public.procurement_records pr
  LEFT JOIN public.inventory_issue_lines i
    ON i.project_id = pr.project_id
   AND COALESCE(i.resource_code,'') = COALESCE(pr.resource_code,'')
   AND i.boq_item_id IS NOT DISTINCT FROM pr.boq_item_id
   AND (
      i.structure_id IS NOT DISTINCT FROM pr.structure_id
      OR i.structure_id = ANY(COALESCE(pr.structure_ids, ARRAY[]::uuid[]))
   )
  GROUP BY pr.id
)
SELECT
  pr.project_id,
  pr.id AS procurement_id,
  pr.pr_no,
  pr.material,
  pr.resource_code,
  pr.boq_item_id,
  b.item_code AS boq_item_code,
  b.description AS boq_description,
  pr.structure_id,
  ps.code AS structure_code,
  ps.name AS structure_name,
  pr.required_qty,
  pr.unit,
  pr.budget_unit_rate,
  COALESCE(pr.budget_amount, COALESCE(pr.required_qty,0) * COALESCE(pr.budget_unit_rate,0)) AS budget_amount,
  COALESCE(grn.received_qty,0) AS received_qty,
  COALESCE(grn.received_amount,0) AS received_amount,
  COALESCE(issue_match.issued_qty,0) AS issued_qty,
  GREATEST(COALESCE(pr.required_qty,0) - COALESCE(grn.received_qty,0), 0) AS remaining_to_receive,
  COALESCE(grn.received_amount,0) - COALESCE(pr.budget_amount, COALESCE(pr.required_qty,0) * COALESCE(pr.budget_unit_rate,0), 0) AS budget_variance_amount,
  grn.last_received_date,
  pr.status,
  pr.structure_ids,
  pr.structure_count,
  COALESCE(issue_match.issued_amount,0) AS issued_amount
FROM public.procurement_records pr
LEFT JOIN grn ON grn.procurement_id = pr.id
LEFT JOIN issue_match ON issue_match.procurement_id = pr.id
LEFT JOIN public.boq_items b ON b.id = pr.boq_item_id
LEFT JOIN public.project_structure_nodes ps ON ps.id = pr.structure_id;

COMMENT ON COLUMN public.inventory_issue_lines.is_subcontractor_charge IS
  'When true, the app creates a confirmed Finance Deduction linked to subcontractor_id so it appears automatically in the subcontractor certificate.';
COMMENT ON COLUMN public.inventory_issue_lines.amount IS
  'Issue value used for subcontractor deduction and cost control. Defaults to issued_qty × unit_rate.';


----------------------------------------------------------------
-- FILE: SUPABASE_V132_INVENTORY_PROCUREMENT_VILLAS_AND_SUBCONTRACTOR_DEDUCTION.sql
----------------------------------------------------------------
-- V132 Inventory / Procurement / Subcontractor Deduction Link
-- Safe migration. Keeps procurement orders model-based while GRN/Issue works per selected villa.

-- 1) Make sure procurement can store multiple selected villas/structures.
ALTER TABLE IF EXISTS public.procurement_records
  ADD COLUMN IF NOT EXISTS structure_ids uuid[] NULL,
  ADD COLUMN IF NOT EXISTS structure_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_boq_qty numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_procurement_records_structure_ids_gin
  ON public.procurement_records USING gin (structure_ids);

CREATE OR REPLACE FUNCTION public.procurement_set_structure_summary()
RETURNS trigger AS $$
BEGIN
  IF NEW.structure_ids IS NOT NULL AND array_length(NEW.structure_ids, 1) > 0 THEN
    NEW.structure_count := array_length(NEW.structure_ids, 1);
    NEW.structure_id := NEW.structure_ids[1];
  ELSIF NEW.structure_id IS NOT NULL THEN
    NEW.structure_ids := ARRAY[NEW.structure_id];
    NEW.structure_count := 1;
  ELSE
    NEW.structure_count := COALESCE(NEW.structure_count, 0);
  END IF;

  IF COALESCE(NEW.model_boq_qty, 0) = 0 AND COALESCE(NEW.structure_count, 0) > 0 THEN
    NEW.model_boq_qty := COALESCE(NEW.required_qty, 0) / NULLIF(NEW.structure_count, 0);
  END IF;

  IF COALESCE(NEW.budget_amount, 0) = 0 THEN
    NEW.budget_amount := COALESCE(NEW.required_qty, 0) * COALESCE(NEW.budget_unit_rate, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procurement_set_structure_summary ON public.procurement_records;
CREATE TRIGGER trg_procurement_set_structure_summary
BEFORE INSERT OR UPDATE ON public.procurement_records
FOR EACH ROW EXECUTE FUNCTION public.procurement_set_structure_summary();

UPDATE public.procurement_records
SET
  structure_ids = CASE
    WHEN structure_ids IS NULL AND structure_id IS NOT NULL THEN ARRAY[structure_id]
    ELSE structure_ids
  END,
  structure_count = CASE
    WHEN COALESCE(structure_count,0) = 0 AND structure_ids IS NOT NULL THEN array_length(structure_ids, 1)
    WHEN COALESCE(structure_count,0) = 0 AND structure_id IS NOT NULL THEN 1
    ELSE structure_count
  END
WHERE structure_ids IS NULL OR COALESCE(structure_count,0) = 0;

-- 2) Inventory issue can optionally be charged to a subcontractor.
ALTER TABLE IF EXISTS public.inventory_issue_lines
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid NULL REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_subcontractor_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finance_record_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_issue_subcontractor_charge
  ON public.inventory_issue_lines(project_id, subcontractor_id, is_subcontractor_charge, issue_date);

CREATE OR REPLACE FUNCTION public.inventory_set_issue_amount()
RETURNS trigger AS $$
BEGIN
  NEW.amount := COALESCE(NEW.amount, 0);
  IF NEW.amount = 0 THEN
    NEW.amount := COALESCE(NEW.issued_qty,0) * COALESCE(NEW.unit_rate,0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_set_issue_amount ON public.inventory_issue_lines;
CREATE TRIGGER trg_inventory_set_issue_amount
BEFORE INSERT OR UPDATE ON public.inventory_issue_lines
FOR EACH ROW EXECUTE FUNCTION public.inventory_set_issue_amount();

-- 3) Stock view remains per material + BOQ + villa/structure + store.
-- When the app posts GRN from a PR with many villas, it creates one stock row per villa.
drop view if exists public.v_inventory_stock cascade;
create view public.v_inventory_stock as
WITH movements AS (
  SELECT
    g.project_id,
    g.resource_code,
    g.material,
    g.boq_item_id,
    g.structure_id,
    g.location_id,
    g.unit,
    SUM(COALESCE(g.received_qty,0)) AS received_qty,
    0::numeric AS issued_qty,
    SUM(COALESCE(g.amount, COALESCE(g.received_qty,0) * COALESCE(g.unit_rate,0))) AS received_amount
  FROM public.inventory_grn_lines g
  WHERE COALESCE(g.status,'Posted') <> 'Cancelled'
  GROUP BY g.project_id, g.resource_code, g.material, g.boq_item_id, g.structure_id, g.location_id, g.unit

  UNION ALL

  SELECT
    i.project_id,
    i.resource_code,
    i.material,
    i.boq_item_id,
    i.structure_id,
    i.location_id,
    i.unit,
    0::numeric AS received_qty,
    SUM(COALESCE(i.issued_qty,0)) AS issued_qty,
    0::numeric AS received_amount
  FROM public.inventory_issue_lines i
  GROUP BY i.project_id, i.resource_code, i.material, i.boq_item_id, i.structure_id, i.location_id, i.unit
), grouped AS (
  SELECT
    project_id,
    resource_code,
    material,
    boq_item_id,
    structure_id,
    location_id,
    unit,
    SUM(received_qty) AS received_qty,
    SUM(issued_qty) AS issued_qty,
    SUM(received_amount) AS received_amount,
    CASE WHEN SUM(received_qty) > 0 THEN SUM(received_amount) / NULLIF(SUM(received_qty),0) ELSE 0 END AS avg_unit_rate
  FROM movements
  GROUP BY project_id, resource_code, material, boq_item_id, structure_id, location_id, unit
)
SELECT
  g.*,
  b.item_code AS boq_item_code,
  b.description AS boq_description,
  ps.code AS structure_code,
  ps.name AS structure_name,
  il.code AS location_code,
  il.name AS location_name,
  (g.received_qty - g.issued_qty) AS stock_qty,
  (g.received_qty - g.issued_qty) * g.avg_unit_rate AS stock_value
FROM grouped g
LEFT JOIN public.boq_items b ON b.id = g.boq_item_id
LEFT JOIN public.project_structure_nodes ps ON ps.id = g.structure_id
LEFT JOIN public.inventory_locations il ON il.id = g.location_id;

-- 4) Cost-control view matches issues to any villa selected in the PR.
-- V132.1 Fix: keep v_inventory_cost_control view column order compatible with existing Postgres view.
-- Run this after the V132 error: cannot change name of view column "required_qty" to "structure_ids".
-- This does NOT delete data. It recreates the view with the old column order and appends the new columns at the end.

drop view if exists public.v_inventory_cost_control cascade;
create view public.v_inventory_cost_control as
WITH grn AS (
  SELECT
    procurement_id,
    SUM(COALESCE(received_qty,0)) AS received_qty,
    SUM(COALESCE(amount,0)) AS received_amount,
    MAX(received_date) AS last_received_date
  FROM public.inventory_grn_lines
  WHERE procurement_id IS NOT NULL AND COALESCE(status,'Posted') <> 'Cancelled'
  GROUP BY procurement_id
), issue_match AS (
  SELECT
    pr.id AS procurement_id,
    SUM(COALESCE(i.issued_qty,0)) AS issued_qty,
    SUM(COALESCE(i.amount,0)) AS issued_amount
  FROM public.procurement_records pr
  LEFT JOIN public.inventory_issue_lines i
    ON i.project_id = pr.project_id
   AND COALESCE(i.resource_code,'') = COALESCE(pr.resource_code,'')
   AND i.boq_item_id IS NOT DISTINCT FROM pr.boq_item_id
   AND (
      i.structure_id IS NOT DISTINCT FROM pr.structure_id
      OR i.structure_id = ANY(COALESCE(pr.structure_ids, ARRAY[]::uuid[]))
   )
  GROUP BY pr.id
)
SELECT
  pr.project_id,
  pr.id AS procurement_id,
  pr.pr_no,
  pr.material,
  pr.resource_code,
  pr.boq_item_id,
  b.item_code AS boq_item_code,
  b.description AS boq_description,
  pr.structure_id,
  ps.code AS structure_code,
  ps.name AS structure_name,
  -- Keep old V130/V131 column order from here to avoid Postgres view rename error
  pr.required_qty,
  pr.unit,
  pr.budget_unit_rate,
  COALESCE(pr.budget_amount, COALESCE(pr.required_qty,0) * COALESCE(pr.budget_unit_rate,0)) AS budget_amount,
  COALESCE(grn.received_qty,0) AS received_qty,
  COALESCE(grn.received_amount,0) AS received_amount,
  COALESCE(issue_match.issued_qty,0) AS issued_qty,
  GREATEST(COALESCE(pr.required_qty,0) - COALESCE(grn.received_qty,0), 0) AS remaining_to_receive,
  COALESCE(grn.received_amount,0) - COALESCE(pr.budget_amount, COALESCE(pr.required_qty,0) * COALESCE(pr.budget_unit_rate,0), 0) AS budget_variance_amount,
  grn.last_received_date,
  pr.status,
  -- V132 new columns appended safely
  pr.structure_ids,
  pr.structure_count,
  COALESCE(issue_match.issued_amount,0) AS issued_amount
FROM public.procurement_records pr
LEFT JOIN grn ON grn.procurement_id = pr.id
LEFT JOIN issue_match ON issue_match.procurement_id = pr.id
LEFT JOIN public.boq_items b ON b.id = pr.boq_item_id
LEFT JOIN public.project_structure_nodes ps ON ps.id = pr.structure_id;

COMMENT ON COLUMN public.inventory_issue_lines.is_subcontractor_charge IS
  'When true, the app creates a confirmed Finance Deduction linked to subcontractor_id so it appears automatically in the subcontractor certificate.';
COMMENT ON COLUMN public.inventory_issue_lines.amount IS
  'Issue value used for subcontractor deduction and cost control. Defaults to issued_qty × unit_rate.';


----------------------------------------------------------------
-- FILE: SUPABASE_V133_PROCUREMENT_ACTUAL_RATE_VARIANCE.sql
----------------------------------------------------------------
-- V133: Procurement budget rate vs actual supplier rate.
-- Safe migration: adds actual rate/amount fields and keeps them calculated.

ALTER TABLE IF EXISTS public.procurement_records
  ADD COLUMN IF NOT EXISTS actual_unit_rate numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_amount numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_variance numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_variance numeric(18,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_procurement_records_actual_unit_rate
  ON public.procurement_records(actual_unit_rate);

CREATE OR REPLACE FUNCTION public.fn_procurement_actual_rate_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  qty numeric := COALESCE(NEW.required_qty, 0);
  budget_rate numeric := COALESCE(NEW.budget_unit_rate, 0);
  actual_rate numeric := COALESCE(NEW.actual_unit_rate, 0);
BEGIN
  -- Keep budget amount aligned with qty × budget rate when empty.
  IF NEW.budget_amount IS NULL OR NEW.budget_amount = 0 THEN
    NEW.budget_amount := ROUND(qty * budget_rate, 2);
  END IF;

  -- Actual rate is optional. If no supplier/actual rate is entered, keep actual fields zero.
  IF actual_rate > 0 THEN
    NEW.actual_amount := ROUND(qty * actual_rate, 2);
    NEW.rate_variance := actual_rate - budget_rate;
    NEW.amount_variance := ROUND(COALESCE(NEW.actual_amount, 0) - COALESCE(NEW.budget_amount, 0), 2);
  ELSE
    NEW.actual_unit_rate := COALESCE(NEW.actual_unit_rate, 0);
    NEW.actual_amount := 0;
    NEW.rate_variance := 0;
    NEW.amount_variance := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_actual_rate_totals ON public.procurement_records;
CREATE TRIGGER trg_procurement_actual_rate_totals
BEFORE INSERT OR UPDATE OF required_qty, budget_unit_rate, budget_amount, actual_unit_rate, actual_amount
ON public.procurement_records
FOR EACH ROW
EXECUTE FUNCTION public.fn_procurement_actual_rate_totals();

UPDATE public.procurement_records
SET
  actual_unit_rate = COALESCE(actual_unit_rate, 0),
  actual_amount = CASE WHEN COALESCE(actual_unit_rate, 0) > 0 THEN ROUND(COALESCE(required_qty, 0) * COALESCE(actual_unit_rate, 0), 2) ELSE 0 END,
  rate_variance = CASE WHEN COALESCE(actual_unit_rate, 0) > 0 THEN COALESCE(actual_unit_rate, 0) - COALESCE(budget_unit_rate, 0) ELSE 0 END,
  amount_variance = CASE WHEN COALESCE(actual_unit_rate, 0) > 0 THEN ROUND((COALESCE(required_qty, 0) * COALESCE(actual_unit_rate, 0)) - COALESCE(budget_amount, 0), 2) ELSE 0 END;

COMMENT ON COLUMN public.procurement_records.actual_unit_rate IS 'Actual supplier/PO unit rate for comparison against tender budget unit rate.';
COMMENT ON COLUMN public.procurement_records.rate_variance IS 'Actual unit rate minus budget unit rate. Positive = over budget.';
COMMENT ON COLUMN public.procurement_records.amount_variance IS 'Actual amount minus budget amount. Positive = over budget.';


----------------------------------------------------------------
-- FILE: SUPABASE_V84_COST_LIBRARY_SAFE.sql
----------------------------------------------------------------
create extension if not exists "pgcrypto";

create table if not exists public.cost_library (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  category text not null default 'Material',
  code text not null,
  description text not null,
  unit text,
  default_rate numeric default 0,
  waste_percent numeric default 0,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table public.cost_library add column if not exists project_id uuid null;
alter table public.cost_library add column if not exists category text not null default 'Material';
alter table public.cost_library add column if not exists code text;
alter table public.cost_library add column if not exists description text;
alter table public.cost_library add column if not exists unit text;
alter table public.cost_library add column if not exists default_rate numeric default 0;
alter table public.cost_library add column if not exists waste_percent numeric default 0;
alter table public.cost_library add column if not exists notes text;
alter table public.cost_library add column if not exists created_at timestamp default now();
alter table public.cost_library add column if not exists updated_at timestamp default now();

create index if not exists idx_cost_library_code on public.cost_library (code);
create index if not exists idx_cost_library_category on public.cost_library (category);


----------------------------------------------------------------
-- FILE: SUPABASE_V87_PRODUCTION_SAFE.sql
----------------------------------------------------------------
-- V87 Production Safe Migration
-- Run once in Supabase SQL Editor. Safe: no DROP, no DELETE.

create extension if not exists "pgcrypto";

create table if not exists public.cost_library (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  category text not null default 'Material',
  code text not null,
  description text not null,
  unit text,
  default_rate numeric default 0,
  waste_percent numeric default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.cost_library add column if not exists project_id uuid null references public.projects(id) on delete cascade;
alter table public.cost_library add column if not exists category text not null default 'Material';
alter table public.cost_library add column if not exists code text;
alter table public.cost_library add column if not exists description text;
alter table public.cost_library add column if not exists unit text;
alter table public.cost_library add column if not exists default_rate numeric default 0;
alter table public.cost_library add column if not exists waste_percent numeric default 0;
alter table public.cost_library add column if not exists notes text;
alter table public.cost_library add column if not exists created_at timestamp with time zone default now();
alter table public.cost_library add column if not exists updated_at timestamp with time zone default now();

create unique index if not exists cost_library_code_global_idx on public.cost_library (code);

create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invoice_no text not null,
  invoice_date date,
  client_name text,
  description text,
  amount numeric default 0,
  status text default 'Draft',
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists client_invoices_project_idx on public.client_invoices(project_id);
create unique index if not exists client_invoices_project_invoice_no_idx on public.client_invoices(project_id, invoice_no);

-- Optional relaxed policies for pilot use. Tighten later with roles.
alter table public.cost_library enable row level security;
alter table public.client_invoices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cost_library' and policyname='pilot_allow_all_cost_library') then
    create policy pilot_allow_all_cost_library on public.cost_library for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_invoices' and policyname='pilot_allow_all_client_invoices') then
    create policy pilot_allow_all_client_invoices on public.client_invoices for all using (true) with check (true);
  end if;
end $$;

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

----------------------------------------------------------------
-- FILE: SUPABASE_V138_APPROVAL_MATRIX.sql
----------------------------------------------------------------
-- V138 Approval Matrix + Assigned Reviewers / Approvers
-- Safe additive migration. Run after V137. Can be re-run.

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Core tables
-- =========================================================

create table if not exists public.approval_matrix_rules (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  module text not null,
  action text not null,
  project_id uuid null references public.projects(id) on delete cascade,
  min_amount numeric(18,3) null,
  max_amount numeric(18,3) null,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_matrix_steps (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.approval_matrix_rules(id) on delete cascade,
  step_order integer not null,
  step_type text not null check (step_type in ('review','approval')),
  assignee_type text not null check (assignee_type in ('role','user')),
  role_id uuid null,
  role_name text null,
  user_id uuid null,
  decision_mode text not null default 'any' check (decision_mode in ('any','all')),
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null,
  record_table text not null,
  record_id uuid not null,
  project_id uuid null references public.projects(id) on delete set null,
  amount numeric(18,3) null,
  rule_id uuid null references public.approval_matrix_rules(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','pending_review','pending_approval','approved','rejected','returned','cancelled','missing_configuration')),
  current_step_order integer null,
  submitted_by uuid null,
  submitted_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  returned_at timestamptz null,
  configuration_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_request_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  matrix_step_id uuid null references public.approval_matrix_steps(id) on delete set null,
  step_order integer not null,
  step_type text not null check (step_type in ('review','approval')),
  assigned_role_id uuid null,
  assigned_role_name text null,
  assigned_user_id uuid null,
  assigned_user_name text null,
  decision_mode text not null default 'any' check (decision_mode in ('any','all')),
  is_required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','reviewed','approved','rejected','returned','skipped','cancelled')),
  action_by uuid null,
  action_at timestamptz null,
  comments text null,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_audit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  record_table text not null,
  record_id uuid not null,
  action text not null,
  old_status text null,
  new_status text null,
  actor_user_id uuid null,
  actor_name text null,
  comments text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_approval_matrix_rules_match
  on public.approval_matrix_rules(module, action, project_id, is_active, priority, updated_at desc);
create index if not exists idx_approval_matrix_steps_rule
  on public.approval_matrix_steps(rule_id, step_order);
create unique index if not exists uq_approval_matrix_steps_identity
  on public.approval_matrix_steps(rule_id, step_order, step_type, coalesce(role_name,''), coalesce(user_id::text,''));
create index if not exists idx_approval_requests_record
  on public.approval_requests(record_table, record_id, created_at desc);
create index if not exists idx_approval_requests_project_status
  on public.approval_requests(project_id, status, created_at desc);
create index if not exists idx_approval_assignments_user_pending
  on public.approval_request_assignments(assigned_user_id, status, step_order);
create index if not exists idx_approval_assignments_request_step
  on public.approval_request_assignments(request_id, step_order, status);
create index if not exists idx_approval_audit_request
  on public.approval_audit_log(request_id, created_at desc);

-- =========================================================
-- 2) Add non-breaking approval columns to existing transaction tables
-- =========================================================

alter table if exists public.procurement_records
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

alter table if exists public.inventory_grn_lines
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

alter table if exists public.inventory_issue_lines
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

alter table if exists public.finance_records
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

alter table if exists public.subcontractor_invoices
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

alter table if exists public.client_invoices
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

alter table if exists public.variations
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_status text null,
  add column if not exists approval_locked boolean not null default false;

-- =========================================================
-- 3) Helpers
-- =========================================================

create or replace function public.approval_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_approval_matrix_rules_touch on public.approval_matrix_rules;
create trigger trg_approval_matrix_rules_touch
before update on public.approval_matrix_rules
for each row execute function public.approval_touch_updated_at();

drop trigger if exists trg_approval_requests_touch on public.approval_requests;
create trigger trg_approval_requests_touch
before update on public.approval_requests
for each row execute function public.approval_touch_updated_at();

create or replace function public.approval_role_variants(p_role text)
returns text[]
language sql
immutable
as $$
  select case lower(trim(coalesce(p_role,'')))
    when 'qs' then array['QS','QS Engineer']::text[]
    when 'quantity surveyor' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'storekeeper' then array['Storekeeper','Site Engineer']::text[]
    when 'stores' then array['Storekeeper','Site Engineer']::text[]
    when 'procurement' then array['Procurement','Procurement Officer','Procurement Engineer']::text[]
    when 'procurement engineer' then array['Procurement Engineer','Procurement Officer','Procurement']::text[]
    when 'procurement manager' then array['Procurement Manager','Procurement Officer','Admin']::text[]
    when 'finance manager' then array['Finance Manager','Finance','Admin']::text[]
    when 'director' then array['Director','Project Director','CEO','Admin','Project Manager']::text[]
    when 'project director' then array['Project Director','Director','CEO','Admin','Project Manager']::text[]
    when 'ceo' then array['CEO','Director','Admin']::text[]
    else array[p_role]::text[]
  end;
$$;

create or replace function public.approval_update_transaction_status(
  p_record_table text,
  p_record_id uuid,
  p_approval_status text,
  p_workflow_status text,
  p_request_id uuid default null,
  p_locked boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_record_table not in (
    'procurement_records',
    'inventory_grn_lines',
    'inventory_issue_lines',
    'finance_records',
    'subcontractor_invoices',
    'client_invoices',
    'variations'
  ) then
    return;
  end if;

  execute format(
    'update public.%I
        set approval_status = $1,
            workflow_status = case when exists (
              select 1 from information_schema.columns
              where table_schema = ''public'' and table_name = $5 and column_name = ''workflow_status''
            ) then $2 else workflow_status end,
            approval_request_id = coalesce($3, approval_request_id),
            approval_locked = $4,
            updated_at = now()
      where id = $6',
    p_record_table
  ) using p_approval_status, p_workflow_status, p_request_id, p_locked, p_record_table, p_record_id;
exception
  when undefined_column then
    begin
      execute format(
        'update public.%I
            set approval_status = $1,
                approval_request_id = coalesce($2, approval_request_id),
                approval_locked = $3,
                updated_at = now()
          where id = $4',
        p_record_table
      ) using p_approval_status, p_request_id, p_locked, p_record_id;
    exception when undefined_column then
      null;
    end;
  when undefined_table then
    null;
end;
$$;

create or replace function public.approval_find_rule(
  p_module text,
  p_action text,
  p_project_id uuid,
  p_amount numeric
)
returns public.approval_matrix_rules
language plpgsql
stable
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
begin
  select r.* into v_rule
  from public.approval_matrix_rules r
  where r.module = p_module
    and r.action = p_action
    and r.is_active = true
    and (r.project_id = p_project_id or r.project_id is null)
    and coalesce(p_amount, 0) >= coalesce(r.min_amount, -999999999999999999::numeric)
    and coalesce(p_amount, 0) <= coalesce(r.max_amount,  999999999999999999::numeric)
  order by
    case when r.project_id = p_project_id then 0 else 1 end,
    r.priority asc,
    r.updated_at desc
  limit 1;

  return v_rule;
end;
$$;

create or replace function public.approval_validate_matrix_rule(p_rule_id uuid)
returns text[]
language plpgsql
stable
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
  v_errors text[] := array[]::text[];
  v_approval_count int := 0;
  v_duplicate_orders int := 0;
  v_conflicts int := 0;
begin
  select * into v_rule from public.approval_matrix_rules where id = p_rule_id;
  if not found then
    return array['Rule not found.']::text[];
  end if;

  if nullif(trim(coalesce(v_rule.module,'')), '') is null then
    v_errors := array_append(v_errors, 'Module is required.');
  end if;
  if nullif(trim(coalesce(v_rule.action,'')), '') is null then
    v_errors := array_append(v_errors, 'Action is required.');
  end if;
  if v_rule.min_amount is not null and v_rule.max_amount is not null and v_rule.min_amount > v_rule.max_amount then
    v_errors := array_append(v_errors, 'Amount From cannot be greater than Amount To.');
  end if;

  select count(*) into v_approval_count
  from public.approval_matrix_steps
  where rule_id = p_rule_id and step_type = 'approval';
  if v_approval_count = 0 then
    v_errors := array_append(v_errors, 'At least one Approval step is required.');
  end if;

  if not exists (select 1 from public.approval_matrix_steps where rule_id = p_rule_id) then
    v_errors := array_append(v_errors, 'At least one approval step exists.');
  end if;

  select count(*) into v_duplicate_orders
  from (
    select step_order
    from public.approval_matrix_steps
    where rule_id = p_rule_id
    group by step_order
    having count(*) > 1 and bool_or(decision_mode = 'all') = false
  ) x;
  if v_duplicate_orders > 0 then
    v_errors := array_append(v_errors, 'Step order must be unique unless the same order is intentionally used for grouped approvers.');
  end if;

  if exists (
    select 1 from public.approval_matrix_steps
    where rule_id = p_rule_id
      and assignee_type = 'role'
      and nullif(trim(coalesce(role_name,'')), '') is null
  ) then
    v_errors := array_append(v_errors, 'Role must be selected for role-based steps.');
  end if;

  if exists (
    select 1 from public.approval_matrix_steps
    where rule_id = p_rule_id
      and assignee_type = 'user'
      and user_id is null
  ) then
    v_errors := array_append(v_errors, 'User must be selected for user-based steps.');
  end if;

  if exists (
    select 1
    from public.approval_matrix_steps s_review
    join public.approval_matrix_steps s_approval on s_approval.rule_id = s_review.rule_id
    where s_review.rule_id = p_rule_id
      and s_review.step_type = 'review'
      and s_approval.step_type = 'approval'
      and s_review.step_order > s_approval.step_order
  ) then
    v_errors := array_append(v_errors, 'Review steps must come before approval steps.');
  end if;

  select count(*) into v_conflicts
  from public.approval_matrix_rules r
  where r.id <> p_rule_id
    and r.is_active = true
    and v_rule.is_active = true
    and r.module = v_rule.module
    and r.action = v_rule.action
    and coalesce(r.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_rule.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(r.min_amount, -999999999999999999::numeric) <= coalesce(v_rule.max_amount, 999999999999999999::numeric)
    and coalesce(v_rule.min_amount, -999999999999999999::numeric) <= coalesce(r.max_amount, 999999999999999999::numeric);

  if v_conflicts > 0 then
    v_errors := array_append(v_errors, 'Duplicate active rule / conflicting amount range exists for the same module, action, and project.');
  end if;

  return v_errors;
end;
$$;

-- =========================================================
-- 4) Submission engine: find rule, freeze assignments, set transaction status
-- =========================================================

create or replace function public.approval_submit_transaction(
  p_module text,
  p_action text,
  p_record_table text,
  p_record_id uuid,
  p_project_id uuid default null,
  p_amount numeric default null,
  p_submitted_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
  v_request_id uuid;
  v_step public.approval_matrix_steps%rowtype;
  v_user record;
  v_user_count int;
  v_missing text := '';
  v_current_step integer;
  v_current_type text;
  v_initial_status text;
  v_rule_errors text[];
begin
  -- Resubmission freezes a new copy of current matrix; old open flow is cancelled/archived.
  update public.approval_requests
     set status = 'cancelled', updated_at = now()
   where record_table = p_record_table
     and record_id = p_record_id
     and status in ('draft','pending_review','pending_approval','returned','missing_configuration');

  select * into v_rule from public.approval_find_rule(p_module, p_action, p_project_id, p_amount);

  if v_rule.id is null then
    insert into public.approval_requests(module, action, record_table, record_id, project_id, amount, rule_id, status, submitted_by, submitted_at, configuration_message)
    values (p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount, null, 'missing_configuration', p_submitted_by, now(), 'No approval matrix rule found for this transaction.')
    returning id into v_request_id;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, comments)
    values (v_request_id, p_record_table, p_record_id, 'Submitted', 'draft', 'missing_configuration', p_submitted_by, 'No approval matrix rule found for this transaction.');

    perform public.approval_update_transaction_status(p_record_table, p_record_id, 'missing_configuration', 'Missing Configuration', v_request_id, false);
    return v_request_id;
  end if;

  insert into public.approval_requests(module, action, record_table, record_id, project_id, amount, rule_id, status, submitted_by, submitted_at)
  values (p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount, v_rule.id, 'draft', p_submitted_by, now())
  returning id into v_request_id;

  for v_step in
    select * from public.approval_matrix_steps where rule_id = v_rule.id order by step_order, created_at
  loop
    v_user_count := 0;

    if v_step.assignee_type = 'user' and v_step.user_id is not null then
      select u.id, u.full_name into v_user
      from public.users u
      where u.id = v_step.user_id and coalesce(u.is_active, true) = true;

      if v_user.id is not null then
        insert into public.approval_request_assignments(
          request_id, matrix_step_id, step_order, step_type,
          assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name,
          decision_mode, is_required
        ) values (
          v_request_id, v_step.id, v_step.step_order, v_step.step_type,
          v_step.role_id, v_step.role_name, v_user.id, v_user.full_name,
          v_step.decision_mode, v_step.is_required
        );
        v_user_count := 1;
      end if;
    else
      for v_user in
        select distinct u.id, u.full_name, coalesce(pu.role, u.role) as matched_role
        from public.users u
        left join public.project_users pu
          on pu.user_id = u.id
         and (p_project_id is null or pu.project_id = p_project_id)
        where coalesce(u.is_active, true) = true
          and (
            u.role = any(public.approval_role_variants(v_step.role_name))
            or pu.role = any(public.approval_role_variants(v_step.role_name))
          )
        order by u.full_name
      loop
        insert into public.approval_request_assignments(
          request_id, matrix_step_id, step_order, step_type,
          assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name,
          decision_mode, is_required
        ) values (
          v_request_id, v_step.id, v_step.step_order, v_step.step_type,
          v_step.role_id, coalesce(v_step.role_name, v_user.matched_role), v_user.id, v_user.full_name,
          v_step.decision_mode, v_step.is_required
        );
        v_user_count := v_user_count + 1;
      end loop;
    end if;

    if v_user_count = 0 then
      insert into public.approval_request_assignments(
        request_id, matrix_step_id, step_order, step_type,
        assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name,
        decision_mode, is_required, comments
      ) values (
        v_request_id, v_step.id, v_step.step_order, v_step.step_type,
        v_step.role_id, v_step.role_name, null, null,
        v_step.decision_mode, v_step.is_required,
        'No active user resolved for this role/user at submission time.'
      );
      if v_step.is_required then
        v_missing := concat_ws(E'\n', nullif(v_missing,''), 'No user assigned for role/user: ' || coalesce(v_step.role_name, v_step.user_id::text, 'Unknown'));
      end if;
    end if;
  end loop;

  if not exists (select 1 from public.approval_request_assignments where request_id = v_request_id) then
    v_missing := concat_ws(E'\n', nullif(v_missing,''), 'Approval rule has no steps.');
  end if;

  v_rule_errors := public.approval_validate_matrix_rule(v_rule.id);
  if coalesce(array_length(v_rule_errors, 1), 0) > 0 then
    v_missing := concat_ws(E'\n', nullif(v_missing,''), array_to_string(v_rule_errors, E'\n'));
  end if;

  select a.step_order, a.step_type into v_current_step, v_current_type
  from public.approval_request_assignments a
  where a.request_id = v_request_id
    and a.is_required = true
    and a.status = 'pending'
  order by a.step_order asc, case a.step_type when 'review' then 0 else 1 end
  limit 1;

  if nullif(v_missing, '') is not null then
    update public.approval_requests
       set status = 'missing_configuration', current_step_order = v_current_step, configuration_message = v_missing
     where id = v_request_id;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, comments)
    values (v_request_id, p_record_table, p_record_id, 'Submitted', 'draft', 'missing_configuration', p_submitted_by, v_missing);

    perform public.approval_update_transaction_status(p_record_table, p_record_id, 'missing_configuration', 'Missing Configuration', v_request_id, false);
    return v_request_id;
  end if;

  v_initial_status := case when v_current_type = 'review' then 'pending_review' else 'pending_approval' end;

  update public.approval_requests
     set status = v_initial_status, current_step_order = v_current_step
   where id = v_request_id;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, comments)
  values (v_request_id, p_record_table, p_record_id, 'Submitted', 'draft', v_initial_status, p_submitted_by, 'Approval assignments frozen from matrix rule: ' || v_rule.rule_name);

  perform public.approval_update_transaction_status(
    p_record_table,
    p_record_id,
    v_initial_status,
    case when v_initial_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
    v_request_id,
    true
  );

  return v_request_id;
end;
$$;

-- =========================================================
-- 5) Action engine: review, approve, return, reject
-- =========================================================

create or replace function public.approval_act_on_current_step(
  p_request_id uuid,
  p_action text,
  p_comments text default null,
  p_actor_user_id uuid default auth.uid(),
  p_actor_name text default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
  v_assignment public.approval_request_assignments%rowtype;
  v_old_status text;
  v_new_status text;
  v_done_status text;
  v_next_step integer;
  v_next_type text;
  v_is_admin boolean := false;
  v_action text := lower(trim(coalesce(p_action,'')));
begin
  select * into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found.';
  end if;

  if v_request.status not in ('pending_review','pending_approval','missing_configuration') then
    raise exception 'Approval request is not pending. Current status: %', v_request.status;
  end if;

  if v_action not in ('review','approve','return','reject') then
    raise exception 'Unsupported approval action: %', p_action;
  end if;

  if p_actor_user_id is not null then
    select exists(select 1 from public.users u where u.id = p_actor_user_id and u.role = 'Admin')
        or exists(select 1 from public.project_users pu where pu.user_id = p_actor_user_id and pu.project_id = v_request.project_id and pu.role = 'Admin')
    into v_is_admin;
  else
    -- Keeps local demo / service operations usable when auth.uid() is not mapped yet.
    v_is_admin := true;
  end if;

  select * into v_assignment
  from public.approval_request_assignments a
  where a.request_id = p_request_id
    and a.step_order = v_request.current_step_order
    and a.status = 'pending'
    and (
      v_is_admin = true
      or a.assigned_user_id = p_actor_user_id
    )
  order by case when a.assigned_user_id = p_actor_user_id then 0 else 1 end, a.created_at
  limit 1;

  if not found then
    raise exception 'You are not assigned to the current approval step.';
  end if;

  v_old_status := v_request.status;

  if v_action = 'reject' then
    update public.approval_request_assignments
       set status = 'rejected', action_by = p_actor_user_id, action_at = now(), comments = p_comments
     where id = v_assignment.id;

    update public.approval_requests
       set status = 'rejected', rejected_at = now()
     where id = p_request_id
     returning * into v_request;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, 'Rejected', v_old_status, 'rejected', p_actor_user_id, p_actor_name, p_comments);

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'rejected', 'Rejected', p_request_id, true);
    return v_request;
  end if;

  if v_action = 'return' then
    update public.approval_request_assignments
       set status = 'returned', action_by = p_actor_user_id, action_at = now(), comments = p_comments
     where id = v_assignment.id;

    update public.approval_requests
       set status = 'returned', returned_at = now()
     where id = p_request_id
     returning * into v_request;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, 'Returned', v_old_status, 'returned', p_actor_user_id, p_actor_name, p_comments);

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'returned', 'Returned', p_request_id, false);
    return v_request;
  end if;

  v_done_status := case when v_assignment.step_type = 'review' then 'reviewed' else 'approved' end;

  update public.approval_request_assignments
     set status = v_done_status, action_by = p_actor_user_id, action_at = now(), comments = p_comments
   where id = v_assignment.id;

  if v_assignment.decision_mode = 'any' then
    update public.approval_request_assignments
       set status = 'skipped', action_by = p_actor_user_id, action_at = now(), comments = 'Skipped because decision mode is Any One.'
     where request_id = p_request_id
       and step_order = v_assignment.step_order
       and id <> v_assignment.id
       and status = 'pending';
  elsif exists (
    select 1 from public.approval_request_assignments
    where request_id = p_request_id
      and step_order = v_assignment.step_order
      and is_required = true
      and status = 'pending'
  ) then
    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, initcap(v_action), v_old_status, v_old_status, p_actor_user_id, p_actor_name, p_comments);

    select * into v_request from public.approval_requests where id = p_request_id;
    return v_request;
  end if;

  select a.step_order, a.step_type into v_next_step, v_next_type
  from public.approval_request_assignments a
  where a.request_id = p_request_id
    and a.is_required = true
    and a.status = 'pending'
  order by a.step_order asc, case a.step_type when 'review' then 0 else 1 end
  limit 1;

  if v_next_step is null then
    v_new_status := 'approved';
    update public.approval_requests
       set status = 'approved', current_step_order = null, approved_at = now()
     where id = p_request_id
     returning * into v_request;

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'approved', 'Approved', p_request_id, true);
  else
    v_new_status := case when v_next_type = 'review' then 'pending_review' else 'pending_approval' end;
    update public.approval_requests
       set status = v_new_status, current_step_order = v_next_step
     where id = p_request_id
     returning * into v_request;

    perform public.approval_update_transaction_status(
      v_request.record_table,
      v_request.record_id,
      v_new_status,
      case when v_new_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
      p_request_id,
      true
    );
  end if;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, comments)
  values (p_request_id, v_request.record_table, v_request.record_id, case when v_done_status = 'reviewed' then 'Reviewed' else 'Approved' end, v_old_status, v_new_status, p_actor_user_id, p_actor_name, p_comments);

  return v_request;
end;
$$;

-- =========================================================
-- 6) Reassign / unlock helpers
-- =========================================================

create or replace function public.approval_reassign_assignment(
  p_assignment_id uuid,
  p_new_user_id uuid,
  p_comments text default null,
  p_actor_user_id uuid default auth.uid(),
  p_actor_name text default null
)
returns public.approval_request_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.approval_request_assignments%rowtype;
  v_request public.approval_requests%rowtype;
  v_new_user record;
  v_is_admin boolean := false;
begin
  select * into v_assignment from public.approval_request_assignments where id = p_assignment_id for update;
  if not found then raise exception 'Assignment not found.'; end if;
  select * into v_request from public.approval_requests where id = v_assignment.request_id;

  select exists(select 1 from public.users u where u.id = p_actor_user_id and u.role = 'Admin')
      or exists(select 1 from public.project_users pu where pu.user_id = p_actor_user_id and pu.project_id = v_request.project_id and pu.role = 'Admin')
  into v_is_admin;
  if coalesce(v_is_admin, false) = false and p_actor_user_id is not null then
    raise exception 'Only admin users can reassign reviewers / approvers.';
  end if;

  select id, full_name into v_new_user from public.users where id = p_new_user_id and coalesce(is_active, true) = true;
  if v_new_user.id is null then raise exception 'New assignee is not an active user.'; end if;

  update public.approval_request_assignments
     set assigned_user_id = v_new_user.id,
         assigned_user_name = v_new_user.full_name,
         comments = concat_ws(E'\n', comments, p_comments)
   where id = p_assignment_id
   returning * into v_assignment;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, comments)
  values (v_request.id, v_request.record_table, v_request.record_id, 'Reassigned', v_request.status, v_request.status, p_actor_user_id, p_actor_name, p_comments);

  return v_assignment;
end;
$$;

create or replace function public.approval_override_unlock(
  p_request_id uuid,
  p_reason text,
  p_actor_user_id uuid default auth.uid(),
  p_actor_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
begin
  select * into v_request from public.approval_requests where id = p_request_id;
  if not found then raise exception 'Approval request not found.'; end if;

  perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, v_request.status, coalesce(v_request.status, 'Unlocked'), p_request_id, false);

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, comments)
  values (v_request.id, v_request.record_table, v_request.record_id, 'Override Unlock', v_request.status, v_request.status, p_actor_user_id, p_actor_name, p_reason);
end;
$$;

-- =========================================================
-- 7) Reporting views
-- =========================================================

drop view if exists public.v_my_pending_approvals cascade;
create view public.v_my_pending_approvals as
select
  a.id as assignment_id,
  r.id as request_id,
  r.module,
  r.action,
  r.record_table,
  r.record_id,
  r.project_id,
  p.project_name,
  r.amount,
  r.status as request_status,
  r.current_step_order,
  a.step_order,
  a.step_type,
  a.assigned_role_name,
  a.assigned_user_id,
  a.assigned_user_name,
  a.decision_mode,
  rm.rule_name,
  r.submitted_at,
  now()::date - coalesce(r.submitted_at, r.created_at)::date as days_pending
from public.approval_request_assignments a
join public.approval_requests r on r.id = a.request_id
left join public.projects p on p.id = r.project_id
left join public.approval_matrix_rules rm on rm.id = r.rule_id
where a.status = 'pending'
  and a.step_order = r.current_step_order
  and r.status in ('pending_review','pending_approval')
  and (a.assigned_user_id = auth.uid() or a.assigned_user_id is null);

drop view if exists public.v_pending_approvals_by_project cascade;
create view public.v_pending_approvals_by_project as
select
  r.project_id,
  coalesce(p.project_name, 'Global / No Project') as project_name,
  count(*) filter (where r.status = 'pending_review') as pending_review_count,
  count(*) filter (where r.status = 'pending_approval') as pending_approval_count,
  count(*) as total_pending,
  coalesce(sum(r.amount), 0) as total_amount
from public.approval_requests r
left join public.projects p on p.id = r.project_id
where r.status in ('pending_review','pending_approval')
group by r.project_id, p.project_name;

drop view if exists public.v_pending_approvals_by_module cascade;
create view public.v_pending_approvals_by_module as
select
  r.module,
  r.action,
  count(*) filter (where r.status = 'pending_review') as pending_review_count,
  count(*) filter (where r.status = 'pending_approval') as pending_approval_count,
  count(*) as total_pending,
  coalesce(sum(r.amount), 0) as total_amount
from public.approval_requests r
where r.status in ('pending_review','pending_approval')
group by r.module, r.action;

drop view if exists public.v_approval_delay_report cascade;
create view public.v_approval_delay_report as
select
  r.*,
  p.project_name,
  rm.rule_name,
  now()::date - coalesce(r.submitted_at, r.created_at)::date as days_pending
from public.approval_requests r
left join public.projects p on p.id = r.project_id
left join public.approval_matrix_rules rm on rm.id = r.rule_id
where r.status in ('pending_review','pending_approval','missing_configuration')
  and now()::date - coalesce(r.submitted_at, r.created_at)::date > 2;

drop view if exists public.v_approval_history cascade;
create view public.v_approval_history as
select
  r.*,
  p.project_name,
  rm.rule_name
from public.approval_requests r
left join public.projects p on p.id = r.project_id
left join public.approval_matrix_rules rm on rm.id = r.rule_id
where r.status in ('approved','rejected','returned','cancelled')
order by r.updated_at desc;

-- =========================================================
-- 8) RLS policies - open pilot policies matching previous V13x style
-- Tighten later by role if needed.
-- =========================================================

alter table public.approval_matrix_rules enable row level security;
alter table public.approval_matrix_steps enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_request_assignments enable row level security;
alter table public.approval_audit_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['approval_matrix_rules','approval_matrix_steps','approval_requests','approval_request_assignments','approval_audit_log']
  loop
    execute format('drop policy if exists %I on public.%I', 'dev_open_' || t, t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', 'dev_open_' || t, t);
  end loop;
end $$;

-- =========================================================
-- 9) Sample default matrix data
-- =========================================================

do $$
declare
  v_rule_id uuid;
  v_created_by uuid := auth.uid();
begin
  -- Procurement / PR 0 - 50,000
  select id into v_rule_id from public.approval_matrix_rules where rule_name='PR up to 50,000' and module='Procurement' and action='PR' and project_id is null and coalesce(min_amount,-1)=0 and coalesce(max_amount,-1)=50000 limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('PR up to 50,000','Procurement','PR',null,0,50000,10,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='QS') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','QS','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Project Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Project Manager','any',true); end if;

  -- Procurement / PR 50,001 - 250,000
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='PR 50,001 to 250,000' and module='Procurement' and action='PR' and project_id is null and coalesce(min_amount,-1)=50001 and coalesce(max_amount,-1)=250000 limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('PR 50,001 to 250,000','Procurement','PR',null,50001,250000,20,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='QS') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','QS','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Procurement Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Procurement Manager','any',true); end if;

  -- Procurement / PR above 250,000
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='PR above 250,000' and module='Procurement' and action='PR' and project_id is null and coalesce(min_amount,-1)=250001 and max_amount is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('PR above 250,000','Procurement','PR',null,250001,null,30,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='QS') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','QS','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='review' and role_name='Project Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'review','role','Project Manager','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=4 and step_type='approval' and role_name='Director') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,4,'approval','role','Director','any',true); end if;

  -- Procurement / PO
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='Purchase Order Approval' and module='Procurement' and action='PO' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('Purchase Order Approval','Procurement','PO',null,null,null,35,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='Procurement') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','Procurement','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Project Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Project Manager','any',true); end if;

  -- GRN / Receive Material
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='GRN Receive Material' and module='GRN' and action='Receive Material' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('GRN Receive Material','GRN','Receive Material',null,null,null,40,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='Storekeeper') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','Storekeeper','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='approval' and role_name='Project Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'approval','role','Project Manager','any',true); end if;

  -- Issue Material / Issue to Site
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='Issue Material to Site' and module='Issue Material' and action='Issue to Site' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('Issue Material to Site','Issue Material','Issue to Site',null,null,null,50,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='Storekeeper') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','Storekeeper','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='approval' and role_name='Site Engineer') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'approval','role','Site Engineer','any',true); end if;

  -- Subcontractor Payment
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='Subcontractor Payment' and module='Payment' and action='Subcontractor Payment' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('Subcontractor Payment','Payment','Subcontractor Payment',null,null,null,60,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='QS') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','QS','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Project Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Project Manager','any',true); end if;

  -- Supplier Payment
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='Supplier Payment' and module='Payment' and action='Supplier Payment' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('Supplier Payment','Payment','Supplier Payment',null,null,null,70,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='Procurement') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','Procurement','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Finance Manager') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Finance Manager','any',true); end if;

  -- Client Certificate
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='Client Certificate' and module='Client Invoice' and action='Client Certificate' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('Client Certificate','Client Invoice','Client Certificate',null,null,null,80,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='QS') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','QS','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Project Director') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Project Director','any',true); end if;

  -- Variation Approval
  v_rule_id := null;
  select id into v_rule_id from public.approval_matrix_rules where rule_name='Variation Approval' and module='Variation' and action='Variation Approval' and project_id is null limit 1;
  if v_rule_id is null then insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by) values('Variation Approval','Variation','Variation Approval',null,null,null,90,true,v_created_by) returning id into v_rule_id; end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='review' and role_name='QS') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,1,'review','role','QS','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,2,'review','role','Finance','any',true); end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='Project Director') then insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required) values(v_rule_id,3,'approval','role','Project Director','any',true); end if;
end $$;

comment on table public.approval_matrix_rules is 'V138 Approval Matrix: module/action/project/amount rule header.';
comment on table public.approval_matrix_steps is 'V138 Approval Matrix steps. Review is data check; Approval is final authorization.';
comment on table public.approval_requests is 'V138 frozen approval flow per submitted transaction.';
comment on table public.approval_request_assignments is 'V138 frozen assigned reviewers / approvers copied from matrix at submission.';
comment on table public.approval_audit_log is 'V138 full audit log for submission, review, approve, return, reject, reassign, unlock.';


----------------------------------------------------------------
-- FILE: SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql
----------------------------------------------------------------
-- V139 Certificate Release Workflow by Users / Emails
-- Run after V138. Safe additive migration; can be re-run.

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Role catalog compatibility
--    Roles are labels used to resolve real users. The frozen workflow stores users/emails.
-- =========================================================

-- Do NOT alter public.users.role / public.project_users.role constraints here.
-- Some installations use an enum type (for example user_role), and adding check values
-- such as 'QS' directly against an enum column causes: invalid input value for enum user_role.
-- Workflow roles are stored as text labels in approval_matrix_steps.role_name and are
-- resolved to real users/emails at Release time.

create table if not exists public.approval_user_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, user_id, role_name)
);

create index if not exists idx_approval_user_roles_project_role
  on public.approval_user_roles(project_id, lower(role_name), is_active);
create index if not exists idx_approval_user_roles_user
  on public.approval_user_roles(user_id, is_active);

-- =========================================================
-- 2) User/email freezing columns
-- =========================================================

alter table if exists public.approval_matrix_steps
  add column if not exists user_name text null,
  add column if not exists user_email text null;

alter table if exists public.approval_requests
  add column if not exists submitted_by_name text null,
  add column if not exists submitted_by_email text null,
  add column if not exists originator_user_id uuid null,
  add column if not exists originator_name text null,
  add column if not exists originator_email text null;

alter table if exists public.approval_request_assignments
  add column if not exists assigned_user_email text null;

alter table if exists public.approval_audit_log
  add column if not exists actor_email text null;

-- Certificate release / payment-decision fields.
alter table if exists public.subcontractor_invoices
  add column if not exists originator_user_id uuid null,
  add column if not exists originator_name text null,
  add column if not exists originator_email text null,
  add column if not exists released_by uuid null,
  add column if not exists released_by_name text null,
  add column if not exists released_by_email text null,
  add column if not exists released_at timestamptz null,
  add column if not exists returned_reason text null,
  add column if not exists rejected_reason text null,
  add column if not exists ceo_released_amount numeric(18,3) null,
  add column if not exists remaining_unreleased_amount numeric(18,3) null,
  add column if not exists payment_decision text null,
  add column if not exists approval_locked boolean not null default false,
  add column if not exists approval_status text null,
  add column if not exists approval_request_id uuid null,
  add column if not exists workflow_status text null;

create index if not exists idx_v139_approval_assignments_user_email_pending
  on public.approval_request_assignments(lower(assigned_user_email), status, step_order);
create index if not exists idx_v139_approval_requests_originator_email
  on public.approval_requests(lower(originator_email), status, created_at desc);
create index if not exists idx_v139_subcontractor_invoices_release
  on public.subcontractor_invoices(project_id, status, approval_status, released_at desc);

-- Backfill email snapshots where possible.
update public.approval_matrix_steps s
set user_name = coalesce(s.user_name, u.full_name),
    user_email = coalesce(s.user_email, u.email)
from public.users u
where s.user_id = u.id
  and (s.user_name is null or s.user_email is null);

update public.approval_request_assignments a
set assigned_user_email = coalesce(a.assigned_user_email, u.email),
    assigned_user_name = coalesce(a.assigned_user_name, u.full_name)
from public.users u
where a.assigned_user_id = u.id
  and (a.assigned_user_email is null or a.assigned_user_name is null);

update public.approval_requests r
set submitted_by_name = coalesce(r.submitted_by_name, u.full_name),
    submitted_by_email = coalesce(r.submitted_by_email, u.email),
    originator_user_id = coalesce(r.originator_user_id, r.submitted_by),
    originator_name = coalesce(r.originator_name, u.full_name),
    originator_email = coalesce(r.originator_email, u.email)
from public.users u
where r.submitted_by = u.id
  and (r.submitted_by_email is null or r.originator_email is null);

-- =========================================================
-- 3) Strict role-to-user resolution
--    No fake text-only workflow: roles resolve to real active users.
-- =========================================================

create or replace function public.approval_role_variants(p_role text)
returns text[]
language sql
immutable
as $$
  select case lower(trim(coalesce(p_role,'')))
    when 'qs' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'qs engineer' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'quantity surveyor' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'storekeeper' then array['Storekeeper']::text[]
    when 'stores' then array['Storekeeper']::text[]
    when 'site engineer' then array['Site Engineer']::text[]
    when 'technical engineer' then array['Technical Engineer','Technical Office Manager']::text[]
    when 'technical office manager' then array['Technical Office Manager','Technical Engineer']::text[]
    when 'procurement' then array['Procurement','Procurement Officer','Procurement Engineer']::text[]
    when 'procurement officer' then array['Procurement Officer','Procurement','Procurement Engineer']::text[]
    when 'procurement engineer' then array['Procurement Engineer','Procurement Officer','Procurement']::text[]
    when 'procurement manager' then array['Procurement Manager']::text[]
    when 'finance' then array['Finance']::text[]
    when 'finance manager' then array['Finance Manager']::text[]
    when 'project manager' then array['Project Manager']::text[]
    when 'director' then array['Director','Project Director']::text[]
    when 'project director' then array['Project Director','Director']::text[]
    when 'ceo' then array['CEO']::text[]
    when 'admin' then array['Admin']::text[]
    else array[p_role]::text[]
  end;
$$;

-- =========================================================
-- 4) Transaction status updater with certificate release semantics
-- =========================================================

create or replace function public.approval_update_transaction_status(
  p_record_table text,
  p_record_id uuid,
  p_approval_status text,
  p_workflow_status text,
  p_request_id uuid default null,
  p_locked boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_certificate_status text;
begin
  if p_record_table not in (
    'procurement_records',
    'inventory_grn_lines',
    'inventory_issue_lines',
    'finance_records',
    'subcontractor_invoices',
    'client_invoices',
    'variations'
  ) then
    return;
  end if;

  -- Generic update for existing V13x transaction tables.
  execute format(
    'update public.%I
        set approval_status = $1,
            workflow_status = case when exists (
              select 1 from information_schema.columns
              where table_schema = ''public'' and table_name = $5 and column_name = ''workflow_status''
            ) then $2 else workflow_status end,
            approval_request_id = coalesce($3, approval_request_id),
            approval_locked = $4,
            updated_at = now()
      where id = $6',
    p_record_table
  ) using p_approval_status, p_workflow_status, p_request_id, p_locked, p_record_table, p_record_id;

  -- Subcontractor Invoices must not stay Draft after Release.
  if p_record_table = 'subcontractor_invoices' then
    v_certificate_status := case p_approval_status
      when 'pending_review' then 'Pending Finance Review'
      when 'pending_approval' then 'Pending Approval'
      when 'approved' then 'Approved'
      when 'returned' then 'Returned to Originator'
      when 'rejected' then 'Rejected'
      when 'missing_configuration' then 'Missing Configuration'
      when 'cancelled' then 'Cancelled'
      else coalesce(nullif(p_workflow_status,''), p_approval_status)
    end;

    update public.subcontractor_invoices
       set status = v_certificate_status,
           approval_status = p_approval_status,
           workflow_status = coalesce(nullif(p_workflow_status,''), workflow_status),
           approval_request_id = coalesce(p_request_id, approval_request_id),
           approval_locked = p_locked,
           updated_at = now()
     where id = p_record_id;
  end if;
exception
  when undefined_column then
    begin
      execute format(
        'update public.%I
            set approval_status = $1,
                approval_request_id = coalesce($2, approval_request_id),
                approval_locked = $3,
                updated_at = now()
          where id = $4',
        p_record_table
      ) using p_approval_status, p_request_id, p_locked, p_record_id;
    exception when undefined_column then
      null;
    end;
  when undefined_table then
    null;
end;
$$;

-- =========================================================
-- 5) Submission engine: freezes real users + emails, excludes originator
-- =========================================================

create or replace function public.approval_submit_transaction(
  p_module text,
  p_action text,
  p_record_table text,
  p_record_id uuid,
  p_project_id uuid default null,
  p_amount numeric default null,
  p_submitted_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
  v_request_id uuid;
  v_step public.approval_matrix_steps%rowtype;
  v_user record;
  v_submitter record;
  v_user_count int;
  v_missing text := '';
  v_current_step integer;
  v_current_type text;
  v_initial_status text;
  v_rule_errors text[];
begin
  select null::uuid as id, null::text as full_name, null::text as email into v_submitter;

  if p_submitted_by is not null then
    select u.id, u.full_name, u.email into v_submitter
    from public.users u
    where u.id = p_submitted_by;
  end if;

  -- Resubmission freezes a new copy of the current matrix; old open/returned flow is archived.
  update public.approval_requests
     set status = 'cancelled', updated_at = now()
   where record_table = p_record_table
     and record_id = p_record_id
     and status in ('draft','pending_review','pending_approval','returned','missing_configuration');

  select * into v_rule from public.approval_find_rule(p_module, p_action, p_project_id, p_amount);

  if v_rule.id is null then
    insert into public.approval_requests(
      module, action, record_table, record_id, project_id, amount, rule_id, status,
      submitted_by, submitted_by_name, submitted_by_email,
      originator_user_id, originator_name, originator_email,
      submitted_at, configuration_message
    ) values (
      p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount, null, 'missing_configuration',
      p_submitted_by, v_submitter.full_name, v_submitter.email,
      p_submitted_by, v_submitter.full_name, v_submitter.email,
      now(), 'No approval matrix rule found for this transaction.'
    ) returning id into v_request_id;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (v_request_id, p_record_table, p_record_id, 'Released / Submitted', 'draft', 'missing_configuration', p_submitted_by, v_submitter.full_name, v_submitter.email, 'No approval matrix rule found for this transaction.');

    perform public.approval_update_transaction_status(p_record_table, p_record_id, 'missing_configuration', 'Missing Configuration', v_request_id, false);
    return v_request_id;
  end if;

  insert into public.approval_requests(
    module, action, record_table, record_id, project_id, amount, rule_id, status,
    submitted_by, submitted_by_name, submitted_by_email,
    originator_user_id, originator_name, originator_email,
    submitted_at
  ) values (
    p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount, v_rule.id, 'draft',
    p_submitted_by, v_submitter.full_name, v_submitter.email,
    p_submitted_by, v_submitter.full_name, v_submitter.email,
    now()
  ) returning id into v_request_id;

  for v_step in
    select * from public.approval_matrix_steps where rule_id = v_rule.id order by step_order, created_at
  loop
    v_user_count := 0;

    if v_step.assignee_type = 'user' and v_step.user_id is not null then
      select u.id, u.full_name, u.email, u.role into v_user
      from public.users u
      where u.id = v_step.user_id and coalesce(u.is_active, true) = true;

      if v_user.id is not null then
        if p_submitted_by is not null and (v_user.id = p_submitted_by or lower(coalesce(v_user.email,'')) = lower(coalesce(v_submitter.email,''))) then
          if v_step.is_required then
            v_missing := concat_ws(E'\n', nullif(v_missing,''), 'Maker-checker rule: creator cannot be assigned to approve/review step ' || v_step.step_order || ' (' || coalesce(v_user.email, v_user.full_name, v_step.user_id::text) || ').');
          end if;
        else
          insert into public.approval_request_assignments(
            request_id, matrix_step_id, step_order, step_type,
            assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name, assigned_user_email,
            decision_mode, is_required
          ) values (
            v_request_id, v_step.id, v_step.step_order, v_step.step_type,
            v_step.role_id, v_step.role_name, v_user.id, v_user.full_name, v_user.email,
            v_step.decision_mode, v_step.is_required
          );
          v_user_count := 1;
        end if;
      end if;
    else
      for v_user in
        select distinct
          u.id,
          u.full_name,
          u.email,
          coalesce(aur.role_name, pu.role::text, u.role::text) as matched_role
        from public.users u
        left join public.project_users pu
          on pu.user_id = u.id
         and (p_project_id is null or pu.project_id = p_project_id)
        left join public.approval_user_roles aur
          on aur.user_id = u.id
         and coalesce(aur.is_active, true) = true
         and (aur.project_id = p_project_id or aur.project_id is null)
        where coalesce(u.is_active, true) = true
          and nullif(trim(coalesce(u.email,'')), '') is not null
          and (
            u.role::text = any(public.approval_role_variants(v_step.role_name))
            or pu.role::text = any(public.approval_role_variants(v_step.role_name))
            or aur.role_name = any(public.approval_role_variants(v_step.role_name))
          )
          and not (
            p_submitted_by is not null
            and (u.id = p_submitted_by or lower(coalesce(u.email,'')) = lower(coalesce(v_submitter.email,'')))
          )
        order by u.full_name
      loop
        insert into public.approval_request_assignments(
          request_id, matrix_step_id, step_order, step_type,
          assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name, assigned_user_email,
          decision_mode, is_required
        ) values (
          v_request_id, v_step.id, v_step.step_order, v_step.step_type,
          v_step.role_id, coalesce(v_step.role_name, v_user.matched_role), v_user.id, v_user.full_name, v_user.email,
          v_step.decision_mode, v_step.is_required
        );
        v_user_count := v_user_count + 1;
      end loop;
    end if;

    if v_user_count = 0 then
      insert into public.approval_request_assignments(
        request_id, matrix_step_id, step_order, step_type,
        assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name, assigned_user_email,
        decision_mode, is_required, comments
      ) values (
        v_request_id, v_step.id, v_step.step_order, v_step.step_type,
        v_step.role_id, v_step.role_name, null, null, null,
        v_step.decision_mode, v_step.is_required,
        'No active non-originator user/email resolved for this role/user at release time.'
      );
      if v_step.is_required then
        v_missing := concat_ws(E'\n', nullif(v_missing,''), 'No active non-originator user assigned for role/user: ' || coalesce(v_step.role_name, v_step.user_email, v_step.user_id::text, 'Unknown') || '.');
      end if;
    end if;
  end loop;

  if not exists (select 1 from public.approval_request_assignments where request_id = v_request_id) then
    v_missing := concat_ws(E'\n', nullif(v_missing,''), 'Approval rule has no steps.');
  end if;

  v_rule_errors := public.approval_validate_matrix_rule(v_rule.id);
  if coalesce(array_length(v_rule_errors, 1), 0) > 0 then
    v_missing := concat_ws(E'\n', nullif(v_missing,''), array_to_string(v_rule_errors, E'\n'));
  end if;

  select a.step_order, a.step_type into v_current_step, v_current_type
  from public.approval_request_assignments a
  where a.request_id = v_request_id
    and a.is_required = true
    and a.status = 'pending'
    and a.assigned_user_id is not null
    and nullif(trim(coalesce(a.assigned_user_email,'')), '') is not null
  order by a.step_order asc, case a.step_type when 'review' then 0 else 1 end
  limit 1;

  if nullif(v_missing, '') is not null then
    update public.approval_requests
       set status = 'missing_configuration', current_step_order = v_current_step, configuration_message = v_missing
     where id = v_request_id;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (v_request_id, p_record_table, p_record_id, 'Released / Submitted', 'draft', 'missing_configuration', p_submitted_by, v_submitter.full_name, v_submitter.email, v_missing);

    perform public.approval_update_transaction_status(p_record_table, p_record_id, 'missing_configuration', 'Missing Configuration', v_request_id, false);
    return v_request_id;
  end if;

  v_initial_status := case when v_current_type = 'review' then 'pending_review' else 'pending_approval' end;

  update public.approval_requests
     set status = v_initial_status, current_step_order = v_current_step
   where id = v_request_id;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
  values (v_request_id, p_record_table, p_record_id, 'Released / Submitted', 'draft', v_initial_status, p_submitted_by, v_submitter.full_name, v_submitter.email, 'Approval assignments frozen as actual users/emails from matrix rule: ' || v_rule.rule_name);

  perform public.approval_update_transaction_status(
    p_record_table,
    p_record_id,
    v_initial_status,
    case when v_initial_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
    v_request_id,
    true
  );

  return v_request_id;
end;
$$;

-- =========================================================
-- 6) Action engine: only assigned user/email can act; creator cannot act; reason required for negative actions
-- =========================================================

create or replace function public.approval_act_on_current_step(
  p_request_id uuid,
  p_action text,
  p_comments text default null,
  p_actor_user_id uuid default auth.uid(),
  p_actor_name text default null,
  p_actor_email text default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
  v_assignment public.approval_request_assignments%rowtype;
  v_old_status text;
  v_new_status text;
  v_done_status text;
  v_next_step integer;
  v_next_type text;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_actor record;
  v_actor_email text;
  v_actor_name text;
begin
  select * into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found.';
  end if;

  if v_request.status not in ('pending_review','pending_approval') then
    raise exception 'Approval request is not pending. Current status: %', v_request.status;
  end if;

  if v_action not in ('review','approve','return','reject','not_approved','not approved') then
    raise exception 'Unsupported approval action: %', p_action;
  end if;

  if v_action = 'not approved' then
    v_action := 'not_approved';
  end if;

  select null::uuid as id, null::text as full_name, null::text as email, null::text as role into v_actor;

  if p_actor_user_id is not null then
    select u.id, u.full_name, u.email, u.role into v_actor
    from public.users u
    where u.id = p_actor_user_id;
  end if;

  v_actor_email := lower(nullif(trim(coalesce(p_actor_email, v_actor.email, case when p_actor_name like '%@%' then p_actor_name else null end, '')), ''));
  v_actor_name := coalesce(nullif(trim(v_actor.full_name), ''), nullif(trim(case when coalesce(p_actor_name,'') not like '%@%' then p_actor_name else '' end), ''), v_actor_email);

  if p_actor_user_id is null and v_actor_email is null then
    raise exception 'Logged-in user id/email is required for approval actions.';
  end if;

  if v_request.originator_user_id is not null and p_actor_user_id is not null and v_request.originator_user_id = p_actor_user_id then
    raise exception 'Maker-checker rule: the certificate originator cannot review, approve, release payment, or approve payment for the same certificate.';
  end if;

  if v_request.originator_email is not null and v_actor_email is not null and lower(v_request.originator_email) = v_actor_email then
    raise exception 'Maker-checker rule: the certificate originator cannot review, approve, release payment, or approve payment for the same certificate.';
  end if;

  select * into v_assignment
  from public.approval_request_assignments a
  where a.request_id = p_request_id
    and a.step_order = v_request.current_step_order
    and a.status = 'pending'
    and (
      (p_actor_user_id is not null and a.assigned_user_id = p_actor_user_id)
      or (v_actor_email is not null and lower(coalesce(a.assigned_user_email,'')) = v_actor_email)
    )
  order by case when p_actor_user_id is not null and a.assigned_user_id = p_actor_user_id then 0 else 1 end, a.created_at
  limit 1;

  if not found then
    raise exception 'You are not assigned to the current approval step by user/email.';
  end if;

  if v_action in ('return','reject','not_approved') and nullif(trim(coalesce(p_comments,'')), '') is null then
    raise exception 'Reason is required for Return / Not Approved / Reject.';
  end if;

  v_old_status := v_request.status;

  if v_action = 'reject' then
    update public.approval_request_assignments
       set status = 'rejected', action_by = p_actor_user_id, action_at = now(), comments = p_comments
     where id = v_assignment.id;

    update public.approval_request_assignments
       set status = 'cancelled', comments = coalesce(comments, 'Cancelled after rejection.')
     where request_id = p_request_id and status = 'pending' and id <> v_assignment.id;

    update public.approval_requests
       set status = 'rejected', current_step_order = null, rejected_at = now()
     where id = p_request_id
     returning * into v_request;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, 'Rejected', v_old_status, 'rejected', p_actor_user_id, v_actor_name, v_actor_email, p_comments);

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'rejected', 'Rejected', p_request_id, true);
    if v_request.record_table = 'subcontractor_invoices' then
      update public.subcontractor_invoices set rejected_reason = p_comments, returned_reason = null where id = v_request.record_id;
    end if;
    return v_request;
  end if;

  if v_action in ('return','not_approved') then
    update public.approval_request_assignments
       set status = 'returned', action_by = p_actor_user_id, action_at = now(), comments = p_comments
     where id = v_assignment.id;

    update public.approval_request_assignments
       set status = 'cancelled', comments = coalesce(comments, 'Cancelled because the current cycle was returned to originator.')
     where request_id = p_request_id and status = 'pending' and id <> v_assignment.id;

    update public.approval_requests
       set status = 'returned', current_step_order = null, returned_at = now()
     where id = p_request_id
     returning * into v_request;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, 'Not Approved / Returned to Originator', v_old_status, 'returned', p_actor_user_id, v_actor_name, v_actor_email, p_comments);

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'returned', 'Returned to Originator', p_request_id, false);
    if v_request.record_table = 'subcontractor_invoices' then
      update public.subcontractor_invoices set returned_reason = p_comments, rejected_reason = null where id = v_request.record_id;
    end if;
    return v_request;
  end if;

  v_done_status := case when v_assignment.step_type = 'review' then 'reviewed' else 'approved' end;

  update public.approval_request_assignments
     set status = v_done_status, action_by = p_actor_user_id, action_at = now(), comments = p_comments
   where id = v_assignment.id;

  if v_assignment.decision_mode = 'any' then
    update public.approval_request_assignments
       set status = 'skipped', action_by = p_actor_user_id, action_at = now(), comments = 'Skipped because decision mode is Any One.'
     where request_id = p_request_id
       and step_order = v_assignment.step_order
       and id <> v_assignment.id
       and status = 'pending';
  elsif exists (
    select 1 from public.approval_request_assignments
    where request_id = p_request_id
      and step_order = v_assignment.step_order
      and is_required = true
      and status = 'pending'
  ) then
    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, initcap(v_action), v_old_status, v_old_status, p_actor_user_id, v_actor_name, v_actor_email, p_comments);

    select * into v_request from public.approval_requests where id = p_request_id;
    return v_request;
  end if;

  select a.step_order, a.step_type into v_next_step, v_next_type
  from public.approval_request_assignments a
  where a.request_id = p_request_id
    and a.is_required = true
    and a.status = 'pending'
    and a.assigned_user_id is not null
  order by a.step_order asc, case a.step_type when 'review' then 0 else 1 end
  limit 1;

  if v_next_step is null then
    v_new_status := 'approved';
    update public.approval_requests
       set status = 'approved', current_step_order = null, approved_at = now()
     where id = p_request_id
     returning * into v_request;

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'approved', 'Approved', p_request_id, true);
  else
    v_new_status := case when v_next_type = 'review' then 'pending_review' else 'pending_approval' end;
    update public.approval_requests
       set status = v_new_status, current_step_order = v_next_step
     where id = p_request_id
     returning * into v_request;

    perform public.approval_update_transaction_status(
      v_request.record_table,
      v_request.record_id,
      v_new_status,
      case when v_new_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
      p_request_id,
      true
    );
  end if;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
  values (p_request_id, v_request.record_table, v_request.record_id, case when v_done_status = 'reviewed' then 'Reviewed' else 'Approved' end, v_old_status, v_new_status, p_actor_user_id, v_actor_name, v_actor_email, p_comments);

  return v_request;
end;
$$;

-- =========================================================
-- 7) Certificate Release entrypoint
--    Save/Create = Draft only. Release starts approval.
-- =========================================================

create or replace function public.certificate_release_for_approval(
  p_invoice_id uuid,
  p_released_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_user record;
  v_request_id uuid;
  v_status text;
begin
  select * into v_invoice
  from public.subcontractor_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Subcontractor invoice not found.';
  end if;

  select id, full_name, email into v_user
  from public.users
  where id = p_released_by;

  if p_released_by is null or v_user.id is null or nullif(trim(coalesce(v_user.email,'')), '') is null then
    raise exception 'Release requires a logged-in user with a valid email.';
  end if;

  v_status := lower(trim(coalesce(v_invoice.status, 'Draft')));
  if v_status not in ('draft','returned','returned to originator','missing configuration') then
    raise exception 'Only Draft or Returned to Originator subcontractor invoices can be released/resubmitted. Current status: %', v_invoice.status;
  end if;

  update public.subcontractor_invoices
     set originator_user_id = coalesce(originator_user_id, p_released_by),
         originator_name = coalesce(originator_name, v_user.full_name),
         originator_email = coalesce(originator_email, v_user.email),
         released_by = p_released_by,
         released_by_name = v_user.full_name,
         released_by_email = v_user.email,
         released_at = now(),
         status = 'Released',
         approval_status = 'released',
         workflow_status = 'Released',
         approval_locked = true,
         returned_reason = null,
         rejected_reason = null,
         updated_at = now()
   where id = p_invoice_id;

  v_request_id := public.approval_submit_transaction(
    'Subcontractor',
    'Subcontractor Certificate',
    'subcontractor_invoices',
    p_invoice_id,
    v_invoice.project_id,
    coalesce(v_invoice.net_payable, v_invoice.net_amount, v_invoice.gross_amount, 0),
    p_released_by
  );

  update public.subcontractor_invoices
     set approval_request_id = v_request_id,
         updated_at = now()
   where id = p_invoice_id;

  return v_request_id;
end;
$$;

-- =========================================================
-- 8) Validation override for certificate workflow order
--    Subcontractor Certificate can be: Technical Office Approval -> Finance Review -> CEO Approval.
-- =========================================================

create or replace function public.approval_validate_matrix_rule(p_rule_id uuid)
returns text[]
language plpgsql
stable
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
  v_errors text[] := array[]::text[];
  v_approval_count int := 0;
  v_duplicate_orders int := 0;
  v_conflicts int := 0;
begin
  select * into v_rule from public.approval_matrix_rules where id = p_rule_id;
  if not found then
    return array['Rule not found.']::text[];
  end if;

  if nullif(trim(coalesce(v_rule.module,'')), '') is null then
    v_errors := array_append(v_errors, 'Module is required.');
  end if;
  if nullif(trim(coalesce(v_rule.action,'')), '') is null then
    v_errors := array_append(v_errors, 'Action is required.');
  end if;
  if v_rule.min_amount is not null and v_rule.max_amount is not null and v_rule.min_amount > v_rule.max_amount then
    v_errors := array_append(v_errors, 'Amount From cannot be greater than Amount To.');
  end if;

  select count(*) into v_approval_count
  from public.approval_matrix_steps
  where rule_id = p_rule_id and step_type = 'approval';
  if v_approval_count = 0 then
    v_errors := array_append(v_errors, 'At least one Approval step is required.');
  end if;

  if not exists (select 1 from public.approval_matrix_steps where rule_id = p_rule_id) then
    v_errors := array_append(v_errors, 'At least one approval step exists.');
  end if;

  select count(*) into v_duplicate_orders
  from (
    select step_order
    from public.approval_matrix_steps
    where rule_id = p_rule_id
    group by step_order
    having count(*) > 1 and bool_or(decision_mode = 'all') = false
  ) x;
  if v_duplicate_orders > 0 then
    v_errors := array_append(v_errors, 'Step order must be unique unless the same order is intentionally used for grouped approvers.');
  end if;

  if exists (
    select 1 from public.approval_matrix_steps
    where rule_id = p_rule_id
      and assignee_type = 'role'
      and nullif(trim(coalesce(role_name,'')), '') is null
  ) then
    v_errors := array_append(v_errors, 'Role must be selected for role-based steps.');
  end if;

  if exists (
    select 1 from public.approval_matrix_steps
    where rule_id = p_rule_id
      and assignee_type = 'user'
      and user_id is null
  ) then
    v_errors := array_append(v_errors, 'User must be selected for user-based steps.');
  end if;

  -- Keep old review-before-approval rule for normal transactions, but allow the certificate flow requested in V139.
  if not (v_rule.module = 'Subcontractor' and v_rule.action = 'Subcontractor Certificate') and exists (
    select 1
    from public.approval_matrix_steps s_review
    join public.approval_matrix_steps s_approval on s_approval.rule_id = s_review.rule_id
    where s_review.rule_id = p_rule_id
      and s_review.step_type = 'review'
      and s_approval.step_type = 'approval'
      and s_review.step_order > s_approval.step_order
  ) then
    v_errors := array_append(v_errors, 'Review steps must come before approval steps.');
  end if;

  select count(*) into v_conflicts
  from public.approval_matrix_rules r
  where r.id <> p_rule_id
    and r.is_active = true
    and v_rule.is_active = true
    and r.module = v_rule.module
    and r.action = v_rule.action
    and coalesce(r.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_rule.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(r.min_amount, -999999999999999999::numeric) <= coalesce(v_rule.max_amount, 999999999999999999::numeric)
    and coalesce(v_rule.min_amount, -999999999999999999::numeric) <= coalesce(r.max_amount, 999999999999999999::numeric);

  if v_conflicts > 0 then
    v_errors := array_append(v_errors, 'Duplicate active rule / conflicting amount range exists for the same module, action, and project.');
  end if;

  return v_errors;
end;
$$;

-- =========================================================
-- 9) Reporting views with emails
-- =========================================================

drop view if exists public.v_my_pending_approvals cascade;
create view public.v_my_pending_approvals as
select
  a.id as assignment_id,
  r.id as request_id,
  r.module,
  r.action,
  r.record_table,
  r.record_id,
  r.project_id,
  p.project_name,
  r.amount,
  r.status as request_status,
  r.current_step_order,
  a.step_order,
  a.step_type,
  a.assigned_role_name,
  a.assigned_user_id,
  a.assigned_user_name,
  a.assigned_user_email,
  a.decision_mode,
  rm.rule_name,
  r.submitted_by,
  r.submitted_by_name,
  r.submitted_by_email,
  r.originator_user_id,
  r.originator_name,
  r.originator_email,
  r.submitted_at,
  now()::date - coalesce(r.submitted_at, r.created_at)::date as days_pending
from public.approval_request_assignments a
join public.approval_requests r on r.id = a.request_id
left join public.projects p on p.id = r.project_id
left join public.approval_matrix_rules rm on rm.id = r.rule_id
where a.status = 'pending'
  and a.step_order = r.current_step_order
  and r.status in ('pending_review','pending_approval')
  and a.assigned_user_id = auth.uid();

drop view if exists public.v_approval_history cascade;
create view public.v_approval_history as
select
  r.*,
  p.project_name,
  rm.rule_name
from public.approval_requests r
left join public.projects p on p.id = r.project_id
left join public.approval_matrix_rules rm on rm.id = r.rule_id
where r.status in ('approved','rejected','returned','cancelled')
order by r.updated_at desc;

-- =========================================================
-- 10) Default Subcontractor Invoice / Certificate rule
-- =========================================================

do $$
declare
  v_rule_id uuid;
  v_created_by uuid;
begin
  select id into v_created_by from public.users order by created_at limit 1;

  select id into v_rule_id
  from public.approval_matrix_rules
  where rule_name='Subcontractor Invoice Release'
    and module='Subcontractor'
    and action='Subcontractor Certificate'
    and project_id is null
  limit 1;

  if v_rule_id is null then
    insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by)
    values('Subcontractor Invoice Release','Subcontractor','Subcontractor Certificate',null,null,null,20,true,v_created_by)
    returning id into v_rule_id;
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='approval' and role_name='Technical Office Manager') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,1,'approval','role','Technical Office Manager','any',true);
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,2,'review','role','Finance','any',true);
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='CEO') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,3,'approval','role','CEO','any',true);
  end if;
end $$;

comment on function public.certificate_release_for_approval(uuid, uuid) is 'V139: Release a Draft/Returned subcontractor invoice and start a frozen user/email approval workflow.';
comment on column public.approval_request_assignments.assigned_user_email is 'V139: frozen assignee email at release/submission time.';
comment on column public.approval_audit_log.actor_email is 'V139: actor email captured in audit trail.';

----------------------------------------------------------------
-- FILE: SQL_FIX_V139_RELEASE_SUBCONTRACTOR_INVOICE.sql
----------------------------------------------------------------

-- SQL_FIX_V139_RELEASE_SUBCONTRACTOR_INVOICE.sql
-- V139 hard fix: Subcontractor Invoice Release workflow by frozen users/emails.
-- Safe to re-run after SUPABASE_V138_APPROVAL_MATRIX.sql and SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql.

create extension if not exists pgcrypto;

-- Core V139 objects/columns, repeated here so this fix can be run directly after V138.
create table if not exists public.approval_user_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, user_id, role_name)
);

create index if not exists idx_approval_user_roles_project_role
  on public.approval_user_roles(project_id, lower(role_name), is_active);
create index if not exists idx_approval_user_roles_user
  on public.approval_user_roles(user_id, is_active);

alter table if exists public.approval_matrix_steps
  add column if not exists user_name text null,
  add column if not exists user_email text null;

alter table if exists public.approval_requests
  add column if not exists submitted_by_name text null,
  add column if not exists submitted_by_email text null,
  add column if not exists originator_user_id uuid null,
  add column if not exists originator_name text null,
  add column if not exists originator_email text null;

alter table if exists public.approval_request_assignments
  add column if not exists assigned_user_email text null;

alter table if exists public.approval_audit_log
  add column if not exists actor_email text null;

create or replace function public.approval_role_variants(p_role text)
returns text[]
language sql
immutable
as $$
  select case lower(trim(coalesce(p_role,'')))
    when 'qs' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'qs engineer' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'quantity surveyor' then array['QS','QS Engineer','Quantity Surveyor']::text[]
    when 'storekeeper' then array['Storekeeper']::text[]
    when 'stores' then array['Storekeeper']::text[]
    when 'site engineer' then array['Site Engineer']::text[]
    when 'technical engineer' then array['Technical Engineer','Technical Office Manager']::text[]
    when 'technical office manager' then array['Technical Office Manager','Technical Engineer']::text[]
    when 'procurement' then array['Procurement','Procurement Officer','Procurement Engineer']::text[]
    when 'procurement officer' then array['Procurement Officer','Procurement','Procurement Engineer']::text[]
    when 'procurement engineer' then array['Procurement Engineer','Procurement Officer','Procurement']::text[]
    when 'procurement manager' then array['Procurement Manager']::text[]
    when 'finance' then array['Finance']::text[]
    when 'finance manager' then array['Finance Manager','Finance']::text[]
    when 'project manager' then array['Project Manager']::text[]
    when 'director' then array['Director','Project Director']::text[]
    when 'project director' then array['Project Director','Director']::text[]
    when 'ceo' then array['CEO']::text[]
    when 'admin' then array['Admin']::text[]
    else array[p_role]::text[]
  end;
$$;

-- =========================================================
-- A) Status compatibility for Subcontractor Invoices
--    Do not touch public.users.role enum/checks.
-- =========================================================

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.subcontractor_invoices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.subcontractor_invoices drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table if exists public.subcontractor_invoices
  alter column status set default 'Draft',
  add column if not exists approval_status text null,
  add column if not exists workflow_status text null,
  add column if not exists approval_request_id uuid null,
  add column if not exists approval_locked boolean not null default false,
  add column if not exists originator_user_id uuid null,
  add column if not exists originator_name text null,
  add column if not exists originator_email text null,
  add column if not exists released_by uuid null,
  add column if not exists released_by_name text null,
  add column if not exists released_by_email text null,
  add column if not exists released_at timestamptz null,
  add column if not exists returned_reason text null,
  add column if not exists rejected_reason text null,
  add column if not exists approved_certificate_amount numeric(18,3) null,
  add column if not exists released_payment_amount numeric(18,3) null,
  add column if not exists total_released_payments numeric(18,3) null,
  add column if not exists remaining_unpaid_balance numeric(18,3) null,
  add column if not exists ceo_released_amount numeric(18,3) null,
  add column if not exists remaining_unreleased_amount numeric(18,3) null,
  add column if not exists payment_decision text null;

alter table if exists public.subcontractor_invoices
  add constraint subcontractor_invoices_status_v139_release_chk
  check (status in (
    'Draft',
    'Released',
    'Pending Review',
    'Pending Approval',
    'Pending Technical Office Approval',
    'Pending Finance Review',
    'Pending CEO Approval',
    'Approved',
    'Partially Released',
    'Payment Held',
    'Returned to Originator',
    'Rejected',
    'Missing Configuration',
    'Paid',
    'Cancelled'
  ));

create index if not exists idx_v139_subcontractor_invoice_status_release
  on public.subcontractor_invoices(project_id, status, approval_status, released_at desc);

-- =========================================================
-- B) Sync auth.users -> public.users without changing user_role enum/checks.
-- =========================================================

create or replace function public.v139_get_or_create_public_user(p_user_id uuid)
returns table(id uuid, full_name text, email text, role text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth record;
  v_public record;
begin
  if p_user_id is null then
    raise exception 'Logged-in user id is required.';
  end if;

  select u.id, u.full_name, u.email, u.role::text
    into v_public
  from public.users u
  where u.id = p_user_id;

  if found then
    id := v_public.id;
    full_name := v_public.full_name;
    email := v_public.email;
    role := v_public.role;
    return next;
    return;
  end if;

  select au.id,
         au.email,
         coalesce(
           nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
           nullif(trim(au.raw_user_meta_data->>'name'), ''),
           nullif(split_part(coalesce(au.email,''), '@', 1), ''),
           'User'
         ) as full_name
    into v_auth
  from auth.users au
  where au.id = p_user_id;

  if not found or nullif(trim(coalesce(v_auth.email,'')), '') is null then
    raise exception 'Release requires a logged-in auth user with a valid email.';
  end if;

  insert into public.users as pu(id, email, full_name, role, is_active)
  values (v_auth.id, v_auth.email, v_auth.full_name, 'Viewer', true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(pu.full_name, ''), excluded.full_name),
        is_active = true,
        updated_at = now()
  returning pu.id, pu.full_name, pu.email, pu.role::text
  into v_public;

  id := v_public.id;
  full_name := v_public.full_name;
  email := v_public.email;
  role := v_public.role;
  return next;
end;
$$;

-- Seed workflow-role aliases from existing users. This is a text mapping table and does not alter users.role.
insert into public.approval_user_roles(project_id, user_id, role_name, is_active)
select null, u.id, u.role::text, true
from public.users u
where nullif(trim(coalesce(u.role::text,'')), '') is not null
  and not exists (
    select 1
    from public.approval_user_roles aur
    where aur.project_id is null
      and aur.user_id = u.id
      and lower(aur.role_name) = lower(u.role::text)
  );

-- =========================================================
-- C) Prevent deleting released/approved workflow invoices.
-- =========================================================

create or replace function public.v139_prevent_non_draft_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(old.status, 'Draft'))) <> 'draft' or coalesce(old.approval_locked, false) = true then
    raise exception 'Only Draft subcontractor invoices can be deleted. Current status: %', old.status;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_v139_prevent_non_draft_invoice_delete on public.subcontractor_invoices;
create trigger trg_v139_prevent_non_draft_invoice_delete
before delete on public.subcontractor_invoices
for each row execute function public.v139_prevent_non_draft_invoice_delete();

-- =========================================================
-- D) Approval status updater with step-specific invoice statuses.
-- =========================================================

create or replace function public.approval_update_transaction_status(
  p_record_table text,
  p_record_id uuid,
  p_approval_status text,
  p_workflow_status text,
  p_request_id uuid default null,
  p_locked boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_certificate_status text;
  v_current_role text;
  v_current_type text;
begin
  if p_record_table = 'subcontractor_invoices' then
    if p_request_id is not null and p_approval_status in ('pending_review','pending_approval') then
      select lower(coalesce(a.assigned_role_name,'')), lower(coalesce(a.step_type,''))
        into v_current_role, v_current_type
      from public.approval_requests r
      join public.approval_request_assignments a
        on a.request_id = r.id
       and a.step_order = r.current_step_order
       and a.status = 'pending'
      where r.id = p_request_id
      order by a.created_at
      limit 1;
    end if;

    v_certificate_status := case
      when p_approval_status = 'pending_review' and coalesce(v_current_role,'') like '%finance%' then 'Pending Finance Review'
      when p_approval_status = 'pending_review' then 'Pending Review'
      when p_approval_status = 'pending_approval' and (coalesce(v_current_role,'') like '%technical office%' or coalesce(v_current_role,'') like '%technical engineer%') then 'Pending Technical Office Approval'
      when p_approval_status = 'pending_approval' and coalesce(v_current_role,'') like '%ceo%' then 'Pending CEO Approval'
      when p_approval_status = 'pending_approval' then 'Pending Approval'
      when p_approval_status = 'approved' then coalesce(nullif(p_workflow_status,''), 'Approved')
      when p_approval_status = 'returned' then 'Returned to Originator'
      when p_approval_status = 'rejected' then 'Rejected'
      when p_approval_status = 'missing_configuration' then 'Missing Configuration'
      when p_approval_status = 'cancelled' then 'Cancelled'
      when p_approval_status = 'released' then 'Released'
      else coalesce(nullif(p_workflow_status,''), p_approval_status, 'Draft')
    end;

    update public.subcontractor_invoices
       set status = v_certificate_status,
           approval_status = p_approval_status,
           workflow_status = coalesce(nullif(p_workflow_status,''), v_certificate_status),
           approval_request_id = coalesce(p_request_id, approval_request_id),
           approval_locked = p_locked,
           updated_at = now()
     where id = p_record_id;
    return;
  end if;

  if p_record_table not in (
    'procurement_records',
    'inventory_grn_lines',
    'inventory_issue_lines',
    'finance_records',
    'client_invoices',
    'variations'
  ) then
    return;
  end if;

  execute format(
    'update public.%I
        set approval_status = $1,
            workflow_status = case when exists (
              select 1 from information_schema.columns
              where table_schema = ''public'' and table_name = $5 and column_name = ''workflow_status''
            ) then $2 else workflow_status end,
            approval_request_id = coalesce($3, approval_request_id),
            approval_locked = $4,
            updated_at = now()
      where id = $6',
    p_record_table
  ) using p_approval_status, p_workflow_status, p_request_id, p_locked, p_record_table, p_record_id;
exception
  when undefined_column then
    begin
      execute format(
        'update public.%I
            set approval_status = $1,
                approval_request_id = coalesce($2, approval_request_id),
                approval_locked = $3,
                updated_at = now()
          where id = $4',
        p_record_table
      ) using p_approval_status, p_request_id, p_locked, p_record_id;
    exception when undefined_column then
      null;
    end;
  when undefined_table then
    null;
end;
$$;

-- =========================================================
-- E) CEO payment decision helper.
-- =========================================================

create or replace function public.v139_finalize_subcontractor_invoice_payment_decision(
  p_invoice_id uuid,
  p_request_id uuid,
  p_released_amount numeric default null,
  p_payment_decision text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_net numeric := 0;
  v_release numeric := null;
  v_decision text := lower(trim(coalesce(p_payment_decision, '')));
  v_status text := 'Approved';
begin
  select * into v_invoice
  from public.subcontractor_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Subcontractor invoice not found for CEO payment decision.';
  end if;

  v_net := coalesce(v_invoice.net_payable, v_invoice.net_amount, v_invoice.gross_amount, 0);

  if v_decision in ('hold', 'hold payment', 'payment held', 'payment_hold') then
    v_release := 0;
    v_status := 'Payment Held';
    v_decision := 'Hold Payment';
  elsif v_decision in ('partial', 'approve partial amount', 'partial release', 'partially released') then
    if p_released_amount is null then
      raise exception 'Released amount is required for partial CEO payment approval.';
    end if;
    if p_released_amount < 0 then
      raise exception 'Released amount cannot be negative.';
    end if;
    if p_released_amount > v_net then
      raise exception 'Released amount (%) cannot exceed net certificate amount (%).', p_released_amount, v_net;
    end if;
    v_release := p_released_amount;
    v_status := case when v_release = 0 then 'Payment Held' when v_release < v_net then 'Partially Released' else 'Approved' end;
    v_decision := case when v_status = 'Partially Released' then 'Approve Partial Amount' when v_status = 'Payment Held' then 'Hold Payment' else 'Approve Full Amount' end;
  else
    v_release := coalesce(p_released_amount, v_net);
    if v_release < 0 then
      raise exception 'Released amount cannot be negative.';
    end if;
    if v_release > v_net then
      raise exception 'Released amount (%) cannot exceed net certificate amount (%).', v_release, v_net;
    end if;
    v_status := case when v_release = 0 then 'Payment Held' when v_release < v_net then 'Partially Released' else 'Approved' end;
    v_decision := case when v_status = 'Partially Released' then 'Approve Partial Amount' when v_status = 'Payment Held' then 'Hold Payment' else 'Approve Full Amount' end;
  end if;

  update public.subcontractor_invoices
     set approved_certificate_amount = v_net,
         released_payment_amount = v_release,
         total_released_payments = v_release,
         ceo_released_amount = v_release,
         remaining_unpaid_balance = greatest(v_net - v_release, 0),
         remaining_unreleased_amount = greatest(v_net - v_release, 0),
         payment_decision = v_decision,
         status = v_status,
         approval_status = 'approved',
         workflow_status = v_status,
         approval_request_id = coalesce(p_request_id, approval_request_id),
         approval_locked = true,
         updated_at = now()
   where id = p_invoice_id;

  return v_status;
end;
$$;

-- =========================================================
-- F) Submission engine: freezes real users/emails and excludes originator.
-- =========================================================

create or replace function public.approval_submit_transaction(
  p_module text,
  p_action text,
  p_record_table text,
  p_record_id uuid,
  p_project_id uuid default null,
  p_amount numeric default null,
  p_submitted_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
  v_request_id uuid;
  v_step public.approval_matrix_steps%rowtype;
  v_user record;
  v_submitter record;
  v_user_count int;
  v_missing text := '';
  v_current_step integer;
  v_current_type text;
  v_initial_status text;
  v_rule_errors text[];
begin
  select null::uuid as id, null::text as full_name, null::text as email into v_submitter;

  if p_submitted_by is not null then
    select u.id, u.full_name, u.email into v_submitter
    from public.v139_get_or_create_public_user(p_submitted_by) u;
  end if;

  update public.approval_requests
     set status = 'cancelled', updated_at = now()
   where record_table = p_record_table
     and record_id = p_record_id
     and status in ('draft','pending_review','pending_approval','returned','rejected','missing_configuration');

  select * into v_rule from public.approval_find_rule(p_module, p_action, p_project_id, p_amount);

  if v_rule.id is null then
    insert into public.approval_requests(
      module, action, record_table, record_id, project_id, amount, rule_id, status,
      submitted_by, submitted_by_name, submitted_by_email,
      originator_user_id, originator_name, originator_email,
      submitted_at, configuration_message
    ) values (
      p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount, null, 'missing_configuration',
      p_submitted_by, v_submitter.full_name, v_submitter.email,
      p_submitted_by, v_submitter.full_name, v_submitter.email,
      now(), 'No approval matrix rule found for this transaction.'
    ) returning id into v_request_id;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (v_request_id, p_record_table, p_record_id, 'Released / Submitted', 'draft', 'missing_configuration', p_submitted_by, v_submitter.full_name, v_submitter.email, 'No approval matrix rule found for this transaction.');

    perform public.approval_update_transaction_status(p_record_table, p_record_id, 'missing_configuration', 'Missing Configuration', v_request_id, false);
    return v_request_id;
  end if;

  insert into public.approval_requests(
    module, action, record_table, record_id, project_id, amount, rule_id, status,
    submitted_by, submitted_by_name, submitted_by_email,
    originator_user_id, originator_name, originator_email,
    submitted_at
  ) values (
    p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount, v_rule.id, 'draft',
    p_submitted_by, v_submitter.full_name, v_submitter.email,
    p_submitted_by, v_submitter.full_name, v_submitter.email,
    now()
  ) returning id into v_request_id;

  for v_step in
    select * from public.approval_matrix_steps where rule_id = v_rule.id order by step_order, created_at
  loop
    v_user_count := 0;

    if v_step.assignee_type = 'user' and v_step.user_id is not null then
      select u.id, u.full_name, u.email, u.role::text into v_user
      from public.users u
      where u.id = v_step.user_id and coalesce(u.is_active, true) = true;

      if v_user.id is not null then
        if p_submitted_by is not null and (v_user.id = p_submitted_by or lower(coalesce(v_user.email,'')) = lower(coalesce(v_submitter.email,''))) then
          if v_step.is_required then
            v_missing := concat_ws(E'\n', nullif(v_missing,''), 'Maker-checker rule: creator cannot be assigned to approve/review step ' || v_step.step_order || ' (' || coalesce(v_user.email, v_user.full_name, v_step.user_id::text) || ').');
          end if;
        elsif nullif(trim(coalesce(v_user.email,'')), '') is null then
          if v_step.is_required then
            v_missing := concat_ws(E'\n', nullif(v_missing,''), 'Specific user for step ' || v_step.step_order || ' has no email.');
          end if;
        else
          insert into public.approval_request_assignments(
            request_id, matrix_step_id, step_order, step_type,
            assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name, assigned_user_email,
            decision_mode, is_required
          ) values (
            v_request_id, v_step.id, v_step.step_order, v_step.step_type,
            v_step.role_id, v_step.role_name, v_user.id, v_user.full_name, v_user.email,
            v_step.decision_mode, v_step.is_required
          );
          v_user_count := 1;
        end if;
      end if;
    else
      for v_user in
        with variants as (
          select lower(x) as role_name from unnest(public.approval_role_variants(v_step.role_name)) x
        )
        select distinct
          u.id,
          u.full_name,
          u.email,
          coalesce(aur.role_name, pu.role::text, u.role::text) as matched_role
        from public.users u
        left join public.project_users pu
          on pu.user_id = u.id
         and (p_project_id is null or pu.project_id = p_project_id)
        left join public.approval_user_roles aur
          on aur.user_id = u.id
         and coalesce(aur.is_active, true) = true
         and (aur.project_id = p_project_id or aur.project_id is null)
        where coalesce(u.is_active, true) = true
          and nullif(trim(coalesce(u.email,'')), '') is not null
          and (
            lower(u.role::text) in (select role_name from variants)
            or lower(coalesce(pu.role::text,'')) in (select role_name from variants)
            or lower(coalesce(aur.role_name,'')) in (select role_name from variants)
          )
          and not (
            p_submitted_by is not null
            and (u.id = p_submitted_by or lower(coalesce(u.email,'')) = lower(coalesce(v_submitter.email,'')))
          )
        order by u.full_name
      loop
        insert into public.approval_request_assignments(
          request_id, matrix_step_id, step_order, step_type,
          assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name, assigned_user_email,
          decision_mode, is_required
        ) values (
          v_request_id, v_step.id, v_step.step_order, v_step.step_type,
          v_step.role_id, coalesce(v_step.role_name, v_user.matched_role), v_user.id, v_user.full_name, v_user.email,
          v_step.decision_mode, v_step.is_required
        );
        v_user_count := v_user_count + 1;
      end loop;
    end if;

    if v_user_count = 0 then
      insert into public.approval_request_assignments(
        request_id, matrix_step_id, step_order, step_type,
        assigned_role_id, assigned_role_name, assigned_user_id, assigned_user_name, assigned_user_email,
        decision_mode, is_required, comments
      ) values (
        v_request_id, v_step.id, v_step.step_order, v_step.step_type,
        v_step.role_id, v_step.role_name, null, null, null,
        v_step.decision_mode, v_step.is_required,
        'No active non-originator user/email resolved for this role/user at release time.'
      );
      if v_step.is_required then
        v_missing := concat_ws(E'\n', nullif(v_missing,''), 'No active non-originator user assigned for role/user: ' || coalesce(v_step.role_name, v_step.user_email, v_step.user_id::text, 'Unknown') || '.');
      end if;
    end if;
  end loop;

  if not exists (select 1 from public.approval_request_assignments where request_id = v_request_id) then
    v_missing := concat_ws(E'\n', nullif(v_missing,''), 'Approval rule has no steps.');
  end if;

  v_rule_errors := public.approval_validate_matrix_rule(v_rule.id);
  if coalesce(array_length(v_rule_errors, 1), 0) > 0 then
    v_missing := concat_ws(E'\n', nullif(v_missing,''), array_to_string(v_rule_errors, E'\n'));
  end if;

  select a.step_order, a.step_type into v_current_step, v_current_type
  from public.approval_request_assignments a
  where a.request_id = v_request_id
    and a.is_required = true
    and a.status = 'pending'
    and a.assigned_user_id is not null
    and nullif(trim(coalesce(a.assigned_user_email,'')), '') is not null
  order by a.step_order asc, case a.step_type when 'review' then 0 else 1 end
  limit 1;

  if nullif(v_missing, '') is not null then
    update public.approval_requests
       set status = 'missing_configuration', current_step_order = v_current_step, configuration_message = v_missing
     where id = v_request_id;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (v_request_id, p_record_table, p_record_id, 'Released / Submitted', 'draft', 'missing_configuration', p_submitted_by, v_submitter.full_name, v_submitter.email, v_missing);

    perform public.approval_update_transaction_status(p_record_table, p_record_id, 'missing_configuration', 'Missing Configuration', v_request_id, false);
    return v_request_id;
  end if;

  v_initial_status := case when v_current_type = 'review' then 'pending_review' else 'pending_approval' end;

  update public.approval_requests
     set status = v_initial_status, current_step_order = v_current_step
   where id = v_request_id;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
  values (v_request_id, p_record_table, p_record_id, 'Released / Submitted', 'draft', v_initial_status, p_submitted_by, v_submitter.full_name, v_submitter.email, 'Approval assignments frozen as actual users/emails from matrix rule: ' || v_rule.rule_name);

  perform public.approval_update_transaction_status(
    p_record_table,
    p_record_id,
    v_initial_status,
    case when v_initial_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
    v_request_id,
    true
  );

  return v_request_id;
end;
$$;

-- =========================================================
-- G) Action engine: assigned email only; reason required for negative actions.
-- =========================================================

create or replace function public.approval_act_on_current_step(
  p_request_id uuid,
  p_action text,
  p_comments text default null,
  p_actor_user_id uuid default auth.uid(),
  p_actor_name text default null,
  p_actor_email text default null,
  p_released_amount numeric default null,
  p_payment_decision text default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
  v_assignment public.approval_request_assignments%rowtype;
  v_old_status text;
  v_new_status text;
  v_done_status text;
  v_next_step integer;
  v_next_type text;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_actor record;
  v_actor_email text;
  v_actor_name text;
  v_final_status text;
begin
  select * into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found.';
  end if;

  if v_request.status not in ('pending_review','pending_approval') then
    raise exception 'Approval request is not pending. Current status: %', v_request.status;
  end if;

  if v_action not in ('review','approve','return','reject','not_approved','not approved') then
    raise exception 'Unsupported approval action: %', p_action;
  end if;

  if v_action = 'not approved' then
    v_action := 'not_approved';
  end if;

  select null::uuid as id, null::text as full_name, null::text as email, null::text as role into v_actor;

  if p_actor_user_id is not null then
    select u.id, u.full_name, u.email, u.role into v_actor
    from public.v139_get_or_create_public_user(p_actor_user_id) u;
  end if;

  v_actor_email := lower(nullif(trim(coalesce(p_actor_email, v_actor.email, case when p_actor_name like '%@%' then p_actor_name else null end, '')), ''));
  v_actor_name := coalesce(nullif(trim(v_actor.full_name), ''), nullif(trim(case when coalesce(p_actor_name,'') not like '%@%' then p_actor_name else '' end), ''), v_actor_email);

  if v_actor_email is null then
    raise exception 'Logged-in user email is required for approval actions.';
  end if;

  if v_request.originator_user_id is not null and p_actor_user_id is not null and v_request.originator_user_id = p_actor_user_id then
    raise exception 'Maker-checker rule: the certificate originator cannot review, approve, release payment, or approve payment for the same certificate.';
  end if;

  if v_request.originator_email is not null and lower(v_request.originator_email) = v_actor_email then
    raise exception 'Maker-checker rule: the certificate originator cannot review, approve, release payment, or approve payment for the same certificate.';
  end if;

  select * into v_assignment
  from public.approval_request_assignments a
  where a.request_id = p_request_id
    and a.step_order = v_request.current_step_order
    and a.status = 'pending'
    and lower(coalesce(a.assigned_user_email,'')) = v_actor_email
  order by a.created_at
  limit 1;

  if not found then
    raise exception 'You are not assigned to the current approval step by frozen user email.';
  end if;

  if v_action in ('return','reject','not_approved') and nullif(trim(coalesce(p_comments,'')), '') is null then
    raise exception 'Reason is required for Return / Not Approved / Reject.';
  end if;

  if v_assignment.step_type = 'review' and v_action = 'approve' then
    raise exception 'Current step is a Review step. Use Review or Not Approved.';
  end if;
  if v_assignment.step_type = 'approval' and v_action = 'review' then
    raise exception 'Current step is an Approval step. Use Approve or Not Approved.';
  end if;

  v_old_status := v_request.status;

  if v_action = 'reject' then
    update public.approval_request_assignments
       set status = 'rejected', action_by = p_actor_user_id, action_at = now(), comments = p_comments
     where id = v_assignment.id;

    update public.approval_request_assignments
       set status = 'cancelled', comments = coalesce(comments, 'Cancelled after rejection.')
     where request_id = p_request_id and status = 'pending' and id <> v_assignment.id;

    update public.approval_requests
       set status = 'rejected', current_step_order = null, rejected_at = now()
     where id = p_request_id
     returning * into v_request;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, 'Rejected / Returned to Originator', v_old_status, 'rejected', p_actor_user_id, v_actor_name, v_actor_email, p_comments);

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'rejected', 'Rejected', p_request_id, false);
    if v_request.record_table = 'subcontractor_invoices' then
      update public.subcontractor_invoices set rejected_reason = p_comments, returned_reason = null, approval_locked = false where id = v_request.record_id;
    end if;
    return v_request;
  end if;

  if v_action in ('return','not_approved') then
    update public.approval_request_assignments
       set status = 'returned', action_by = p_actor_user_id, action_at = now(), comments = p_comments
     where id = v_assignment.id;

    update public.approval_request_assignments
       set status = 'cancelled', comments = coalesce(comments, 'Cancelled because the current cycle was returned to originator.')
     where request_id = p_request_id and status = 'pending' and id <> v_assignment.id;

    update public.approval_requests
       set status = 'returned', current_step_order = null, returned_at = now()
     where id = p_request_id
     returning * into v_request;

    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, 'Not Approved / Returned to Originator', v_old_status, 'returned', p_actor_user_id, v_actor_name, v_actor_email, p_comments);

    perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'returned', 'Returned to Originator', p_request_id, false);
    if v_request.record_table = 'subcontractor_invoices' then
      update public.subcontractor_invoices set returned_reason = p_comments, rejected_reason = null, approval_locked = false where id = v_request.record_id;
    end if;
    return v_request;
  end if;

  v_done_status := case when v_assignment.step_type = 'review' then 'reviewed' else 'approved' end;

  update public.approval_request_assignments
     set status = v_done_status, action_by = p_actor_user_id, action_at = now(), comments = p_comments
   where id = v_assignment.id;

  if v_assignment.decision_mode = 'any' then
    update public.approval_request_assignments
       set status = 'skipped', action_by = p_actor_user_id, action_at = now(), comments = 'Skipped because decision mode is Any One.'
     where request_id = p_request_id
       and step_order = v_assignment.step_order
       and id <> v_assignment.id
       and status = 'pending';
  elsif exists (
    select 1 from public.approval_request_assignments
    where request_id = p_request_id
      and step_order = v_assignment.step_order
      and is_required = true
      and status = 'pending'
  ) then
    insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
    values (p_request_id, v_request.record_table, v_request.record_id, initcap(v_action), v_old_status, v_old_status, p_actor_user_id, v_actor_name, v_actor_email, p_comments);

    select * into v_request from public.approval_requests where id = p_request_id;
    return v_request;
  end if;

  select a.step_order, a.step_type into v_next_step, v_next_type
  from public.approval_request_assignments a
  where a.request_id = p_request_id
    and a.is_required = true
    and a.status = 'pending'
    and a.assigned_user_id is not null
    and nullif(trim(coalesce(a.assigned_user_email,'')), '') is not null
  order by a.step_order asc, case a.step_type when 'review' then 0 else 1 end
  limit 1;

  if v_next_step is null then
    v_new_status := 'approved';
    update public.approval_requests
       set status = 'approved', current_step_order = null, approved_at = now()
     where id = p_request_id
     returning * into v_request;

    if v_request.record_table = 'subcontractor_invoices' then
      v_final_status := public.v139_finalize_subcontractor_invoice_payment_decision(v_request.record_id, p_request_id, p_released_amount, p_payment_decision);
    else
      perform public.approval_update_transaction_status(v_request.record_table, v_request.record_id, 'approved', 'Approved', p_request_id, true);
      v_final_status := 'Approved';
    end if;
  else
    v_new_status := case when v_next_type = 'review' then 'pending_review' else 'pending_approval' end;
    update public.approval_requests
       set status = v_new_status, current_step_order = v_next_step
     where id = p_request_id
     returning * into v_request;

    perform public.approval_update_transaction_status(
      v_request.record_table,
      v_request.record_id,
      v_new_status,
      case when v_new_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
      p_request_id,
      true
    );
    v_final_status := v_new_status;
  end if;

  insert into public.approval_audit_log(request_id, record_table, record_id, action, old_status, new_status, actor_user_id, actor_name, actor_email, comments)
  values (p_request_id, v_request.record_table, v_request.record_id, case when v_done_status = 'reviewed' then 'Reviewed' else 'Approved' end, v_old_status, coalesce(v_final_status, v_new_status), p_actor_user_id, v_actor_name, v_actor_email, p_comments);

  return v_request;
end;
$$;

-- =========================================================
-- H) Release entrypoint: Draft/Returned/Rejected only, then new cycle from step 1.
-- =========================================================

create or replace function public.certificate_release_for_approval(
  p_invoice_id uuid,
  p_released_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_user record;
  v_request_id uuid;
  v_status text;
  v_release_user_id uuid := coalesce(p_released_by, auth.uid());
begin
  select * into v_invoice
  from public.subcontractor_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Subcontractor invoice not found.';
  end if;

  select u.id, u.full_name, u.email into v_user
  from public.v139_get_or_create_public_user(v_release_user_id) u;

  if v_user.id is null or nullif(trim(coalesce(v_user.email,'')), '') is null then
    raise exception 'Release requires a logged-in user with a valid email.';
  end if;

  v_status := lower(trim(coalesce(v_invoice.status, 'Draft')));
  if v_status not in ('draft','returned','returned to originator','missing configuration','rejected') then
    raise exception 'Only Draft, Returned, Rejected, or Missing Configuration subcontractor invoices can be released/resubmitted. Current status: %', v_invoice.status;
  end if;

  update public.subcontractor_invoices
     set originator_user_id = coalesce(originator_user_id, v_user.id),
         originator_name = coalesce(originator_name, v_user.full_name),
         originator_email = coalesce(originator_email, v_user.email),
         released_by = v_user.id,
         released_by_name = v_user.full_name,
         released_by_email = v_user.email,
         released_at = now(),
         status = 'Released',
         approval_status = 'released',
         workflow_status = 'Released',
         approval_locked = true,
         returned_reason = null,
         rejected_reason = null,
         payment_decision = null,
         approved_certificate_amount = null,
         released_payment_amount = null,
         total_released_payments = null,
         ceo_released_amount = null,
         remaining_unpaid_balance = null,
         remaining_unreleased_amount = null,
         updated_at = now()
   where id = p_invoice_id;

  v_request_id := public.approval_submit_transaction(
    'Subcontractor',
    'Subcontractor Certificate',
    'subcontractor_invoices',
    p_invoice_id,
    v_invoice.project_id,
    coalesce(v_invoice.net_payable, v_invoice.net_amount, v_invoice.gross_amount, 0),
    v_user.id
  );

  update public.subcontractor_invoices
     set approval_request_id = v_request_id,
         updated_at = now()
   where id = p_invoice_id;

  return v_request_id;
end;
$$;

-- Backward-compatible alias: external code can call the clearer V139 name.
create or replace function public.release_subcontractor_invoice_for_approval(
  p_invoice_id uuid,
  p_released_by uuid default auth.uid()
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.certificate_release_for_approval(p_invoice_id, p_released_by);
$$;

-- Make the V139 default rule active/available while preserving the old action string used by existing code.
do $$
declare
  v_rule_id uuid;
  v_created_by uuid;
begin
  select id into v_created_by from public.users order by created_at limit 1;

  select id into v_rule_id
  from public.approval_matrix_rules
  where rule_name = 'Subcontractor Invoice Release'
    and module = 'Subcontractor'
    and action = 'Subcontractor Certificate'
    and project_id is null
  limit 1;

  if v_rule_id is null then
    insert into public.approval_matrix_rules(rule_name,module,action,project_id,min_amount,max_amount,priority,is_active,created_by)
    values('Subcontractor Invoice Release','Subcontractor','Subcontractor Certificate',null,null,null,20,true,v_created_by)
    returning id into v_rule_id;
  else
    update public.approval_matrix_rules set is_active = true, priority = 20 where id = v_rule_id;
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and step_type='approval' and role_name='Technical Office Manager') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,1,'approval','role','Technical Office Manager','any',true);
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and step_type='review' and role_name='Finance') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,2,'review','role','Finance','any',true);
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and step_type='approval' and role_name='CEO') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,3,'approval','role','CEO','any',true);
  end if;
end $$;

comment on function public.v139_get_or_create_public_user(uuid) is 'V139: syncs auth.users to public.users without altering users.role enum/check values.';
comment on function public.certificate_release_for_approval(uuid, uuid) is 'V139 Fix: Release a Draft/Returned/Rejected subcontractor invoice and start a frozen user/email approval workflow.';
comment on function public.v139_finalize_subcontractor_invoice_payment_decision(uuid, uuid, numeric, text) is 'V139: applies CEO full/partial/hold payment decision to a subcontractor invoice.';
