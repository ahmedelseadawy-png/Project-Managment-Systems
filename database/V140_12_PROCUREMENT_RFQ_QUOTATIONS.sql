-- V140_12 Procurement RFQ / Quotation module

create table if not exists public.procurement_rfqs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  rfq_no text not null,
  title text not null,
  procurement_record_id uuid null references public.procurement_records(id) on delete set null,
  material text null,
  required_qty numeric(18,3) null,
  unit text null,
  due_date date null,
  status text not null default 'Draft'
    check (status in ('Draft','Issued','Supplier Selected','PO Pending','Closed','Cancelled')),
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, rfq_no)
);

alter table public.procurement_rfqs
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists rfq_no text,
  add column if not exists title text,
  add column if not exists procurement_record_id uuid null references public.procurement_records(id) on delete set null,
  add column if not exists material text null,
  add column if not exists required_qty numeric(18,3) null,
  add column if not exists unit text null,
  add column if not exists due_date date null,
  add column if not exists status text not null default 'Draft',
  add column if not exists notes text null,
  add column if not exists created_by uuid null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.procurement_quotation_offers (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.procurement_rfqs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_name text not null,
  total_amount numeric(18,2) null,
  delivery_days integer null check (delivery_days is null or delivery_days >= 0),
  payment_terms text null,
  validity_date date null,
  notes text null,
  is_selected boolean not null default false,
  selection_reason text null,
  selected_at timestamptz null,
  selected_by text null,
  po_conversion_status text not null default 'not_started'
    check (po_conversion_status in ('not_started','ready_for_po','converted')),
  purchase_order_id uuid null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procurement_offer_selection_reason_required
    check (is_selected = false or nullif(btrim(selection_reason), '') is not null)
);

alter table public.procurement_quotation_offers
  add column if not exists rfq_id uuid references public.procurement_rfqs(id) on delete cascade,
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists supplier_name text,
  add column if not exists total_amount numeric(18,2) null,
  add column if not exists delivery_days integer null,
  add column if not exists payment_terms text null,
  add column if not exists validity_date date null,
  add column if not exists notes text null,
  add column if not exists is_selected boolean not null default false,
  add column if not exists selection_reason text null,
  add column if not exists selected_at timestamptz null,
  add column if not exists selected_by text null,
  add column if not exists po_conversion_status text not null default 'not_started',
  add column if not exists purchase_order_id uuid null,
  add column if not exists created_by uuid null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.procurement_quotation_offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.procurement_quotation_offers(id) on delete cascade,
  rfq_id uuid not null references public.procurement_rfqs(id) on delete cascade,
  description text not null,
  qty numeric(18,3) null,
  unit text null,
  unit_price numeric(18,2) null,
  total_price numeric(18,2) generated always as (
    case
      when qty is null or unit_price is null then null
      else round((qty * unit_price)::numeric, 2)
    end
  ) stored,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.procurement_quotation_offer_items
  add column if not exists offer_id uuid references public.procurement_quotation_offers(id) on delete cascade,
  add column if not exists rfq_id uuid references public.procurement_rfqs(id) on delete cascade,
  add column if not exists description text,
  add column if not exists qty numeric(18,3) null,
  add column if not exists unit text null,
  add column if not exists unit_price numeric(18,2) null,
  add column if not exists total_price numeric(18,2) generated always as (
    case
      when qty is null or unit_price is null then null
      else round((qty * unit_price)::numeric, 2)
    end
  ) stored,
  add column if not exists notes text null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists procurement_one_selected_offer_per_rfq
on public.procurement_quotation_offers(rfq_id)
where is_selected;

create index if not exists procurement_rfqs_project_idx
on public.procurement_rfqs(project_id, created_at desc);

create index if not exists procurement_quotation_offers_rfq_idx
on public.procurement_quotation_offers(rfq_id, created_at);

create index if not exists procurement_quotation_offer_items_offer_idx
on public.procurement_quotation_offer_items(offer_id, created_at);

create or replace function public.procurement_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_procurement_rfqs_touch on public.procurement_rfqs;
create trigger trg_procurement_rfqs_touch
before update on public.procurement_rfqs
for each row execute function public.procurement_touch_updated_at();

drop trigger if exists trg_procurement_quotation_offers_touch on public.procurement_quotation_offers;
create trigger trg_procurement_quotation_offers_touch
before update on public.procurement_quotation_offers
for each row execute function public.procurement_touch_updated_at();

drop trigger if exists trg_procurement_quotation_offer_items_touch on public.procurement_quotation_offer_items;
create trigger trg_procurement_quotation_offer_items_touch
before update on public.procurement_quotation_offer_items
for each row execute function public.procurement_touch_updated_at();

create or replace function public.procurement_select_quotation_offer(
  p_offer_id uuid,
  p_reason text,
  p_selected_by text default null
)
returns public.procurement_quotation_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.procurement_quotation_offers%rowtype;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Selection reason is required';
  end if;

  select * into v_offer
  from public.procurement_quotation_offers
  where id = p_offer_id;

  if not found then
    raise exception 'Quotation offer not found';
  end if;

  update public.procurement_quotation_offers
     set is_selected = false,
         selection_reason = null,
         selected_at = null,
         selected_by = null
   where rfq_id = v_offer.rfq_id
     and id <> p_offer_id;

  update public.procurement_quotation_offers
     set is_selected = true,
         selection_reason = btrim(p_reason),
         selected_at = now(),
         selected_by = p_selected_by
   where id = p_offer_id
   returning * into v_offer;

  update public.procurement_rfqs
     set status = 'Supplier Selected'
   where id = v_offer.rfq_id;

  return v_offer;
end;
$$;

alter table public.procurement_rfqs enable row level security;
alter table public.procurement_quotation_offers enable row level security;
alter table public.procurement_quotation_offer_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'procurement_rfqs',
    'procurement_quotation_offers',
    'procurement_quotation_offer_items'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_all_dev" on public.%1$s', t);
    execute format('create policy "%1$s_select_all_dev" on public.%1$s for select to public using (true)', t);
    execute format('drop policy if exists "%1$s_insert_all_dev" on public.%1$s', t);
    execute format('create policy "%1$s_insert_all_dev" on public.%1$s for insert to public with check (true)', t);
    execute format('drop policy if exists "%1$s_update_all_dev" on public.%1$s', t);
    execute format('create policy "%1$s_update_all_dev" on public.%1$s for update to public using (true) with check (true)', t);
    execute format('drop policy if exists "%1$s_delete_all_dev" on public.%1$s', t);
    execute format('create policy "%1$s_delete_all_dev" on public.%1$s for delete to public using (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
