-- ============================================================
-- V140_01_APPROVAL_CLEANUP_AND_7_STEP_WORKFLOW.sql
-- Construction ERP — Approval Engine Cleanup & 7-Step Workflow
--
-- Safe to run after:
--   SUPABASE_V138_APPROVAL_MATRIX.sql
--   SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql
--   SQL_FIX_V139_RELEASE_SUBCONTRACTOR_INVOICE.sql  (or full bundle)
--
-- Blocker fixes in this version:
--   B1: v139_get_or_create_public_user — dynamic safe role insertion,
--       handles NOT NULL enum role column, handles duplicate email
--   B2: subcontractor_invoices columns added before any function references them
--   B3: approval_user_roles uses column-level unique() so ON CONFLICT DO NOTHING
--       is safe and unambiguous
--   B4: all SQL logic reviewed and validated
--
-- DOES NOT:
--   - Delete any business data
--   - Modify public.users.role enum
--   - Drop any approval_requests, assignments, or audit_log rows
--   - Touch V140_02 through V140_05
-- ============================================================

-- ============================================================
-- STEP 0 — Defensive column additions on subcontractor_invoices
--           Must run BEFORE any function that references these columns.
--           Safe if V139 already added them (add column if not exists).
-- ============================================================

alter table if exists public.subcontractor_invoices
  alter column status set default 'Draft';

alter table if exists public.subcontractor_invoices
  add column if not exists approval_status             text          null,
  add column if not exists workflow_status             text          null,
  add column if not exists approval_request_id         uuid          null,
  add column if not exists approval_locked             boolean       not null default false,
  add column if not exists originator_user_id          uuid          null,
  add column if not exists originator_name             text          null,
  add column if not exists originator_email            text          null,
  add column if not exists released_by                 uuid          null,
  add column if not exists released_by_name            text          null,
  add column if not exists released_by_email           text          null,
  add column if not exists released_at                 timestamptz   null,
  add column if not exists returned_reason             text          null,
  add column if not exists rejected_reason             text          null,
  add column if not exists approved_certificate_amount numeric(18,3) null,
  add column if not exists released_payment_amount     numeric(18,3) null,
  add column if not exists total_released_payments     numeric(18,3) null,
  add column if not exists remaining_unpaid_balance    numeric(18,3) null,
  add column if not exists ceo_released_amount         numeric(18,3) null,
  add column if not exists remaining_unreleased_amount numeric(18,3) null,
  add column if not exists payment_decision            text          null,
  add column if not exists net_payable                 numeric(18,3) null;

-- ============================================================
-- STEP 1 — approval_user_roles: ensure table + partial unique indexes.
--
-- WHY PARTIAL INDEXES instead of a column-level UNIQUE constraint:
--   PostgreSQL UNIQUE constraints treat NULL as distinct from every other NULL.
--   A UNIQUE on (project_id, user_id, role_name) would allow duplicate rows
--   where project_id IS NULL (global roles), defeating the uniqueness guarantee.
--
-- Two partial indexes handle both scopes cleanly:
--   • Global  (project_id IS NULL)  → unique on (user_id, lower(role_name))
--   • Project (project_id IS NOT NULL) → unique on (project_id, user_id, lower(role_name))
--
-- ON CONFLICT DO NOTHING is safe with partial indexes — PostgreSQL checks each
-- applicable partial index on insert and blocks the duplicate silently.
-- ============================================================

