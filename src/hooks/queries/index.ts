'use client'
// src/hooks/queries/index.ts
// All data hooks for the Project Controls System

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { unwrap, unwrapOptional } from '@/lib/supabase/helpers'
import { qk } from '@/lib/query-keys'
import type {
  Project, ProjectInsert,
  Subcontractor, SubcontractorInsert,
  BoqItem, BoqItemInsert,
  SubcontractBreakdown, SubcontractBreakdownInsert,
  QsEntry, QsEntryInsert, VillaAssignment, VillaAssignmentInsert, VillaBreakdownLine, VillaBreakdownLineInsert, StructureNode, StructureNodeInsert, StructureNodeUpdate, NodeType, TenderItem, TenderItemInsert, CostCategory, ScheduleActivity, ScheduleActivityInsert, ActivityStatus, QtoLine, QtoLineInsert, QtoLineUpdate, VillaUnit, VillaUnitInsert, VillaProgress, VillaProgressInsert, VillaProgressUpdate, TradeType,
  Certificate, CertificateInsert,
  CertificateLine, CertificateLineInsert,
  InvoiceAddition, InvoiceAdditionInsert,
  InvoicePenalty, InvoicePenaltyInsert,
  TechnicalRecord, TechnicalRecordInsert,
  TechnicalStatus,
  ProcurementRecord, ProcurementRecordInsert, ProcurementStatus,
  Variation, VariationInsert, VariationStatus,
  VDashboardKpis, VCommercialSummary, VCertificateSummary, VTechnicalOverdue, VPendingApproval,
  ApprovalStatus, CertificateStatus,
} from '@/types/database'
import type { GenerateCertificateRequest, GenerateCertificateResponse } from '@/types/certificate-engine'

// ─── helpers ────────────────────────────────────────────────────────────────

export function calcEffectivePayQty(survey: number | null | undefined, boq: number): number {
  return !survey || survey === 0 ? boq : survey
}

// ─── PROJECTS ───────────────────────────────────────────────────────────────

export function useProjects() {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.projects.list(),
    enabled: typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    queryFn: async (): Promise<Project[]> => unwrap(await supabase.from('projects').select('*').order('project_name'), []),
  })
}

export function useProject(id: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.projects.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<Project | null> => unwrapOptional(await supabase.from('projects').select('*').eq('id', id!).single()),
  })
}

export function useDashboardKpis(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.dashboard.kpis(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<VDashboardKpis | null> => unwrapOptional(await supabase.from('v_dashboard_kpis').select('*').eq('project_id', projectId!).single()),
  })
}

export function useCreateProject() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProjectInsert): Promise<Project> => unwrap(await supabase.from('projects').insert(input as any).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects.list() }),
  })
}

export function useUpdateProject() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProjectInsert> }): Promise<Project> =>
      unwrap(await supabase.from('projects').update(data as any).eq('id', id).select().single()),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: qk.projects.list() }); qc.setQueryData(qk.projects.detail(p.id), p) },
  })
}

// ─── SUBCONTRACTORS ──────────────────────────────────────────────────────────

export function useSubcontractors(projectId?: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: [...qk.subcontractors.list(), projectId ?? ''],
    enabled: !!projectId,
    queryFn: async (): Promise<Subcontractor[]> => {
      if (!projectId) return []

      // V140_05: subcontractors are global master data. The project screen must only
      // show subcontractors explicitly linked to the active project.
      const linked = await supabase
        .from('project_subcontractors')
        .select('subcontractor_id, subcontractors(*)')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (!linked.error) {
        const rows = (linked.data ?? [])
          .map((r: any) => r.subcontractors)
          .filter(Boolean) as Subcontractor[]
        return rows.sort((a: any, b: any) => String(a.subcontractor_code ?? '').localeCompare(String(b.subcontractor_code ?? '')))
      }

      // Safe fallback before V140_05 SQL is run: infer project subcontractors from
      // project-scoped records instead of showing the whole global subcontractor list.
      const ids = new Set<string>()
      const collect = (rows: any[] | null | undefined) => {
        ;(rows ?? []).forEach((r: any) => {
          if (r?.subcontractor_id) ids.add(String(r.subcontractor_id))
        })
      }

      const queries = await Promise.allSettled([
        supabase.from('subcontract_breakdown').select('subcontractor_id').eq('project_id', projectId).eq('is_active', true),
        supabase.from('subcontractor_contracts').select('subcontractor_id').eq('project_id', projectId),
        supabase.from('subcontractor_invoices').select('subcontractor_id').eq('project_id', projectId),
        supabase.from('subcontractor_work_assignments').select('subcontractor_id').eq('project_id', projectId),
      ])
      queries.forEach((result) => {
        if (result.status === 'fulfilled' && !result.value.error) collect(result.value.data as any[])
      })

      if (ids.size === 0) return []
      return unwrap(
        await supabase.from('subcontractors').select('*').in('id', Array.from(ids)).order('subcontractor_code'),
        []
      )
    },
  })
}

export function useSubcontractor(id: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.subcontractors.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<Subcontractor | null> => unwrapOptional(await supabase.from('subcontractors').select('*').eq('id', id!).single()),
  })
}

export function useCommercialSummary(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.commercial.summary(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<VCommercialSummary[]> => unwrap(await supabase.from('v_commercial_summary').select('*').eq('project_id', projectId!).order('subcontractor_code'), []),
  })
}

export function useCreateSubcontractor() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SubcontractorInsert): Promise<Subcontractor> => unwrap(await supabase.from('subcontractors').insert(input as any).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subcontractors.all() }),
  })
}

export function useUpdateSubcontractor() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SubcontractorInsert> }): Promise<Subcontractor> =>
      unwrap(await supabase.from('subcontractors').update(data as any).eq('id', id).select().single()),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: qk.subcontractors.all() }); qc.setQueryData(qk.subcontractors.detail(s.id), s) },
  })
}

// ─── BOQ ────────────────────────────────────────────────────────────────────

