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


-- V138 SQL compatibility fix:
-- PostgreSQL/Supabase cannot change an existing VIEW column type using CREATE OR REPLACE VIEW
-- (example: numeric -> numeric(18,2)). Dropping and recreating project views avoids 42P16.
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