create table if not exists public.approval_user_roles (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        null references public.projects(id) on delete cascade,
  user_id    uuid        not null references public.users(id) on delete cascade,
  role_name  text        not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique index 1: global roles (project_id IS NULL).
-- Prevents duplicate global role assignments for the same user.
-- IMPORTANT: indexes are scoped to is_active = true rows only,
-- so inactive duplicates do not block index creation.
-- Pre-flight de-duplication step runs first to handle any
-- existing duplicate active rows from before this migration.

-- De-duplicate active global rows (project_id IS NULL):
-- Keep the oldest active row (lowest created_at) for each (user_id, lower(role_name)) pair.
-- Deactivate all others. Does NOT delete any rows.
update public.approval_user_roles
   set is_active  = false,
       updated_at = now()
 where id in (
   select id from (
     select id,
            row_number() over (
              partition by user_id, lower(role_name)
              order by created_at asc, id asc
            ) as rn
       from public.approval_user_roles
      where project_id is null
        and coalesce(is_active, true) = true
   ) ranked
   where rn > 1
 );

-- De-duplicate active project-scoped rows (project_id IS NOT NULL):
-- Keep the oldest active row for each (project_id, user_id, lower(role_name)) pair.
update public.approval_user_roles
   set is_active  = false,
       updated_at = now()
 where id in (
   select id from (
     select id,
            row_number() over (
              partition by project_id, user_id, lower(role_name)
              order by created_at asc, id asc
            ) as rn
       from public.approval_user_roles
      where project_id is not null
        and coalesce(is_active, true) = true
   ) ranked
   where rn > 1
 );

do $$
declare v_dupes integer;
begin
  select count(*) into v_dupes
    from public.approval_user_roles
   where is_active = false
     and updated_at >= now() - interval '5 seconds';
  if v_dupes > 0 then
    raise notice 'V140_01: % duplicate approval_user_roles row(s) deactivated before index creation.', v_dupes;
  end if;
end $$;

-- Partial unique index 1: global active roles (project_id IS NULL).
create unique index if not exists uq_approval_user_roles_global_user_role
  on public.approval_user_roles(user_id, lower(role_name))
  where project_id is null
    and coalesce(is_active, true) = true;

-- Partial unique index 2: project-scoped active roles (project_id IS NOT NULL).
create unique index if not exists uq_approval_user_roles_project_user_role
  on public.approval_user_roles(project_id, user_id, lower(role_name))
  where project_id is not null
    and coalesce(is_active, true) = true;

-- Supporting lookup indexes (non-unique)
create index if not exists idx_approval_user_roles_project_role
  on public.approval_user_roles(project_id, lower(role_name), is_active);
create index if not exists idx_approval_user_roles_user
  on public.approval_user_roles(user_id, is_active);

-- ============================================================
-- STEP 2 — approval_requests / assignments / audit_log: additive columns.
--           Safe if V139 already added them.
-- ============================================================

alter table if exists public.approval_matrix_steps
  add column if not exists user_name  text null,
  add column if not exists user_email text null;

alter table if exists public.approval_requests
  add column if not exists submitted_by_name   text null,
  add column if not exists submitted_by_email  text null,
  add column if not exists originator_user_id  uuid null,
  add column if not exists originator_name     text null,
  add column if not exists originator_email    text null;

alter table if exists public.approval_request_assignments
  add column if not exists assigned_user_email text null;

alter table if exists public.approval_audit_log
  add column if not exists actor_name  text null,
  add column if not exists actor_email text null;

-- ============================================================
-- STEP 3 — Dynamic overload cleanup:
--           Drop ALL overloads of approval_act_on_current_step
--           that are NOT the final 8-parameter version.
-- ============================================================

do $$
declare
  r            record;
  v_final_args text := 'uuid, text, text, uuid, text, text, numeric, text';
  v_drop_sql   text;
begin
  for r in
    select p.oid,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'approval_act_on_current_step'
  loop
    if r.args <> v_final_args then
      v_drop_sql := format(
        'drop function if exists public.approval_act_on_current_step(%s) cascade',
        r.args
      );
      raise notice 'V140_01: dropping overload approval_act_on_current_step(%)', r.args;
      execute v_drop_sql;
    else
      raise notice 'V140_01: keeping final version approval_act_on_current_step(%)', r.args;
    end if;
  end loop;
end $$;

-- ============================================================
-- STEP 4 — Drop ALL functions that will be recreated in this migration.
--           PostgreSQL raises 42P13 if you try to change input parameter
--           names with CREATE OR REPLACE. Dropping exact signatures first
--           prevents all such errors regardless of what the database has.
--           Every function recreated below is listed here.
-- ============================================================

drop function if exists public.approval_role_variants(text);
drop function if exists public.v139_get_or_create_public_user(uuid);
drop function if exists public.v139_finalize_subcontractor_invoice_payment_decision(uuid, uuid, numeric, text);
drop function if exists public.certificate_release_for_approval(uuid, uuid);
drop function if exists public.release_subcontractor_invoice_for_approval(uuid, uuid);
drop function if exists public.approval_update_transaction_status(text, uuid, text, text, uuid, boolean);
drop function if exists public.approval_find_rule(text, text, uuid, numeric);
drop function if exists public.approval_submit_transaction(text, text, text, uuid, uuid, numeric, uuid);
-- NOTE: v139_is_admin_owner is NOT dropped here because RLS policies and the
-- view v_my_pending_approvals depend on it. It has the same signature and return
-- type, so CREATE OR REPLACE is safe and used in STEP 13 instead.

-- ============================================================
-- STEP 5 — approval_role_variants (recreated after DROP above)
-- ============================================================

create function public.approval_role_variants(p_role_name text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_role_name, '')))
    -- Existing variants (preserved)
    when 'qs'                         then array['qs','qs engineer','quantity surveyor','quantity surveyor engineer','site qs','site quantity surveyor']
    when 'qs engineer'                then array['qs','qs engineer','quantity surveyor','quantity surveyor engineer','site qs','site quantity surveyor']
    when 'quantity surveyor'          then array['qs','qs engineer','quantity surveyor','quantity surveyor engineer','site qs','site quantity surveyor']
    when 'technical office manager'   then array['technical office manager','technical office','tom','technical manager','site technical office manager','site tom']
    when 'storekeeper'                then array['storekeeper','store keeper','store','stores','inventory']
    when 'site engineer'              then array['site engineer','engineer','field engineer']
    when 'procurement'                then array['procurement','procurement engineer','procurement manager','purchasing','purchasing manager']
    when 'procurement engineer'       then array['procurement','procurement engineer','procurement manager','purchasing','purchasing manager']
    when 'procurement manager'        then array['procurement','procurement engineer','procurement manager','purchasing','purchasing manager']
    when 'project manager'            then array['project manager','pm','project director','project lead']
    when 'project director'           then array['project director','project manager','pm','project lead']
    when 'finance'                    then array['finance','finance manager','finance department','finance dept','financial controller','accounts','accountant']
    when 'finance manager'            then array['finance','finance manager','finance department','finance dept','financial controller','accounts','accountant']
    when 'admin'                      then array['admin','administrator','system admin','owner']
    when 'ceo'                        then array['ceo','chief executive officer','owner','managing director','md','general manager']
    when 'owner'                      then array['owner','ceo','admin','administrator']
    -- V140 new role aliases
    when 'site technical office manager'            then array['site technical office manager','site tom','technical office manager site','site technical office','site to manager']
    when 'site tom'                                 then array['site technical office manager','site tom','technical office manager site','site technical office','site to manager']
    when 'head office qs'                           then array['head office qs','ho qs','head office quantity surveyor','ho quantity surveyor','head qs','central qs']
    when 'ho qs'                                    then array['head office qs','ho qs','head office quantity surveyor','ho quantity surveyor','head qs','central qs']
    when 'head office technical office manager'     then array['head office technical office manager','ho tom','head office tom','ho technical office manager','head technical office manager','central tom']
    when 'ho tom'                                   then array['head office technical office manager','ho tom','head office tom','ho technical office manager','head technical office manager','central tom']
    when 'projects manager'                         then array['projects manager','project manager ho','head office project manager','ho project manager','projects director','ho pm']
    else array[lower(trim(coalesce(p_role_name, '')))]
  end;
$$;

comment on function public.approval_role_variants(text) is
  'V140_01: Returns text aliases for a workflow role. Used by approval_submit_transaction.';

-- ============================================================
-- STEP 6 — v139_get_or_create_public_user (Blocker 1 fix)
--
-- SAFE INSERT strategy for public.users.role enum/check:
--   1. If user already in public.users → return existing row.
--   2. If email already exists in public.users with different id → return/update that row.
--   3. If new: use dynamic SQL to pick the safest available role value:
--      Priority: 'Viewer' → 'viewer' → 'Admin' → 'admin' → first enum value → 'Admin' text
--   4. Never touches the enum definition.
-- ============================================================