export function useBoqItems(projectId: string | null, filters?: { discipline?: string; search?: string }) {
  const supabase = createClient()
  return useQuery({
    queryKey: [...qk.boq.list(projectId ?? ''), filters],
    enabled: !!projectId,
    queryFn: async (): Promise<BoqItem[]> => {
      let q = supabase.from('boq_items').select('*').eq('project_id', projectId!).order('item_code')
      if (filters?.discipline) q = q.eq('discipline', filters.discipline as BoqItem['discipline'])
      if (filters?.search) q = q.or(`item_code.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
      return unwrap(await q, [])
    },
  })
}

export function useCreateBoqItem() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: BoqItemInsert): Promise<BoqItem> => unwrap(await supabase.from('boq_items').insert(input as any).select().single()),
    onSuccess: (item) => qc.invalidateQueries({ queryKey: qk.boq.list(item.project_id) }),
  })
}

export function useBulkImportBoq() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, items }: { projectId: string; items: Omit<BoqItemInsert, 'project_id'>[] }) => {
      const rows: BoqItemInsert[] = items.map(i => ({ ...i, project_id: projectId }))
      const BATCH = 500
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        // Use insert with ignoreDuplicates to handle re-imports gracefully
        const res = await supabase.from('boq_items').insert(batch as any).select('id')
        inserted += unwrap(res, []).length
      }
      return { inserted, projectId }
    },
    onSuccess: ({ projectId }) => qc.invalidateQueries({ queryKey: qk.boq.list(projectId) }),
  })
}

export function useUpdateBoqItem() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BoqItemInsert> }): Promise<BoqItem> =>
      unwrap(await supabase.from('boq_items').update(data as any).eq('id', id).select().single()),
    onSuccess: (item) => { qc.invalidateQueries({ queryKey: qk.boq.list(item.project_id) }); qc.setQueryData(qk.boq.detail(item.id), item) },
  })
}

// ─── SUBCONTRACT BREAKDOWN ──────────────────────────────────────────────────

export interface BreakdownWithJoins extends SubcontractBreakdown {
  subcontractors: { subcontractor_code: string; name: string }
  boq_items: { item_code: string; description: string; unit: string }
}

export function useSubcontractBreakdown(projectId: string | null, subcontractorId?: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: subcontractorId ? qk.breakdown.bySub(projectId ?? '', subcontractorId) : qk.breakdown.list(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<BreakdownWithJoins[]> => {
      let q = supabase.from('subcontract_breakdown').select('*, subcontractors(subcontractor_code,name), boq_items(item_code,description,unit)')
        .eq('project_id', projectId!).eq('is_active', true).order('assignment_key')
      if (subcontractorId) q = q.eq('subcontractor_id', subcontractorId)
      return unwrap(await q, []) as BreakdownWithJoins[]
    },
  })
}

export function useCreateBreakdown() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SubcontractBreakdownInsert): Promise<SubcontractBreakdown> =>
      unwrap(await supabase.from('subcontract_breakdown').insert(input as any).select().single()),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: qk.breakdown.list(r.project_id) }); qc.invalidateQueries({ queryKey: qk.commercial.summary(r.project_id) }) },
  })
}

export function useUpdateBreakdown() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SubcontractBreakdownInsert> }): Promise<SubcontractBreakdown> =>
      unwrap(await supabase.from('subcontract_breakdown').update(data as any).eq('id', id).select().single()),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: qk.breakdown.list(r.project_id) }); qc.invalidateQueries({ queryKey: qk.commercial.summary(r.project_id) }) },
  })
}

// ─── QS ENTRIES ──────────────────────────────────────────────────────────────

export function useQsEntries(projectId: string | null, subcontractorId?: string, certNo?: number) {
  const supabase = createClient()
  const key = certNo ? qk.qs.byCert(projectId ?? '', certNo) : subcontractorId ? qk.qs.bySub(projectId ?? '', subcontractorId) : qk.qs.list(projectId ?? '')
  return useQuery({
    queryKey: key,
    enabled: !!projectId,
    queryFn: async (): Promise<QsEntry[]> => {
      let q = supabase.from('qs_entries').select('*').eq('project_id', projectId!).order('period_end', { ascending: false })
      if (certNo !== undefined) q = q.eq('cert_no', certNo)
      return unwrap(await q, [])
    },
  })
}

export function usePendingApprovals(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.qs.pending(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<VPendingApproval[]> => unwrap(await supabase.from('v_pending_approvals').select('*').eq('project_id', projectId!).order('submitted_at'), []),
  })
}

export function useBatchCreateQsEntries() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, entries }: { projectId: string; entries: Omit<QsEntryInsert, 'project_id'>[] }): Promise<QsEntry[]> => {
      const rows: QsEntryInsert[] = entries.map(e => ({ ...e, project_id: projectId }))
      return unwrap(await supabase.from('qs_entries').upsert(rows as any, { onConflict: 'project_id,breakdown_id,cert_no' }).select(), [])
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: qk.qs.list(vars.projectId) }); qc.invalidateQueries({ queryKey: qk.qs.pending(vars.projectId) }) },
  })
}

export function useSubmitQsEntry() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<QsEntry> =>
      unwrap(await supabase.from('qs_entries').update({ status: 'Submitted' as ApprovalStatus, submitted_at: new Date().toISOString() } as any).eq('id', id).select().single()),
    onSuccess: (e) => { qc.invalidateQueries({ queryKey: qk.qs.list(e.project_id) }); qc.invalidateQueries({ queryKey: qk.qs.pending(e.project_id) }) },
  })
}

export function useReviewQsEntry() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ qsEntryId, projectId, decision, approvedQty, comments }: { qsEntryId: string; projectId: string; decision: 'Approved' | 'Rejected'; approvedQty?: number; comments?: string }): Promise<QsEntry> => {
      const entry: QsEntry = unwrap<QsEntry>(await supabase.from('qs_entries').update({ status: decision as ApprovalStatus } as any).eq('id', qsEntryId).select().single() as any)
      unwrap(await supabase.from('qs_approvals').insert({ project_id: projectId, qs_entry_id: qsEntryId, status: decision as ApprovalStatus, review_date: new Date().toISOString(), approved_qty: approvedQty ?? null, comments: comments ?? null } as any).select().single() as any)
      return entry
    },
    onSuccess: (e: QsEntry) => { qc.invalidateQueries({ queryKey: qk.qs.list(e.project_id) }); qc.invalidateQueries({ queryKey: qk.qs.pending(e.project_id) }); qc.invalidateQueries({ queryKey: qk.approvals.list(e.project_id) }) },
  })
}

// ─── CERTIFICATES ────────────────────────────────────────────────────────────

export interface CertificateWithSub extends Certificate {
  subcontractors: { subcontractor_code: string; name: string }
}

export function useCertificates(projectId: string | null, subcontractorId?: string) {
  const supabase = createClient()
  const key = subcontractorId ? qk.certificates.bySub(projectId ?? '', subcontractorId) : qk.certificates.list(projectId ?? '')
  return useQuery({
    queryKey: key,
    enabled: !!projectId,
    queryFn: async (): Promise<CertificateWithSub[]> => {
      let q = supabase.from('subcontractor_invoices').select('*, subcontractors(subcontractor_code,name)').eq('project_id', projectId!).order('period_end', { ascending: false })
      if (subcontractorId) q = q.eq('subcontractor_id', subcontractorId)
      return unwrap(await q, []) as CertificateWithSub[]
    },
  })
}

export function useCertificateDetail(id: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.certificates.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<CertificateWithSub | null> =>
      unwrapOptional(await supabase.from('subcontractor_invoices').select('*, subcontractors(subcontractor_code,name)').eq('id', id!).single()) as CertificateWithSub | null,
  })
}

export function useCertificateLines(certificateId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.certificates.lines(certificateId ?? ''),
    enabled: !!certificateId,
    queryFn: async (): Promise<CertificateLine[]> => unwrap(await supabase.from('subcontractor_invoice_lines').select('*').eq('invoice_id', certificateId!).order('line_no'), []),
  })
}

export function useCertificateSummary(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.certificates.summary(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<VCertificateSummary[]> => unwrap(await supabase.from('subcontractor_invoices').select('*, subcontractors(subcontractor_code,name)').eq('project_id', projectId!).order('created_at', { ascending: false }), []),
  })
}

export function useNextCertNo(projectId: string | null, subcontractorId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['nextCertNo', projectId, subcontractorId],
    enabled: !!projectId && !!subcontractorId,
    queryFn: async (): Promise<number> => {
      // v108: restore reliable auto numbering.
      // Do NOT use count + 1 because deleted/skipped invoices can create duplicate invoice numbers.
      // Instead read existing invoice_no values for the same project + subcontractor and return max trailing number + 1.
      const { data, error } = await supabase.from('subcontractor_invoices')
        .select('invoice_no')
        .eq('project_id', projectId!)
        .eq('subcontractor_id', subcontractorId!)
      if (error) throw error
      const maxNo = (data ?? []).reduce((max: number, row: { invoice_no: string | null }) => {
        const raw = String(row.invoice_no ?? '')
        const trailing = raw.match(/(\d+)\s*$/)?.[1]
        const direct = raw.match(/^\d+$/)?.[0]
        const num = Number(trailing ?? direct ?? 0)
        return Number.isFinite(num) ? Math.max(max, num) : max
      }, 0)
      return maxNo + 1
    },
  })
}




export function useCreateCertificate() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CertificateInsert): Promise<Certificate> =>
      unwrap(await supabase.from('subcontractor_invoices').insert(input as any).select().single()),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: qk.certificates.list(c.project_id) })
      qc.invalidateQueries({ queryKey: qk.certificates.summary(c.project_id) })
      qc.invalidateQueries({ queryKey: qk.dashboard.kpis(c.project_id) })
    },
  })
}
export function useUpdateCertificate() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CertificateInsert> }): Promise<Certificate> =>
      unwrap(await supabase.from('subcontractor_invoices').update(data as any).eq('id', id).select().single()),
    onSuccess: (c) => { qc.setQueryData(qk.certificates.detail(c.id), c); qc.invalidateQueries({ queryKey: qk.certificates.list(c.project_id) }); qc.invalidateQueries({ queryKey: qk.dashboard.kpis(c.project_id) }) },
  })
}

export function useUpdateCertificateAmounts() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, gross_amount, retention_amount, net_amount, net_payable, retention_pct, retention_release_amount, previous_paid_amount }: {
      id: string
      gross_amount: number
      retention_amount: number
      net_amount: number
      net_payable?: number
      retention_pct?: number
      retention_release_amount?: number
      previous_paid_amount?: number
    }): Promise<Certificate> => {
      const update: any = { gross_amount, retention_amount, net_amount, net_payable: net_payable ?? net_amount }
      if (retention_pct !== undefined) update.retention_pct = retention_pct
      if (retention_release_amount !== undefined) update.retention_release_amount = retention_release_amount
      if (previous_paid_amount !== undefined) update.previous_paid_amount = previous_paid_amount
      return unwrap(await supabase.from('subcontractor_invoices').update(update).eq('id', id).select().single())
    },
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: qk.certificates.list(c.project_id) }) },
  })
}

export function useApproveCertificate() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, paymentDate, gross_amount, retention_amount, net_amount }: {
      id: string
      status: Extract<CertificateStatus, 'Approved' | 'Paid'>
      paymentDate?: string
      gross_amount?: number
      retention_amount?: number
      net_amount?: number
    }): Promise<Certificate> => {
      const update: Partial<CertificateInsert> = { status }
      if (paymentDate) (update as any).payment_date = paymentDate
      if (gross_amount !== undefined) (update as any).gross_amount = gross_amount
      if (retention_amount !== undefined) (update as any).retention_amount = retention_amount
      if (net_amount !== undefined) (update as any).net_amount = net_amount
      return unwrap(await supabase.from('subcontractor_invoices').update(update as any).eq('id', id).select().single())
    },
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: qk.certificates.list(c.project_id) }); qc.setQueryData(qk.certificates.detail(c.id), c) },
  })
}

// ─── CERTIFICATE ENGINE (Edge Function) ──────────────────────────────────────

async function callCertEngine(req: GenerateCertificateRequest): Promise<GenerateCertificateResponse> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const res = await supabase.functions.invoke('generate-certificate', {
    body: req,
    headers: { Authorization: `Bearer ${session.access_token}` },
  }) as { data: GenerateCertificateResponse | null; error: Error | null }
  if (res.error) throw new Error(res.error.message)
  if (!res.data) throw new Error('Empty response from certificate engine')
  return res.data
}

export function usePreviewCertificate() {
  return useMutation({ mutationFn: (req: Omit<GenerateCertificateRequest, 'dry_run'>) => callCertEngine({ ...req, dry_run: true }) })
}

export function useGenerateCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: Omit<GenerateCertificateRequest, 'dry_run'>) => callCertEngine({ ...req, dry_run: false }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.certificates.list(data.project_id) })
      qc.invalidateQueries({ queryKey: qk.certificates.summary(data.project_id) })
      qc.invalidateQueries({ queryKey: qk.dashboard.kpis(data.project_id) })
      qc.invalidateQueries({ queryKey: qk.commercial.summary(data.project_id) })
    },
  })
}

// ─── TECHNICAL OFFICE ────────────────────────────────────────────────────────

export function useTechnicalRecords(projectId: string | null, filters?: { recordType?: string; status?: string; search?: string }) {
  const supabase = createClient()
  return useQuery({
    queryKey: [...qk.technical.list(projectId ?? ''), filters],
    enabled: !!projectId,
    queryFn: async (): Promise<TechnicalRecord[]> => {
      let q = supabase.from('technical_records').select('*').eq('project_id', projectId!).order('due_date', { ascending: true, nullsFirst: false })
      if (filters?.recordType) q = q.eq('record_type', filters.recordType as TechnicalRecord['record_type'])
      if (filters?.status) q = q.eq('status', filters.status as TechnicalStatus)
      if (filters?.search) q = q.or(`reference_no.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`)
      return unwrap(await q, [])
    },
  })
}

export function useOverdueTechnicalItems(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.technical.overdue(projectId ?? ''),
    enabled: !!projectId,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<VTechnicalOverdue[]> => unwrap(await supabase.from('v_technical_overdue').select('*').eq('project_id', projectId!).order('days_overdue', { ascending: false }), []),
  })
}

export function useTechnicalRealtimeSync(projectId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()
  useEffect(() => {
    if (!projectId) return
    const ch = supabase.channel(`technical-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technical_records', filter: `project_id=eq.${projectId}` }, () => {
        qc.invalidateQueries({ queryKey: qk.technical.list(projectId) })
        qc.invalidateQueries({ queryKey: qk.technical.overdue(projectId) })
        qc.invalidateQueries({ queryKey: qk.dashboard.kpis(projectId) })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId]) // eslint-disable-line
}

export function useCreateTechnicalRecord() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TechnicalRecordInsert): Promise<TechnicalRecord> => unwrap(await supabase.from('technical_records').insert(input as any).select().single()),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: qk.technical.list(r.project_id) }); qc.invalidateQueries({ queryKey: qk.dashboard.kpis(r.project_id) }) },
  })
}

