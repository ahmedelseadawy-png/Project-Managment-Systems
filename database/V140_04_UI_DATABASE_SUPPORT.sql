-- ============================================================
-- V140_04_UI_DATABASE_SUPPORT.sql
-- Construction ERP — UI Database Support
-- Safe/additive database support for branding, permissions,
-- subcontractor contracts/terms, procurement quotations,
-- and subcontractor dashboard data.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.v140_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Company branding/profile
create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  company_name_en text not null default 'BuildCore ERP',
  company_name_ar text null,
  logo_url text null,
  logo_storage_path text null,
  logo_fallback_url text not null default '/assets/logo.png',
  phone text null,
  email text null,
  address text null,
  tax_vat_registration_no text null,
  commercial_register_no text null,
  pdf_footer_text text null default 'BuildCore ERP · All rights reserved · Confidential',
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_company_profile_one_active on public.company_profile(is_active) where is_active = true;
drop trigger if exists trg_company_profile_updated_at on public.company_profile;
create trigger trg_company_profile_updated_at before update on public.company_profile for each row execute function public.v140_touch_updated_at();
insert into public.company_profile(company_name_en, company_name_ar, logo_fallback_url, is_active)
select 'BuildCore ERP','بيلدكور للإنشاءات','/assets/logo.png',true
where not exists (select 1 from public.company_profile where is_active = true);

insert into storage.buckets (id, name, public) values ('company-assets','company-assets',true)
on conflict (id) do update set public = true;
drop policy if exists company_assets_select_public on storage.objects;
create policy company_assets_select_public on storage.objects for select using (bucket_id = 'company-assets');
drop policy if exists company_assets_insert_authenticated on storage.objects;
create policy company_assets_insert_authenticated on storage.objects for insert to authenticated with check (bucket_id = 'company-assets');
drop policy if exists company_assets_update_authenticated on storage.objects;
create policy company_assets_update_authenticated on storage.objects for update to authenticated using (bucket_id = 'company-assets') with check (bucket_id = 'company-assets');
drop policy if exists company_assets_delete_authenticated on storage.objects;
create policy company_assets_delete_authenticated on storage.objects for delete to authenticated using (bucket_id = 'company-assets');

create or replace function public.v140_save_company_profile(
  p_company_name_en text,
  p_company_name_ar text default null,
  p_logo_url text default null,
  p_logo_storage_path text default null,
  p_logo_fallback_url text default '/assets/logo.png',
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_tax_vat_registration_no text default null,
  p_commercial_register_no text default null,
  p_pdf_footer_text text default null
) returns public.company_profile
language plpgsql security definer set search_path = public as $$
declare v_row public.company_profile%rowtype;
begin
  update public.company_profile set is_active=false, updated_by=auth.uid(), updated_at=now() where is_active=true;
  insert into public.company_profile(company_name_en, company_name_ar, logo_url, logo_storage_path, logo_fallback_url, phone, email, address, tax_vat_registration_no, commercial_register_no, pdf_footer_text, is_active, created_by, updated_by)
  values(coalesce(nullif(trim(p_company_name_en),''),'BuildCore ERP'), p_company_name_ar, p_logo_url, p_logo_storage_path, coalesce(nullif(trim(p_logo_fallback_url),''),'/assets/logo.png'), p_phone, p_email, p_address, p_tax_vat_registration_no, p_commercial_register_no, coalesce(p_pdf_footer_text,'BuildCore ERP · All rights reserved · Confidential'), true, auth.uid(), auth.uid())
  returning * into v_row;
  return v_row;
end; $$;

-- Module registry + permissions
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
('home','Home','Main',1,true),('assigned-approvals','Assigned Approvals','Main',2,true),('approval-history','Approval History','Main',3,true),('project-structure','Project Structure','Project',10,true),('boq','BOQ','Project',20,true),('bbs-qs','BBS & QS','Project',30,true),('subcontractor-dashboard','Subcontractor Dashboard','Project',35,true),('subcontractor-contracts','Subcontractor Contracts','Project',40,true),('subcontractor-invoices','Subcontractor Invoices','Project',50,true),('material-requests','Material Requests','Project',60,true),('procurement','Procurement','Project',70,true),('procurement-quotations','Procurement Quotations','Project',71,true),('rfis','RFIs','Project',80,true),('daily-reports','Daily Reports','Project',90,true),('site-progress','Site Progress','Project',100,true),('finance','Finance','Finance',110,true),('reports','Reports','Reports',120,true),('company-branding','Company Branding','Settings',200,true),('permissions','Permissions','Settings',210,true),('settings','Settings','Settings',220,true)
on conflict(module_key) do update set module_label=excluded.module_label,module_category=excluded.module_category,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();

