-- ============================================================
-- V140_01_OPTIONAL_CLEANUP_OLD_TEST_REQUESTS.sql
-- Construction ERP — Inspect Old Approval Requests (Safe Read-Only by Default)
--
-- PURPOSE:
--   Review approval_requests that were created under the old
--   V139 3-step rule ('Subcontractor Invoice Release') before
--   the V140_01 migration was applied.
--
-- DEFAULT BEHAVIOR:
--   This file ONLY runs SELECT queries. Nothing is modified.
--   Review the output in Supabase SQL Editor, then decide
--   whether to uncomment Section 2 or Section 3.
--
-- SECTIONS:
--   Section 1 — Inspect (always runs, safe)
--   Section 2 — Cancel open old requests (commented out)
--   Section 3 — Remove test invoices only (commented out, extra caution)
--
-- DO NOT uncomment Section 2 or 3 without explicit approval.
-- ============================================================

-- ============================================================
-- SECTION 1 — INSPECT (runs by default — read-only)
-- ============================================================

-- 1A. All approval_matrix_rules for Subcontractor Certificate
--     Shows which rules are active vs deactivated after V140_01.
select
  id,
  rule_name,
  module,
  action,
  priority,
  is_active,
  created_at
from public.approval_matrix_rules
where module = 'Subcontractor'
  and action = 'Subcontractor Certificate'
order by priority;

-- 1B. Steps for each rule (so you can compare old vs new)
select
  r.rule_name,
  r.is_active   as rule_active,
  s.step_order,
  s.step_type,
  s.role_name,
  s.decision_mode,
  s.is_required
from public.approval_matrix_steps s
join public.approval_matrix_rules r on r.id = s.rule_id
where r.module = 'Subcontractor'
  and r.action = 'Subcontractor Certificate'
order by r.priority, s.step_order;

-- 1C. All approval_requests under the OLD rule(s) (non-V140)
--     Review this list before considering any cleanup.
select
  ar.id                              as request_id,
  ar.status                          as request_status,
  ar.module,
  ar.action,
  ar.current_step_order,
  ar.submitted_by,
  ar.submitted_at,
  ar.approved_at,
  ar.updated_at,
  amr.rule_name,
  amr.is_active                      as rule_still_active,
  si.status                          as invoice_status,
  si.gross_amount,
  si.originator_email
from public.approval_requests ar
join public.approval_matrix_rules amr on amr.id = ar.rule_id
left join public.subcontractor_invoices si on si.id = ar.record_id
where amr.module = 'Subcontractor'
  and amr.action = 'Subcontractor Certificate'
  and amr.rule_name <> 'Subcontractor Invoice V140 — 7-Step Workflow'
order by ar.submitted_at desc;

-- 1D. Open (still pending) old requests specifically
--     These are the ones you might want to cancel or migrate.
select
  ar.id                              as request_id,
  ar.status,
  ar.current_step_order,
  ar.submitted_at,
  amr.rule_name,
  si.status                          as invoice_current_status,
  si.originator_email
from public.approval_requests ar
join public.approval_matrix_rules amr on amr.id = ar.rule_id
left join public.subcontractor_invoices si on si.id = ar.record_id
where amr.module = 'Subcontractor'
  and amr.action = 'Subcontractor Certificate'
  and amr.rule_name <> 'Subcontractor Invoice V140 — 7-Step Workflow'
  and ar.status in ('pending_review', 'pending_approval', 'missing_configuration')
order by ar.submitted_at desc;

-- 1E. Frozen assignments for all old requests
select
  ara.request_id,
  ara.step_order,
  ara.step_type,
  ara.assigned_role_name,
  ara.assigned_user_name,
  ara.assigned_user_email,
  ara.status                         as assignment_status,
  ara.action_at
from public.approval_request_assignments ara
join public.approval_requests ar on ar.id = ara.request_id
join public.approval_matrix_rules amr on amr.id = ar.rule_id
where amr.module = 'Subcontractor'
  and amr.action = 'Subcontractor Certificate'
  and amr.rule_name <> 'Subcontractor Invoice V140 — 7-Step Workflow'
order by ara.request_id, ara.step_order;

-- 1F. Overload check — confirm only 1 version of approval_act_on_current_step
select
  proname,
  pg_get_function_identity_arguments(oid) as args,
  prosecdef as security_definer
from pg_proc
where proname = 'approval_act_on_current_step'
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: exactly 1 row with args = 'uuid, text, text, uuid, text, text, numeric, text'

-- ============================================================
-- SECTION 2 — CANCEL OPEN OLD-RULE REQUESTS (COMMENTED OUT)
--
-- Review Section 1D results first.
-- Uncomment and run ONLY after explicit approval.
-- This sets old pending requests to 'cancelled' and
-- resets the related invoices to 'Returned to Originator'
-- so they can be re-released under the new V140 7-step rule.
--
-- SAFE: Does not delete any rows. Only updates status fields.
-- ============================================================

/*
do $$
declare
  r record;
  v_old_rule_ids uuid[];
begin
  select array_agg(id) into v_old_rule_ids
    from public.approval_matrix_rules
   where module   = 'Subcontractor'
     and action   = 'Subcontractor Certificate'
     and rule_name <> 'Subcontractor Invoice V140 — 7-Step Workflow';

  if v_old_rule_ids is null or array_length(v_old_rule_ids, 1) = 0 then
    raise notice 'No old rules found. Nothing to cancel.';
    return;
  end if;

  -- Cancel all pending requests under old rules
  for r in
    select ar.id, ar.record_id
      from public.approval_requests ar
     where ar.rule_id = any(v_old_rule_ids)
       and ar.status in ('pending_review', 'pending_approval', 'missing_configuration')
  loop
    -- Cancel the request
    update public.approval_requests
       set status = 'cancelled', updated_at = now()
     where id = r.id;

    -- Skipped assignments
    update public.approval_request_assignments
       set status = 'skipped'
     where request_id = r.id
       and status = 'pending';

    -- Reset invoice so originator can re-release under V140 rule
    update public.subcontractor_invoices
       set status          = 'Returned to Originator',
           approval_status = 'returned',
           workflow_status = 'Returned to Originator',
           approval_locked = false,
           returned_reason = 'Approval cycle cancelled during V140_01 migration upgrade. Please re-release to start the new 7-step workflow.',
           updated_at      = now()
     where id = r.record_id;

    raise notice 'Cancelled request % and reset invoice %', r.id, r.record_id;
  end loop;
end $$;
*/

-- ============================================================
-- SECTION 3 — REMOVE TEST INVOICES ONLY (EXTRA CAUTION — COMMENTED OUT)
--
-- Only use this if you have confirmed these are test records
-- with no real business value.
-- Lists the candidate invoices first so you can review.
--
-- DANGER: This deletes invoice rows permanently.
-- Do NOT run without confirming the invoice IDs in Section 1.
-- ============================================================

/*
-- First review which invoices would be deleted:
select id, invoice_no, status, gross_amount, originator_email, created_at
from public.subcontractor_invoices
where status in ('Draft', 'Returned to Originator')
  and gross_amount < 1
  and invoice_no like 'TEST%';
-- Review output above, then modify the WHERE clause to match
-- your actual test records before uncommenting the DELETE below.

-- delete from public.subcontractor_invoices
-- where id in ('<uuid1>', '<uuid2>');
-- Replace with actual IDs from your review.
*/