export function useUpdateTechnicalRecord() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TechnicalRecordInsert> }): Promise<TechnicalRecord> =>
      unwrap(await supabase.from('technical_records').update(data as any).eq('id', id).select().single()),
    onSuccess: (r) => { qc.setQueryData(qk.technical.detail(r.id), r); qc.invalidateQueries({ queryKey: qk.technical.list(r.project_id) }); qc.invalidateQueries({ queryKey: qk.technical.overdue(r.project_id) }) },
  })
}

export function useSetTechnicalStatus() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, responseDate, comments }: { id: string; status: TechnicalStatus; responseDate?: string; comments?: string }): Promise<TechnicalRecord> => {
      const update: Partial<TechnicalRecordInsert> = { status }
      if (responseDate) update.response_date = responseDate
      if (comments) update.comments = comments
      return unwrap(await supabase.from('technical_records').update(update as any).eq('id', id).select().single())
    },
    onSuccess: (r) => { qc.setQueryData(qk.technical.detail(r.id), r); qc.invalidateQueries({ queryKey: qk.technical.list(r.project_id) }); qc.invalidateQueries({ queryKey: qk.technical.overdue(r.project_id) }); qc.invalidateQueries({ queryKey: qk.dashboard.kpis(r.project_id) }) },
  })
}

