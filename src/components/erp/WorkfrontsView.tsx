'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type WorkfrontRow = {
  id: string
  project_id: string | null
  subcontractor_id: string | null
  subcontractor_code: string | null
  subcontractor_name: string | null
  villa_no: string | null
  building_no: string | null
  trade: string | null
  planned_start_date: string | null
  planned_finish_date: string | null
  planned_progress_percent: number | null
  site_progress_percent: number | null
  certified_progress_percent: number | null
  paid_progress_percent: number | null
  health_status: string | null
  status: string | null
  progress_warning?: string | null
}

type Props = {
  projectId?: string | null
}

const card = {
  background: '#fff',
  border: '1px solid #e1e8e5',
  borderRadius: 12,
  padding: 14,
} as const

const input = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d9e2df',
  borderRadius: 8,
  fontSize: 13,
  background: '#fff',
} as const

const pct = (value: unknown) => `${Number(value ?? 0).toFixed(1)}%`
const text = (value: unknown) => String(value ?? '').trim()

export function WorkfrontsView({ projectId }: Props) {
  const [rows, setRows] = useState<WorkfrontRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [subcontractorFilter, setSubcontractorFilter] = useState('all')
  const [tradeFilter, setTradeFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!projectId) {
        setRows([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const supabase = createClient()
        const { data, error: dbError } = await supabase
          .from('v_subcontractor_workfronts')
          .select('*')
          .eq('project_id', projectId)
          .order('subcontractor_code', { ascending: true })
          .order('villa_no', { ascending: true })
        if (dbError) throw dbError
        if (!cancelled) setRows((data ?? []) as WorkfrontRow[])
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load workfronts.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [projectId])

  const subcontractors = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((row) => {
      const id = text(row.subcontractor_id || row.subcontractor_code)
      if (id) map.set(id, `${row.subcontractor_code ?? 'SC'} - ${row.subcontractor_name ?? 'Subcontractor'}`)
    })
    return Array.from(map.entries())
  }, [rows])

  const trades = useMemo(() => Array.from(new Set(rows.map((row) => text(row.trade || 'General')).filter(Boolean))).sort(), [rows])
  const healthStatuses = useMemo(() => Array.from(new Set(rows.map((row) => text(row.health_status || row.status)).filter(Boolean))).sort(), [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const subKey = text(row.subcontractor_id || row.subcontractor_code)
      const building = text(row.villa_no || row.building_no)
      const haystack = [building, row.subcontractor_code, row.subcontractor_name, row.trade].map(text).join(' ').toLowerCase()
      return (!q || haystack.includes(q))
        && (subcontractorFilter === 'all' || subKey === subcontractorFilter)
        && (tradeFilter === 'all' || text(row.trade || 'General') === tradeFilter)
        && (healthFilter === 'all' || text(row.health_status || row.status) === healthFilter)
    })
  }, [rows, search, subcontractorFilter, tradeFilter, healthFilter])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ background: '#113f3a', color: '#fff', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900, textTransform: 'uppercase' }}>Schedule / Site Workfronts</div>
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>Workfronts</div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>Grouped by subcontractor, villa/building, contract, and trade from v_subcontractor_workfronts.</div>
      </div>

      {!projectId && <div style={card}>Select a project to view workfronts.</div>}
      {projectId && (
        <>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <label><SmallLabel>Search</SmallLabel><input style={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Villa, building, subcontractor" /></label>
            <label><SmallLabel>Subcontractor</SmallLabel><select style={input} value={subcontractorFilter} onChange={(event) => setSubcontractorFilter(event.target.value)}><option value="all">All</option>{subcontractors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><SmallLabel>Trade</SmallLabel><select style={input} value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)}><option value="all">All</option>{trades.map((trade) => <option key={trade} value={trade}>{trade}</option>)}</select></label>
            <label><SmallLabel>Health</SmallLabel><select style={input} value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}><option value="all">All</option>{healthStatuses.map((health) => <option key={health} value={health}>{health}</option>)}</select></label>
          </div>

          {loading && <div style={card}>Loading workfronts...</div>}
          {error && <div style={{ ...card, borderColor: '#f3caca', color: '#9c2d2d' }}>{error}</div>}
          {!loading && !error && (
            <div style={{ ...card, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980, fontSize: 13 }}>
                <thead>
                  <tr>{['Subcontractor', 'Villa / Building', 'Trade', 'Planned Start', 'Planned Finish', 'Planned', 'Site', 'Certified', 'Paid', 'Health', 'Warning'].map((head) => <th key={head} style={{ textAlign: 'left', padding: '9px 10px', borderBottom: '1px solid #dfe8e4', color: '#667085', fontSize: 11, textTransform: 'uppercase' }}>{head}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const health = text(row.health_status || row.status || 'No Schedule')
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid #edf2f0' }}>
                        <td style={td}><b>{row.subcontractor_code ?? '-'}</b><div style={{ color: '#667085', fontSize: 12 }}>{row.subcontractor_name ?? '-'}</div></td>
                        <td style={td}>{row.villa_no || row.building_no || 'Unassigned'}</td>
                        <td style={td}>{row.trade || 'General'}</td>
                        <td style={td}>{row.planned_start_date ?? '-'}</td>
                        <td style={td}>{row.planned_finish_date ?? '-'}</td>
                        <td style={td}>{pct(row.planned_progress_percent)}</td>
                        <td style={td}>{pct(row.site_progress_percent)}</td>
                        <td style={td}>{pct(row.certified_progress_percent)}</td>
                        <td style={td}>{pct(row.paid_progress_percent)}</td>
                        <td style={td}><Badge text={health} /></td>
                        <td style={td}>{row.progress_warning ? <span style={{ color: '#8a4b00', fontWeight: 800 }}>{row.progress_warning}</span> : '-'}</td>
                      </tr>
                    )
                  })}
                  {filteredRows.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#667085' }}>No workfronts found. Add subcontractor contract breakdown items or sync schedule mappings.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const td = { padding: '10px', verticalAlign: 'top', color: '#1f2933' } as const

function SmallLabel({ children }: { children: string }) {
  return <div style={{ fontSize: 12, color: '#667085', marginBottom: 5, fontWeight: 700 }}>{children}</div>
}

function Badge({ text: label }: { text: string }) {
  const tone = label === 'Delayed' ? ['#fee2e2', '#991b1b'] : label === 'At Risk' ? ['#fff4de', '#8a4b00'] : label === 'No Schedule' ? ['#f1f5f9', '#475569'] : ['#e1f5ee', '#0f6e56']
  return <span style={{ display: 'inline-block', borderRadius: 999, padding: '3px 9px', background: tone[0], color: tone[1], fontSize: 11, fontWeight: 900 }}>{label}</span>
}
