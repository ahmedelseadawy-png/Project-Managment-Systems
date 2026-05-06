-- V140_16 Fix workfront grouping
-- Safe view-only stabilization. No data is dropped or mutated.

alter table public.subcontractor_contract_items
  add column if not exists villa_id uuid null,
  add column if not exists building_id uuid null;

create or replace view public.v_subcontractor_workfronts as
with item_locations_raw as (
  select
    ps.*,
    s.subcontractor_code,
    s.name as subcontractor_name,
    ci.villa_id,
    ci.building_id,
    coalesce(
      ci.villa_id::text,
      ci.building_id::text,
      nullif(trim(coalesce(ps.villa_no, '')), ''),
      nullif(trim(coalesce(ps.building_no, '')), '')
    ) as raw_building_key
  from public.v_contract_item_progress_summary ps
  left join public.subcontractor_contract_items ci on ci.id = ps.contract_item_id
  left join public.subcontractors s on s.id = ps.subcontractor_id
), item_locations as (
  select
    r.*,
    max(case when r.raw_building_key is not null then 1 else 0 end)
      over (partition by r.project_id, r.subcontractor_id, r.contract_id, coalesce(r.trade, 'General')) as has_any_building_key
  from item_locations_raw r
), item_base as (
  select
    *,
    coalesce(trade, 'General') as workfront_trade,
    case
      when raw_building_key is not null then raw_building_key
      when has_any_building_key = 1 then null
      else 'unassigned::' || coalesce(project_id::text, 'no-project') || '::' ||
           coalesce(subcontractor_id::text, 'no-subcontractor') || '::' ||
           coalesce(contract_id::text, 'no-contract') || '::' ||
           coalesce(trade, 'General')
    end as building_key
  from item_locations
), grouped as (
  select
    project_id,
    subcontractor_id,
    contract_id,
    building_key,
    workfront_trade as trade,
    max(subcontractor_code) as subcontractor_code,
    coalesce(max(subcontractor_name), 'Subcontractor') as subcontractor_name,
    (array_agg(villa_id) filter (where villa_id is not null))[1] as villa_id,
    (array_agg(building_id) filter (where building_id is not null))[1] as building_id,
    coalesce(max(nullif(trim(coalesce(villa_no, '')), '')), max(nullif(trim(coalesce(building_no, '')), ''))) as villa_no,
    max(nullif(trim(coalesce(building_no, '')), '')) as building_no,
    min(planned_start_date) as planned_start_date,
    max(planned_finish_date) as planned_finish_date,
    bool_or(coalesce(has_p6_mapping, false)) as has_p6_mapping,
    bool_or(planned_start_date is not null or planned_finish_date is not null) as has_planned_dates,
    sum(coalesce(contract_value, 0)) as contract_value,
    sum(coalesce(certified_value, 0)) as certified_value,
    sum(coalesce(paid_value, 0)) as paid_value,
    case
      when sum(coalesce(contract_value, 0)) > 0 then
        sum(coalesce(site_progress_percent, 0) * coalesce(contract_value, 0))
        / nullif(sum(coalesce(contract_value, 0)), 0)
      else avg(coalesce(site_progress_percent, 0))
    end as site_progress_percent
  from item_base
  where building_key is not null
  group by project_id, subcontractor_id, contract_id, building_key, workfront_trade
), progress as (
  select
    *,
    case
      when planned_start_date is null or planned_finish_date is null then 0
      when current_date <= planned_start_date then 0
      when current_date >= planned_finish_date then 100
      when planned_finish_date = planned_start_date then 100
      else least(100, greatest(0,
        (current_date - planned_start_date)::numeric
        / nullif((planned_finish_date - planned_start_date)::numeric, 0)
        * 100
      ))
    end::numeric(9,3) as planned_progress_percent
  from grouped
), health as (
  select
    *,
    case
      when planned_start_date is null and planned_finish_date is null then 'No Schedule'
      when coalesce(site_progress_percent, 0) >= 100 then 'Completed'
      when planned_start_date is not null and current_date > planned_start_date and coalesce(site_progress_percent, 0) = 0 then 'Delayed'
      when planned_finish_date is not null and current_date > planned_finish_date and coalesce(site_progress_percent, 0) < 100 then 'Delayed'
      when coalesce(site_progress_percent, 0) < planned_progress_percent - 10 then 'Delayed'
      when planned_finish_date is not null and planned_finish_date <= current_date + 7 and coalesce(site_progress_percent, 0) < 80 then 'At Risk'
      else 'On Track'
    end as health_status
  from progress
)
select
  (
    substr(md5(coalesce(project_id::text,'') || '|' || coalesce(subcontractor_id::text,'') || '|' || coalesce(contract_id::text,'') || '|' || coalesce(building_key,'') || '|' || coalesce(trade,'')), 1, 8) || '-' ||
    substr(md5(coalesce(project_id::text,'') || '|' || coalesce(subcontractor_id::text,'') || '|' || coalesce(contract_id::text,'') || '|' || coalesce(building_key,'') || '|' || coalesce(trade,'')), 9, 4) || '-' ||
    substr(md5(coalesce(project_id::text,'') || '|' || coalesce(subcontractor_id::text,'') || '|' || coalesce(contract_id::text,'') || '|' || coalesce(building_key,'') || '|' || coalesce(trade,'')), 13, 4) || '-' ||
    substr(md5(coalesce(project_id::text,'') || '|' || coalesce(subcontractor_id::text,'') || '|' || coalesce(contract_id::text,'') || '|' || coalesce(building_key,'') || '|' || coalesce(trade,'')), 17, 4) || '-' ||
    substr(md5(coalesce(project_id::text,'') || '|' || coalesce(subcontractor_id::text,'') || '|' || coalesce(contract_id::text,'') || '|' || coalesce(building_key,'') || '|' || coalesce(trade,'')), 21, 12)
  )::uuid as id,
  project_id,
  subcontractor_id,
  contract_id,
  villa_id,
  building_id,
  villa_no,
  building_no,
  trade,
  planned_start_date,
  planned_finish_date,
  null::date as actual_start_date,
  null::date as actual_finish_date,
  site_progress_percent::numeric(9,3) as actual_progress_percent,
  planned_progress_percent,
  greatest(0, current_date - coalesce(planned_finish_date, current_date))::int as delay_days,
  health_status,
  health_status as status,
  null::text as notes,
  site_progress_percent::numeric(9,3) as site_progress_percent,
  case when contract_value > 0 then least(100, certified_value / contract_value * 100) else 0 end::numeric(9,3) as certified_progress_percent,
  case when contract_value > 0 then least(100, paid_value / contract_value * 100) else 0 end::numeric(9,3) as paid_progress_percent,
  contract_value::numeric as contract_value,
  certified_value::numeric(18,3) as certified_value,
  paid_value::numeric(18,3) as paid_value,
  (certified_value - paid_value)::numeric as outstanding_value,
  has_p6_mapping,
  has_planned_dates,
  subcontractor_code,
  subcontractor_name
