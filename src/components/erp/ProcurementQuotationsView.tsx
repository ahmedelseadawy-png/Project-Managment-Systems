'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

type RFQ = {
  id: string
  project_id: string
  rfq_no: string
  title: string
  procurement_record_id: string | null
  material: string | null
  required_qty: number | null
  unit: string | null
  description?: string | null
  required_date?: string | null
  due_date: string | null
  status: string
  notes: string | null
  selected_offer_id?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type Offer = {
  id: string
  rfq_id: string
  project_id: string
  supplier_name: string
  supplier_contact?: string | null
  offer_amount?: number | null
  currency?: string | null
  total_amount: number | null
  delivery_days: number | null
  payment_terms: string | null
  validity_date: string | null
  offer_notes?: string | null
  attachment_url?: string | null
  notes: string | null
  is_selected: boolean
  selection_reason: string | null
  selected_at: string | null
  selected_by: string | null
  po_conversion_status: string | null
  purchase_order_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type OfferItem = {
  id: string
  offer_id: string
  rfq_id: string
  description: string
  qty: number | null
  unit: string | null
  unit_price: number | null
  total_price: number | null
  notes: string | null
}

type ProcurementRecordOption = {
  id?: string
  pr_no?: string | null
  material?: string | null
  description?: string | null
  required_qty?: number | null
  unit?: string | null
  status?: string | null
}

type Props = {
  procurement?: ProcurementRecordOption[]
  projectId?: string | null
  userId?: string | null
  userEmail?: string | null
  initialMode?: 'rfqs' | 'supplier-offers' | 'quotation-comparison'
  onBack?: () => void
}

type ViewMode = 'list' | 'supplier-offers' | 'comparison-list' | 'new-rfq' | 'details' | 'new-offer' | 'edit-offer' | 'compare'
type RfqDraft = {
  rfq_no: string
  title: string
  procurement_record_id: string
  material: string
  required_qty: string
  unit: string
  due_date: string
  status: string
  notes: string
}
type OfferDraft = {
  supplier_name: string
  supplier_contact: string
  total_amount: string
  currency: string
  delivery_days: string
  payment_terms: string
  validity_date: string
  notes: string
  attachment_url: string
  items: OfferItemDraft[]
}
type OfferItemDraft = {
  description: string
  qty: string
  unit: string
  unit_price: string
  notes: string
}

const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #d9e2df',
  borderRadius: 8,
  fontSize: 13,
  background: '#fff',
} as const

const buttonBase = {
  borderRadius: 8,
  border: '1px solid transparent',
  padding: '9px 12px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
} as const

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: unknown) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value ?? 0))
const n = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const blankOfferItem = (unit = ''): OfferItemDraft => ({ description: '', qty: '1', unit, unit_price: '0', notes: '' })
const blankOffer = (unit = ''): OfferDraft => ({
  supplier_name: '',
  supplier_contact: '',
  total_amount: '0',
  currency: 'EGP',
  delivery_days: '',
  payment_terms: '',
  validity_date: '',
  notes: '',
  attachment_url: '',
  items: [blankOfferItem(unit)],
})

