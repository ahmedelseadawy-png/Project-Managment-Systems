'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

type AnyRow = Record<string, any>

interface SubcontractorProgressDashboardProps {
  projectId?: string | null
  projectName?: string
  subcontractors?: AnyRow[]
  commercial?: AnyRow[]
  breakdowns?: AnyRow[]
  villaBreakdownLines?: AnyRow[]
  certificates?: AnyRow[]
  structureNodes?: AnyRow[]
  villaUnits?: AnyRow[]
  villaAssignments?: AnyRow[]
  villaProgress?: AnyRow[]
  onOpenContracts?: (subcontractorId?: string) => void
  onOpenInvoices?: (subcontractorId?: string) => void
}

const money = (value: any, currency = 'EGP') => {
  const n = Number(value || 0)
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const pct = (value: any) => `${Math.round(Number(value || 0))}%`
const text = (value: any) => String(value ?? '').trim()
const lower = (value: any) => text(value).toLowerCase()

function uniqueCount(values: any[]) {
  return new Set(values.filter(Boolean).map((x) => String(x))).size
}

export function SubcontractorProgressDashboard({
  projectId = null,
  projectName = 'Active Project',
  subcontractors = [],
  commercial = [],
  breakdowns = [],
  villaBreakdownLines = [],
  certificates = [],
  structureNodes = [],
  villaUnits = [],
  villaAssignments = [],
  villaProgress = [],
  onOpenContracts,
  onOpenInvoices,
}: SubcontractorProgressDashboardProps) {
  const [tradeFilter, setTradeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'progress' | 'value' | 'buildings'>('progress')
  const [dbRows, setDbRows] = useState<AnyRow[]>([])
  const [dbMessage, setDbMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadDashboardView() {
      try {
        const supabase = createClient()
        let query = supabase.from('v_subcontractor_dashboard').select('*')
        if (projectId) query = query.eq('project_id', projectId)
        const { data, error } = await query.limit(200)
        if (error) throw error
        if (cancelled) return
        const mapped = (data ?? []).map((r: any, idx: number) => ({
          id: String(r.subcontractor_id ?? `${r.subcontractor_name ?? 'sub'}-${idx}`),
          code: r.subcontractor_code || 'SC',
          name: r.subcontractor_name || 'Unassigned',
          trade: r.trade || 'General',
          status: r.health_status || 'Not Started',
          assignedBuildings: Number(r.assigned_buildings || 0),
          working: Number(r.working_count ?? r.working_buildings ?? 0),
          notStarted: Number(r.not_started_count ?? r.not_started_buildings ?? 0),
          completed: Number(r.completed_count ?? r.completed_buildings ?? 0),
          delayed: Number(r.delayed_count ?? r.delayed_buildings ?? 0),
          atRisk: Number(r.at_risk_count ?? 0),
          onHold: Number(r.paused_buildings || 0),
          progress: Number(r.average_progress ?? r.progress_percent ?? 0),
          plannedProgress: Number(r.planned_progress_percent ?? 0),
          siteProgress: Number(r.site_progress_percent ?? r.average_progress ?? r.progress_percent ?? 0),
          certifiedProgress: Number(r.certified_progress_percent ?? 0),
          paidProgress: Number(r.paid_progress_percent ?? 0),
          contractValue: Number(r.contract_value || 0),
          certified: Number(r.certified_value ?? r.certified_amount ?? 0),
          paid: Number(r.paid_value ?? r.paid_amount ?? 0),
          remaining: Number(r.outstanding_value ?? Math.max(0, Number(r.certified_value ?? r.certified_amount ?? 0) - Number(r.paid_value ?? r.paid_amount ?? 0))),
          invoices: Number(r.open_invoices || 0),
          openInvoices: Number(r.open_invoices || 0),
          lastInvoiceNo: '—',
          health: r.health_status || 'Not Started',
        }))
        setDbRows(mapped)
        setDbMessage(mapped.length ? 'Live data from v_subcontractor_dashboard.' : '')
      } catch (e: any) {
        if (!cancelled) {
          setDbRows([])
          setDbMessage(e?.message ? `Using calculated fallback data. ${e.message}` : 'Using calculated fallback data.')
        }
      }
    }
    void loadDashboardView()
    return () => { cancelled = true }
  }, [projectId, subcontractors.length])

  const computedRows = useMemo(() => {
    const commercialBySub = new Map(commercial.map((r) => [String(r.subcontractor_id ?? ''), r]))
    const progressByVilla = new Map<string, AnyRow[]>()
    ;(villaProgress || []).forEach((p) => {
      const key = String(p.villa_unit_id ?? '')
      if (!key) return
      const arr = progressByVilla.get(key) ?? []
      arr.push(p)
      progressByVilla.set(key, arr)
    })

    const nodeById = new Map((structureNodes || []).map((n) => [String(n.id), n]))
    const getTopBuildingId = (nodeId: any) => {
      let current = nodeById.get(String(nodeId ?? ''))
      let lastBuilding = current
      let guard = 0
      while (current && current.parent_id && guard < 20) {
        if (['building', 'tower', 'block', 'villa', 'unit'].includes(lower(current.type))) lastBuilding = current
        current = nodeById.get(String(current.parent_id))
        guard += 1
      }
      return lastBuilding?.id ? String(lastBuilding.id) : String(nodeId ?? '')
    }

    return (subcontractors || []).map((sub) => {
      const subId = String(sub.id ?? '')
      const trade = sub.trade_scope || sub.trade || 'General'
      const subBreakdowns = (breakdowns || []).filter((b) => String(b.subcontractor_id ?? '') === subId)
      const subVillaLines = (villaBreakdownLines || []).filter((b) => String(b.subcontractor_id ?? '') === subId)
      const subInvoices = (certificates || []).filter((c) => String(c.subcontractor_id ?? '') === subId)
      const subAssignments = (villaAssignments || []).filter((a) => String(a.subcontractor_id ?? '') === subId)
      const subUnits = (villaUnits || []).filter((u) => String(u.subcontractor_id ?? '') === subId)

      const assignedBuildingIdsFromUnits = subUnits.map((u) => u.id)
      const assignedStructureIds = [
        ...subBreakdowns.map((b) => b.structure_id),
        ...subVillaLines.map((b) => b.villa_node_id || b.villa_type_node_id),
        ...subAssignments.map((a) => a.villa_node_id || a.villa_type_node_id),
      ].filter(Boolean)
      const assignedBuildings = subUnits.length > 0
        ? uniqueCount(assignedBuildingIdsFromUnits)
        : uniqueCount(assignedStructureIds.map(getTopBuildingId))

      const unitProgressValues = subUnits.flatMap((u) => {
        const ps = progressByVilla.get(String(u.id)) ?? []
        return ps.map((p) => Number(p.completion_pct || 0))
      })
      const avgUnitProgress = unitProgressValues.length
        ? unitProgressValues.reduce((s, v) => s + v, 0) / unitProgressValues.length
        : 0

      const commercialRow = commercialBySub.get(subId)
      const contractValue = Number(commercialRow?.total_contract_value ?? 0) ||
        subBreakdowns.reduce((s, b) => s + (Number(b.contract_value) || (Number(b.subcontract_qty) || 0) * (Number(b.rate) || 0)), 0) +
        subVillaLines.reduce((s, b) => s + (Number(b.contract_value) || (Number(b.subcontract_qty) || 0) * (Number(b.rate) || 0)), 0)
      const certified = Number(commercialRow?.total_certified_gross ?? 0) || subInvoices.reduce((s, c) => s + (Number(c.gross_amount) || 0), 0)
      const paid = Number(commercialRow?.total_net_paid ?? 0) || subInvoices.reduce((s, c) => s + (Number(c.released_payment_amount || c.total_released_payments || c.net_amount) || 0), 0)
      const valueProgress = contractValue > 0 ? (certified / contractValue) * 100 : 0
      const progress = avgUnitProgress > 0 ? avgUnitProgress : valueProgress
      const paidProgress = contractValue > 0 ? (paid / contractValue) * 100 : 0

      const working = subUnits.filter((u) => ['in progress', 'active'].includes(lower(u.status))).length
      const completed = subUnits.filter((u) => lower(u.status) === 'completed').length
      const onHold = subUnits.filter((u) => lower(u.status) === 'on hold').length
      const notStarted = subUnits.length > 0
        ? subUnits.filter((u) => !lower(u.status) || lower(u.status) === 'not started').length
        : Math.max(0, assignedBuildings - (progress > 0 ? assignedBuildings : 0))
      const workingFallback = subUnits.length > 0 ? working : (progress > 0 && progress < 100 ? assignedBuildings : 0)
      const completedFallback = subUnits.length > 0 ? completed : (progress >= 100 ? assignedBuildings : 0)
      const notStartedFallback = subUnits.length > 0 ? notStarted : (progress <= 0 ? assignedBuildings : 0)

      const openInvoices = subInvoices.filter((c) => ['released', 'pending review', 'pending approval', 'pending ceo approval', 'finance review'].some((s) => lower(c.status || c.workflow_status).includes(s))).length
      const lastInvoice = subInvoices.slice().sort((a, b) => String(b.period_end || b.invoice_date || b.created_at).localeCompare(String(a.period_end || a.invoice_date || a.created_at)))[0]

      let health: 'On Track' | 'Needs Attention' | 'Delayed' | 'Not Started' = 'On Track'
      if (assignedBuildings === 0) health = 'Not Started'
      else if (progress < 10) health = 'Not Started'
      else if (progress < 45 && openInvoices > 0) health = 'Needs Attention'
      else if (onHold > 0 || progress < 25) health = 'Delayed'

      return {
        id: subId,
        code: sub.subcontractor_code || sub.code || 'SC',
        name: sub.name || sub.subcontractor_name || 'Subcontractor',
        trade,
        status: sub.status || health,
        assignedBuildings,
        working: workingFallback,
        notStarted: notStartedFallback,
        completed: completedFallback,
        delayed: health === 'Delayed' ? Math.max(assignedBuildings - completedFallback, 0) : 0,
        atRisk: health === 'Needs Attention' ? Math.max(assignedBuildings - completedFallback, 0) : 0,
        onHold,
        progress: Math.min(100, Math.max(0, progress)),
        plannedProgress: 0,
        siteProgress: Math.min(100, Math.max(0, progress)),
        certifiedProgress: Math.min(100, Math.max(0, valueProgress)),
        paidProgress: Math.min(100, Math.max(0, paidProgress)),
        contractValue,
        certified,
        paid,
        remaining: Math.max(0, contractValue - certified),
        invoices: subInvoices.length,
        openInvoices,
        lastInvoiceNo: lastInvoice?.invoice_no || '—',
        health,
      }
    })
  }, [subcontractors, commercial, breakdowns, villaBreakdownLines, certificates, structureNodes, villaUnits, villaAssignments, villaProgress])

  const rows = dbRows.length > 0 ? dbRows : computedRows
  const trades = Array.from(new Set(rows.map((r) => r.trade).filter(Boolean)))
  const filteredRows = rows
    .filter((r) => tradeFilter === 'all' || r.trade === tradeFilter)
    .filter((r) => statusFilter === 'all' || r.health === statusFilter)
    .sort((a, b) => sortBy === 'value' ? b.contractValue - a.contractValue : sortBy === 'buildings' ? b.assignedBuildings - a.assignedBuildings : b.progress - a.progress)

  const totals = (filteredRows as AnyRow[]).reduce((acc: AnyRow, r: AnyRow) => {
    acc.contractors += 1
    acc.buildings += r.assignedBuildings
    acc.working += r.working
    acc.notStarted += r.notStarted
    acc.completed += r.completed
    acc.delayed += r.delayed || 0
    acc.atRisk += r.atRisk || 0
    acc.onHold += r.onHold
    acc.contractValue += r.contractValue
    acc.certified += r.certified
    acc.paid += r.paid
    acc.remaining += r.remaining
    acc.openInvoices += r.openInvoices
    acc.progressSum += r.progress
    acc.plannedProgressSum += r.plannedProgress || 0
    acc.siteProgressSum += r.siteProgress || r.progress || 0
    acc.certifiedProgressSum += r.certifiedProgress || 0
    acc.paidProgressSum += r.paidProgress || 0
    return acc
  }, { contractors: 0, buildings: 0, working: 0, notStarted: 0, completed: 0, delayed: 0, atRisk: 0, onHold: 0, contractValue: 0, certified: 0, paid: 0, remaining: 0, openInvoices: 0, progressSum: 0, plannedProgressSum: 0, siteProgressSum: 0, certifiedProgressSum: 0, paidProgressSum: 0 })
  const avgProgress = totals.contractors ? totals.progressSum / totals.contractors : 0
  const avgPlannedProgress = totals.contractors ? totals.plannedProgressSum / totals.contractors : 0
  const avgSiteProgress = totals.contractors ? totals.siteProgressSum / totals.contractors : 0
  const avgCertifiedProgress = totals.contractors ? totals.certifiedProgressSum / totals.contractors : 0
  const avgPaidProgress = totals.contractors ? totals.paidProgressSum / totals.contractors : 0

  const healthColor = (h: string) => ['On Track', 'Completed'].includes(h) ? '#0F6E56' : ['Needs Attention', 'At Risk'].includes(h) ? '#BA7517' : h === 'Delayed' ? '#A32D2D' : '#667085'
  const healthBg = (h: string) => ['On Track', 'Completed'].includes(h) ? '#E1F5EE' : ['Needs Attention', 'At Risk'].includes(h) ? '#FFF3D6' : h === 'Delayed' ? '#FCEBEB' : '#F2F4F7'

  const kpi = (label: string, value: string, sub?: string, color = '#111827') => (
    <div style={{ background: '#fff', border: '0.5px solid #E1E4DC', borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#667085', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', border: '0.5px solid #E1E4DC', borderRadius: 18, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#111827' }}>Subcontractor Performance Dashboard</div>
            <div style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>{projectName} · contractors comparison, building progress, active vs inactive work fronts</div>{dbMessage && <div style={{ fontSize: 11, color: dbRows.length ? '#0F6E56' : '#BA7517', marginTop: 6, fontWeight: 800 }}>{dbMessage}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)} style={selectStyle}>
              <option value="all">All trades</option>
              {trades.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="all">All health</option>
              <option value="On Track">On Track</option>
              <option value="At Risk">At Risk</option>
              <option value="Needs Attention">Needs Attention</option>
              <option value="Delayed">Delayed</option>
              <option value="Completed">Completed</option>
              <option value="Not Started">Not Started</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={selectStyle}>
              <option value="progress">Sort by progress</option>
              <option value="value">Sort by contract value</option>
              <option value="buildings">Sort by buildings</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          {kpi('Contractors', String(totals.contractors), 'active subcontractors')}
          {kpi('Assigned Buildings / Villas', String(totals.buildings), 'linked to contractors', '#185FA5')}
          {kpi('Working Now', String(totals.working), 'in progress', '#0F6E56')}
          {kpi('Not Started', String(totals.notStarted), 'no progress yet', '#BA7517')}
          {kpi('Completed', String(totals.completed), 'finished buildings', '#0F6E56')}
          {kpi('Delayed', String(totals.delayed), 'behind plan', '#A32D2D')}
          {kpi('At Risk', String(totals.atRisk), 'finish risk', '#BA7517')}
          {kpi('Planned Progress', pct(avgPlannedProgress), 'P6 planned dates', '#185FA5')}
          {kpi('Site Progress', pct(avgSiteProgress), 'approved physical progress', avgSiteProgress >= 70 ? '#0F6E56' : '#BA7517')}
          {kpi('Certified Progress', pct(avgCertifiedProgress), 'approved invoice lines', '#533AB7')}
          {kpi('Paid Progress', pct(avgPaidProgress), 'payments vs contract', '#0F6E56')}
          {kpi('Certified Value', money(totals.certified), 'approved certificates', '#185FA5')}
          {kpi('Paid Value', money(totals.paid), 'confirmed payments', '#0F6E56')}
          {kpi('Outstanding', money(totals.remaining), 'certified minus paid', '#A32D2D')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .85fr) minmax(420px, 1.15fr)', gap: 14, alignItems: 'stretch' }}>
          <div style={{ background: '#FAFAF8', border: '0.5px solid #E1E4DC', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#344054', marginBottom: 14 }}>Workfront Status</div>
            <div style={{ width: 170, height: 170, borderRadius: '50%', margin: '0 auto 16px', background: `conic-gradient(#0F6E56 0 ${totals.buildings ? (totals.working / totals.buildings) * 100 : 0}%, #3B82F6 ${totals.buildings ? (totals.working / totals.buildings) * 100 : 0}% ${totals.buildings ? ((totals.working + totals.completed) / totals.buildings) * 100 : 0}%, #BA7517 ${totals.buildings ? ((totals.working + totals.completed) / totals.buildings) * 100 : 0}% ${totals.buildings ? ((totals.working + totals.completed + totals.notStarted) / totals.buildings) * 100 : 0}%, #A32D2D ${totals.buildings ? ((totals.working + totals.completed + totals.notStarted) / totals.buildings) * 100 : 0}% 100%)`, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 104, height: 104, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', border: '1px solid #E1E4DC' }}>
                <div><div style={{ fontSize: 26, fontWeight: 900 }}>{totals.buildings}</div><div style={{ fontSize: 11, color: '#667085' }}>Total</div></div>
              </div>
            </div>
            {[['Working', totals.working, '#0F6E56'], ['Completed', totals.completed, '#3B82F6'], ['Not Started', totals.notStarted, '#BA7517'], ['Delayed', totals.delayed, '#A32D2D'], ['At Risk', totals.atRisk, '#D97706']].map(([label, value, color]) => (
              <div key={String(label)} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: String(color) }} />
                <span style={{ fontSize: 12, color: '#667085' }}>{label}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '0.5px solid #E1E4DC', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', background: '#F7F7F2', borderBottom: '0.5px solid #E1E4DC', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#344054' }}>Contractors Ranking</span>
              <span style={{ fontSize: 12, color: '#667085' }}>{money(totals.certified)} certified · {money(totals.contractValue)} contracts</span>
            </div>
            <div style={{ maxHeight: 310, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#fff' }}><th style={th}>Subcontractor</th><th style={th}>Buildings</th><th style={th}>Working</th><th style={th}>Not Started</th><th style={th}>Site</th><th style={th}>Certified</th><th style={th}>Paid</th><th style={th}>Health</th></tr></thead>
              <tbody>
                  {filteredRows.length === 0 ? <tr><td colSpan={8} style={{ padding: 22, color: '#98A2B3', textAlign: 'center' }}>No subcontractor progress data yet.</td></tr> : filteredRows.map((r) => (
                    <tr key={r.id} style={{ borderTop: '0.5px solid #E1E4DC' }}>
                      <td style={td}><strong>{r.code} — {r.name}</strong><div style={{ color: '#667085', fontSize: 11 }}>{r.trade}</div></td>
                      <td style={td}>{r.assignedBuildings}</td>
                      <td style={{ ...td, color: '#0F6E56', fontWeight: 900 }}>{r.working}</td>
                      <td style={{ ...td, color: '#BA7517', fontWeight: 900 }}>{r.notStarted}</td>
                      <td style={td}><ProgressCell value={r.siteProgress ?? r.progress} /></td>
                      <td style={td}><ProgressCell value={r.certifiedProgress} tone="#533AB7" /></td>
                      <td style={td}><ProgressCell value={r.paidProgress} tone="#0F6E56" /></td>
                      <td style={td}><span style={{ background: healthBg(r.health), color: healthColor(r.health), borderRadius: 999, padding: '3px 9px', fontWeight: 800, fontSize: 11 }}>{r.health}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
        {filteredRows.map((r) => (
          <div key={r.id} style={{ background: '#fff', border: '0.5px solid #E1E4DC', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <div><div style={{ fontSize: 15, fontWeight: 900 }}>{r.name}</div><div style={{ fontSize: 12, color: '#667085' }}>{r.code} · {r.trade}</div></div>
              <span style={{ background: healthBg(r.health), color: healthColor(r.health), borderRadius: 999, padding: '3px 9px', fontWeight: 800, fontSize: 11, height: 'fit-content' }}>{r.health}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              <Mini label="Total" value={r.assignedBuildings} />
              <Mini label="Working" value={r.working} color="#0F6E56" />
              <Mini label="Not started" value={r.notStarted} color="#BA7517" />
              <Mini label="Done" value={r.completed} color="#185FA5" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <ProgressBand label="Planned" value={r.plannedProgress} color="#185FA5" />
              <ProgressBand label="Site" value={r.siteProgress ?? r.progress} color="#0F6E56" />
              <ProgressBand label="Certified" value={r.certifiedProgress} color="#533AB7" />
              <ProgressBand label="Paid" value={r.paidProgress} color="#0F6E56" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#475467', marginBottom: 12 }}>
              <div>Contract: <strong>{money(r.contractValue)}</strong></div>
              <div>Certified: <strong>{money(r.certified)}</strong></div>
              <div>Paid: <strong>{money(r.paid)}</strong></div>
              <div>Open invoices: <strong>{r.openInvoices}</strong></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onOpenContracts?.(r.id)} style={btnStyle}>Open Contract</button>
              <button onClick={() => onOpenInvoices?.(r.id)} style={btnStyle}>Invoices</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Mini({ label, value, color = '#111827' }: { label: string; value: any; color?: string }) {
  return <div style={{ background: '#FAFAF8', border: '0.5px solid #E1E4DC', borderRadius: 12, padding: 10, textAlign: 'center' }}><div style={{ color, fontSize: 18, fontWeight: 900 }}>{value}</div><div style={{ color: '#667085', fontSize: 10 }}>{label}</div></div>
}

function ProgressCell({ value, tone }: { value: any; tone?: string }) {
  const v = Math.min(100, Math.max(0, Number(value || 0)))
  const color = tone || (v >= 70 ? '#0F6E56' : v >= 35 ? '#BA7517' : '#A32D2D')
  return <div style={{ minWidth: 90 }}><div style={{ height: 7, background: '#EEF1EA', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${v}%`, height: '100%', background: color }} /></div><div style={{ fontSize: 11, marginTop: 3, fontWeight: 800 }}>{pct(v)}</div></div>
}

function ProgressBand({ label, value, color }: { label: string; value: any; color: string }) {
  const v = Math.min(100, Math.max(0, Number(value || 0)))
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: '#667085' }}>{label}</span><strong>{pct(v)}</strong>
      </div>
      <div style={{ height: 8, background: '#EEF1EA', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

const selectStyle: CSSProperties = { border: '0.5px solid #D0D5DD', borderRadius: 10, padding: '8px 10px', background: '#fff', fontSize: 12, color: '#344054' }
const th: CSSProperties = { padding: '9px 12px', textAlign: 'left', color: '#667085', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }
const td: CSSProperties = { padding: '10px 12px', verticalAlign: 'middle', color: '#344054' }
const btnStyle: CSSProperties = { border: '0.5px solid #D0D5DD', background: '#fff', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', flex: 1 }