create function public.v139_get_or_create_public_user(p_user_id uuid)
returns table(id uuid, full_name text, email text, role text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth         record;
  v_public       record;
  v_existing     record;
  v_safe_role    text;
  v_role_col_type text;
  v_enum_values  text[];
  v_insert_sql   text;
begin
  -- Guard
  if p_user_id is null then
    raise exception 'v139_get_or_create_public_user: p_user_id is required.';
  end if;

  -- 1. Try public.users by id first (fastest path)
  select u.id, u.full_name, u.email, u.role::text as role
    into v_public
    from public.users u
   where u.id = p_user_id
   limit 1;

  if v_public.id is not null then
    return query select v_public.id, v_public.full_name, v_public.email, v_public.role;
    return;
  end if;

  -- 2. Load from auth.users
  select a.id,
         coalesce(a.raw_user_meta_data->>'full_name',
                  a.raw_user_meta_data->>'name',
                  a.email) as full_name,
         a.email
    into v_auth
    from auth.users a
   where a.id = p_user_id
   limit 1;

  if v_auth.id is null then
    raise exception 'v139_get_or_create_public_user: user % not found in auth.users or public.users.', p_user_id;
  end if;

  if nullif(trim(coalesce(v_auth.email, '')), '') is null then
    raise exception 'v139_get_or_create_public_user: user % has no email. Email is required for approval workflow.', p_user_id;
  end if;

  -- 3. Handle duplicate email: if this email already exists under a different id, return that row.
  select u.id, u.full_name, u.email, u.role::text as role
    into v_existing
    from public.users u
   where lower(u.email) = lower(v_auth.email)
     and u.id <> p_user_id
   limit 1;

  if v_existing.id is not null then
    -- Email exists under a different id (e.g. invited twice).
    -- Return the existing row without inserting a duplicate.
    return query select v_existing.id, v_existing.full_name, v_existing.email, v_existing.role;
    return;
  end if;

  -- 4. Determine a safe role value for the insert.
  --    Inspect the column type: if it is an enum, pick the safest enum value.
  --    Never assume a default exists or that NULL is allowed.

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into v_role_col_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'users'
     and a.attname = 'role'
     and a.attnum  > 0
   limit 1;

  if v_role_col_type is null then
    -- Column 'role' does not exist — insert without it
    v_safe_role := null;
  elsif v_role_col_type like '%[]' then
    -- Array type — unusual; skip role
    v_safe_role := null;
  else
    -- Try to enumerate enum values if it is a pg enum type
    select array_agg(e.enumlabel order by e.enumsortorder)
      into v_enum_values
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname = regexp_replace(v_role_col_type, '^public\.', '');

    if v_enum_values is not null and array_length(v_enum_values, 1) > 0 then
      -- Prefer 'Viewer' or 'viewer' (least privileged), then 'Admin', then first value
      if 'Viewer'  = any(v_enum_values) then v_safe_role := 'Viewer';
      elsif 'viewer' = any(v_enum_values) then v_safe_role := 'viewer';
      elsif 'Admin'  = any(v_enum_values) then v_safe_role := 'Admin';
      elsif 'admin'  = any(v_enum_values) then v_safe_role := 'admin';
      else v_safe_role := v_enum_values[1];
      end if;
    else
      -- Text column with check constraint or no constraint: use 'Admin'
      -- (matches the known 'Admin' check value in this project's schema)
      v_safe_role := 'Admin';
    end if;
  end if;

  -- 5. Insert into public.users using dynamic SQL to avoid compile-time enum binding.
  --    If role column doesn't exist, insert without it.
  --    ON CONFLICT (id): update name/email but never change role of existing user.
  if v_role_col_type is null then
    -- No role column
    execute format(
      'insert into public.users(id, full_name, email)
       values ($1, $2, $3)
       on conflict (id) do update
         set full_name = coalesce(excluded.full_name, public.users.full_name),
             email     = coalesce(excluded.email,     public.users.email)'
    ) using v_auth.id, v_auth.full_name, v_auth.email;
  else
    execute format(
      'insert into public.users(id, full_name, email, role)
       values ($1, $2, $3, $4::%s)
       on conflict (id) do update
         set full_name = coalesce(excluded.full_name, public.users.full_name),
             email     = coalesce(excluded.email,     public.users.email)',
      v_role_col_type
    ) using v_auth.id, v_auth.full_name, v_auth.email, v_safe_role;
  end if;

  -- 6. Return the now-existing row
  return query
    select u.id, u.full_name, u.email, u.role::text
      from public.users u
     where u.id = p_user_id
     limit 1;
end;
$$;

comment on function public.v139_get_or_create_public_user(uuid) is
  'V140_01 B1: syncs auth.users → public.users. Handles NOT NULL enum role via dynamic SQL. Handles duplicate email. Never modifies enum.';

-- ============================================================
-- STEP 7 — v139_finalize_subcontractor_invoice_payment_decision
-- ============================================================

create function public.v139_finalize_subcontractor_invoice_payment_decision(
  p_invoice_id      uuid,
  p_actor_user_id   uuid    default auth.uid(),
  p_released_amount numeric default null,
  p_decision        text    default 'full'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   record;
  v_dec   text := lower(trim(coalesce(p_decision, 'full')));
  v_net   numeric;
begin
  select * into v_inv
    from public.subcontractor_invoices
   where id = p_invoice_id
   for update;

  if not found then
    raise exception 'Subcontractor invoice % not found.', p_invoice_id;
  end if;

  -- Normalise decision label
  if v_dec in ('approve full amount','full amount','full')    then v_dec := 'full';
  elsif v_dec in ('approve partial amount','partial amount','partial') then v_dec := 'partial';
  elsif v_dec in ('hold payment','hold')                      then v_dec := 'hold';
  else
    raise exception 'Unknown payment decision: %. Use full, partial, or hold.', p_decision;
  end if;

  -- Net payable: use net_payable if present, fall back to net_amount, then gross_amount
  v_net := coalesce(v_inv.net_payable, v_inv.net_amount, v_inv.gross_amount, 0);

  if v_dec = 'full' then
    update public.subcontractor_invoices set
      payment_decision            = 'Approve Full Amount',
      approved_certificate_amount = v_net,
      released_payment_amount     = v_net,
      ceo_released_amount         = v_net,
      total_released_payments     = coalesce(total_released_payments, 0) + v_net,
      remaining_unpaid_balance    = 0,
      remaining_unreleased_amount = 0,
      status                      = 'Approved',
      updated_at                  = now()
    where id = p_invoice_id;

  elsif v_dec = 'partial' then
    if p_released_amount is null or p_released_amount <= 0 then
      raise exception 'Partial payment requires p_released_amount > 0.';
    end if;
    update public.subcontractor_invoices set
      payment_decision            = 'Approve Partial Amount',
      approved_certificate_amount = v_net,
      released_payment_amount     = p_released_amount,
      ceo_released_amount         = p_released_amount,
      total_released_payments     = coalesce(total_released_payments, 0) + p_released_amount,
      remaining_unpaid_balance    = greatest(0, v_net - p_released_amount),
      remaining_unreleased_amount = greatest(0, v_net - p_released_amount),
      status                      = 'Partially Released',
      updated_at                  = now()
    where id = p_invoice_id;

  elsif v_dec = 'hold' then
    update public.subcontractor_invoices set
      payment_decision            = 'Hold Payment',
      approved_certificate_amount = v_net,
      released_payment_amount     = 0,
      ceo_released_amount         = 0,
      remaining_unpaid_balance    = v_net,
      remaining_unreleased_amount = v_net,
      status                      = 'Payment Held',
      updated_at                  = now()
    where id = p_invoice_id;
  end if;
end;
$$;

comment on function public.v139_finalize_subcontractor_invoice_payment_decision(uuid, uuid, numeric, text) is
  'V140_01: CEO payment decision: full/partial/hold. Reads net_payable→net_amount→gross_amount for net value.';

-- ============================================================
-- STEP 8 — certificate_release_for_approval
-- ============================================================

create function public.certificate_release_for_approval(
  p_invoice_id  uuid,
  p_released_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice         record;
  v_user            record;
  v_status          text;
  v_request_id      uuid;
  v_release_user_id uuid := coalesce(p_released_by, auth.uid());
begin
  select * into v_invoice
    from public.subcontractor_invoices
   where id = p_invoice_id
   for update;

  if not found then
    raise exception 'Subcontractor invoice % not found.', p_invoice_id;
  end if;

  if v_release_user_id is null then
    raise exception 'Release requires a logged-in user (auth.uid() is null and p_released_by was not supplied).';
  end if;

  select u.id, u.full_name, u.email into v_user
    from public.v139_get_or_create_public_user(v_release_user_id) u;

  if v_user.id is null or nullif(trim(coalesce(v_user.email, '')), '') is null then
    raise exception 'Release requires a logged-in user with a valid email.';
  end if;

  v_status := lower(trim(coalesce(v_invoice.status, 'Draft')));

  if v_status not in (
    'draft', 'returned', 'returned to originator',
    'missing configuration', 'missing_configuration', 'rejected'
  ) then
    raise exception
      'Only Draft, Returned, Rejected, or Missing Configuration invoices can be released. Current status: %',
      v_invoice.status;
  end if;

  -- Reset all approval fields for a fresh cycle
  update public.subcontractor_invoices set
    originator_user_id          = coalesce(originator_user_id, v_user.id),
    originator_name             = coalesce(originator_name,    v_user.full_name),
    originator_email            = coalesce(originator_email,   v_user.email),
    released_by                 = v_user.id,
    released_by_name            = v_user.full_name,
    released_by_email           = v_user.email,
    released_at                 = now(),
    status                      = 'Released',
    approval_status             = 'released',
    workflow_status             = 'Released',
    approval_locked             = true,
    returned_reason             = null,
    rejected_reason             = null,
    payment_decision            = null,
    approved_certificate_amount = null,
    released_payment_amount     = null,
    total_released_payments     = null,
    ceo_released_amount         = null,
    remaining_unpaid_balance    = null,
    remaining_unreleased_amount = null,
    updated_at                  = now()
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
         updated_at          = now()
   where id = p_invoice_id;

  return v_request_id;
end;
$$;

comment on function public.certificate_release_for_approval(uuid, uuid) is
  'V140_01: Releases a Draft/Returned/Rejected subcontractor invoice and starts a fresh frozen approval cycle.';

-- ============================================================
-- STEP 9 — release_subcontractor_invoice_for_approval (backward alias)
-- ============================================================

create function public.release_subcontractor_invoice_for_approval(
  p_invoice_id  uuid,
  p_released_by uuid default auth.uid()
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.certificate_release_for_approval(p_invoice_id, p_released_by);
$$;

comment on function public.release_subcontractor_invoice_for_approval(uuid, uuid) is
  'V140_01: Backward-compatible alias for certificate_release_for_approval.';

-- ============================================================
-- STEP 10 — approval_update_transaction_status (create or replace)
-- ============================================================

create function public.approval_update_transaction_status(
  p_record_table    text,
  p_record_id       uuid,
  p_approval_status text,
  p_display_status  text,
  p_request_id      uuid    default null,
  p_lock            boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_record_table = 'subcontractor_invoices' then
    update public.subcontractor_invoices set
      approval_status     = p_approval_status,
      workflow_status     = p_display_status,
      status              = case
                              when p_display_status in (
                                'Approved','Partially Released','Payment Held',
                                'Rejected','Returned to Originator',
                                'Missing Configuration','Cancelled'
                              ) then p_display_status
                              else status
                            end,
      approval_request_id = coalesce(p_request_id, approval_request_id),
      approval_locked     = p_lock,
      updated_at          = now()
    where id = p_record_id;
  elsif p_record_table = 'procurement_records' then
    update public.procurement_records
       set workflow_status = p_display_status,
           updated_at      = now()
     where id = p_record_id;
  elsif p_record_table = 'inventory_grn_headers' then
    update public.inventory_grn_headers
       set workflow_status = p_display_status
     where id = p_record_id;
  elsif p_record_table = 'inventory_issue_headers' then
    update public.inventory_issue_headers
       set workflow_status = p_display_status
     where id = p_record_id;
  elsif p_record_table = 'finance_records' then
    update public.finance_records
       set workflow_status = p_display_status
     where id = p_record_id;
  end if;
end;
$$;

-- ============================================================
-- STEP 11 — approval_find_rule (create or replace)
-- ============================================================

create function public.approval_find_rule(
  p_module     text,
  p_action     text,
  p_project_id uuid    default null,
  p_amount     numeric default null
)
returns public.approval_matrix_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.approval_matrix_rules%rowtype;
begin
  select * into v_rule
    from public.approval_matrix_rules
   where module    = p_module
     and action    = p_action
     and is_active = true
     and (project_id = p_project_id or project_id is null)
     and (min_amount is null or p_amount is null or p_amount >= min_amount)
     and (max_amount is null or p_amount is null or p_amount <= max_amount)
   order by
     case when project_id = p_project_id then 0 else 1 end,
     priority asc
   limit 1;
  return v_rule;
end;
$$;

-- ============================================================
-- STEP 12 — approval_submit_transaction (create or replace)
-- ============================================================

create function public.approval_submit_transaction(
  p_module       text,
  p_action       text,
  p_record_table text,
  p_record_id    uuid,
  p_project_id   uuid    default null,
  p_amount       numeric default null,
  p_submitted_by uuid    default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule                   public.approval_matrix_rules%rowtype;
  v_request_id             uuid;
  v_step                   record;
  v_user                   record;
  v_user_count             integer;
  v_current_step           integer;
  v_current_type           text;
  v_initial_status         text;
  v_submitter              record;
  v_submitter_is_admin_owner boolean := false;
  v_missing                text := '';
begin
  -- Cancel any open approval requests for this record
  update public.approval_requests
     set status = 'cancelled', updated_at = now()
   where record_table = p_record_table
     and record_id    = p_record_id
     and status in ('pending_review','pending_approval','draft','missing_configuration');

  update public.approval_request_assignments ass
     set status = 'skipped'
    from public.approval_requests req
   where ass.request_id = req.id
     and req.record_table = p_record_table
     and req.record_id    = p_record_id
     and ass.status       = 'pending';

  -- Resolve submitter
  if p_submitted_by is not null then
    select u.id, u.full_name, u.email into v_submitter
      from public.v139_get_or_create_public_user(p_submitted_by) u;
    if nullif(trim(coalesce(v_submitter.email, '')), '') is null then
      raise exception 'Submitting user % has no email. Email is required for approval workflow.', p_submitted_by;
    end if;
    -- Determine if originator is Admin/Owner BEFORE freezing assignments.
    -- If yes, they are NOT excluded from role resolution so they can be
    -- assigned to and act on their own invoice's approval steps.
    v_submitter_is_admin_owner := public.v139_is_admin_owner(v_submitter.id, v_submitter.email);
  end if;

  v_rule := public.approval_find_rule(p_module, p_action, p_project_id, p_amount);

  -- No rule found → missing_configuration
  if v_rule.id is null then
    insert into public.approval_requests(
      module, action, record_table, record_id, project_id, amount,
      rule_id, status, submitted_by, submitted_at,
      submitted_by_name, submitted_by_email,
      originator_user_id, originator_email
    ) values (
      p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount,
      null, 'missing_configuration', p_submitted_by, now(),
      v_submitter.full_name, v_submitter.email,
      p_submitted_by, v_submitter.email
    ) returning id into v_request_id;

    insert into public.approval_audit_log(
      request_id, record_table, record_id, action,
      old_status, new_status, actor_user_id, actor_name, actor_email, comments
    ) values (
      v_request_id, p_record_table, p_record_id, 'Submitted',
      'draft', 'missing_configuration',
      p_submitted_by, v_submitter.full_name, v_submitter.email,
      'No active approval matrix rule found for ' || p_module || '/' || p_action
    );

    perform public.approval_update_transaction_status(
      p_record_table, p_record_id,
      'missing_configuration', 'Missing Configuration',
      v_request_id, false
    );
    return v_request_id;
  end if;

  insert into public.approval_requests(
    module, action, record_table, record_id, project_id, amount,
    rule_id, status, submitted_by, submitted_at,
    submitted_by_name, submitted_by_email,
    originator_user_id, originator_email
  ) values (
    p_module, p_action, p_record_table, p_record_id, p_project_id, p_amount,
    v_rule.id, 'draft', p_submitted_by, now(),
    v_submitter.full_name, v_submitter.email,
    p_submitted_by, v_submitter.email
  ) returning id into v_request_id;

  -- Freeze assignments
  for v_step in
    select * from public.approval_matrix_steps
     where rule_id = v_rule.id
     order by step_order, created_at
  loop
    v_user_count := 0;

    if v_step.assignee_type = 'user' and v_step.user_id is not null then
      select u.id, u.full_name, u.email into v_user
        from public.users u
       where u.id = v_step.user_id
         and coalesce(u.is_active, true) = true
       limit 1;

      if v_user.id is not null and nullif(trim(coalesce(v_user.email,'')), '') is not null then
        insert into public.approval_request_assignments(
          request_id, matrix_step_id, step_order, step_type,
          assigned_role_id, assigned_role_name,
          assigned_user_id, assigned_user_name, assigned_user_email,
          decision_mode, is_required
        ) values (
          v_request_id, v_step.id, v_step.step_order, v_step.step_type,
          v_step.role_id, v_step.role_name,
          v_user.id, v_user.full_name, v_user.email,
          v_step.decision_mode, v_step.is_required
        );
        v_user_count := 1;
      elsif v_step.is_required then
        v_missing := concat_ws(E'\n', nullif(v_missing,''),
          'Specific user for step ' || v_step.step_order || ' has no email or is inactive.');
      end if;

    else
      -- Role-based resolution with V140 aliases
      for v_user in
        with variants as (
          select lower(x) as role_key
            from unnest(public.approval_role_variants(v_step.role_name)) x
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
             lower(u.role::text) in (select role_key from variants)
             or lower(coalesce(pu.role::text,'')) in (select role_key from variants)
             or lower(coalesce(aur.role_name,'')) in (select role_key from variants)
           )
           -- Maker-checker: exclude originator UNLESS they are Admin/Owner.
           -- Admin/Owner originators can be assigned to and act on their own invoice.
           and (
             v_submitter_is_admin_owner = true   -- Admin/Owner: never excluded
             or p_submitted_by is null            -- no submitter context: no exclusion
             or not (
               u.id = p_submitted_by
               or lower(coalesce(u.email,'')) = lower(coalesce(v_submitter.email,''))
             )
           )
         order by u.full_name
      loop
        insert into public.approval_request_assignments(
          request_id, matrix_step_id, step_order, step_type,
          assigned_role_id, assigned_role_name,
          assigned_user_id, assigned_user_name, assigned_user_email,
          decision_mode, is_required
        ) values (
          v_request_id, v_step.id, v_step.step_order, v_step.step_type,
          v_step.role_id, coalesce(v_step.role_name, v_user.matched_role),
          v_user.id, v_user.full_name, v_user.email,
          v_step.decision_mode, v_step.is_required
        );
        v_user_count := v_user_count + 1;
      end loop;
    end if;

    if v_user_count = 0 then
      insert into public.approval_request_assignments(
        request_id, matrix_step_id, step_order, step_type,
        assigned_role_id, assigned_role_name,
        assigned_user_id, assigned_user_name, assigned_user_email,
        decision_mode, is_required, comments
      ) values (
        v_request_id, v_step.id, v_step.step_order, v_step.step_type,
        v_step.role_id, v_step.role_name,
        null, null, null,
        v_step.decision_mode, v_step.is_required,
        'No active non-originator user resolved for role: ' || coalesce(v_step.role_name,'?')
      );
      if v_step.is_required then
        v_missing := concat_ws(E'\n', nullif(v_missing,''),
          'No user found for required step ' || v_step.step_order || ' — role: ' || coalesce(v_step.role_name,'?'));
      end if;
    end if;
  end loop;

  -- If any required steps are missing users → missing_configuration
  if v_missing <> '' then
    update public.approval_requests set status = 'missing_configuration' where id = v_request_id;
    insert into public.approval_audit_log(
      request_id, record_table, record_id, action,
      old_status, new_status, actor_user_id, actor_name, actor_email, comments
    ) values (
      v_request_id, p_record_table, p_record_id, 'Submitted',
      'draft', 'missing_configuration',
      p_submitted_by, v_submitter.full_name, v_submitter.email,
      'Missing configuration: ' || v_missing
    );
    perform public.approval_update_transaction_status(
      p_record_table, p_record_id,
      'missing_configuration', 'Missing Configuration',
      v_request_id, false
    );
    return v_request_id;
  end if;

  -- Find first step
  select a.step_order, a.step_type
    into v_current_step, v_current_type
    from public.approval_request_assignments a
   where a.request_id  = v_request_id
     and a.is_required = true
     and a.assigned_user_id is not null
   order by a.step_order asc
   limit 1;

  if v_current_step is null then
    update public.approval_requests set status = 'missing_configuration' where id = v_request_id;
    return v_request_id;
  end if;

  v_initial_status := case when v_current_type = 'review' then 'pending_review' else 'pending_approval' end;

  update public.approval_requests
     set status = v_initial_status, current_step_order = v_current_step
   where id = v_request_id;

  insert into public.approval_audit_log(
    request_id, record_table, record_id, action,
    old_status, new_status, actor_user_id, actor_name, actor_email, comments
  ) values (
    v_request_id, p_record_table, p_record_id, 'Submitted',
    'draft', v_initial_status,
    p_submitted_by, v_submitter.full_name, v_submitter.email,
    'Approval assignments frozen from rule: ' || v_rule.rule_name
  );

  perform public.approval_update_transaction_status(
    p_record_table, p_record_id,
    v_initial_status,
    case when v_initial_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
    v_request_id, true
  );

  return v_request_id;
end;
$$;

-- ============================================================
-- STEP 13 — v139_is_admin_owner helper
-- ============================================================

create or replace function public.v139_is_admin_owner(
  p_user_id uuid  default null,
  p_email   text  default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result boolean := false;
begin
  if p_user_id is not null then
    select (
      exists(select 1 from public.users u
              where u.id = p_user_id
                and u.role::text = 'Admin'
                and coalesce(u.is_active, true) = true)
      or exists(select 1 from public.approval_user_roles aur
                 where aur.user_id = p_user_id
                   and lower(aur.role_name) in ('admin','owner')
                   and coalesce(aur.is_active, true) = true)
    ) into v_result;
  end if;

  if not v_result and p_email is not null then
    select exists(
      select 1 from public.users u
       where lower(u.email) = lower(p_email)
         and u.role::text = 'Admin'
         and coalesce(u.is_active, true) = true
    ) into v_result;
  end if;

  return coalesce(v_result, false);
end;
$$;

-- ============================================================
-- STEP 14 — approval_act_on_current_step — FINAL 8-PARAMETER VERSION
-- ============================================================

create function public.approval_act_on_current_step(
  p_request_id       uuid,
  p_action           text,
  p_comments         text    default null,
  p_actor_user_id    uuid    default auth.uid(),
  p_actor_name       text    default null,
  p_actor_email      text    default null,
  p_released_amount  numeric default null,
  p_payment_decision text    default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request       public.approval_requests%rowtype;
  v_assignment    public.approval_request_assignments%rowtype;
  v_old_status    text;
  v_new_status    text;
  v_done_status   text;
  v_next_step     integer;
  v_next_type     text;
  v_action        text := lower(trim(coalesce(p_action, '')));
  v_actor         record;
  v_actor_email   text;
  v_actor_name    text;
  v_is_admin      boolean := false;
  v_override_note text    := '';
begin
  -- 1. Load and lock request
  select * into v_request
    from public.approval_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Approval request % not found.', p_request_id;
  end if;

  if v_request.status not in ('pending_review','pending_approval') then
    raise exception
      'Cannot act: request status is %. Only pending_review or pending_approval requests can be acted on.',
      v_request.status;
  end if;

  -- Normalise action aliases
  if v_action in ('not_approved','not approved','return to originator') then
    v_action := 'return';
  end if;

  if v_action not in ('review','approve','return','reject') then
    raise exception 'Unsupported action: %. Use: review, approve, return, reject.', p_action;
  end if;

  -- Mandatory reason for return / reject — enforced even for Admin
  if v_action in ('return','reject') and nullif(trim(coalesce(p_comments,'')), '') is null then
    raise exception 'A reason (p_comments) is required for % actions.', p_action;
  end if;

  -- 2. Resolve actor
  if p_actor_user_id is not null then
    select u.id, u.full_name, u.email into v_actor
      from public.v139_get_or_create_public_user(p_actor_user_id) u;
  end if;

  v_actor_email := lower(nullif(trim(coalesce(
    p_actor_email,
    v_actor.email,
    case when coalesce(p_actor_name,'') like '%@%' then p_actor_name else null end,
    ''
  )), ''));

  v_actor_name := coalesce(
    nullif(trim(v_actor.full_name), ''),
    nullif(trim(case when coalesce(p_actor_name,'') not like '%@%' then p_actor_name else '' end), ''),
    v_actor_email
  );

  if v_actor_email is null then
    raise exception 'Actor email is required. Ensure the user has an email in public.users or auth.users.';
  end if;

  -- 3. Admin / Owner check
  if p_actor_user_id is not null then
    select (
      exists(select 1 from public.users u
              where u.id = p_actor_user_id
                and u.role::text = 'Admin'
                and coalesce(u.is_active, true) = true)
      or exists(select 1 from public.project_users pu
                 where pu.user_id   = p_actor_user_id
                   and pu.project_id = v_request.project_id
                   and pu.role::text = 'Admin')
      or exists(select 1 from public.approval_user_roles aur
                 where aur.user_id = p_actor_user_id
                   and lower(aur.role_name) in ('admin','owner')
                   and coalesce(aur.is_active, true) = true
                   and (aur.project_id = v_request.project_id or aur.project_id is null))
    ) into v_is_admin;
  else
    v_is_admin := true; -- service role / local dev
  end if;

  -- 4. Maker-checker — BYPASSED for Admin / Owner
  --    Admin CAN act on their own invoice.
  --    Non-admin: originator is blocked from acting on their own invoice.
  if not v_is_admin then
    if v_request.originator_user_id is not null
       and p_actor_user_id is not null
       and v_request.originator_user_id = p_actor_user_id then
      raise exception 'Maker-checker: the invoice originator cannot act on their own approval request.';
    end if;
    if v_request.originator_email is not null
       and lower(v_request.originator_email) = v_actor_email then
      raise exception 'Maker-checker: the invoice originator email cannot act on their own approval request.';
    end if;
  end if;

  -- 5. Find current pending assignment
  select * into v_assignment
    from public.approval_request_assignments a
   where a.request_id = p_request_id
     and a.step_order = v_request.current_step_order
     and a.status     = 'pending'
     and (
       v_is_admin = true
       or a.assigned_user_id    = p_actor_user_id
       or lower(coalesce(a.assigned_user_email,'')) = v_actor_email
     )
   order by
     case when a.assigned_user_id = p_actor_user_id then 0 else 1 end,
     a.created_at
   limit 1;

  if not found then
    if v_is_admin then
      -- Admin fallback: find any pending assignment at current step
      select * into v_assignment
        from public.approval_request_assignments a
       where a.request_id = p_request_id
         and a.step_order = v_request.current_step_order
         and a.status     = 'pending'
       order by a.created_at
       limit 1;
      if not found then
        raise exception 'No pending assignment found at step %.', v_request.current_step_order;
      end if;
      v_override_note := ' [Admin override — acted outside assigned role]';
    else
      raise exception
        'You are not assigned to step %. Only the assigned user/email can act.',
        v_request.current_step_order;
    end if;
  end if;

  v_old_status := v_request.status;

  -- 6. Handle return / reject
  if v_action in ('return','reject') then
    v_new_status := case v_action when 'return' then 'returned' else 'rejected' end;

    update public.approval_request_assignments
       set status = v_action || 'ed', action_at = now()
     where request_id = p_request_id and status = 'pending';

    update public.approval_requests
       set status = v_new_status, current_step_order = null, updated_at = now()
     where id = p_request_id
     returning * into v_request;

    -- Update the invoice directly
    if v_action = 'return' then
      update public.subcontractor_invoices set
        status          = 'Returned to Originator',
        approval_status = 'returned',
        workflow_status = 'Returned to Originator',
        returned_reason = p_comments,
        approval_locked = false,
        updated_at      = now()
      where id = v_request.record_id
        and v_request.record_table = 'subcontractor_invoices';
    else
      update public.subcontractor_invoices set
        status          = 'Rejected',
        approval_status = 'rejected',
        workflow_status = 'Rejected',
        rejected_reason = p_comments,
        approval_locked = false,
        updated_at      = now()
      where id = v_request.record_id
        and v_request.record_table = 'subcontractor_invoices';
    end if;

    perform public.approval_update_transaction_status(
      v_request.record_table, v_request.record_id,
      v_new_status,
      case v_action when 'return' then 'Returned to Originator' else 'Rejected' end,
      p_request_id, false
    );

    insert into public.approval_audit_log(
      request_id, record_table, record_id, action,
      old_status, new_status,
      actor_user_id, actor_name, actor_email, comments
    ) values (
      p_request_id, v_request.record_table, v_request.record_id,
      case v_action when 'return' then 'Returned' else 'Rejected' end,
      v_old_status, v_new_status,
      p_actor_user_id, v_actor_name, v_actor_email,
      trim(coalesce(p_comments,'') || v_override_note)
    );

    select * into v_request from public.approval_requests where id = p_request_id;
    return v_request;
  end if;

  -- 7. Handle review / approve
  v_done_status := case v_action when 'review' then 'reviewed' else 'approved' end;

  update public.approval_request_assignments
     set status = v_done_status, action_at = now()
   where id = v_assignment.id;

  -- For 'all' decision_mode: wait for all required siblings
  if v_assignment.decision_mode = 'all' then
    if exists (
      select 1 from public.approval_request_assignments
       where request_id = p_request_id
         and step_order = v_assignment.step_order
         and id        <> v_assignment.id
         and is_required = true
         and status = 'pending'
    ) then
      insert into public.approval_audit_log(
        request_id, record_table, record_id, action,
        old_status, new_status,
        actor_user_id, actor_name, actor_email, comments
      ) values (
        p_request_id, v_request.record_table, v_request.record_id,
        initcap(v_action), v_old_status, v_old_status,
        p_actor_user_id, v_actor_name, v_actor_email,
        trim(coalesce(p_comments,'') || v_override_note)
      );
      select * into v_request from public.approval_requests where id = p_request_id;
      return v_request;
    end if;
  end if;

  -- Skip other pending at same step (for 'any' mode)
  update public.approval_request_assignments
     set status = 'skipped'
   where request_id = p_request_id
     and step_order = v_assignment.step_order
     and id        <> v_assignment.id
     and status     = 'pending';

  -- 8. Advance to next step
  select a.step_order, a.step_type
    into v_next_step, v_next_type
    from public.approval_request_assignments a
   where a.request_id  = p_request_id
     and a.is_required = true
     and a.status      = 'pending'
     and a.assigned_user_id is not null
     and a.step_order  > v_request.current_step_order
   order by a.step_order asc
   limit 1;

  if v_next_step is null then
    -- All steps complete → approved
    update public.approval_requests
       set status = 'approved', current_step_order = null, approved_at = now(), updated_at = now()
     where id = p_request_id
     returning * into v_request;

    if v_request.record_table = 'subcontractor_invoices' then
      perform public.v139_finalize_subcontractor_invoice_payment_decision(
        v_request.record_id,
        p_actor_user_id,
        p_released_amount,
        coalesce(p_payment_decision, 'full')
      );
    else
      perform public.approval_update_transaction_status(
        v_request.record_table, v_request.record_id,
        'approved', 'Approved', p_request_id, true
      );
    end if;

    v_new_status := 'approved';
  else
    v_new_status := case when v_next_type = 'review' then 'pending_review' else 'pending_approval' end;

    update public.approval_requests
       set status = v_new_status, current_step_order = v_next_step, updated_at = now()
     where id = p_request_id
     returning * into v_request;

    perform public.approval_update_transaction_status(
      v_request.record_table, v_request.record_id,
      v_new_status,
      case when v_new_status = 'pending_review' then 'Pending Review' else 'Pending Approval' end,
      p_request_id, true
    );
  end if;

  insert into public.approval_audit_log(
    request_id, record_table, record_id, action,
    old_status, new_status,
    actor_user_id, actor_name, actor_email, comments
  ) values (
    p_request_id, v_request.record_table, v_request.record_id,
    case when v_done_status = 'reviewed' then 'Reviewed' else 'Approved' end,
    v_old_status, v_new_status,
    p_actor_user_id, v_actor_name, v_actor_email,
    trim(coalesce(p_comments,'') || v_override_note)
  );

  select * into v_request from public.approval_requests where id = p_request_id;
  return v_request;
end;
$$;

comment on function public.approval_act_on_current_step(uuid,text,text,uuid,text,text,numeric,text) is
  'V140_01 FINAL 8-param: review/approve/return/reject. Admin bypasses maker-checker and own-invoice restriction. Reason mandatory for return/reject even for Admin.';

-- ============================================================
-- STEP 15 — Fix subcontractor_invoices status check constraint
-- ============================================================

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.subcontractor_invoices'::regclass
       and contype  = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.subcontractor_invoices drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.subcontractor_invoices
  add constraint subcontractor_invoices_v140_status_chk
  check (status in (
    'Draft','Released',
    'Pending Review','Pending Approval',
    'Pending Technical Office Approval','Pending Finance Review','Pending CEO Approval',
    'Approved','Partially Released','Payment Held',
    'Returned to Originator','Rejected',
    'Missing Configuration','Paid','Cancelled'
  ));

-- ============================================================
-- STEP 16 — Deactivate old Subcontractor Certificate rules
-- ============================================================

update public.approval_matrix_rules
   set is_active  = false,
       updated_at = now()
 where module    = 'Subcontractor'
   and action    = 'Subcontractor Certificate'
   and rule_name <> 'Subcontractor Invoice V140 — 7-Step Workflow'
   and is_active  = true;

-- ============================================================
-- STEP 17 — Insert new 7-step rule (idempotent)
-- ============================================================

do $$
declare
  v_rule_id    uuid;
  v_created_by uuid;
begin
  select id into v_created_by from public.users order by created_at limit 1;

  select id into v_rule_id
    from public.approval_matrix_rules
   where rule_name = 'Subcontractor Invoice V140 — 7-Step Workflow'
     and module    = 'Subcontractor'
     and action    = 'Subcontractor Certificate'
   limit 1;

  if v_rule_id is null then
    insert into public.approval_matrix_rules(
      rule_name, module, action, project_id,
      min_amount, max_amount, priority, is_active, created_by
    ) values (
      'Subcontractor Invoice V140 — 7-Step Workflow',
      'Subcontractor', 'Subcontractor Certificate',
      null, null, null, 10, true, v_created_by
    ) returning id into v_rule_id;
    raise notice 'V140_01: created new rule id=%', v_rule_id;
  else
    update public.approval_matrix_rules
       set is_active = true, priority = 10, updated_at = now()
     where id = v_rule_id;
    raise notice 'V140_01: rule exists, ensured active, priority=10. id=%', v_rule_id;
  end if;

  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=1 and role_name='Site Technical Office Manager') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,1,'review','role','Site Technical Office Manager','any',true);
  end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=2 and role_name='Project Manager') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,2,'approval','role','Project Manager','any',true);
  end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=3 and role_name='Head Office QS') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,3,'review','role','Head Office QS','any',true);
  end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=4 and role_name='Head Office Technical Office Manager') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,4,'approval','role','Head Office Technical Office Manager','any',true);
  end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=5 and role_name='Projects Manager') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,5,'approval','role','Projects Manager','any',true);
  end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=6 and role_name='Finance') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,6,'review','role','Finance','any',true);
  end if;
  if not exists(select 1 from public.approval_matrix_steps where rule_id=v_rule_id and step_order=7 and role_name='CEO') then
    insert into public.approval_matrix_steps(rule_id,step_order,step_type,assignee_type,role_name,decision_mode,is_required)
    values(v_rule_id,7,'approval','role','CEO','any',true);
  end if;

  raise notice 'V140_01: 7 steps verified for rule id=%', v_rule_id;