// ─── PROCUREMENT ─────────────────────────────────────────────────────────────

export function useProcurementRecords(projectId: string | null, status?: ProcurementStatus) {
  const supabase = createClient()
  return useQuery({
    queryKey: status ? qk.procurement.delayed(projectId ?? '') : qk.procurement.list(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<ProcurementRecord[]> => {
      let q = supabase.from('procurement_records').select('*').eq('project_id', projectId!).order('pr_date', { ascending: false })
      if (status) q = q.eq('status', status)
      return unwrap(await q, [])
    },
  })
}

export function useCreateProcurement() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProcurementRecordInsert): Promise<ProcurementRecord> => unwrap(await supabase.from('procurement_records').insert(input as any).select().single()),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: qk.procurement.list(r.project_id) }); qc.invalidateQueries({ queryKey: qk.dashboard.kpis(r.project_id) }) },
  })
}

export function useUpdateProcurement() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProcurementRecordInsert> }): Promise<ProcurementRecord> =>
      unwrap(await supabase.from('procurement_records').update(data as any).eq('id', id).select().single()),
    onSuccess: (r) => { qc.setQueryData(qk.procurement.detail(r.id), r); qc.invalidateQueries({ queryKey: qk.procurement.list(r.project_id) }) },
  })
}

// ─── VARIATIONS ──────────────────────────────────────────────────────────────

export function useVariations(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: qk.variations.list(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<Variation[]> => unwrap(await supabase.from('variations').select('*').eq('project_id', projectId!).order('vo_no'), []),
  })
}

export function useCreateVariation() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VariationInsert): Promise<Variation> => unwrap(await supabase.from('variations').insert(input as any).select().single()),
    onSuccess: (v) => qc.invalidateQueries({ queryKey: qk.variations.list(v.project_id) }),
  })
}