export function ProcurementQuotationsView({
  procurement = [],
  projectId,
  userId,
  userEmail,
  initialMode = 'rfqs',
  onBack,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [view, setView] = useState<ViewMode>('list')
  const [rfqs, setRfqs] = useState<RFQ[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [items, setItems] = useState<OfferItem[]>([])
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null)
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [selectionReason, setSelectionReason] = useState('')
  const [rfqDraft, setRfqDraft] = useState<RfqDraft>({
    rfq_no: '',
    title: '',
    procurement_record_id: '',
    material: '',
    required_qty: '',
    unit: '',
    due_date: today(),
    status: 'Draft',
    notes: '',
  })
  const [offerDraft, setOfferDraft] = useState<OfferDraft>(blankOffer())

  useEffect(() => {
    if (initialMode === 'supplier-offers') setView('supplier-offers')
    else if (initialMode === 'quotation-comparison') setView('comparison-list')
    else setView('list')
  }, [initialMode])

  const selectedRfq = useMemo(
    () => rfqs.find((rfq) => rfq.id === selectedRfqId) ?? null,
    [rfqs, selectedRfqId]
  )
  const rfqOffers = useMemo(
    () => offers.filter((offer) => offer.rfq_id === selectedRfqId),
    [offers, selectedRfqId]
  )
  const offerItemsByOffer = useMemo(() => {
    const map = new Map<string, OfferItem[]>()
    items.forEach((item) => {
      const existing = map.get(item.offer_id) ?? []
      map.set(item.offer_id, [...existing, item])
    })
    return map
  }, [items])
  const selectedOffer = rfqOffers.find((offer) => offer.is_selected) ?? null
  const lowestAmount = rfqOffers.length ? Math.min(...rfqOffers.map((offer) => Number(offer.offer_amount ?? offer.total_amount ?? 0))) : null
  const fastestDelivery = rfqOffers.filter((offer) => offer.delivery_days !== null).length
    ? Math.min(...rfqOffers.map((offer) => Number(offer.delivery_days ?? Number.MAX_SAFE_INTEGER)))
    : null
  const bestPaymentScore = rfqOffers.length ? Math.max(...rfqOffers.map((offer) => paymentScore(offer.payment_terms))) : null

  useEffect(() => {
    if (!projectId) return
    void loadRfqs()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRfqs(nextSelectedId?: string | null) {
    if (!projectId) return
    setLoading(true)
    setMessage('')
    try {
      const { data: rfqRows, error: rfqError } = await supabase
        .from('procurement_rfqs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (rfqError) throw rfqError

      const rfqIds = (rfqRows ?? []).map((rfq: RFQ) => rfq.id)
      let offerRows: Offer[] = []
      let itemRows: OfferItem[] = []
      if (rfqIds.length) {
        const [offerResult, itemResult] = await Promise.all([
          supabase
            .from('procurement_quotation_offers')
            .select('*')
            .in('rfq_id', rfqIds)
            .order('created_at', { ascending: true }),
          supabase
            .from('procurement_quotation_offer_items')
            .select('*')
            .in('rfq_id', rfqIds)
            .order('created_at', { ascending: true }),
        ])
        if (offerResult.error) throw offerResult.error
        if (itemResult.error) throw itemResult.error
        offerRows = offerResult.data ?? []
        itemRows = itemResult.data ?? []
      }

      setRfqs(rfqRows ?? [])
      setOffers(offerRows)
      setItems(itemRows)
      if (nextSelectedId !== undefined) setSelectedRfqId(nextSelectedId)
    } catch (error: any) {
      setMessage(error?.message ?? 'Unable to load RFQs.')
    } finally {
      setLoading(false)
    }
  }

  function openDetails(rfqId: string) {
    setSelectedRfqId(rfqId)
    setSelectionReason('')
    setView('details')
  }

  function openNewRfq() {
    const nextNo = `RFQ-${new Date().getFullYear()}-${String(rfqs.length + 1).padStart(3, '0')}`
    setRfqDraft({
      rfq_no: nextNo,
      title: '',
      procurement_record_id: '',
      material: '',
      required_qty: '',
      unit: '',
      due_date: today(),
      status: 'Draft',
      notes: '',
    })
    setView('new-rfq')
  }

  function applyProcurementRecord(id: string) {
    const record = procurement.find((row) => row.id === id)
    setRfqDraft({
      ...rfqDraft,
      procurement_record_id: id,
      title: record?.material ? `RFQ - ${record.material}` : rfqDraft.title,
      material: record?.material ?? record?.description ?? '',
      required_qty: record?.required_qty ? String(record.required_qty) : '',
      unit: record?.unit ?? '',
    })
  }

  async function saveRfq() {
    if (!projectId || !rfqDraft.rfq_no.trim() || !rfqDraft.title.trim()) return
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        project_id: projectId,
        rfq_no: rfqDraft.rfq_no.trim(),
        title: rfqDraft.title.trim(),
        description: rfqDraft.notes.trim() || null,
        procurement_record_id: rfqDraft.procurement_record_id || null,
        material: rfqDraft.material.trim() || null,
        required_qty: rfqDraft.required_qty === '' ? null : n(rfqDraft.required_qty),
        unit: rfqDraft.unit.trim() || null,
        required_date: rfqDraft.due_date || null,
        due_date: rfqDraft.due_date || null,
        status: rfqDraft.status.toLowerCase().replaceAll(' ', '_'),
        notes: rfqDraft.notes.trim() || null,
        created_by: userId ?? null,
      }
      const { data, error } = await supabase.from('procurement_rfqs').insert(payload as any).select('*').single()
      if (error) throw error
      await loadRfqs(data.id)
      setMessage('RFQ created.')
      setView('details')
    } catch (error: any) {
      setMessage(error?.message ?? 'Unable to create RFQ.')
    } finally {
      setSaving(false)
    }
  }

  function openOfferForm(mode: 'new' | 'edit', offer?: Offer) {
    if (!selectedRfq) return
    openOfferFormForRfq(selectedRfq, mode, offer)
  }

  function openOfferFormForRfq(rfq: RFQ, mode: 'new' | 'edit', offer?: Offer) {
    setEditingOfferId(offer?.id ?? null)
    if (mode === 'edit' && offer) {
      const existingItems = offerItemsByOffer.get(offer.id) ?? []
      setOfferDraft({
        supplier_name: offer.supplier_name,
        supplier_contact: offer.supplier_contact ?? '',
        total_amount: String(offer.offer_amount ?? offer.total_amount ?? 0),
        currency: offer.currency ?? 'EGP',
        delivery_days: offer.delivery_days === null ? '' : String(offer.delivery_days),
        payment_terms: offer.payment_terms ?? '',
        validity_date: offer.validity_date ?? '',
        notes: offer.offer_notes ?? offer.notes ?? '',
        attachment_url: offer.attachment_url ?? '',
        items: existingItems.length
          ? existingItems.map((item) => ({
              description: item.description,
              qty: item.qty === null ? '' : String(item.qty),
              unit: item.unit ?? rfq.unit ?? '',
              unit_price: item.unit_price === null ? '' : String(item.unit_price),
              notes: item.notes ?? '',
            }))
          : [blankOfferItem(rfq.unit ?? '')],
      })
      setView('edit-offer')
    } else {
      setOfferDraft(blankOffer(rfq.unit ?? ''))
      setView('new-offer')
    }
  }

  function setOfferItem(index: number, patch: Partial<OfferItemDraft>) {
    const nextItems = offerDraft.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    )
    const total = nextItems.reduce((sum, item) => sum + n(item.qty) * n(item.unit_price), 0)
    setOfferDraft({ ...offerDraft, items: nextItems, total_amount: String(total) })
  }

  async function saveOffer() {
    if (!projectId || !selectedRfq || !offerDraft.supplier_name.trim()) return
    setSaving(true)
    setMessage('')
    try {
      const cleanItems = offerDraft.items
        .map((item) => ({
          rfq_id: selectedRfq.id,
          description: item.description.trim(),
          qty: item.qty === '' ? null : n(item.qty),
          unit: item.unit.trim() || null,
          unit_price: item.unit_price === '' ? null : n(item.unit_price),
          notes: item.notes.trim() || null,
        }))
        .filter((item) => item.description)

      const itemTotal = cleanItems.reduce((sum, item) => sum + n(item.qty) * n(item.unit_price), 0)
      const offerPayload = {
        rfq_id: selectedRfq.id,
        project_id: projectId,
        supplier_name: offerDraft.supplier_name.trim(),
        supplier_contact: offerDraft.supplier_contact.trim() || null,
        total_amount: n(offerDraft.total_amount) || itemTotal,
        offer_amount: n(offerDraft.total_amount) || itemTotal,
        currency: offerDraft.currency.trim() || 'EGP',
        delivery_days: offerDraft.delivery_days === '' ? null : n(offerDraft.delivery_days),
        payment_terms: offerDraft.payment_terms.trim() || null,
        validity_date: offerDraft.validity_date || null,
        notes: offerDraft.notes.trim() || null,
        offer_notes: offerDraft.notes.trim() || null,
        attachment_url: offerDraft.attachment_url.trim() || null,
        created_by: userId ?? null,
      }

      let offerId = editingOfferId
      if (editingOfferId) {
        const offerUpdatePayload = {
          rfq_id: offerPayload.rfq_id,
          project_id: offerPayload.project_id,
          supplier_name: offerPayload.supplier_name,
          supplier_contact: offerPayload.supplier_contact,
          total_amount: offerPayload.total_amount,
          offer_amount: offerPayload.offer_amount,
          currency: offerPayload.currency,
          delivery_days: offerPayload.delivery_days,
          payment_terms: offerPayload.payment_terms,
          validity_date: offerPayload.validity_date,
          notes: offerPayload.notes,
          offer_notes: offerPayload.offer_notes,
          attachment_url: offerPayload.attachment_url,
        }
        const { error } = await supabase
          .from('procurement_quotation_offers')
          .update(offerUpdatePayload as any)
          .eq('id', editingOfferId)
        if (error) throw error
        const { error: deleteItemsError } = await supabase
          .from('procurement_quotation_offer_items')
          .delete()
          .eq('offer_id', editingOfferId)
        if (deleteItemsError) throw deleteItemsError
      } else {
        const { data, error } = await supabase
          .from('procurement_quotation_offers')
          .insert(offerPayload as any)
          .select('id')
          .single()
        if (error) throw error
        offerId = data.id
      }

      if (offerId && cleanItems.length) {
        const { error: insertItemsError } = await supabase
          .from('procurement_quotation_offer_items')
          .insert(cleanItems.map((item) => ({ ...item, item_name: item.description, offer_id: offerId })) as any)
        if (insertItemsError) throw insertItemsError
      }

      await loadRfqs(selectedRfq.id)
      setMessage(editingOfferId ? 'Supplier offer updated.' : 'Supplier offer added.')
      setView('details')
    } catch (error: any) {
      setMessage(error?.message ?? 'Unable to save supplier offer.')
    } finally {
      setSaving(false)
    }
  }

  async function selectWinningOffer(offerId: string) {
    if (!selectedRfq || !selectionReason.trim()) {
      setMessage('Selection reason is required before choosing a winning supplier.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('select_procurement_quotation_offer', {
        p_offer_id: offerId,
        p_reason: selectionReason.trim(),
      })
      if (error) throw error

      await loadRfqs(selectedRfq.id)
      setMessage('Winning supplier selected.')
    } catch (error: any) {
      setMessage(error?.message ?? 'Unable to select winning supplier.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteOffer(offer: Offer) {
    if (offer.is_selected) {
      setMessage('Selected supplier offers cannot be deleted. Select another winner first if this award changed.')
      return
    }
    if (!window.confirm(`Delete supplier offer from ${offer.supplier_name}?`)) return
    setSaving(true)
    setMessage('')
    try {
      const { error: itemError } = await supabase
        .from('procurement_quotation_offer_items')
        .delete()
        .eq('offer_id', offer.id)
      if (itemError) throw itemError
      const { error } = await supabase
        .from('procurement_quotation_offers')
        .delete()
        .eq('id', offer.id)
      if (error) throw error
      await loadRfqs(selectedRfqId ?? offer.rfq_id)
      setMessage('Supplier offer deleted.')
    } catch (error: any) {
      setMessage(error?.message ?? 'Unable to delete supplier offer.')
    } finally {
      setSaving(false)
    }
  }

  async function markReadyForPo() {
    if (!selectedOffer) return
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase
        .from('procurement_quotation_offers')
        .update({ po_conversion_status: 'ready_for_po' } as any)
        .eq('id', selectedOffer.id)
      if (error) throw error
      await loadRfqs(selectedRfq?.id ?? null)
      setMessage('Selected offer marked ready for Purchase Order conversion.')
    } catch (error: any) {
      setMessage(error?.message ?? 'Unable to mark offer for PO conversion.')
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <div style={{ background: '#113f3a', borderRadius: 12, padding: 18, color: '#fff', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900, textTransform: 'uppercase' }}>Procurement Quotations / RFQ</div>
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>Supplier Offers and Selection</div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>Create RFQs, capture supplier offers, compare live Supabase data, and reserve the selected offer for PO conversion.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <button onClick={openNewRfq} style={{ ...buttonBase, background: '#fff', color: '#113f3a' }}>+ New RFQ</button>
        {onBack && <button onClick={onBack} style={{ ...buttonBase, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.45)' }}>Back to Procurement</button>}
      </div>
    </div>
  )

  if (!projectId) {
    return <div style={{ display: 'grid', gap: 14 }}>{header}<Panel>No project selected. Select a project before creating RFQs.</Panel></div>
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {header}
      {message && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eef9f4', border: '1px solid #cceadf', color: '#0c5c46', fontSize: 13, fontWeight: 700 }}>{message}</div>}
      {loading && <Panel>Loading RFQs from Supabase...</Panel>}
      {!loading && view === 'list' && renderList()}
      {!loading && view === 'supplier-offers' && renderSupplierOffers()}
      {!loading && view === 'comparison-list' && renderComparisonSelector()}
      {!loading && view === 'new-rfq' && renderRfqForm()}
      {!loading && view === 'details' && selectedRfq && renderDetails()}
      {!loading && (view === 'new-offer' || view === 'edit-offer') && selectedRfq && renderOfferForm()}
      {!loading && view === 'compare' && selectedRfq && renderCompare()}
    </div>
  )

  function renderList() {
    const offerCountByRfq = new Map<string, number>()
    offers.forEach((offer) => offerCountByRfq.set(offer.rfq_id, (offerCountByRfq.get(offer.rfq_id) ?? 0) + 1))
    return (
      <Panel
        title="RFQ List"
        action={<button onClick={openNewRfq} style={{ ...buttonBase, background: '#0f6e56', color: '#fff' }}>+ New RFQ</button>}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 13 }}>
            <thead><tr>{['RFQ No', 'Title', 'Material', 'Required Date', 'Offers', 'Status', 'Selected Supplier', ''].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
            <tbody>
              {rfqs.map((rfq) => {
                const winner = offers.find((offer) => offer.rfq_id === rfq.id && offer.is_selected)
                return (
                  <tr key={rfq.id} style={{ borderBottom: '1px solid #edf2f0' }}>
                    <Td strong>{rfq.rfq_no}</Td>
                    <Td>{rfq.title}</Td>
                    <Td>{rfq.material ?? '-'}</Td>
                    <Td>{rfq.required_date ?? rfq.due_date ?? '-'}</Td>
                    <Td>{offerCountByRfq.get(rfq.id) ?? 0}</Td>
                    <Td><Status text={rfq.status} /></Td>
                    <Td>{winner ? <Status text={winner.supplier_name} tone="success" /> : '-'}</Td>
                    <Td><button onClick={() => openDetails(rfq.id)} style={{ ...buttonBase, background: '#fff', borderColor: '#cfdcd7', color: '#16443c' }}>Open</button></Td>
                  </tr>
                )
              })}
              {rfqs.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#667085' }}>No RFQs yet. Start with + New RFQ.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    )
  }

  function renderSupplierOffers() {
    const rfqById = new Map(rfqs.map((rfq) => [rfq.id, rfq]))
    return (
      <Panel
        title="Supplier Offers"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => {
              const firstRfq = rfqs[0]
              if (!firstRfq) { setMessage('Create an RFQ before adding supplier offers.'); return }
              setSelectedRfqId(firstRfq.id)
              openOfferFormForRfq(firstRfq, 'new')
            }} style={{ ...buttonBase, background: '#0f6e56', color: '#fff' }}>+ Add Offer</button>
            <button onClick={() => setView('list')} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>Open RFQs</button>
          </div>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
            <thead><tr>{['RFQ', 'Supplier', 'Offer Amount', 'Currency', 'Delivery', 'Payment Terms', 'Validity', 'Selected', ''].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
            <tbody>
              {offers.map((offer) => {
                const rfq = rfqById.get(offer.rfq_id)
                return (
                  <tr key={offer.id} style={{ borderBottom: '1px solid #edf2f0', background: offer.is_selected ? '#f0faf6' : '#fff' }}>
                    <Td><b>{rfq?.rfq_no ?? '-'}</b><div style={{ color: '#667085', fontSize: 12 }}>{rfq?.title ?? '-'}</div></Td>
                    <Td strong>{offer.supplier_name}</Td>
                    <Td>{money(offer.offer_amount ?? offer.total_amount)}</Td>
                    <Td>{offer.currency ?? 'EGP'}</Td>
                    <Td>{offer.delivery_days ?? '-'} days</Td>
                    <Td>{offer.payment_terms ?? '-'}</Td>
                    <Td>{offer.validity_date ?? '-'}</Td>
                    <Td>{offer.is_selected ? <Status text="Selected" tone="success" /> : '-'}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => {
                          if (!rfq) return
                          setSelectedRfqId(offer.rfq_id)
                          openOfferFormForRfq(rfq, 'edit', offer)
                        }} style={{ ...buttonBase, background: '#fff', borderColor: '#cfdcd7', color: '#16443c' }}>Edit</button>
                        <button onClick={() => deleteOffer(offer)} disabled={saving || offer.is_selected} style={{ ...buttonBase, background: '#fff3f3', color: '#9c2d2d', borderColor: '#efc9c9', opacity: offer.is_selected ? 0.55 : 1 }}>Delete</button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
              {offers.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#667085' }}>No supplier offers yet. Create an RFQ and add supplier offers.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    )
  }

  function renderComparisonSelector() {
    return (
      <Panel title="Quotation Comparison">
        <FormGrid>
          <Field label="Select RFQ">
            <select
              style={inputStyle}
              value={selectedRfqId ?? ''}
              onChange={(event) => {
                setSelectedRfqId(event.target.value || null)
                setSelectionReason('')
              }}
            >
              <option value="">Select RFQ</option>
              {rfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfq.rfq_no} - {rfq.title}</option>)}
            </select>
          </Field>
        </FormGrid>
        {rfqs.length === 0 && <div style={{ padding: 18, color: '#667085' }}>No RFQs found. Create an RFQ first.</div>}
        {selectedRfq && rfqOffers.length === 0 && <div style={{ padding: 18, color: '#667085' }}>No supplier offers found for this RFQ. Add supplier offers to compare.</div>}
        {selectedRfq && rfqOffers.length > 0 && renderCompare()}
      </Panel>
    )
  }

  function renderRfqForm() {
    return (
      <Panel title="New RFQ">
        <FormGrid>
          <Field label="RFQ No"><input style={inputStyle} value={rfqDraft.rfq_no} onChange={(event) => setRfqDraft({ ...rfqDraft, rfq_no: event.target.value })} /></Field>
          <Field label="Link Material Request"><select style={inputStyle} value={rfqDraft.procurement_record_id} onChange={(event) => applyProcurementRecord(event.target.value)}><option value="">Manual RFQ</option>{procurement.map((record) => <option key={record.id} value={record.id}>{record.pr_no ?? 'PR'} - {record.material ?? record.description ?? 'Material'}</option>)}</select></Field>
          <Field label="Title"><input style={inputStyle} value={rfqDraft.title} onChange={(event) => setRfqDraft({ ...rfqDraft, title: event.target.value })} /></Field>
          <Field label="Material"><input style={inputStyle} value={rfqDraft.material} onChange={(event) => setRfqDraft({ ...rfqDraft, material: event.target.value })} /></Field>
          <Field label="Required Qty"><input type="number" style={inputStyle} value={rfqDraft.required_qty} onChange={(event) => setRfqDraft({ ...rfqDraft, required_qty: event.target.value })} /></Field>
          <Field label="Unit"><input style={inputStyle} value={rfqDraft.unit} onChange={(event) => setRfqDraft({ ...rfqDraft, unit: event.target.value })} /></Field>
          <Field label="Required Date"><input type="date" style={inputStyle} value={rfqDraft.due_date} onChange={(event) => setRfqDraft({ ...rfqDraft, due_date: event.target.value })} /></Field>
          <Field label="Status"><select style={inputStyle} value={rfqDraft.status} onChange={(event) => setRfqDraft({ ...rfqDraft, status: event.target.value })}><option>Draft</option><option>Sent</option><option>Under Comparison</option><option>Awarded</option><option>Cancelled</option></select></Field>
        </FormGrid>
        <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 86 }} value={rfqDraft.notes} onChange={(event) => setRfqDraft({ ...rfqDraft, notes: event.target.value })} /></Field>
        <Actions>
          <button onClick={saveRfq} disabled={saving || !rfqDraft.rfq_no.trim() || !rfqDraft.title.trim()} style={{ ...buttonBase, background: '#0f6e56', color: '#fff', opacity: saving ? 0.65 : 1 }}>Save RFQ</button>
          <button onClick={() => setView('list')} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>Cancel</button>
        </Actions>
      </Panel>
    )
  }

  function renderDetails() {
    if (!selectedRfq) return null
    return (
      <>
        <Panel
          title={`${selectedRfq.rfq_no} - ${selectedRfq.title}`}
          action={<button onClick={() => setView('list')} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>RFQ List</button>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Metric label="Material" value={selectedRfq.material ?? '-'} />
            <Metric label="Qty" value={`${selectedRfq.required_qty ?? '-'} ${selectedRfq.unit ?? ''}`} />
            <Metric label="Required Date" value={selectedRfq.required_date ?? selectedRfq.due_date ?? '-'} />
            <Metric label="Offers" value={rfqOffers.length} />
            <Metric label="Selected" value={selectedOffer?.supplier_name ?? '-'} />
          </div>
          {selectedRfq.notes && <div style={{ marginTop: 12, color: '#667085', fontSize: 13 }}>{selectedRfq.notes}</div>}
        </Panel>

        <Panel
          title="Supplier Offers"
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => openOfferForm('new')} style={{ ...buttonBase, background: '#0f6e56', color: '#fff' }}>+ Add Supplier Offer</button>
              {rfqOffers.length >= 2 && <button onClick={() => setView('compare')} style={{ ...buttonBase, background: '#fff', borderColor: '#0f6e56', color: '#0f6e56' }}>Compare</button>}
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
            {rfqOffers.map((offer) => (
              <div key={offer.id} style={{ border: `1px solid ${offer.is_selected ? '#0f6e56' : '#dfe8e4'}`, borderRadius: 10, padding: 12, background: offer.is_selected ? '#f0faf6' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 900 }}>{offer.supplier_name}</div>
                  {offer.is_selected && <Status text="Selected" tone="success" />}
                </div>
                <div style={{ marginTop: 8, display: 'grid', gap: 5, fontSize: 13, color: '#475467' }}>
                  <div><b>{offer.currency ?? 'EGP'} {money(offer.offer_amount ?? offer.total_amount)}</b> total amount</div>
                  {offer.supplier_contact && <div>{offer.supplier_contact}</div>}
                  <div>{offer.delivery_days ?? '-'} delivery days</div>
                  <div>{offer.payment_terms ?? '-'}</div>
                  <div>Valid until {offer.validity_date ?? '-'}</div>
                  <div>PO status: {offer.po_conversion_status ?? 'not_started'}</div>
                </div>
                <Actions>
                  <button onClick={() => openOfferForm('edit', offer)} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>Edit</button>
                  <button onClick={() => deleteOffer(offer)} disabled={saving || offer.is_selected} style={{ ...buttonBase, background: '#fff3f3', color: '#9c2d2d', borderColor: '#efc9c9', opacity: offer.is_selected ? 0.55 : 1 }}>Delete</button>
                </Actions>
              </div>
            ))}
            {rfqOffers.length === 0 && <div style={{ padding: 18, color: '#667085' }}>No supplier offers yet.</div>}
          </div>
        </Panel>
      </>
    )
  }

  function renderOfferForm() {
    if (!selectedRfq) return null
    return (
      <Panel title={view === 'edit-offer' ? 'Edit Supplier Offer' : 'Supplier Offer'}>
        <FormGrid>
          <Field label="Supplier Name"><input style={inputStyle} value={offerDraft.supplier_name} onChange={(event) => setOfferDraft({ ...offerDraft, supplier_name: event.target.value })} /></Field>
          <Field label="Supplier Contact"><input style={inputStyle} value={offerDraft.supplier_contact} onChange={(event) => setOfferDraft({ ...offerDraft, supplier_contact: event.target.value })} /></Field>
          <Field label="Total Amount"><input type="number" style={inputStyle} value={offerDraft.total_amount} onChange={(event) => setOfferDraft({ ...offerDraft, total_amount: event.target.value })} /></Field>
          <Field label="Currency"><input style={inputStyle} value={offerDraft.currency} onChange={(event) => setOfferDraft({ ...offerDraft, currency: event.target.value })} /></Field>
          <Field label="Delivery Days"><input type="number" style={inputStyle} value={offerDraft.delivery_days} onChange={(event) => setOfferDraft({ ...offerDraft, delivery_days: event.target.value })} /></Field>
          <Field label="Payment Terms"><input style={inputStyle} value={offerDraft.payment_terms} onChange={(event) => setOfferDraft({ ...offerDraft, payment_terms: event.target.value })} placeholder="Net 30, 45 days, advance 20%" /></Field>
          <Field label="Validity Date"><input type="date" style={inputStyle} value={offerDraft.validity_date} onChange={(event) => setOfferDraft({ ...offerDraft, validity_date: event.target.value })} /></Field>
          <Field label="Attachment URL"><input style={inputStyle} value={offerDraft.attachment_url} onChange={(event) => setOfferDraft({ ...offerDraft, attachment_url: event.target.value })} /></Field>
        </FormGrid>
        <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 74 }} value={offerDraft.notes} onChange={(event) => setOfferDraft({ ...offerDraft, notes: event.target.value })} /></Field>
        <div style={{ fontWeight: 900, margin: '12px 0 8px' }}>Offer Items</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {offerDraft.items.map((item, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(3, minmax(80px, 1fr)) auto', gap: 8, alignItems: 'end' }}>
              <Field label="Description"><input style={inputStyle} value={item.description} onChange={(event) => setOfferItem(index, { description: event.target.value })} /></Field>
              <Field label="Qty"><input type="number" style={inputStyle} value={item.qty} onChange={(event) => setOfferItem(index, { qty: event.target.value })} /></Field>
              <Field label="Unit"><input style={inputStyle} value={item.unit} onChange={(event) => setOfferItem(index, { unit: event.target.value })} /></Field>
              <Field label="Unit Price"><input type="number" style={inputStyle} value={item.unit_price} onChange={(event) => setOfferItem(index, { unit_price: event.target.value })} /></Field>
              <button onClick={() => setOfferDraft({ ...offerDraft, items: offerDraft.items.filter((_x, itemIndex) => itemIndex !== index) })} disabled={offerDraft.items.length === 1} style={{ ...buttonBase, background: '#fff3f3', color: '#9c2d2d', borderColor: '#efc9c9' }}>Remove</button>
            </div>
          ))}
        </div>
        <Actions>
          <button onClick={() => setOfferDraft({ ...offerDraft, items: [...offerDraft.items, blankOfferItem(selectedRfq?.unit ?? '')] })} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>Add Item</button>
          <button onClick={saveOffer} disabled={saving || !offerDraft.supplier_name.trim()} style={{ ...buttonBase, background: '#0f6e56', color: '#fff', opacity: saving ? 0.65 : 1 }}>Save Offer</button>
          <button onClick={() => setView('details')} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>Cancel</button>
        </Actions>
      </Panel>
    )
  }

  function renderCompare() {
    if (!selectedRfq) return null
    return (
      <Panel
        title="Quotation Comparison"
        action={<button onClick={() => setView('details')} style={{ ...buttonBase, background: '#fff', borderColor: '#d9e2df' }}>Back to RFQ</button>}
      >
        <div style={{ marginBottom: 12 }}>
          <Field label="Required Selection Reason">
            <textarea style={{ ...inputStyle, minHeight: 72 }} value={selectionReason} onChange={(event) => setSelectionReason(event.target.value)} placeholder="Why is this supplier selected?" />
          </Field>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, fontSize: 13 }}>
            <thead><tr>{['Supplier', 'Offer Amount', 'Delivery', 'Payment Terms', 'Validity', 'Highlights', 'Selected', 'Action'].map((head) => <Th key={head}>{head}</Th>)}</tr></thead>
            <tbody>
              {rfqOffers.map((offer) => {
                const amount = Number(offer.offer_amount ?? offer.total_amount ?? 0)
                const isLowest = lowestAmount !== null && amount === lowestAmount
                const isFastest = fastestDelivery !== null && Number(offer.delivery_days ?? Number.MAX_SAFE_INTEGER) === fastestDelivery
                const isBestPayment = bestPaymentScore !== null && paymentScore(offer.payment_terms) === bestPaymentScore
                return (
                  <tr key={offer.id} style={{ borderBottom: '1px solid #edf2f0', background: offer.is_selected ? '#f0faf6' : '#fff' }}>
                    <Td strong>{offer.supplier_name}</Td>
                    <Td>{offer.currency ?? 'EGP'} {money(amount)}</Td>
                    <Td>{offer.delivery_days ?? '-'} days</Td>
                    <Td>{offer.payment_terms ?? '-'}</Td>
                    <Td>{offer.validity_date ?? '-'}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {isLowest && <Status text="Lowest price" tone="success" />}
                        {isFastest && <Status text="Fastest delivery" tone="warn" />}
                        {isBestPayment && <Status text="Best payment terms" />}
                      </div>
                    </Td>
                    <Td>{offer.is_selected ? <Status text="Selected supplier" tone="success" /> : '-'}</Td>
                    <Td><button onClick={() => selectWinningOffer(offer.id)} disabled={saving || !selectionReason.trim()} style={{ ...buttonBase, background: '#0f6e56', color: '#fff', opacity: !selectionReason.trim() ? 0.6 : 1 }}>Select</button></Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {selectedOffer && (
          <div style={{ marginTop: 14, padding: 12, border: '1px solid #cceadf', background: '#eef9f4', borderRadius: 10 }}>
            <div style={{ fontWeight: 900, color: '#0c5c46' }}>Selected supplier: {selectedOffer.supplier_name}</div>
            <div style={{ fontSize: 13, color: '#475467', marginTop: 4 }}>Reason: {selectedOffer.selection_reason ?? '-'}</div>
            <Actions>
              <button onClick={markReadyForPo} disabled={saving} style={{ ...buttonBase, background: '#0f6e56', color: '#fff' }}>Convert to Purchase Order Later</button>
            </Actions>
          </div>
        )}
      </Panel>
    )
  }
}

function paymentScore(value: string | null | undefined) {
  const text = String(value ?? '').toLowerCase()
  const dayMatch = text.match(/(\d+)\s*(day|days|net)/)
  const days = dayMatch ? Number(dayMatch[1]) : 0
  const advanceMatch = text.match(/advance\s*(\d+)/)
  const advancePenalty = advanceMatch ? Number(advanceMatch[1]) * 2 : 0
  return days - advancePenalty
}

function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e1e8e5', borderRadius: 12, padding: 14 }}>
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {title && <div style={{ fontSize: 16, fontWeight: 900, color: '#1f2933' }}>{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 5, fontWeight: 700 }}>{label}</div>
      {children}
    </label>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{children}</div>
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ background: '#f7faf8', border: '1px solid #e4ece8', borderRadius: 10, padding: 11 }}>
      <div style={{ fontSize: 11, color: '#667085', textTransform: 'uppercase', fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 900, color: '#1f2933' }}>{value}</div>
    </div>
  )
}

function Status({ text, tone = 'default' }: { text: string; tone?: 'default' | 'success' | 'warn' }) {
  const colors = {
    default: { bg: '#eef2ff', fg: '#344054' },
    success: { bg: '#e1f5ee', fg: '#0f6e56' },
    warn: { bg: '#fff4de', fg: '#8a4b00' },
  }[tone]
  return <span style={{ display: 'inline-block', borderRadius: 999, padding: '3px 9px', background: colors.bg, color: colors.fg, fontSize: 11, fontWeight: 900 }}>{text}</span>
}

function Th({ children }: { children: ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '9px 10px', borderBottom: '1px solid #dfe8e4', color: '#667085', fontSize: 11, textTransform: 'uppercase' }}>{children}</th>
}

function Td({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td style={{ padding: '10px', verticalAlign: 'top', fontWeight: strong ? 900 : 500, color: '#1f2933' }}>{children}</td>
}