create table if not exists public.user_project_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  access_level text not null default 'member' check (access_level in ('viewer','member','manager','admin','owner')),
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_user_project_access_active on public.user_project_access(user_id,project_id) where is_active = true;

create table if not exists public.user_module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  module_key text not null references public.erp_modules(module_key) on delete cascade,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  can_export boolean not null default false,
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_user_module_permissions_global on public.user_module_permissions(user_id, lower(module_key)) where project_id is null and is_active = true;
create unique index if not exists uq_user_module_permissions_project on public.user_module_permissions(project_id,user_id,lower(module_key)) where project_id is not null and is_active = true;

-- Subcontractor contracts and terms
create table if not exists public.subcontractor_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null,
  subcontractor_id uuid null,
  subcontractor_name text null,
  contract_no text not null,
  contract_title text null,
  status text not null default 'Draft' check (status in ('Draft','Active','Suspended','Completed','Cancelled','Closed')),
  project_structure_id uuid null,
  structure_name text null,
  scope_of_work text null,
  contract_date date null,
  start_date date null,
  end_date date null,
  currency text not null default 'EGP',
  contract_value numeric(18,3) not null default 0,
  linked_boq_reference text null,
  linked_breakdown_reference text null,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_subcontractor_contracts_project_no on public.subcontractor_contracts(project_id, lower(contract_no));

create table if not exists public.subcontractor_contract_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.subcontractor_contracts(id) on delete cascade,
  scope_of_work text null,
  contract_duration_days integer null,
  start_date date null,
  completion_date date null,
  payment_terms text null,
  advance_payment_type text not null default 'none' check (advance_payment_type in ('none','percentage','fixed_amount')),
  advance_payment_value numeric(18,3) not null default 0,
  advance_recovery_method text null,
  advance_recovery_percent numeric(9,3) null,
  retention_percent numeric(9,3) not null default 0,
  retention_cap numeric(18,3) null,
  retention_release_rules text null,
  vat_tax_percent numeric(9,3) null,
  tax_terms text null,
  insurance_requirements text null,
  performance_bond text null,
  delay_penalty_rate numeric(9,3) null,
  max_delay_penalty_cap numeric(18,3) null,
  defects_liability_period text null,
  warranty_period text null,
  materials_supplied_by_main_contractor text null,
  back_charges_rules text null,
  deductions_rules text null,
  variation_approval_rules text null,
  extra_work_approval_rules text null,
  claims_rules text null,
  termination_terms text null,
  cancellation_terms text null,
  required_documents text null,
  attachments_notes text null,
  special_conditions text null,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_subcontractor_contract_terms_contract on public.subcontractor_contract_terms(contract_id);

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

alter table if exists public.subcontractor_invoices add column if not exists contract_id uuid null, add column if not exists contract_no text null, add column if not exists advance_recovery_amount numeric(18,3) null, add column if not exists retention_release_amount numeric(18,3) null, add column if not exists contract_terms_snapshot jsonb null;
create index if not exists idx_subcontractor_invoices_contract on public.subcontractor_invoices(contract_id);

-- Procurement quotations
create table if not exists public.procurement_quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null,
  procurement_record_id uuid null,
  supplier_id uuid null,
  supplier_name text not null,
  quotation_no text null,
  quotation_date date null,
  validity_until date null,
  currency text not null default 'EGP',
  offer_amount numeric(18,3) not null default 0,
  unit_rate numeric(18,3) null,
  delivery_days integer null,
  payment_terms text null,
  comparison_notes text null,
  supplier_notes text null,
  is_selected boolean not null default false,
  selection_reason text null,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Selected','Rejected','Expired','Cancelled')),
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.procurement_quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.procurement_quotations(id) on delete cascade,
  procurement_item_id uuid null,
  boq_item_id uuid null,
  description text not null,
  unit text null,
  quantity numeric(18,3) not null default 0,
  unit_rate numeric(18,3) not null default 0,
  amount numeric(18,3) generated always as (quantity * unit_rate) stored,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists public.procurement_records add column if not exists selected_quotation_id uuid null, add column if not exists selected_supplier_name text null, add column if not exists quotation_selection_reason text null, add column if not exists quotation_status text null;