from health;

create or replace view public.v_subcontractor_dashboard as
with item_locations_raw as (
  select
    ps.*,
    s.subcontractor_code,
    s.name as subcontractor_name_source,
    s.trade_scope,
    ci.villa_id,
    ci.building_id,
    coalesce(
      ci.villa_id::text,
      ci.building_id::text,
      nullif(trim(coalesce(ps.villa_no, '')), ''),
      nullif(trim(coalesce(ps.building_no, '')), '')
    ) as raw_building_key
  from public.v_contract_item_progress_summary ps
  left join public.subcontractor_contract_items ci on ci.id = ps.contract_item_id
  left join public.subcontractors s on s.id = ps.subcontractor_id
), item_locations as (
  select
    r.*,
    max(case when r.raw_building_key is not null then 1 else 0 end)
      over (partition by r.project_id, r.subcontractor_id) as has_any_building_key
  from item_locations_raw r
), item_base as (
  select
    *,
    case
      when raw_building_key is not null then raw_building_key
      when has_any_building_key = 1 then null
      else 'unassigned::' || coalesce(contract_id::text, subcontractor_id::text, project_id::text)
    end as building_key
  from item_locations
), item_financial as (
  select
    project_id,
    subcontractor_id,
    max(subcontractor_code) as subcontractor_code,
    coalesce(max(subcontractor_name_source), 'Subcontractor') as subcontractor_name,
    coalesce(max(trade), max(trade_scope), 'General') as trade,
    round(avg(site_progress_percent),3)::numeric(9,3) as average_progress,
    round(avg(planned_progress_percent),3)::numeric(9,3) as planned_progress_percent,
    round(avg(site_progress_percent),3)::numeric(9,3) as site_progress_percent,
    case when sum(contract_value) > 0 then least(100, sum(certified_value) / sum(contract_value) * 100) else 0 end::numeric(9,3) as certified_progress_percent,
    case when sum(contract_value) > 0 then least(100, sum(paid_value) / sum(contract_value) * 100) else 0 end::numeric(9,3) as paid_progress_percent,
    sum(contract_value)::numeric(18,3) as contract_value,
    sum(certified_value)::numeric(18,3) as certified_value,
    sum(paid_value)::numeric(18,3) as paid_value,
    sum(outstanding_value)::numeric(18,3) as outstanding_value
  from item_base
  group by project_id, subcontractor_id
), building_counts as (
  select
    project_id,
    subcontractor_id,
    count(*)::int as assigned_buildings,
    count(*) filter (where status in ('Working','On Track'))::int as working_count,
    count(*) filter (where status = 'Not Started')::int as not_started_count,
    count(*) filter (where status = 'Completed')::int as completed_count,
    count(*) filter (where status = 'Delayed')::int as delayed_count,
    count(*) filter (where status = 'At Risk')::int as at_risk_count,
    count(*) filter (where status = 'No Schedule')::int as no_schedule_count
  from public.v_subcontractor_workfronts
  group by project_id, subcontractor_id
)
select
  f.project_id,
  f.subcontractor_id,
  f.subcontractor_code,
  f.subcontractor_name,
  f.trade,
  coalesce(bc.assigned_buildings, 0)::int as assigned_buildings,
  coalesce(bc.working_count, 0)::int as working_count,
  coalesce(bc.not_started_count, 0)::int as not_started_count,
  coalesce(bc.completed_count, 0)::int as completed_count,
  coalesce(bc.delayed_count, 0)::int as delayed_count,
  coalesce(bc.at_risk_count, 0)::int as at_risk_count,
  f.average_progress,
  f.planned_progress_percent,
  f.site_progress_percent,
  f.certified_progress_percent,
  f.paid_progress_percent,
  f.contract_value,
  f.certified_value,
  f.paid_value,
  f.outstanding_value,
  case
    when coalesce(bc.delayed_count,0) > 0 then 'Delayed'
    when coalesce(bc.at_risk_count,0) > 0 then 'At Risk'
    when coalesce(bc.assigned_buildings,0) > 0 and coalesce(bc.no_schedule_count,0) = coalesce(bc.assigned_buildings,0) then 'No Schedule'
    when coalesce(bc.assigned_buildings,0) > 0 and coalesce(bc.not_started_count,0) = coalesce(bc.assigned_buildings,0) then 'Not Started'
    when coalesce(bc.assigned_buildings,0) > 0 and coalesce(bc.completed_count,0) = coalesce(bc.assigned_buildings,0) then 'Completed'
    when coalesce(f.site_progress_percent,0) > 0 or coalesce(bc.working_count,0) > 0 then 'On Track'
    else 'No Schedule'
  end as health_status,
  coalesce(bc.working_count, 0)::int as working_buildings,
  coalesce(bc.not_started_count, 0)::int as not_started_buildings,
  coalesce(bc.completed_count, 0)::int as completed_buildings,
  0::int as paused_buildings,
  coalesce(bc.delayed_count, 0)::int as delayed_buildings,
  f.site_progress_percent as progress_percent,
  f.certified_value as certified_amount,
  f.paid_value as paid_amount,
  0::int as open_invoices
from item_financial f
left join building_counts bc
  on bc.project_id = f.project_id
 and bc.subcontractor_id = f.subcontractor_id;

grant select on public.v_subcontractor_workfronts to authenticated;
grant select on public.v_subcontractor_dashboard to authenticated;