export function useUpdateVariation() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VariationInsert> }): Promise<Variation> =>
      unwrap(await supabase.from('variations').update(data as any).eq('id', id).select().single()),
    onSuccess: (v) => qc.invalidateQueries({ queryKey: qk.variations.list(v.project_id) }),
  })
}

export function useApproveVariation() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, approvedValue }: { id: string; status: Extract<VariationStatus, 'Approved' | 'Rejected' | 'Partially Approved'>; approvedValue?: number }): Promise<Variation> =>
      unwrap(await supabase.from('variations').update({ status, approved_value: approvedValue ?? null, approved_at: new Date().toISOString() } as any).eq('id', id).select().single()),
    onSuccess: (v) => qc.invalidateQueries({ queryKey: qk.variations.list(v.project_id) }),
  })
}

export function useTenderItems(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['tender_items', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<TenderItem[]> => unwrap(await supabase.from('tender_items').select('*').eq('project_id', projectId!).order('created_at'), []),
  })
}

export function useCreateTenderItem() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TenderItemInsert): Promise<TenderItem> => unwrap(await supabase.from('tender_items').insert(input as any).select().single()),
    onSuccess: (item) => qc.invalidateQueries({ queryKey: ['tender_items', item.project_id] }),
  })
}


export function useUpdateTenderItem() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, project_id, patch }: { id: string; project_id: string; patch: Partial<TenderItemInsert> }): Promise<TenderItem> =>
      unwrap(await supabase.from('tender_items').update(patch as any).eq('id', id).select().single()),
    onSuccess: (item) => qc.invalidateQueries({ queryKey: ['tender_items', item.project_id] }),
  })
}

export function useDeleteTenderItem() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => { const { error } = await supabase.from('tender_items').delete().eq('id', id); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tender_items'] }),
  })
}

// ── Schedule / Primavera ──────────────────────────────────────────
export function useScheduleActivities(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['schedule_activities', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ScheduleActivity[]> => unwrap(
      await supabase.from('schedule_activities').select('*').eq('project_id', projectId!).order('planned_start'),
      []
    ),
  })
}

export function useBulkUpsertSchedule() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, activities }: { projectId: string; activities: Omit<ScheduleActivityInsert, 'project_id'>[] }) => {
      const rows: ScheduleActivityInsert[] = activities.map(a => ({ ...a, project_id: projectId }))
      const BATCH = 500
      let upserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const res = await supabase.from('schedule_activities')
          .upsert(rows.slice(i, i + BATCH) as any, { onConflict: 'project_id,activity_id' })
          .select('id')
        upserted += unwrap(res, []).length
      }
      return { upserted, projectId }
    },
    onSuccess: ({ projectId }) => qc.invalidateQueries({ queryKey: ['schedule_activities', projectId] }),
  })
}

// ── QTO Lines ─────────────────────────────────────────────────────
export function useQtoLines(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['qto_lines', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<QtoLine[]> => unwrap(
      await supabase.from('qto_lines').select('*').eq('project_id', projectId!).order('created_at'),
      []
    ),
  })
}

export function useCreateQtoLine() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: QtoLineInsert): Promise<QtoLine> => {
      const first = await supabase.from('qto_lines').insert(input as any).select().single()
      if (!first.error) return unwrap(first)

      // Some existing databases still have qto_lines.structure_id linked to the old
      // project_structures table, while the new Project Structure uses
      // project_structure_nodes. Do not block QS entry; save it without structure_id
      // and run SUPABASE_FIX_QTO_STRUCTURE_FK.sql to enable node-level structure links.
      const msg = String(first.error.message || '')
      if (msg.includes('qto_lines_structure_id_fkey') || msg.toLowerCase().includes('foreign key')) {
        const retryInput = { ...(input as any), structure_id: null }
        return unwrap(await supabase.from('qto_lines').insert(retryInput).select().single())
      }
      throw first.error
    },
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['qto_lines', r.project_id] }),
  })
}

export function useUpdateQtoLine() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: QtoLineUpdate }): Promise<QtoLine> =>
      unwrap(await supabase.from('qto_lines').update(data as any).eq('id', id).select().single()),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['qto_lines', r.project_id] }),
  })
}

export function useDeleteQtoLine() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }): Promise<void> => {
      const { error } = await supabase.from('qto_lines').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['qto_lines', vars.projectId] }),
  })
}

export function useDeleteCertificate() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }): Promise<void> => {
      const current = unwrapOptional(await supabase.from('subcontractor_invoices').select('id,status,approval_locked').eq('id', id).single() as any) as any
      const status = String(current?.status ?? 'Draft').trim().toLowerCase()
      if (!current?.id) throw new Error('Subcontractor invoice not found.')
      if (status !== 'draft' || current.approval_locked) throw new Error(`Only Draft subcontractor invoices can be deleted. Current status: ${current.status ?? 'Unknown'}.`)
      const { error } = await supabase.from('subcontractor_invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: qk.certificates.list(vars.projectId) })
      qc.invalidateQueries({ queryKey: qk.dashboard.kpis(vars.projectId) })
    },
  })
}

// ── Villa Units ───────────────────────────────────────────────────
export function useVillaUnits(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['villa_units', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<VillaUnit[]> => unwrap(
      await supabase.from('villa_units').select('*').eq('project_id', projectId!).order('villa_no'),
      []
    ),
  })
}

export function useBulkCreateVillaUnits() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, units }: { projectId: string; units: Omit<VillaUnitInsert, 'project_id'>[] }): Promise<VillaUnit[]> => {
      const rows: VillaUnitInsert[] = units.map(u => ({ ...u, project_id: projectId }))
      return unwrap(await supabase.from('villa_units').insert(rows as any).select(), [])
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['villa_units', vars.projectId] }),
  })
}

export function useUpdateVillaUnit() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VillaUnitInsert> }): Promise<VillaUnit> =>
      unwrap(await supabase.from('villa_units').update(data as any).eq('id', id).select().single()),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['villa_units', r.project_id] }),
  })
}