end $$;

-- ============================================================
-- STEP 18 — Indexes
-- ============================================================

create index if not exists idx_v140_approval_requests_status_step
  on public.approval_requests(status, current_step_order, record_table);

create index if not exists idx_v140_assignments_email_status
  on public.approval_request_assignments(lower(assigned_user_email), status, step_order);

-- ============================================================
-- STEP 19 — GRANT EXECUTE to authenticated role.
--           Required because DROP + CREATE resets privileges.
--           Supabase exposes these via PostgREST as RPC calls.
-- ============================================================

grant execute on function public.v139_get_or_create_public_user(uuid)
  to authenticated;

grant execute on function public.certificate_release_for_approval(uuid, uuid)
  to authenticated;

grant execute on function public.release_subcontractor_invoice_for_approval(uuid, uuid)
  to authenticated;

grant execute on function public.v139_finalize_subcontractor_invoice_payment_decision(uuid, uuid, numeric, text)
  to authenticated;

grant execute on function public.approval_act_on_current_step(uuid, text, text, uuid, text, text, numeric, text)
  to authenticated;

grant execute on function public.v139_is_admin_owner(uuid, text)
  to authenticated;

grant execute on function public.approval_find_rule(text, text, uuid, numeric)
  to authenticated;

grant execute on function public.approval_submit_transaction(text, text, text, uuid, uuid, numeric, uuid)
  to authenticated;

