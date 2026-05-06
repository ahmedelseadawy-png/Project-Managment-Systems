'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type WorkfrontRow = {
  id: string
  project_id: string | null
  subcontractor_id: string | null
  subcontractor_code?: string | null
  subcontractor_name?: string | null
  contract_id: string | null
  villa_id?: string | null
  building_id?: string | null
  villa_no: string | null
  building_no: string | null
  trade: string | null
  planned_start_date: string | null
  planned_finish_date: string | null
  site_progress_percent: number | null
  certified_progress_percent: number | null
  health_status: string | null
  progress_warning?: string | null
}

type ContractItem = {
  id: string
  project_id: string | null
  subcontractor_id: string | null
  contract_id: string | null
  boq_item_id?: string | null
  breakdown_item_id?: string | null
  item_code?: string | null
  description?: string | null
  item_description?: string | null
  contract_type?: string | null
  trade?: string | null
  villa_id?: string | null
  building_id?: string | null
  villa_no?: string | null
  building_no?: string | null
}

type ProgressUpdate = {
  id: string
  contract_item_id: string
  progress_percent: number
  progress_date: string
  status: string
  notes: string | null
  created_at: string
}

type Props = {
  projectId?: string | null
  userId?: string | null
  isAdminOwner?: boolean
}

type ExcelRow = Record<string, unknown>

type SiteProgressInsert = {
  project_id: string
  subcontractor_id: string | null
  contract_id: string | null
  contract_item_id: string
  boq_item_id: string | null
  breakdown_id: string | null
  villa_no: string | null
  building_no: string | null
  trade: string | null
  progress_percent: number
  progress_date: string
  notes: string | null
  status: string
  submitted_by: string | null
  submitted_at: string
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
}

const today = () => new Date().toISOString().slice(0, 10)
const text = (value: unknown) => String(value ?? '').trim()
const pct = (value: unknown) => `${Number(value ?? 0).toFixed(1)}%`
const keyFromParts = (parts: Array<string | null | undefined>) => parts.map((part) => text(part) || '-').join('|')
const excelKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const excelPick = (row: ExcelRow, names: string[]) => {
  const wanted = names.map(excelKey)
  const found = Object.entries(row).find(([key]) => wanted.includes(excelKey(key)))
  return found?.[1]
}
const excelPercent = (value: unknown) => {
  const raw = text(value).replace('%', '')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null
}
const excelDate = (value: unknown) => {
  const raw = text(value)
  if (!raw) return today()
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10)
}

const card = { background: '#fff', border: '1px solid #e1e8e5', borderRadius: 12, padding: 14 } as const
const input = { width: '100%', padding: '8px 10px', border: '1px solid #d9e2df', borderRadius: 8, fontSize: 13, background: '#fff' } as const
const button = { borderRadius: 8, border: '1px solid transparent', padding: '9px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' } as const

