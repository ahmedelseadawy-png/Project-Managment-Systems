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

-- =========================================================
-- V139 RELEASE SUBCONTRACTOR INVOICE HARD FIX
-- Keep this patch at the end so it overrides earlier V139 function definitions.
-- See database/SQL_FIX_V139_RELEASE_SUBCONTRACTOR_INVOICE.sql
-- =========================================================

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