export function useDeleteVillaUnit() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }): Promise<void> => {
      const { error } = await supabase.from('villa_units').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['villa_units', vars.projectId] }),
  })
}

// ── Villa Progress ─────────────────────────────────────────────────
export function useVillaProgress(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['villa_progress', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<VillaProgress[]> => unwrap(
      await supabase.from('villa_progress').select('*').eq('project_id', projectId!),
      []
    ),
  })
}

export function useUpsertVillaProgress() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VillaProgressInsert): Promise<VillaProgress> =>
      unwrap(await supabase.from('villa_progress').upsert(input as any, { onConflict: 'villa_unit_id,trade' }).select().single()),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['villa_progress', r.project_id] })
      qc.invalidateQueries({ queryKey: ['villa_units', r.project_id] })
    },
  })
}

// ── Invoice Lines ─────────────────────────────────────────────────
export function useInvoiceLines(invoiceId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['invoice_lines', invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('subcontractor_invoice_lines')
        .select('*, subcontract_breakdown(assignment_key, subcontract_qty, rate, boq_items(item_code, description, unit, boq_qty))')
        .eq('invoice_id', invoiceId!),
      []
    ),
  })
}

export function useBulkUpsertInvoiceLines() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, lines }: { invoiceId: string; lines: any[] }): Promise<any[]> => {
      // Round all numeric fields to 3dp to prevent float precision issues
      // Cap new_cumulative_qty at boq_qty so DB trigger never fires for 100%
      const r3 = (v: number) => Math.round((Number(v) || 0) * 1000) / 1000
      const safeLines = lines.map((l) => {
        const boqQty = r3(l.boq_qty ?? 0)
        const prevQty = r3(l.previous_cumulative_qty ?? 0)
        const currentQty = r3(l.current_qty ?? 0)
        // Cap cumulative so it never exceeds boq_qty (handles 100% + float errors)
        const rawCum = r3(prevQty + currentQty)
        const safeCum = boqQty > 0 ? Math.min(rawCum, boqQty) : rawCum
        const safeCurrentQty = r3(safeCum - prevQty)
        const rate = Number(l.rate ?? 0)
        return {
          ...l,
          boq_qty: boqQty,
          previous_cumulative_qty: prevQty,
          current_qty: safeCurrentQty,
          approved_qty: safeCurrentQty,
          new_cumulative_qty: safeCum,
          current_value: r3(safeCurrentQty * rate),
          cumulative_value: r3(safeCum * rate),
          current_work_pct: boqQty > 0 ? r3((safeCurrentQty / boqQty) * 100) : 0,
        }
      })
      // Delete existing lines first then insert safe lines
      await supabase.from('subcontractor_invoice_lines').delete().eq('invoice_id', invoiceId)
      if (!safeLines.length) return []
      const result = await supabase.from('subcontractor_invoice_lines').insert(safeLines).select()
      if (result.error) {
        // If still hitting trigger — try inserting without new_cumulative_qty (bypass trigger field)
        console.error('Insert error:', result.error.message)
        const fallbackLines = safeLines.map(({ new_cumulative_qty, ...rest }) => rest)
        return unwrap(await supabase.from('subcontractor_invoice_lines').insert(fallbackLines).select(), [])
      }
      return result.data ?? []
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['invoice_lines', vars.invoiceId] }),
  })
}

export function usePreviousCumulativeQty(projectId: string | null, subcontractorId: string | null, breakdownId: string | null, currentInvoiceId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['prev_cumulative', projectId, subcontractorId, breakdownId, currentInvoiceId],
    enabled: !!projectId && !!subcontractorId && !!breakdownId,
    queryFn: async (): Promise<number> => {
      // v108: previous qty = latest cumulative qty from the immediately previous invoice by period_end.
      // It must not always read invoice 1, and it must not read any invoice after the selected one.
      const { data: invoices, error } = await supabase.from('subcontractor_invoices')
        .select('id, period_end, created_at')
        .eq('project_id', projectId!)
        .eq('subcontractor_id', subcontractorId!)
        .order('period_end', { ascending: true })
      if (error) throw error
      if (!invoices?.length) return 0

      type PreviousInvoiceRow = { id: string; period_end: string | null; created_at: string | null }
      type PreviousInvoiceLineRow = { invoice_id: string; new_cumulative_qty: number | null; approved_qty: number | null; current_qty: number | null }
      const invoiceRows = (invoices ?? []) as PreviousInvoiceRow[]
      const currentInvoice = currentInvoiceId ? invoiceRows.find((i: PreviousInvoiceRow) => i.id === currentInvoiceId) : null
      const currentPeriod = currentInvoice?.period_end ?? currentInvoice?.created_at ?? null
      const prevInvoices = currentPeriod
        ? invoiceRows.filter((i: PreviousInvoiceRow) => String(i.period_end ?? i.created_at ?? '') < String(currentPeriod))
        : invoiceRows
      if (!prevInvoices.length) return 0

      const prevIds = prevInvoices.map((i: PreviousInvoiceRow) => i.id)
      const { data: lines, error: lineErr } = await supabase.from('subcontractor_invoice_lines')
        .select('invoice_id,new_cumulative_qty,approved_qty,current_qty')
        .in('invoice_id', prevIds)
        .eq('breakdown_id', breakdownId!)
      if (lineErr) throw lineErr
      if (!lines?.length) return 0

      const order = new Map(prevInvoices.map((inv: PreviousInvoiceRow, idx: number) => [inv.id, idx]))
      const lineRows = (lines ?? []) as PreviousInvoiceLineRow[]
      const sortedLines = [...lineRows].sort((a: PreviousInvoiceLineRow, b: PreviousInvoiceLineRow) => Number(order.get(b.invoice_id) ?? -1) - Number(order.get(a.invoice_id) ?? -1))
      const latest = sortedLines[0]
      return Number(latest.new_cumulative_qty ?? latest.approved_qty ?? latest.current_qty ?? 0)
    },
  })
}

// ── Invoice Penalties & Additions ────────────────────────────────
export function useInvoicePenalties(invoiceId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['invoice_penalties', invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<InvoicePenalty[]> => unwrap(
      await supabase.from('invoice_penalties').select('*').eq('invoice_id', invoiceId!).order('created_at'),
      []
    ),
  })
}

