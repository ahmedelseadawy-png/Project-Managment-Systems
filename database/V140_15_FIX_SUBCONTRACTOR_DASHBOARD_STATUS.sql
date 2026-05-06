-- V140_15 Fix subcontractor dashboard building counts and status logic
-- Safe view-only stabilization after V140_14. No data is dropped or mutated.

alter table public.subcontractor_contract_items
  add column if not exists villa_id uuid null,
  add column if not exists building_id uuid null;

-- V140_14 could classify contract items with no P6 mapping and no planned dates
-- as Working. Physical health must remain schedule/site based, not certified based.
create or replace view public.v_subcontractor_workfronts as
select
  ps.contract_item_id as id,
  ps.project_id,
  ps.subcontractor_id,
  ps.contract_id,
  ci.villa_id,
  ci.building_id,
  ps.villa_no,
  ps.building_no,
  ps.trade,
  ps.planned_start_date,
  ps.planned_finish_date,
  null::date as actual_start_date,
  null::date as actual_finish_date,
  ps.site_progress_percent as actual_progress_percent,
  ps.planned_progress_percent,
  greatest(0, current_date - coalesce(ps.planned_finish_date, current_date))::int as delay_days,
  case
    when ps.planned_start_date is null and ps.planned_finish_date is null then 'No Schedule'
    when ps.site_progress_percent >= 100 then 'Completed'
    when ps.planned_start_date is not null and current_date < ps.planned_start_date and ps.site_progress_percent = 0 then 'Not Started'
    when ps.planned_start_date is not null and current_date > ps.planned_start_date and ps.site_progress_percent = 0 then 'Delayed'
    when ps.planned_finish_date is not null and current_date > ps.planned_finish_date and ps.site_progress_percent < 100 then 'Delayed'
    when ps.site_progress_percent < ps.planned_progress_percent - 10 then 'Delayed'
    when ps.planned_finish_date is not null and ps.planned_finish_date <= current_date + 7 and ps.site_progress_percent < 80 then 'At Risk'
    else 'Working'
  end as health_status,
  case
    when ps.planned_start_date is null and ps.planned_finish_date is null then 'No Schedule'
    when ps.site_progress_percent >= 100 then 'Completed'
    when ps.planned_start_date is not null and current_date < ps.planned_start_date and ps.site_progress_percent = 0 then 'Not Started'
    when ps.planned_start_date is not null and current_date > ps.planned_start_date and ps.site_progress_percent = 0 then 'Delayed'
    when ps.planned_finish_date is not null and current_date > ps.planned_finish_date and ps.site_progress_percent < 100 then 'Delayed'
    when ps.site_progress_percent < ps.planned_progress_percent - 10 then 'Delayed'
    when ps.planned_finish_date is not null and ps.planned_finish_date <= current_date + 7 and ps.site_progress_percent < 80 then 'At Risk'
    else 'Working'
  end as status,
  null::text as notes,
  ps.site_progress_percent,
  ps.certified_progress_percent,
  ps.paid_progress_percent,
  ps.contract_value,
  ps.certified_value,
  ps.paid_value,
  ps.outstanding_value
from public.v_contract_item_progress_summary ps
left join public.subcontractor_contract_items ci on ci.id = ps.contract_item_id;

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
), building_rollup as (
  select
    ib.project_id,
    ib.subcontractor_id,
    ib.building_key,
    bool_or(coalesce(ib.has_p6_mapping, false)) as has_p6_mapping,
    bool_or(ib.planned_start_date is not null or ib.planned_finish_date is not null) as has_planned_dates,
    min(ib.planned_start_date) as planned_start_date,
    max(ib.planned_finish_date) as planned_finish_date,
    avg(ib.planned_progress_percent) as planned_progress_percent,
    avg(ib.site_progress_percent) as site_progress_percent,
    bool_or(wf.status = 'Delayed') as has_delayed,
    bool_or(wf.status = 'At Risk') as has_at_risk,
    bool_and(wf.status = 'Completed') as all_completed
  from item_base ib
  left join public.v_subcontractor_workfronts wf on wf.id = ib.contract_item_id
  where ib.building_key is not null
  group by ib.project_id, ib.subcontractor_id, ib.building_key
), building_status as (
  select
    *,
    case
      when has_delayed then 'Delayed'
      when has_at_risk then 'At Risk'
      when not has_planned_dates then 'No Schedule'
      when coalesce(site_progress_percent,0) >= 100 or all_completed then 'Completed'
      when planned_start_date is not null and current_date < planned_start_date and coalesce(site_progress_percent,0) = 0 then 'Not Started'
      when coalesce(site_progress_percent,0) > 0 then 'Working'
      when has_planned_dates and coalesce(planned_progress_percent,0) <= 10 and coalesce(site_progress_percent,0) = 0 then 'Not Started'
      else 'Working'
    end as status
  from building_rollup
), building_counts as (
  select
    project_id,
    subcontractor_id,
    count(*)::int as assigned_buildings,
    count(*) filter (where status = 'Working')::int as working_count,
    count(*) filter (where status = 'Not Started')::int as not_started_count,
    count(*) filter (where status = 'Completed')::int as completed_count,
    count(*) filter (where status = 'Delayed')::int as delayed_count,
    count(*) filter (where status = 'At Risk')::int as at_risk_count,
    count(*) filter (where status = 'No Schedule')::int as no_schedule_count
  from building_status
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
