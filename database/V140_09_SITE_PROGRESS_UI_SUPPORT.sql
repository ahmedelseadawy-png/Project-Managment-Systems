-- V140_09 Site Progress UI support
-- Safe additive migration only. No data is dropped or mutated.

alter table public.site_progress_updates
  add column if not exists structure_node_id uuid null,
  add column if not exists villa_node_id uuid null,
  add column if not exists boq_item_id uuid null,
  add column if not exists breakdown_id uuid null,
  add column if not exists submitted_by uuid null,
  add column if not exists submitted_at timestamptz null,
  add column if not exists rejected_by uuid null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null;

create index if not exists idx_site_progress_updates_project_status
on public.site_progress_updates(project_id, status, progress_date desc);

create index if not exists idx_site_progress_updates_subcontractor
on public.site_progress_updates(project_id, subcontractor_id, status, progress_date desc);

create index if not exists idx_site_progress_updates_boq_item
on public.site_progress_updates(boq_item_id)
where boq_item_id is not null;

grant select, insert, update on public.site_progress_updates to authenticated;