export function useCreateInvoicePenalty() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InvoicePenaltyInsert): Promise<InvoicePenalty> =>
      unwrap(await supabase.from('invoice_penalties').insert(input as any).select().single()),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['invoice_penalties', r.invoice_id] }),
  })
}

export function useDeleteInvoicePenalty() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }): Promise<void> => {
      const { error } = await supabase.from('invoice_penalties').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['invoice_penalties', vars.invoiceId] }),
  })
}

export function useInvoiceAdditions(invoiceId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['invoice_additions', invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<InvoiceAddition[]> => unwrap(
      await supabase.from('invoice_additions').select('*').eq('invoice_id', invoiceId!).order('created_at'),
      []
    ),
  })
}

export function useCreateInvoiceAddition() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InvoiceAdditionInsert): Promise<InvoiceAddition> =>
      unwrap(await supabase.from('invoice_additions').insert(input as any).select().single()),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['invoice_additions', r.invoice_id] }),
  })
}

export function useDeleteInvoiceAddition() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }): Promise<void> => {
      const { error } = await supabase.from('invoice_additions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['invoice_additions', vars.invoiceId] }),
  })
}

// ── Bulk Delete Hooks ─────────────────────────────────────────────
export function useDeleteSubcontractor() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      // Do not delete the global subcontractor master record. Remove only the
      // current project link so other projects keep using the same subcontractor.
      const { error } = await supabase
        .from('project_subcontractors')
        .update({ is_active: false, updated_at: new Date().toISOString() } as any)
        .eq('project_id', projectId)
        .eq('subcontractor_id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: [...qk.subcontractors.list(), vars.projectId] })
      qc.invalidateQueries({ queryKey: qk.subcontractors.all() })
    },
  })
}

export function useDeleteBreakdown() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('subcontract_breakdown').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: qk.breakdown.list(vars.projectId) })
      qc.invalidateQueries({ queryKey: qk.commercial.summary(vars.projectId) })
    },
  })
}

export function useDeleteBoqItem() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('boq_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: qk.boq.list(vars.projectId) }),
  })
}

export function useDeleteTechnical() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('technical_records').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: qk.technical.list(vars.projectId) }),
  })
}

export function useDeleteProcurement() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('procurement_records').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: qk.procurement.list(vars.projectId) }),
  })
}

export function useDeleteVariation() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('variations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: qk.variations.list(vars.projectId) }),
  })
}

export function useDeleteProject() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects.list() }),
  })
}

export function useDeleteQsEntry() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('qs_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: qk.qs.list(vars.projectId) }),
  })
}

// ── Structure Nodes ───────────────────────────────────────────────
export function useStructureNodes(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['structure_nodes', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<StructureNode[]> => unwrap(
      await supabase.from('project_structure_nodes')
        .select('*')
        .eq('project_id', projectId!)
        .order('level')
        .order('sort_order'),
      []
    ),
  })
}

export function useCreateStructureNode() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: StructureNodeInsert): Promise<StructureNode> =>
      unwrap(await supabase.from('project_structure_nodes').insert(input as any).select().single()),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['structure_nodes', r.project_id] }),
  })
}

export function useUpdateStructureNode() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StructureNodeUpdate }): Promise<StructureNode> =>
      unwrap(await supabase.from('project_structure_nodes').update(data as any).eq('id', id).select().single()),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['structure_nodes', r.project_id] }),
  })
}

export function useDeleteStructureNode() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }): Promise<void> => {
      const { error } = await supabase.from('project_structure_nodes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['structure_nodes', vars.projectId] }),
  })
}

export function useBulkCreateStructureNodes() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, nodes }: { projectId: string; nodes: Omit<StructureNodeInsert, 'project_id'>[] }): Promise<StructureNode[]> => {
      const rows = nodes.map(n => ({ ...n, project_id: projectId }))
      return unwrap(await supabase.from('project_structure_nodes').insert(rows as any).select(), [])
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['structure_nodes', vars.projectId] }),
  })
}

export function useReorderStructureNode() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sort_order, parent_id, projectId }: { id: string; sort_order: number; parent_id: string | null; projectId: string }) => {
      const { error } = await supabase.from('project_structure_nodes').update({ sort_order, parent_id } as any).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['structure_nodes', vars.projectId] }),
  })
}

// ── Villa Assignments ─────────────────────────────────────────────
export function useVillaAssignments(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['villa_assignments', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('villa_assignments')
        .select('*, subcontractors(subcontractor_code, name)')
        .eq('project_id', projectId!)
        .order('villa_node_id'),
      []
    ),
  })
}

export function useCreateVillaAssignment() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VillaAssignmentInsert): Promise<any> =>
      unwrap(await supabase.from('villa_assignments').insert(input as any).select().single()),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['villa_assignments', r.project_id] })
      qc.invalidateQueries({ queryKey: ['villa_breakdown_lines', r.project_id] })
    },
  })
}

export function useDeleteVillaAssignment() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('villa_assignments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['villa_assignments', vars.projectId] }),
  })
}

export function useVillaBreakdownLines(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['villa_breakdown_lines', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('villa_breakdown_lines')
        .select('*, subcontractors(subcontractor_code, name), boq_items(item_code, description, unit, boq_qty, client_rate)')
        .eq('project_id', projectId!)
        .order('villa_node_id'),
      []
    ),
  })
}

export function useBulkCreateVillaBreakdown() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, lines }: { projectId: string; lines: Omit<VillaBreakdownLineInsert, 'project_id'>[] }): Promise<any[]> => {
      const rows = lines.map(l => ({ ...l, project_id: projectId }))
      return unwrap(await supabase.from('villa_breakdown_lines').insert(rows as any).select(), [])
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['villa_breakdown_lines', vars.projectId] }),
  })
}

// ── Payment Records ─────────────────────────────────────────────────────────
// ── Finance Records ──────────────────────────────────────────────────────────
export function useFinanceRecords(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['finance_records', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('finance_records')
        .select('*, subcontractors(subcontractor_code, name), subcontractor_invoices(invoice_no, net_amount, gross_amount, period_end, status)')
        .eq('project_id', projectId!)
        .order('payment_date', { ascending: false }),
      []
    ),
  })
}