export function SiteProgressView({ projectId, userId, isAdminOwner = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [workfronts, setWorkfronts] = useState<WorkfrontRow[]>([])
  const [items, setItems] = useState<ContractItem[]>([])
  const [updates, setUpdates] = useState<ProgressUpdate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<WorkfrontRow | null>(null)
  const [progressDate, setProgressDate] = useState(today())
  const [progressPercent, setProgressPercent] = useState('0')
  const [progressStatus, setProgressStatus] = useState(isAdminOwner ? 'approved' : 'pending')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [subcontractorFilter, setSubcontractorFilter] = useState('all')
  const [tradeFilter, setTradeFilter] = useState('all')
  const [contractFilter, setContractFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = async () => {
    if (!projectId) {
      setWorkfronts([])
      setItems([])
      setUpdates([])
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const [wfResult, itemResult, updateResult] = await Promise.all([
        supabase.from('v_subcontractor_workfronts').select('*').eq('project_id', projectId).order('subcontractor_code', { ascending: true }).order('villa_no', { ascending: true }),
        supabase.from('subcontractor_contract_items').select('id,project_id,subcontractor_id,contract_id,boq_item_id,breakdown_item_id,item_code,description,item_description,contract_type,trade,villa_id,building_id,villa_no,building_no').eq('project_id', projectId).eq('is_active', true),
        supabase.from('site_progress_updates').select('id,contract_item_id,progress_percent,progress_date,status,notes,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(80),
      ])
      if (wfResult.error) throw wfResult.error
      if (itemResult.error) throw itemResult.error
      if (updateResult.error) throw updateResult.error
      setWorkfronts((wfResult.data ?? []) as WorkfrontRow[])
      setItems((itemResult.data ?? []) as ContractItem[])
      setUpdates((updateResult.data ?? []) as ProgressUpdate[])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load site progress data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const itemsByWorkfront = useMemo(() => {
    const map = new Map<string, ContractItem[]>()
    workfronts.forEach((wf) => {
      const wfBuilding = text(wf.villa_id || wf.building_id || wf.villa_no || wf.building_no)
      const key = keyFromParts([wf.project_id, wf.subcontractor_id, wf.contract_id, wf.trade, wfBuilding])
      const matched = items.filter((item) => {
        const itemBuilding = text(item.villa_id || item.building_id || item.villa_no || item.building_no)
        return text(item.project_id) === text(wf.project_id)
          && text(item.subcontractor_id) === text(wf.subcontractor_id)
          && text(item.contract_id) === text(wf.contract_id)
          && text(item.trade || 'General') === text(wf.trade || 'General')
          && itemBuilding === wfBuilding
      })
      map.set(key, matched)
    })
    return map
  }, [items, workfronts])

  const getWorkfrontItems = useCallback((wf: WorkfrontRow) => {
    const wfBuilding = text(wf.villa_id || wf.building_id || wf.villa_no || wf.building_no)
    return itemsByWorkfront.get(keyFromParts([wf.project_id, wf.subcontractor_id, wf.contract_id, wf.trade, wfBuilding])) ?? []
  }, [itemsByWorkfront])

  const latestProgressForItems = (wfItems: ContractItem[]) => updates.find((update) => wfItems.some((item) => item.id === update.contract_item_id))

  const subcontractors = useMemo(() => Array.from(new Map(workfronts.map((wf) => [text(wf.subcontractor_id || wf.subcontractor_code), `${wf.subcontractor_code ?? 'SC'} - ${wf.subcontractor_name ?? 'Subcontractor'}`])).entries()).filter(([id]) => id), [workfronts])
  const trades = useMemo(() => Array.from(new Set(workfronts.map((wf) => text(wf.trade || 'General')).filter(Boolean))).sort(), [workfronts])
  const contracts = useMemo(() => Array.from(new Set(workfronts.map((wf) => text(wf.contract_id)).filter(Boolean))).sort(), [workfronts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return workfronts.filter((wf) => {
      const wfItems = getWorkfrontItems(wf)
      const itemText = wfItems.map((item) => [item.item_code, item.item_description, item.description].map(text).join(' ')).join(' ')
      const haystack = [wf.subcontractor_code, wf.subcontractor_name, wf.villa_no, wf.building_no, wf.trade, itemText].map(text).join(' ').toLowerCase()
      return (!q || haystack.includes(q))
        && (subcontractorFilter === 'all' || text(wf.subcontractor_id || wf.subcontractor_code) === subcontractorFilter)
        && (tradeFilter === 'all' || text(wf.trade || 'General') === tradeFilter)
        && (contractFilter === 'all' || text(wf.contract_id) === contractFilter)
        && (statusFilter === 'all' || text(wf.health_status) === statusFilter)
    })
  }, [workfronts, search, subcontractorFilter, tradeFilter, contractFilter, statusFilter, getWorkfrontItems])

  const openModal = (wf: WorkfrontRow) => {
    setSelected(wf)
    setProgressDate(today())
    setProgressPercent(String(Number(wf.site_progress_percent ?? 0)))
    setProgressStatus(isAdminOwner ? 'approved' : 'pending')
    setNotes('')
  }

  const saveProgress = async () => {
    if (!selected || !projectId) return
    const wfItems = getWorkfrontItems(selected)
    if (wfItems.length === 0) {
      setMessage('No contract items were found for this workfront. Check the contract breakdown links.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const supabase = createClient()
      const percent = Math.max(0, Math.min(100, Number(progressPercent) || 0))
      const nowIso = new Date().toISOString()
      const payload = wfItems.map((item) => ({
        project_id: projectId,
        subcontractor_id: selected.subcontractor_id,
        contract_id: selected.contract_id,
        contract_item_id: item.id,
        boq_item_id: item.boq_item_id ?? null,
        breakdown_id: item.breakdown_item_id ?? null,
        villa_no: selected.villa_no ?? item.villa_no ?? null,
        building_no: selected.building_no ?? item.building_no ?? null,
        trade: selected.trade ?? item.trade ?? null,
        progress_percent: percent,
        progress_date: progressDate,
        notes: notes.trim() || null,
        status: progressStatus,
        submitted_by: userId ?? null,
        submitted_at: nowIso,
        approved_by: progressStatus === 'approved' ? (userId ?? null) : null,
        approved_at: progressStatus === 'approved' ? nowIso : null,
        created_by: userId ?? null,
      }))
      const { error } = await supabase.from('site_progress_updates').insert(payload as any)
      if (error) throw error
      setSelected(null)
      setMessage(progressStatus === 'approved' ? 'Approved site progress saved. Workfronts will now read this physical progress.' : 'Site progress submitted for approval.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save site progress.')
    } finally {
      setSaving(false)
    }
  }

  const setUpdateStatus = async (update: ProgressUpdate, status: 'approved' | 'rejected') => {
    setSaving(true)
    setMessage('')
    try {
      const supabase = createClient()
      const nowIso = new Date().toISOString()
      const { error } = await supabase
        .from('site_progress_updates')
        .update({
          status,
          approved_by: status === 'approved' ? (userId ?? null) : null,
          approved_at: status === 'approved' ? nowIso : null,
          rejected_by: status === 'rejected' ? (userId ?? null) : null,
          rejected_at: status === 'rejected' ? nowIso : null,
        } as any)
        .eq('id', update.id)
      if (error) throw error
      setMessage(status === 'approved' ? 'Site progress approved.' : 'Site progress rejected.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update progress status.')
    } finally {
      setSaving(false)
    }
  }

  const buildPayloadForWorkfront = (wf: WorkfrontRow, wfItems: ContractItem[], percent: number, date: string, status: string, rowNotes: string | null): SiteProgressInsert[] => {
    const nowIso = new Date().toISOString()
    return wfItems.map((item) => ({
      project_id: projectId ?? text(wf.project_id),
      subcontractor_id: wf.subcontractor_id,
      contract_id: wf.contract_id,
      contract_item_id: item.id,
      boq_item_id: item.boq_item_id ?? null,
      breakdown_id: item.breakdown_item_id ?? null,
      villa_no: wf.villa_no ?? item.villa_no ?? null,
      building_no: wf.building_no ?? item.building_no ?? null,
      trade: wf.trade ?? item.trade ?? null,
      progress_percent: percent,
      progress_date: date,
      notes: rowNotes,
      status,
      submitted_by: userId ?? null,
      submitted_at: nowIso,
      approved_by: status === 'approved' ? (userId ?? null) : null,
      approved_at: status === 'approved' ? nowIso : null,
      created_by: userId ?? null,
    }))
  }

  const exportSiteProgressExcel = async () => {
    const XLSX = await import('xlsx')
    const rows = filtered.map((wf) => {
      const wfItems = getWorkfrontItems(wf)
      const latest = latestProgressForItems(wfItems)
      return {
        subcontractor_code: wf.subcontractor_code ?? '',
        subcontractor_name: wf.subcontractor_name ?? '',
        subcontractor_id: wf.subcontractor_id ?? '',
        villa_or_node: wf.villa_no || wf.building_no || 'Unassigned',
        villa_no: wf.villa_no ?? '',
        building_no: wf.building_no ?? '',
        trade: wf.trade ?? 'General',
        contract_id: wf.contract_id ?? '',
        contract_item_ids: wfItems.map((item) => item.id).join(', '),
        boq_items: wfItems.map((item) => text(item.item_code || item.item_description || item.description)).filter(Boolean).join(', '),
        contract_types: Array.from(new Set(wfItems.map((item) => text(item.contract_type || 'boq')).filter(Boolean))).join(', '),
        planned_start: wf.planned_start_date ?? '',
        planned_finish: wf.planned_finish_date ?? '',
        current_site_progress_percent: Number(wf.site_progress_percent ?? 0),
        certified_progress_percent: Number(wf.certified_progress_percent ?? 0),
        last_progress_date: latest?.progress_date ?? '',
        latest_status: latest?.status ?? '',
        warning: wf.progress_warning ?? '',
        import_progress_percent: '',
        import_progress_date: today(),
        import_status: isAdminOwner ? 'approved' : 'pending',
        import_notes: '',
      }
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Site Progress')
    XLSX.writeFile(wb, `site-progress-${today()}.xlsx`)
  }

  const downloadImportTemplate = async () => {
    const XLSX = await import('xlsx')
    const rows = filtered.slice(0, 200).map((wf) => {
      const wfItems = getWorkfrontItems(wf)
      return {
        subcontractor_code: wf.subcontractor_code ?? '',
        villa_or_node: wf.villa_no || wf.building_no || 'Unassigned',
        trade: wf.trade ?? 'General',
        contract_id: wf.contract_id ?? '',
        contract_item_id: wfItems[0]?.id ?? '',
        progress_percent: '',
        progress_date: today(),
        status: isAdminOwner ? 'approved' : 'pending',
        notes: '',
      }
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{
      subcontractor_code: '',
      villa_or_node: '',
      trade: '',
      contract_id: '',
      contract_item_id: '',
      progress_percent: '',
      progress_date: today(),
      status: isAdminOwner ? 'approved' : 'pending',
      notes: '',
    }])
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template')
    XLSX.writeFile(wb, `site-progress-import-template-${today()}.xlsx`)
  }

  const findWorkfrontFromExcel = (row: ExcelRow) => {
    const contractItemId = text(excelPick(row, ['contract_item_id', 'contract item id', 'contract item']))
    if (contractItemId) {
      return workfronts.find((wf) => getWorkfrontItems(wf).some((item) => item.id === contractItemId)) ?? null
    }
    const subcontractorCode = text(excelPick(row, ['subcontractor_code', 'subcontractor code', 'subcontractor'])).toLowerCase()
    const villaNode = text(excelPick(row, ['villa_or_node', 'villa node', 'villa', 'villa_no', 'building_no', 'node'])).toLowerCase()
    const trade = text(excelPick(row, ['trade', 'discipline'])).toLowerCase()
    const contractId = text(excelPick(row, ['contract_id', 'contract id', 'contract'])).toLowerCase()
    return workfronts.find((wf) => {
      const wfVilla = text(wf.villa_no || wf.building_no || 'Unassigned').toLowerCase()
      return (!subcontractorCode || text(wf.subcontractor_code || wf.subcontractor_id).toLowerCase() === subcontractorCode)
        && (!villaNode || wfVilla === villaNode)
        && (!trade || text(wf.trade || 'General').toLowerCase() === trade)
        && (!contractId || text(wf.contract_id).toLowerCase().startsWith(contractId))
    }) ?? null
  }

  const importSiteProgressExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !projectId) return
    setSaving(true)
    setMessage('')
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: '', raw: false })
      const payload: SiteProgressInsert[] = []
      let skipped = 0

      rows.forEach((row) => {
        const percent = excelPercent(excelPick(row, ['progress_percent', 'progress %', 'progress', 'site progress', 'import_progress_percent']))
        const wf = findWorkfrontFromExcel(row)
        if (percent == null || !wf) {
          skipped += 1
          return
        }
        const contractItemId = text(excelPick(row, ['contract_item_id', 'contract item id', 'contract item']))
        const wfItems = contractItemId ? getWorkfrontItems(wf).filter((item) => item.id === contractItemId) : getWorkfrontItems(wf)
        if (wfItems.length === 0) {
          skipped += 1
          return
        }
        const importedStatus = text(excelPick(row, ['status', 'import_status'])).toLowerCase()
        const safeStatus = importedStatus === 'approved' && isAdminOwner ? 'approved' : importedStatus === 'rejected' ? 'rejected' : 'pending'
        const date = excelDate(excelPick(row, ['progress_date', 'progress date', 'date', 'import_progress_date']))
        const rowNotes = text(excelPick(row, ['notes', 'import_notes'])) || null
        payload.push(...buildPayloadForWorkfront(wf, wfItems, percent, date, safeStatus, rowNotes))
      })

      if (payload.length === 0) {
        setMessage(`No valid site progress rows found. Skipped ${skipped} row(s).`)
        return
      }

      const supabase = createClient()
      const { error } = await supabase.from('site_progress_updates').insert(payload as never[])
      if (error) throw error
      setMessage(`Imported ${payload.length} site progress update(s). Skipped ${skipped} row(s).`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to import site progress Excel file.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ background: '#113f3a', color: '#fff', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900, textTransform: 'uppercase' }}>Physical Progress Entry</div>
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>Site Progress</div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>Record and approve physical site progress. Workfronts read only approved progress.</div>
      </div>

      {!projectId && <div style={card}>Select a project before entering site progress.</div>}
      {projectId && (
        <>
          {message && <div style={{ ...card, background: '#eef9f4', borderColor: '#cceadf', color: '#0c5c46', fontWeight: 800 }}>{message}</div>}
          <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900 }}>Excel Import / Export</div>
              <div style={{ color: '#667085', fontSize: 12 }}>Export the current filtered workfronts or import physical progress updates.</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button disabled={loading || filtered.length === 0} onClick={exportSiteProgressExcel} style={{ ...button, background: '#fff', borderColor: '#cddbd5', color: '#0f513f' }}>Export Current View</button>
              <button disabled={loading} onClick={downloadImportTemplate} style={{ ...button, background: '#fff', borderColor: '#cddbd5', color: '#0f513f' }}>Download Import Template</button>
              <button disabled={saving || loading} onClick={() => fileInputRef.current?.click()} style={{ ...button, background: '#0f6e56', color: '#fff', opacity: saving || loading ? 0.65 : 1 }}>Import Excel</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importSiteProgressExcel} style={{ display: 'none' }} />
            </div>
          </div>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><Small>Project</Small><input style={input} value="Current Project" disabled /></label>
            <label><Small>Search</Small><input style={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Villa, BOQ item, subcontractor" /></label>
            <label><Small>Subcontractor</Small><select style={input} value={subcontractorFilter} onChange={(event) => setSubcontractorFilter(event.target.value)}><option value="all">All</option>{subcontractors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label><Small>Trade / Discipline</Small><select style={input} value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)}><option value="all">All</option>{trades.map((trade) => <option key={trade} value={trade}>{trade}</option>)}</select></label>
            <label><Small>Contract</Small><select style={input} value={contractFilter} onChange={(event) => setContractFilter(event.target.value)}><option value="all">All</option>{contracts.map((contract) => <option key={contract} value={contract}>{contract.slice(0, 8)}</option>)}</select></label>
            <label><Small>Progress Status</Small><select style={input} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All</option><option>No Schedule</option><option>Delayed</option><option>At Risk</option><option>On Track</option><option>Completed</option></select></label>
          </div>

          {loading && <div style={card}>Loading workfronts...</div>}
          {!loading && (
            <div style={{ ...card, overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Subcontractor', 'Villa / Node', 'BOQ Item', 'Trade', 'Contract Type', 'Planned Start', 'Planned Finish', 'Current Site', 'Last Progress', 'Warning', ''].map((head) => <th key={head} style={th}>{head}</th>)}</tr></thead>
                <tbody>
                  {filtered.map((wf) => {
                    const wfItems = getWorkfrontItems(wf)
                    const itemCodes = wfItems.map((item) => text(item.item_code || item.item_description || item.description)).filter(Boolean)
                    const contractTypes = Array.from(new Set(wfItems.map((item) => text(item.contract_type || 'boq')).filter(Boolean)))
                    return (
                      <tr key={wf.id} style={{ borderBottom: '1px solid #edf2f0' }}>
                        <td style={td}><b>{wf.subcontractor_code ?? '-'}</b><div style={{ color: '#667085', fontSize: 12 }}>{wf.subcontractor_name ?? '-'}</div></td>
                        <td style={td}>{wf.villa_no || wf.building_no || 'Unassigned'}</td>
                        <td style={td}>{itemCodes.slice(0, 2).join(', ') || '-'}{itemCodes.length > 2 ? ` +${itemCodes.length - 2}` : ''}</td>
                        <td style={td}>{wf.trade || 'General'}</td>
                        <td style={td}>{contractTypes.join(', ') || '-'}</td>
                        <td style={td}>{wf.planned_start_date ?? '-'}</td>
                        <td style={td}>{wf.planned_finish_date ?? '-'}</td>
                        <td style={td}>{pct(wf.site_progress_percent)}</td>
                        <td style={td}>{latestProgressForItems(wfItems)?.progress_date ?? '-'}</td>
                        <td style={td}>{wf.progress_warning ? <span style={{ color: '#8a4b00', fontWeight: 800 }}>{wf.progress_warning}</span> : '-'}</td>
                        <td style={td}><button onClick={() => openModal(wf)} style={{ ...button, background: '#0f6e56', color: '#fff' }}>Add / Update Site Progress</button></td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#667085' }}>No workfronts found. Add subcontractor contract breakdown items or sync schedule mappings.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={card}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Pending / Recent Site Progress</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Date', 'Progress', 'Status', 'Notes', 'Actions'].map((head) => <th key={head} style={th}>{head}</th>)}</tr></thead>
                <tbody>
                  {updates.map((update) => (
                    <tr key={update.id} style={{ borderBottom: '1px solid #edf2f0' }}>
                      <td style={td}>{update.progress_date}</td>
                      <td style={td}>{pct(update.progress_percent)}</td>
                      <td style={td}><Badge text={update.status} /></td>
                      <td style={td}>{update.notes ?? '-'}</td>
                      <td style={td}>
                        {update.status === 'pending' && isAdminOwner ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button disabled={saving} onClick={() => setUpdateStatus(update, 'approved')} style={{ ...button, background: '#0f6e56', color: '#fff' }}>Approve</button>
                            <button disabled={saving} onClick={() => setUpdateStatus(update, 'rejected')} style={{ ...button, background: '#fff3f3', color: '#9c2d2d', borderColor: '#efc9c9' }}>Reject</button>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                  {updates.length === 0 && <tr><td colSpan={5} style={{ padding: 18, color: '#667085', textAlign: 'center' }}>No site progress updates yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 18, width: 'min(560px, 100%)', boxShadow: '0 24px 80px rgba(15,23,42,.24)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Add / Update Site Progress</div>
                <div style={{ color: '#667085', fontSize: 13, marginTop: 4 }}>{selected.subcontractor_code} - {selected.villa_no || selected.building_no || 'Unassigned'} - {selected.trade}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ ...button, background: '#fff', borderColor: '#d9e2df' }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <label><Small>Progress Date</Small><input type="date" style={input} value={progressDate} onChange={(event) => setProgressDate(event.target.value)} /></label>
              <label><Small>Progress %</Small><input type="number" min="0" max="100" step="0.1" style={input} value={progressPercent} onChange={(event) => setProgressPercent(event.target.value)} /></label>
              <label><Small>Status</Small><select style={input} value={progressStatus} onChange={(event) => setProgressStatus(event.target.value)}><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option></select></label>
            </div>
            <label style={{ display: 'block', marginTop: 10 }}><Small>Notes</Small><textarea style={{ ...input, minHeight: 90 }} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            {!isAdminOwner && progressStatus === 'approved' && <div style={{ marginTop: 10, color: '#8a4b00', fontWeight: 800 }}>Only Admin/Owner should save directly as approved. Use pending if approval is required.</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setSelected(null)} style={{ ...button, background: '#fff', borderColor: '#d9e2df' }}>Cancel</button>
              <button disabled={saving} onClick={saveProgress} style={{ ...button, background: '#0f6e56', color: '#fff', opacity: saving ? 0.65 : 1 }}>{saving ? 'Saving...' : 'Save Progress'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th = { textAlign: 'left', padding: '9px 10px', borderBottom: '1px solid #dfe8e4', color: '#667085', fontSize: 11, textTransform: 'uppercase' } as const
const td = { padding: '10px', verticalAlign: 'top', color: '#1f2933' } as const

function Small({ children }: { children: string }) {
  return <div style={{ fontSize: 12, color: '#667085', marginBottom: 5, fontWeight: 700 }}>{children}</div>
}

function Badge({ text: label }: { text: string }) {
  const normalized = label.toLowerCase()
  const tone = normalized === 'approved' ? ['#e1f5ee', '#0f6e56'] : normalized === 'rejected' ? ['#fee2e2', '#991b1b'] : ['#fff4de', '#8a4b00']
  return <span style={{ display: 'inline-block', borderRadius: 999, padding: '3px 9px', background: tone[0], color: tone[1], fontSize: 11, fontWeight: 900 }}>{label}</span>
}
