-- V140_08 — Contract Pricing Type + BOQ-code Rate Reuse
-- Purpose:
-- 1) Allow subcontractor contracts to be BOQ unit-rate, lump sum / مقطوعية, labor-only, supply & apply, or dayworks.
-- 2) Store the selected pricing basis on contract and smart breakdown rows.
-- 3) Support UI behavior where one rate per BOQ item code + subcontractor is reused across villas.
-- Safe migration: no DROP, no business data deletion, no role enum changes.

begin;

alter table if exists public.subcontractor_contracts
  add column if not exists contract_type text not null default 'BOQ Unit Rate',
  add column if not exists pricing_basis text not null default 'boq_unit_rate',
  add column if not exists lump_sum_amount numeric(18,3) not null default 0;

alter table if exists public.subcontractor_contract_terms
  add column if not exists contract_type text null,
  add column if not exists pricing_basis text null,
  add column if not exists lump_sum_amount numeric(18,3) null;

alter table if exists public.subcontract_breakdown
  add column if not exists contract_type text not null default 'BOQ Unit Rate',
  add column if not exists pricing_basis text not null default 'boq_unit_rate',
  add column if not exists rate_source text null,
  add column if not exists lump_sum_amount numeric(18,3) null;

create index if not exists idx_subcontract_breakdown_project_sub_boq
  on public.subcontract_breakdown(project_id, subcontractor_id, boq_item_id)
  where is_active = true;

create index if not exists idx_subcontract_breakdown_pricing_basis
  on public.subcontract_breakdown(project_id, pricing_basis)
  where is_active = true;

comment on column public.subcontractor_contracts.contract_type is 'UI label for subcontract pricing type: BOQ Unit Rate, Lump Sum / مقطوعية, Labor Only, Supply & Apply, Dayworks, etc.';
comment on column public.subcontractor_contracts.pricing_basis is 'Stable key used by UI: boq_unit_rate, lump_sum, labor_only, supply_apply, dayworks.';
comment on column public.subcontract_breakdown.rate_source is 'Tracks whether rate was manual, auto-reused by same subcontractor + BOQ code, or distributed lump sum.';

commit;