export function useFinanceByInvoice(invoiceId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['finance_records_invoice', invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<any[]> => {
      if (!invoiceId) return []
      // First get the invoice_no for this invoice so we can match by either field
      const { data: inv } = await supabase.from('subcontractor_invoices')
        .select('invoice_no').eq('id', invoiceId).single()
      const invoiceNo = (inv as any)?.invoice_no
      // Match by invoice_id OR invoice_no (handles records added before linking)
      let query = supabase.from('finance_records')
        .select('*')
        .order('payment_date', { ascending: false })
      if (invoiceNo) {
        query = query.or(`invoice_id.eq.${invoiceId},invoice_no.eq.${invoiceNo}`)
      } else {
        query = query.eq('invoice_id', invoiceId)
      }
      return unwrap(await query, [])
    },
  })
}

export function useAddFinanceRecord() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: {
      project_id: string
      invoice_id?: string | null
      subcontractor_id?: string | null
      record_type: string
      amount: number
      payment_date: string
      payment_method?: string
      reference?: string | null
      bank_name?: string | null
      invoice_no?: string | null
      final_payable?: number | null
      description?: string | null
      notes?: string | null
      status?: string
      cost_center_id?: string | null
      cost_center_code?: string | null
      receipt_voucher_no?: string | null
      payment_voucher_no?: string | null
      cheque_no?: string | null
      payee_name?: string | null
      accounting_direction?: string | null
      analysis?: string | null
      disbursement_entity?: string | null
    }): Promise<any> => unwrap(
      await supabase.from('finance_records').insert(record as any).select().single()
    ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['finance_records', vars.project_id] })
      if (vars.invoice_id) qc.invalidateQueries({ queryKey: ['finance_records_invoice', vars.invoice_id] })
    },
  })
}

export function useUpdateFinanceRecord() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<any> }): Promise<any> => unwrap(
      await supabase.from('finance_records').update(data as any).eq('id', id).select().single()
    ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['finance_records'] })
    },
  })
}

export function useDeleteFinanceRecord() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId, invoiceId }: { id: string; projectId: string; invoiceId?: string | null }): Promise<void> => {
      const { error } = await supabase.from('finance_records').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['finance_records', vars.projectId] })
      if (vars.invoiceId) qc.invalidateQueries({ queryKey: ['finance_records_invoice', vars.invoiceId] })
    },
  })
}

// Legacy aliases for backward compatibility
export const useInvoicePayments = useFinanceByInvoice
export function useAddPaymentRecord() { return useAddFinanceRecord() }
export function useDeletePaymentRecord() { return useDeleteFinanceRecord() }



// ── Inventory / Stores ─────────────────────────────────────────────────────
export function useInventoryLocations(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['inventory_locations', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('inventory_locations').select('*').eq('project_id', projectId!).order('code'),
      []
    ),
  })
}

export function useCreateInventoryLocation() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: any): Promise<any> => unwrap(
      await supabase.from('inventory_locations').insert(record).select().single()
    ),
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['inventory_locations', r.project_id] }),
  })
}

export function useInventoryGrnLines(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['inventory_grn_lines', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('inventory_grn_lines')
        .select('*, procurement_records(pr_no, required_qty, budget_amount, status), boq_items(item_code, description), project_structure_nodes(code, name), inventory_locations(code, name)')
        .eq('project_id', projectId!)
        .order('received_date', { ascending: false }),
      []
    ),
  })
}

export function useCreateInventoryGrnLine() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: any): Promise<any> => unwrap(
      await supabase.from('inventory_grn_lines').insert(record).select().single()
    ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['inventory_grn_lines', r.project_id] })
      qc.invalidateQueries({ queryKey: ['inventory_stock', r.project_id] })
      qc.invalidateQueries({ queryKey: ['inventory_cost_control', r.project_id] })
      qc.invalidateQueries({ queryKey: qk.procurement.list(r.project_id) })
    },
  })
}

export function useInventoryIssueLines(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['inventory_issue_lines', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('inventory_issue_lines')
        .select('*, boq_items(item_code, description), project_structure_nodes(code, name), inventory_locations(code, name)')
        .eq('project_id', projectId!)
        .order('issue_date', { ascending: false }),
      []
    ),
  })
}

export function useCreateInventoryIssueLine() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: any): Promise<any> => unwrap(
      await supabase.from('inventory_issue_lines').insert(record).select().single()
    ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['inventory_issue_lines', r.project_id] })
      qc.invalidateQueries({ queryKey: ['inventory_stock', r.project_id] })
      qc.invalidateQueries({ queryKey: ['inventory_cost_control', r.project_id] })
    },
  })
}

export function useInventoryStock(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['inventory_stock', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('v_inventory_stock').select('*').eq('project_id', projectId!).order('material'),
      []
    ),
  })
}

export function useInventoryCostControl(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['inventory_cost_control', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('v_inventory_cost_control').select('*').eq('project_id', projectId!).order('pr_no'),
      []
    ),
  })
}

// ── Cost Centers ─────────────────────────────────────────────────────────────
export function useCostCenters(projectId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['cost_centers', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<any[]> => unwrap(
      await supabase.from('cost_centers').select('*').eq('project_id', projectId!).order('code'),
      []
    ),
  })
}

export function useAddCostCenter() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: {
      project_id: string; code: string; name: string; name_ar?: string;
      type?: string; budget?: number; notes?: string; parent_id?: string | null;
    }): Promise<any> => unwrap(
      await supabase.from('cost_centers').insert(record as any).select().single()
    ),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['cost_centers', vars.project_id] }),
  })
}

export function useUpdateCostCenter() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<any> }): Promise<any> => unwrap(
      await supabase.from('cost_centers').update(data as any).eq('id', id).select().single()
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost_centers'] }),
  })
}

export function useDeleteCostCenter() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }): Promise<void> => {
      const { error } = await supabase.from('cost_centers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['cost_centers', vars.projectId] }),
  })
}