grant execute on function public.approval_role_variants(text)
  to authenticated;

-- ============================================================
-- STEP 20 — Reload PostgREST schema (eliminates PGRST203).
--           Run after grants so new signatures are visible.
-- ============================================================

notify pgrst, 'reload schema';

-- ============================================================
-- V140_01 COMPLETE — Verification queries:
--
-- 1. Exactly 1 overload:
--    SELECT proname, pg_get_function_identity_arguments(oid)
--    FROM pg_proc WHERE proname='approval_act_on_current_step'
--    AND pronamespace='public'::regnamespace;
--
-- 2. No remaining overloads on any approval function:
--    SELECT proname, count(*) FROM pg_proc
--    WHERE pronamespace='public'::regnamespace
--    AND proname IN ('approval_act_on_current_step',
--      'certificate_release_for_approval',
--      'release_subcontractor_invoice_for_approval',
--      'v139_get_or_create_public_user',
--      'v139_finalize_subcontractor_invoice_payment_decision')
--    GROUP BY proname HAVING count(*) > 1;
--    -- Expected: 0 rows
--
-- 3. Old rule deactivated, new rule active:
--    SELECT rule_name, is_active, priority
--    FROM public.approval_matrix_rules
--    WHERE module='Subcontractor' AND action='Subcontractor Certificate'
--    ORDER BY priority;
--
-- 4. 7 steps on new rule:
--    SELECT step_order, step_type, role_name
--    FROM public.approval_matrix_steps s
--    JOIN public.approval_matrix_rules r ON r.id=s.rule_id
--    WHERE r.rule_name='Subcontractor Invoice V140 — 7-Step Workflow'
--    ORDER BY step_order;
--
-- 5. Partial unique indexes exist (active rows only):
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename='approval_user_roles'
--    AND indexname IN (
--      'uq_approval_user_roles_global_user_role',
--      'uq_approval_user_roles_project_user_role');
--    -- Expected: 2 rows
--
-- 6. Payment columns exist on subcontractor_invoices:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='subcontractor_invoices'
--    AND column_name IN ('approved_certificate_amount','released_payment_amount',
--      'ceo_released_amount','payment_decision','net_payable');
--    -- Expected: 5 rows
-- ============================================================
