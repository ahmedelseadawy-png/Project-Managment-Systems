-- Fix for Supabase/PostgreSQL error 42P16:
-- cannot change data type of view column ... from numeric to numeric(18,2)
-- Run this once BEFORE rerunning SUPABASE_SETUP_BUNDLE.sql if your database already has older views.

begin;

drop view if exists public.v_my_pending_approvals cascade;
drop view if exists public.v_pending_approvals_by_project cascade;
drop view if exists public.v_pending_approvals_by_module cascade;
drop view if exists public.v_approval_delay_report cascade;
drop view if exists public.v_approval_history cascade;
drop view if exists public.v_inventory_cost_control cascade;
drop view if exists public.v_inventory_stock cascade;
drop view if exists public.v_procurement_register cascade;
drop view if exists public.v_certificate_finance_summary cascade;
drop view if exists public.v_retention_balance cascade;
drop view if exists public.v_subcontractor_certificate_summary cascade;
drop view if exists public.v_subcontractor_invoice_payment_summary cascade;
drop view if exists public.v_subcontractor_retention_balance cascade;
drop view if exists public.v_dashboard_kpis cascade;
drop view if exists public.v_technical_overdue cascade;
drop view if exists public.v_pending_approvals cascade;
drop view if exists public.v_certificate_summary cascade;
drop view if exists public.v_commercial_summary cascade;

commit;