-- Subcontractor dashboard data
create table if not exists public.subcontractor_work_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null,
  contract_id uuid null references public.subcontractor_contracts(id) on delete set null,
  subcontractor_id uuid null,
  subcontractor_name text null,
  trade text null,
  structure_id uuid null,
  building_code text null,
  building_name text null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','paused','completed','delayed','cancelled')),
  progress_percent numeric(9,3) not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
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
create table if not exists public.subcontractor_progress_updates (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.subcontractor_work_assignments(id) on delete cascade,
  project_id uuid null,
  contract_id uuid null,
  subcontractor_id uuid null,
  update_date date not null default current_date,
  progress_percent numeric(9,3) not null check (progress_percent >= 0 and progress_percent <= 100),
  status text null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create or replace view public.v_subcontractor_dashboard as
with contract_totals as (
  select project_id, subcontractor_id, coalesce(subcontractor_name,'Unassigned') subcontractor_name, count(*) contracts_count, sum(coalesce(contract_value,0)) contract_value
  from public.subcontractor_contracts group by project_id, subcontractor_id, coalesce(subcontractor_name,'Unassigned')
), assignment_totals as (
  select project_id, subcontractor_id, coalesce(subcontractor_name,'Unassigned') subcontractor_name, coalesce(trade,'General') trade, count(*) assigned_buildings,
  count(*) filter(where status='in_progress') working_buildings, count(*) filter(where status='not_started') not_started_buildings,
  count(*) filter(where status='completed') completed_buildings, count(*) filter(where status='paused') paused_buildings, count(*) filter(where status='delayed') delayed_buildings,
  round(avg(coalesce(progress_percent,0)),3) progress_percent
  from public.subcontractor_work_assignments group by project_id, subcontractor_id, coalesce(subcontractor_name,'Unassigned'), coalesce(trade,'General')
), invoice_totals as (
  select c.project_id, c.subcontractor_id, coalesce(c.subcontractor_name,'Unassigned') subcontractor_name,
  sum(coalesce(i.net_payable,i.net_amount,i.gross_amount,0)) certified_amount, sum(coalesce(i.released_payment_amount,i.ceo_released_amount,0)) paid_amount,
  count(*) filter(where coalesce(i.status,'') not in ('Approved','Paid','Cancelled','Rejected')) open_invoices
  from public.subcontractor_contracts c left join public.subcontractor_invoices i on i.contract_id=c.id
  group by c.project_id, c.subcontractor_id, coalesce(c.subcontractor_name,'Unassigned')
)
select coalesce(a.project_id,ct.project_id,it.project_id) project_id, coalesce(a.subcontractor_id,ct.subcontractor_id,it.subcontractor_id) subcontractor_id,
coalesce(a.subcontractor_name,ct.subcontractor_name,it.subcontractor_name,'Unassigned') subcontractor_name, coalesce(a.trade,'General') trade,
coalesce(a.assigned_buildings,0) assigned_buildings, coalesce(a.working_buildings,0) working_buildings, coalesce(a.not_started_buildings,0) not_started_buildings,
coalesce(a.completed_buildings,0) completed_buildings, coalesce(a.paused_buildings,0) paused_buildings, coalesce(a.delayed_buildings,0) delayed_buildings, coalesce(a.progress_percent,0) progress_percent,
coalesce(ct.contracts_count,0) contracts_count, coalesce(ct.contract_value,0) contract_value, coalesce(it.certified_amount,0) certified_amount, coalesce(it.paid_amount,0) paid_amount, coalesce(it.open_invoices,0) open_invoices,
case when coalesce(a.assigned_buildings,0)=0 then 'Not Started' when coalesce(a.delayed_buildings,0)>0 then 'Delayed' when coalesce(a.progress_percent,0)>=90 then 'On Track' when coalesce(a.progress_percent,0)>=50 then 'Needs Attention' when coalesce(a.progress_percent,0)>0 then 'In Progress' else 'Not Started' end health_status
from assignment_totals a full join contract_totals ct on ct.project_id is not distinct from a.project_id and ct.subcontractor_id is not distinct from a.subcontractor_id and ct.subcontractor_name=a.subcontractor_name
full join invoice_totals it on it.project_id is not distinct from coalesce(a.project_id,ct.project_id) and it.subcontractor_id is not distinct from coalesce(a.subcontractor_id,ct.subcontractor_id) and it.subcontractor_name=coalesce(a.subcontractor_name,ct.subcontractor_name);

-- RLS: conservative, avoids lockout during V140 UI rollout
alter table public.company_profile enable row level security;
alter table public.erp_modules enable row level security;
alter table public.user_project_access enable row level security;
alter table public.user_module_permissions enable row level security;
alter table public.subcontractor_contracts enable row level security;
alter table public.subcontractor_contract_terms enable row level security;
alter table public.subcontractor_contract_items enable row level security;
alter table public.procurement_quotations enable row level security;
alter table public.procurement_quotation_items enable row level security;
alter table public.subcontractor_work_assignments enable row level security;
alter table public.subcontractor_progress_updates enable row level security;

drop policy if exists company_profile_read_authenticated on public.company_profile; create policy company_profile_read_authenticated on public.company_profile for select to authenticated using (true);
drop policy if exists company_profile_admin_write on public.company_profile; create policy company_profile_admin_write on public.company_profile for all to authenticated using (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email')) with check (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email'));
drop policy if exists erp_modules_read_authenticated on public.erp_modules; create policy erp_modules_read_authenticated on public.erp_modules for select to authenticated using (true);
drop policy if exists erp_modules_admin_write on public.erp_modules; create policy erp_modules_admin_write on public.erp_modules for all to authenticated using (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email')) with check (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email'));
drop policy if exists user_project_access_admin_all on public.user_project_access; create policy user_project_access_admin_all on public.user_project_access for all to authenticated using (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email')) with check (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email'));
drop policy if exists user_project_access_user_read_own on public.user_project_access; create policy user_project_access_user_read_own on public.user_project_access for select to authenticated using (user_id = auth.uid());
drop policy if exists user_module_permissions_admin_all on public.user_module_permissions; create policy user_module_permissions_admin_all on public.user_module_permissions for all to authenticated using (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email')) with check (public.v139_is_admin_owner(auth.uid(), auth.jwt()->>'email'));
drop policy if exists user_module_permissions_user_read_own on public.user_module_permissions; create policy user_module_permissions_user_read_own on public.user_module_permissions for select to authenticated using (user_id = auth.uid());

drop policy if exists subcontractor_contracts_auth_all on public.subcontractor_contracts; create policy subcontractor_contracts_auth_all on public.subcontractor_contracts for all to authenticated using (true) with check (true);
drop policy if exists subcontractor_contract_terms_auth_all on public.subcontractor_contract_terms; create policy subcontractor_contract_terms_auth_all on public.subcontractor_contract_terms for all to authenticated using (true) with check (true);
drop policy if exists subcontractor_contract_items_auth_all on public.subcontractor_contract_items; create policy subcontractor_contract_items_auth_all on public.subcontractor_contract_items for all to authenticated using (true) with check (true);
drop policy if exists procurement_quotations_auth_all on public.procurement_quotations; create policy procurement_quotations_auth_all on public.procurement_quotations for all to authenticated using (true) with check (true);
drop policy if exists procurement_quotation_items_auth_all on public.procurement_quotation_items; create policy procurement_quotation_items_auth_all on public.procurement_quotation_items for all to authenticated using (true) with check (true);
drop policy if exists subcontractor_work_assignments_auth_all on public.subcontractor_work_assignments; create policy subcontractor_work_assignments_auth_all on public.subcontractor_work_assignments for all to authenticated using (true) with check (true);
drop policy if exists subcontractor_progress_updates_auth_all on public.subcontractor_progress_updates; create policy subcontractor_progress_updates_auth_all on public.subcontractor_progress_updates for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.company_profile to authenticated;
grant select, insert, update, delete on public.erp_modules to authenticated;
grant select, insert, update, delete on public.user_project_access to authenticated;
grant select, insert, update, delete on public.user_module_permissions to authenticated;
grant select, insert, update, delete on public.subcontractor_contracts to authenticated;
grant select, insert, update, delete on public.subcontractor_contract_terms to authenticated;
grant select, insert, update, delete on public.subcontractor_contract_items to authenticated;
grant select, insert, update, delete on public.procurement_quotations to authenticated;
grant select, insert, update, delete on public.procurement_quotation_items to authenticated;
grant select, insert, update, delete on public.subcontractor_work_assignments to authenticated;
grant select, insert, update, delete on public.subcontractor_progress_updates to authenticated;
grant select on public.v_subcontractor_dashboard to authenticated;
grant execute on function public.v140_save_company_profile(text,text,text,text,text,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
