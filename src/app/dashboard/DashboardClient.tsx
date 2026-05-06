'use client'
// v68

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  CERT_STATUSES,
  DISCIPLINES,
  PROCUREMENT_STATUSES,
  TECH_STATUSES,
  VARIATION_STATUSES,
  type BoqItemWithStructure,
  type ClientInvoice,
  type ProjectStructure,
  isUuid,
  money,
  n,
  today,
} from './lib'
import { Badge, BigMetric, Button, Card, Field, FormGrid, Input, MeterRow, Metric, Select, Table, TextArea, Toolbar } from './ui'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useProject } from '@/hooks/useProject'
import { ApprovalCenter, ApprovalMatrixSettings, ApprovalStatusPanel } from '@/components/approval/ApprovalV138'
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import { useUserPermissions } from '@/hooks/useUserPermissions'
import { CompanyLogo } from '@/components/erp/CompanyLogo'
import { ProjectWorkspace } from '@/components/erp/ProjectWorkspace'
import { AccessDenied } from '@/components/erp/AccessDenied'
import { CompanyBrandingView } from '@/components/erp/CompanyBrandingView'
import { PermissionsView } from '@/components/erp/PermissionsView'
import { ProcurementQuotationsView } from '@/components/erp/ProcurementQuotationsView'
import { SubcontractorProgressDashboard } from '@/components/erp/SubcontractorProgressDashboard'
import { WorkfrontsView } from '@/components/erp/WorkfrontsView'
import { SiteProgressView } from '@/components/erp/SiteProgressView'
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDashboardKpis,
  useCommercialSummary,
  useSubcontractors,
  useCreateSubcontractor,
  useBoqItems,
  useCreateBoqItem,
  useSubcontractBreakdown,
  useCreateBreakdown,
  useUpdateBreakdown,
  useQsEntries,
  useBatchCreateQsEntries,
  useSubmitQsEntry,
  usePendingApprovals,
  useReviewQsEntry,
  useCertificates,
  useCreateCertificate,
  useApproveCertificate,
  useUpdateCertificateAmounts,
  useNextCertNo,
  useTechnicalRecords,
  useCreateTechnicalRecord,
  useSetTechnicalStatus,
  useProcurementRecords,
  useCreateProcurement,
  useVariations,
  useCreateVariation,
  useApproveVariation,
  useBulkImportBoq,
  useTenderItems,
  useCreateTenderItem,
  useUpdateTenderItem,
  useDeleteTenderItem,
  useScheduleActivities,
  useBulkUpsertSchedule,
  useQtoLines,
  useCreateQtoLine,
  useUpdateQtoLine,
  useDeleteQtoLine,
  useDeleteCertificate,
  useInvoiceLines,
  useBulkUpsertInvoiceLines,
  useInvoicePenalties,
  useCreateInvoicePenalty,
  useDeleteInvoicePenalty,
  useInvoiceAdditions,
  useCreateInvoiceAddition,
  useDeleteInvoiceAddition,
  useVillaUnits,
  useBulkCreateVillaUnits,
  useUpdateVillaUnit,
  useDeleteVillaUnit,
  useVillaProgress,
  useUpsertVillaProgress,
  useUpdateTechnicalRecord,
  useUpdateProcurement,
  useUpdateVariation,
  useVillaAssignments,
  useCreateVillaAssignment,
  useDeleteVillaAssignment,
  useVillaBreakdownLines,
  useBulkCreateVillaBreakdown,
  useInvoicePayments,
  useAddPaymentRecord,
  useDeletePaymentRecord,
  useFinanceRecords,
  useAddFinanceRecord,
  useUpdateFinanceRecord,
  useDeleteFinanceRecord,
  useCostCenters,
  useAddCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
  useDeleteSubcontractor,
  useDeleteBreakdown,
  useDeleteBoqItem,
  useUpdateSubcontractor,
  useUpdateBoqItem,
  useDeleteTechnical,
  useDeleteProcurement,
  useDeleteVariation,
  useDeleteProject,
  useDeleteQsEntry,
  useStructureNodes,
  useCreateStructureNode,
  useUpdateStructureNode,
  useDeleteStructureNode,
  useBulkCreateStructureNodes,
  useReorderStructureNode,
  useInventoryLocations,
  useCreateInventoryLocation,
  useInventoryGrnLines,
  useCreateInventoryGrnLine,
  useInventoryIssueLines,
  useCreateInventoryIssueLine,
  useInventoryStock,
  useInventoryCostControl,
} from '@/hooks/queries'
import type {
  ActivityStatus,
  ApprovalStatus,
  NodeType,
  PenaltyType,
  StructureNode,
  TradeType,
  BoqItem,
  CertificateStatus,
  CostCategory,
  Discipline,
  ProjectStatus,
  ProcurementStatus,
  TechnicalStatus,
  VariationStatus,
} from '@/types/database'

const normalizeCode = (value: any) => String(value ?? '').trim().toUpperCase()
const round3 = (value: number) => Math.round((Number(value) || 0) * 1000) / 1000


type WorkflowEntity = 'procurement' | 'grn' | 'issue' | 'finance'
type WorkflowTask = { entity: WorkflowEntity; table: string; id: string; ref: string; title: string; amount?: number; qty?: number; date?: string; status: string; owner?: string; row: any }
type WorkflowAction = 'Submit'|'Review'|'Approve'|'Return'|'Order'|'Post'|'Confirm'|'Reject'|'Cancel'
const WORKFLOW_DRAFT = ['draft', 'pr raised', 'pending']
const WORKFLOW_SUBMITTED = ['submitted']
const WORKFLOW_REVIEWED = ['reviewed']
const WORKFLOW_APPROVED = ['approved']
const WORKFLOW_POSTED = ['posted', 'confirmed', 'delivered']
const wfText = (value: any) => String(value ?? '').trim()
const wfLower = (value: any) => wfText(value).toLowerCase()
const wfEffectiveStatus = (row: any) => wfText(row?.workflow_status || row?.status || 'Draft')
const wfTone = (status: any): 'default' | 'success' | 'warn' | 'danger' => {
  const s = wfLower(status)
  if (['approved','posted','confirmed','delivered'].includes(s)) return 'success'
  if (['rejected','cancelled','canceled','returned','missing configuration'].includes(s)) return 'danger'
  if (['submitted','reviewed','pending','pending review','pending approval','pr raised','po issued','rfq issued','partially delivered'].includes(s)) return 'warn'
  return 'default'
}

type TenderResource = { id: string; project_id?: string | null; category: CostCategory; code: string; description: string; unit: string; unit_rate: number; default_waste_pct?: number; notes?: string }

const makeInitialContractDraft = () => ({
  contract_no: '',
  subcontractor_id: '',
  scope_of_work: '',
  contract_date: today(),
  start_date: '',
  end_date: '',
  contract_value: '',
  contract_type: 'BOQ Unit Rate',
  pricing_basis: 'boq_unit_rate',
  lump_sum_amount: '',
  advance_payment_type: 'percentage',
  advance_payment_value: '',
  advance_recovery_pct: '20',
  retention_pct: '5',
  delay_penalty_rate: '0.5% per week',
  payment_terms: 'Net 30 after CEO approval',
  special_conditions: '',
})

type V101Claim = { id: string; claim_no: string | null; title: string; claim_type: string | null; status: string | null; submitted_amount: number | null; approved_amount: number | null; submission_date: string | null }
type V101Budget = { id: string; budget_code: string | null; description: string | null; discipline: string | null; budget_amount: number | null }
type V101CostTx = { id: string; description: string | null; amount: number | null; transaction_date: string | null; source: string | null }
type V101Cashflow = { id: string; period_month: string; planned_revenue: number | null; planned_cost: number | null; actual_revenue: number | null; actual_cost: number | null }
type V101Approval = { id: string; entity_type: string; status: string | null; requested_at: string | null; notes: string | null }
type V101BbsLine = { id: string; structure_node_id: string | null; boq_item_id: string | null; steel_qty_ton: number | null; effective_qs_qty: number | null; steel_ratio_ton_m3: number | null; notes: string | null }
type V103InvoiceLine = { id: string; invoice_id: string; project_id: string; subcontractor_id: string | null; breakdown_id: string | null; boq_item_id: string | null; structure_id: string | null; structure_node_id?: string | null; current_qty: number | null; new_cumulative_qty?: number | null; rate: number | null; current_value: number | null; cumulative_value: number | null; approved_qty: number | null; remarks: string | null; resource_code?: string | null }
type V104ActualMaterial = { id: string; project_id?: string | null; boq_item_id?: string | null; structure_id?: string | null; structure_node_id?: string | null; resource_code?: string | null; code?: string | null; description?: string | null; qty?: number | null; quantity?: number | null; rate?: number | null; unit_rate?: number | null; amount?: number | null; total_cost?: number | null; actual_cost?: number | null; transaction_date?: string | null; source?: string | null }

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const { activeProject, setActiveProject } = useProject()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeView, setActiveView] = useState('home')
  const [message, setMessage] = useState<string>('')
  const [selectedApprovalTask, setSelectedApprovalTask] = useState<WorkflowTask | null>(null)
  const [dashView, setDashView] = useState<'ceo'|'client'>('ceo')

  // ── V140: Company branding + permissions ─────────────────────────────────
  const { profile: companyProfile } = useCompanyProfile()
  const { isAdminOwner, canView } = useUserPermissions(
    user?.id,
    user?.email,
    activeProject?.id
  )
  const navigateTo = (viewId: string) => {
    if (viewId === 'bbs') { setBbsQsTab('bbs'); setActiveView('bbs-qs'); return }
    if (viewId === 'qs') { setBbsQsTab('qs'); setActiveView('bbs-qs'); return }
    if (viewId === 'bbs-qs') { setBbsQsTab('qs'); setActiveView('bbs-qs'); return }
    if (viewId === 'rfqs') { setActiveView('procurement-quotations'); return }
    if (viewId === 'payment-requests') { setActiveView('finance'); return }
    setActiveView(viewId)
  }

  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()

  const projectId = activeProject?.id ?? null
  const [commercialTab, setCommercialTab] = useState<'claims'|'budget'|'cashflow'|'costcontrol'>('costcontrol')
  const [claimsData, setClaimsData] = useState<V101Claim[]>([])
  const [budgetData, setBudgetData] = useState<V101Budget[]>([])
  const [actualCostData, setActualCostData] = useState<V101CostTx[]>([])
  const [invoiceLinesAll, setInvoiceLinesAll] = useState<V103InvoiceLine[]>([])
  const [cashflowData, setCashflowData] = useState<V101Cashflow[]>([])
  const [approvalData, setApprovalData] = useState<V101Approval[]>([])
  const [materialActualData, setMaterialActualData] = useState<V104ActualMaterial[]>([])
  const [claimForm, setClaimForm] = useState({ claim_no: '', title: '', claim_type: 'Variation', submitted_amount: '', description: '' })
  const [budgetForm, setBudgetForm] = useState({ budget_code: '', description: '', discipline: 'Structural', budget_amount: '' })
  const [cashflowForm, setCashflowForm] = useState({ period_month: '', planned_revenue: '', planned_cost: '' })
  const [bbsLines, setBbsLines] = useState<V101BbsLine[]>([])
  const [bbsForm, setBbsForm] = useState({ structure_node_id: '', boq_item_id: '', steel_qty_ton: '', notes: '' })
  const [bbsFilterStructure, setBbsFilterStructure] = useState('')
  const [bbsFilterBoq, setBbsFilterBoq] = useState('')
  const [ccFilterStructure, setCcFilterStructure] = useState('')
  const [ccFilterBoq, setCcFilterBoq] = useState('')
  const [ccFilterDiscipline, setCcFilterDiscipline] = useState('')
  const [ccExpanded, setCcExpanded] = useState<Record<string, boolean>>({})
  const { data: kpis } = useDashboardKpis(projectId)
  const { data: commercial = [] } = useCommercialSummary(projectId)
  const { data: subcontractors = [] } = useSubcontractors(projectId)
  const [allSubcontractorsForLink, setAllSubcontractorsForLink] = useState<any[]>([])

  useEffect(() => {
    let cancelled = false
    async function loadGlobalSubcontractors() {
      const { data, error } = await supabase.from('subcontractors').select('*').order('subcontractor_code')
      if (!cancelled && !error) setAllSubcontractorsForLink(data ?? [])
    }
    void loadGlobalSubcontractors()
    return () => { cancelled = true }
  }, [supabase])

  const projectSubcontractorIds = useMemo(() => new Set((subcontractors as any[]).map((s: any) => String(s.id))), [subcontractors])
  const availableSubcontractorsForLink = useMemo(
    () => allSubcontractorsForLink.filter((s: any) => !projectSubcontractorIds.has(String(s.id))),
    [allSubcontractorsForLink, projectSubcontractorIds]
  )

  const { data: boqItems = [] } = useBoqItems(projectId)
  const { data: breakdowns = [] } = useSubcontractBreakdown(projectId)
  const { data: qsEntries = [] } = useQsEntries(projectId)
  const { data: pending = [] } = usePendingApprovals(projectId)
  const { data: certificates = [] } = useCertificates(projectId)
  const { data: technical = [] } = useTechnicalRecords(projectId)
  const { data: procurement = [] } = useProcurementRecords(projectId)
  const { data: variations = [] } = useVariations(projectId)

  const createSubcontractor = useCreateSubcontractor()
  const createBoq = useCreateBoqItem()
  const createBreakdown = useCreateBreakdown()
  const updateBreakdown = useUpdateBreakdown()
  const createQs = useBatchCreateQsEntries()
  const submitQs = useSubmitQsEntry()
  const reviewQs = useReviewQsEntry()
  const createCertificate = useCreateCertificate()
  const deleteCertificate = useDeleteCertificate()
  const bulkUpsertInvoiceLines = useBulkUpsertInvoiceLines()
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const prevQtyCache = useRef<Record<string, number>>({})
  const invoiceSortNumber = (invoiceNo?: string | number | null) => {
    const raw = String(invoiceNo ?? '')
    const trailing = raw.match(/(\d+)\s*$/)?.[1]
    const num = Number(trailing ?? raw)
    return Number.isFinite(num) ? num : 0
  }
  const normalizedStatus = (status?: string | null) => String(status ?? '').trim().toLowerCase()
  const isPaidStatus = (status?: string | null) => ['approved', 'paid', 'partially released'].includes(normalizedStatus(status))
  const isEditableInvoiceStatus = (status?: string | null) => ['draft', 'returned to originator', 'missing configuration', 'rejected'].includes(normalizedStatus(status))
  const canEditSubcontractorInvoice = (invoice: any) => isEditableInvoiceStatus(invoice?.status) && !invoice?.approval_locked
  const canReleaseSubcontractorInvoice = (invoice: any) => ['draft', 'returned to originator', 'missing configuration', 'rejected'].includes(normalizedStatus(invoice?.status))
  const isFinanceEligibleInvoice = (invoice: any) => normalizedStatus(invoice?.status) !== 'draft'
  const isInvoiceBefore = (candidate: any, current: any) => {
    const a = invoiceSortNumber(candidate?.invoice_no)
    const b = invoiceSortNumber(current?.invoice_no)
    if (a && b && a !== b) return a < b
    const ad = String(candidate?.period_end ?? candidate?.invoice_date ?? candidate?.created_at ?? '')
    const bd = String(current?.period_end ?? current?.invoice_date ?? current?.created_at ?? '')
    return Boolean(ad && bd && ad < bd)
  }
  const { data: invoicePenalties = [] } = useInvoicePenalties(selectedInvoiceId)
  const createInvoicePenalty = useCreateInvoicePenalty()
  const deleteInvoicePenalty = useDeleteInvoicePenalty()
  const { data: invoiceAdditions = [] } = useInvoiceAdditions(selectedInvoiceId)
  const createInvoiceAddition = useCreateInvoiceAddition()
  const deleteInvoiceAddition = useDeleteInvoiceAddition()
  const deleteSubcontractor = useDeleteSubcontractor()
  const updateSubcontractor = useUpdateSubcontractor()
  const updateBoqItem = useUpdateBoqItem()
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [editSubForm, setEditSubForm] = useState<any>({})
  const [linkExistingSubId, setLinkExistingSubId] = useState('')
  const [editingBoqId, setEditingBoqId] = useState<string | null>(null)
  const [editBoqForm, setEditBoqForm] = useState<any>({})
  const deleteBreakdown = useDeleteBreakdown()
  const deleteBoqItem = useDeleteBoqItem()
  const updateTechnical = useUpdateTechnicalRecord()
  const updateProcurement = useUpdateProcurement()
  const updateVariation = useUpdateVariation()
  const [editingTechnicalId, setEditingTechnicalId] = useState<string | null>(null)
  const [editTechnicalForm, setEditTechnicalForm] = useState<any>({})
  const [editingProcurementId, setEditingProcurementId] = useState<string | null>(null)
  const [editProcurementForm, setEditProcurementForm] = useState<any>({})
  const [editingVariationId, setEditingVariationId] = useState<string | null>(null)
  const [editVariationForm, setEditVariationForm] = useState<any>({})
  const deleteTechnical = useDeleteTechnical()
  const deleteProcurement = useDeleteProcurement()
  const deleteVariation = useDeleteVariation()
  const deleteProject = useDeleteProject()
  const deleteQsEntry = useDeleteQsEntry()
  const [ph2Form, setPh2Form] = useState({ phase_id: '', villa_type_id: '', start_no: '1', count: '100', prefix: 'V2-', subcontractor_id: '' })
  const PENALTY_TYPES: PenaltyType[] = ['NCR', 'Schedule Delay', 'Warehouse / Material', 'Other']
  const [penaltyForm, setPenaltyForm] = useState({ penalty_type: 'NCR' as PenaltyType, reference: '', description: '', amount: '' })
  const [additionForm, setAdditionForm] = useState({ description: '', amount: '' })
  type InvoiceLineEdit = { current_qty: string; current_work_pct: string }
  type InvoiceLineEditState = Record<string, InvoiceLineEdit | string>
  const [invoiceLineEdits, setInvoiceLineEdits] = useState<InvoiceLineEditState>({})
  const [invoiceNodeFilter, setInvoiceNodeFilter] = useState<Set<string>>(new Set())
  const [invoiceGroupByNode, setInvoiceGroupByNode] = useState(true)
  const [invoiceCollapsedNodes, setInvoiceCollapsedNodes] = useState<Set<string>>(new Set())
  const [invoiceTab, setInvoiceTab] = useState<'list'|'breakdown'>('list')
  const approveCertificate = useApproveCertificate()
  const updateCertAmounts = useUpdateCertificateAmounts()
  const createTechnical = useCreateTechnicalRecord()
  const setTechnicalStatus = useSetTechnicalStatus()
  const createProcurement = useCreateProcurement()
  const { data: inventoryLocations = [] } = useInventoryLocations(projectId)
  const { data: inventoryGrnLines = [] } = useInventoryGrnLines(projectId)
  const { data: inventoryIssueLines = [] } = useInventoryIssueLines(projectId)
  const { data: inventoryStock = [] } = useInventoryStock(projectId)
  const { data: inventoryCostControl = [] } = useInventoryCostControl(projectId)
  const createInventoryLocation = useCreateInventoryLocation()
  const createInventoryGrnLine = useCreateInventoryGrnLine()
  const createInventoryIssueLine = useCreateInventoryIssueLine()
  const createVariation = useCreateVariation()
  const approveVariation = useApproveVariation()
  const bulkImportBoq = useBulkImportBoq()
  const { data: scheduleActivities = [] } = useScheduleActivities(projectId)
  const { data: villaUnits = [] } = useVillaUnits(projectId)
  const { data: villaAssignments = [] } = useVillaAssignments(projectId)
  const { data: villaBreakdownLines = [] } = useVillaBreakdownLines(projectId)
  const createVillaAssignment = useCreateVillaAssignment()
  const deleteVillaAssignment = useDeleteVillaAssignment()
  const bulkCreateVillaBreakdown = useBulkCreateVillaBreakdown()
  // ── Payment Register ─────────────────────────────────────────────────────
  const { data: invoicePayments = [] } = useInvoicePayments(selectedInvoiceId)
  const addPaymentRecord = useAddPaymentRecord()
  const deletePaymentRecord = useDeletePaymentRecord()
  const [paymentForm, setPaymentForm] = useState({
    paid_amount: '', payment_date: new Date().toISOString().split('T')[0],
    reference: '', payment_method: 'Transfer', notes: '',
  })
  // ── Finance Module ────────────────────────────────────────────────────────
  const { data: financeRecords = [] } = useFinanceRecords(projectId)
  const addFinanceRecord = useAddFinanceRecord()
  const updateFinanceRecord = useUpdateFinanceRecord()
  const deleteFinanceRecord = useDeleteFinanceRecord()
  const { data: costCenters = [] } = useCostCenters(projectId)
  const addCostCenter = useAddCostCenter()
  const updateCostCenter = useUpdateCostCenter()
  const deleteCostCenter = useDeleteCostCenter()
  const [financeTab, setFinanceTab] = useState<'payments'|'all'|'reports'|'subregister'|'add'|'costcenters'>('payments')
  const [financeForm, setFinanceForm] = useState({
    record_type: 'Payment', amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Transfer', reference: '', bank_name: '', description: '',
    notes: '', subcontractor_id: '', invoice_id: '', invoice_no: '', status: 'Pending',
    cost_center_id: '', receipt_voucher_no: '', payment_voucher_no: '', cheque_no: '',
    payee_name: '', accounting_direction: '', analysis: '', disbursement_entity: '',
  })
  const [financeFilter, setFinanceFilter] = useState({ type: '', subId: '', invoiceId: '', from: '', to: '', costCenterId: '', status: '', method: '', direction: '', search: '' })
  const [inventoryFilter, setInventoryFilter] = useState({ material: '', locationId: '', boqItemId: '', structureId: '', from: '', to: '', stockStatus: '', movement: 'all', search: '' })
  const [ccForm, setCcForm] = useState({ code: '', name: '', name_ar: '', type: 'Subcontractor', budget: '', notes: '' })
  const [editingCcId, setEditingCcId] = useState<string|null>(null)
  const [editCcForm, setEditCcForm] = useState<any>({})
  const [expandedInvId, setExpandedInvId] = useState<string|null>(null)
  const [expandedSubId, setExpandedSubId] = useState<string|null>(null)

  // v120: Enterprise Finance ↔ Certificate live link.
  // Finance is the source of truth for paid and previously-paid values.
  const textKey = (value: any) => String(value ?? '').trim().toLowerCase()
  const moneyValue = (value: any) => {
    const num = Number(value ?? 0)
    return Number.isFinite(num) ? num : 0
  }
  const isConfirmedFinancePayment = (r: any) => {
    const type = textKey(r?.record_type)
    const status = textKey(r?.status || 'confirmed')
    return type === 'payment' && ['confirmed', 'posted'].includes(status)
  }
  const isConfirmedFinanceDeduction = (r: any) => {
    const type = textKey(r?.record_type)
    const status = textKey(r?.status || 'confirmed')
    return ['deduction', 'penalty'].includes(type) && ['confirmed', 'posted'].includes(status)
  }
  const financePaymentBelongsToInvoice = (r: any, inv: any) => {
    if (!r || !inv) return false
    const recordInvoiceId = String(r.invoice_id ?? '').trim()
    const invoiceId = String(inv.id ?? '').trim()
    const recordInvoiceNo = textKey(r.invoice_no)
    const invoiceNo = textKey(inv.invoice_no)
    return Boolean(
      (recordInvoiceId && invoiceId && recordInvoiceId === invoiceId) ||
      (recordInvoiceNo && invoiceNo && recordInvoiceNo === invoiceNo)
    )
  }
  const financePaidForInvoice = (inv: any) => financeRecords
    .filter((r: any) => isConfirmedFinancePayment(r) && financePaymentBelongsToInvoice(r, inv))
    .reduce((sum: number, r: any) => sum + moneyValue(r.amount), 0)
  const financePreviousPaidForSub = (subcontractorId: string | null | undefined, currentInv?: any) => {
    if (!subcontractorId) return 0
    const currentCutoff = String(currentInv?.period_end ?? currentInv?.invoice_date ?? currentInv?.created_at ?? '')
    return financeRecords
      .filter((r: any) => isConfirmedFinancePayment(r) && String(r.subcontractor_id ?? '') === String(subcontractorId))
      .filter((r: any) => {
        if (currentInv && financePaymentBelongsToInvoice(r, currentInv)) return false
        const linkedInv = r.invoice_id
          ? certificates.find((c: any) => String(c.id ?? '') === String(r.invoice_id ?? ''))
          : (r.invoice_no ? certificates.find((c: any) => textKey(c.invoice_no) === textKey(r.invoice_no) && String(c.subcontractor_id ?? '') === String(subcontractorId)) : null)
        if (currentInv && linkedInv) return isInvoiceBefore(linkedInv, currentInv)
        const paymentDate = String(r.payment_date ?? r.created_at ?? '')
        return currentCutoff ? Boolean(paymentDate && paymentDate <= currentCutoff) : true
      })
      .reduce((sum: number, r: any) => sum + moneyValue(r.amount), 0)
  }
  const financeDeductionBelongsToInvoice = (r: any, inv: any) => financePaymentBelongsToInvoice(r, inv)
  const financeDeductionsForInvoice = (inv: any) => financeRecords
    .filter((r: any) => isConfirmedFinanceDeduction(r) && financeDeductionBelongsToInvoice(r, inv))
    .reduce((sum: number, r: any) => sum + moneyValue(r.amount), 0)
  const financePreviousDeductionsForSub = (subcontractorId: string | null | undefined, currentInv?: any) => {
    if (!subcontractorId) return 0
    const currentCutoff = String(currentInv?.period_end ?? currentInv?.invoice_date ?? currentInv?.created_at ?? '')
    return financeRecords
      .filter((r: any) => isConfirmedFinanceDeduction(r) && String(r.subcontractor_id ?? '') === String(subcontractorId))
      .filter((r: any) => {
        if (currentInv && financeDeductionBelongsToInvoice(r, currentInv)) return false
        const linkedInv = r.invoice_id
          ? certificates.find((c: any) => String(c.id ?? '') === String(r.invoice_id ?? ''))
          : (r.invoice_no ? certificates.find((c: any) => textKey(c.invoice_no) === textKey(r.invoice_no) && String(c.subcontractor_id ?? '') === String(subcontractorId)) : null)
        if (currentInv && linkedInv) return isInvoiceBefore(linkedInv, currentInv)
        const deductionDate = String(r.payment_date ?? r.created_at ?? '')
        return currentCutoff ? Boolean(deductionDate && deductionDate <= currentCutoff) : true
      })
      .reduce((sum: number, r: any) => sum + moneyValue(r.amount), 0)
  }
  const financeTotalDeductionsForCertificate = (subcontractorId: string | null | undefined, currentInv?: any) =>
    financePreviousDeductionsForSub(subcontractorId, currentInv) + financeDeductionsForInvoice(currentInv)
  const [assignForm, setAssignForm] = useState({ villa_node_id: '', trade: 'Structural', subcontractor_id: '', rate_pct: '100' })
  const [bdTab, setBdTab] = useState<'smart'|'list'>('smart')
  const [contractTab, setContractTab] = useState<'overview'|'terms'|'financial'|'items'|'invoices'|'breakdown'>('overview')
  const [showNewContractModal, setShowNewContractModal] = useState(false)
  const [localContracts, setLocalContracts] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [selectedContractId, setSelectedContractId] = useState('')
  const [contractTerms, setContractTerms] = useState<any | null>(null)
  const [contractItems, setContractItems] = useState<any[]>([])
  const [editingContractId, setEditingContractId] = useState<string | null>(null)
  const [editingContractItemId, setEditingContractItemId] = useState<string | null>(null)
  const [editContractItemForm, setEditContractItemForm] = useState({ item_code: '', description: '', unit: '', quantity: '', rate: '', notes: '' })
  const [contractsLoading, setContractsLoading] = useState(false)
  const [contractDraft, setContractDraft] = useState(makeInitialContractDraft)

  const selectedContract = useMemo(() => contracts.find((c: any) => String(c.id) === String(selectedContractId)) ?? contracts[0] ?? null, [contracts, selectedContractId])
  const loadContractDetails = async (contractId: string) => {
    if (!contractId) { setContractTerms(null); setContractItems([]); return }
    const [{ data: termsData, error: termsError }, { data: itemsData, error: itemsError }] = await Promise.all([
      supabase.from('subcontractor_contract_terms').select('*').eq('contract_id', contractId).maybeSingle(),
      supabase.from('subcontractor_contract_items').select('*').eq('contract_id', contractId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ])
    if (termsError) throw termsError
    if (itemsError) throw itemsError
    setContractTerms(termsData ?? null)
    setContractItems(itemsData ?? [])
  }

  const loadContractsFromSupabase = async (preferredContractId?: string) => {
    if (!projectId) {
      setContracts([]); setSelectedContractId(''); setContractTerms(null); setContractItems([]); return
    }
    setContractsLoading(true)
    try {
      const { data, error } = await supabase.from('subcontractor_contracts').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
      if (error) throw error
      const rows = data ?? []
      setContracts(rows)
      const nextId = preferredContractId || (selectedContractId && rows.some((r: any) => String(r.id) === String(selectedContractId)) ? selectedContractId : rows[0]?.id ?? '')
      setSelectedContractId(nextId)
      if (nextId) await loadContractDetails(nextId)
      else { setContractTerms(null); setContractItems([]) }
    } catch (e: any) {
      setMessage(`Could not load subcontractor contracts from Supabase: ${e?.message ?? e}`)
      setContracts([]); setContractTerms(null); setContractItems([])
    } finally { setContractsLoading(false) }
  }

  useEffect(() => { void loadContractsFromSupabase(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => {
    if (!selectedContractId) { setContractTerms(null); setContractItems([]); return }
    void loadContractDetails(selectedContractId).catch((e: any) => setMessage(`Could not load contract details: ${e?.message ?? e}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContractId])

  const openNewContractModal = () => { setEditingContractId(null); setContractDraft(makeInitialContractDraft()); setShowNewContractModal(true) }

  const openEditContractModal = async () => {
    if (!selectedContract?.id) { setMessage('Select a saved contract first.'); return }
    const freshTerms = contractTerms || (await supabase.from('subcontractor_contract_terms').select('*').eq('contract_id', selectedContract.id).maybeSingle()).data
    setEditingContractId(selectedContract.id)
    setContractDraft({
      contract_no: selectedContract.contract_no ?? '', subcontractor_id: selectedContract.subcontractor_id ?? '', scope_of_work: freshTerms?.scope_of_work ?? selectedContract.scope_of_work ?? '', contract_date: selectedContract.contract_date ?? '', start_date: freshTerms?.start_date ?? selectedContract.start_date ?? '', end_date: freshTerms?.completion_date ?? selectedContract.end_date ?? '', contract_value: String(selectedContract.contract_value ?? ''), contract_type: selectedContract.contract_type ?? freshTerms?.contract_type ?? 'BOQ Unit Rate', pricing_basis: selectedContract.pricing_basis ?? freshTerms?.pricing_basis ?? 'boq_unit_rate', lump_sum_amount: String(selectedContract.lump_sum_amount ?? ''), advance_payment_type: freshTerms?.advance_payment_type === 'fixed_amount' ? 'fixed' : (freshTerms?.advance_payment_type ?? 'percentage'), advance_payment_value: String(freshTerms?.advance_payment_value ?? ''), advance_recovery_pct: String(freshTerms?.advance_recovery_percent ?? '20'), retention_pct: String(freshTerms?.retention_percent ?? '5'), delay_penalty_rate: String(freshTerms?.delay_penalty_rate ?? '0.5% per week'), payment_terms: freshTerms?.payment_terms ?? 'Net 30 after CEO approval', special_conditions: freshTerms?.special_conditions ?? selectedContract.notes ?? '',
    })
    setShowNewContractModal(true)
  }

  const saveContractToSupabase = async () => {
    if (!projectId) return
    const safeNo = contractDraft.contract_no.trim() || `SC-${String(contracts.length + 1).padStart(3, '0')}`
    const selectedSub = contractDraft.subcontractor_id ? subcontractors.find((s: any) => String(s.id) === String(contractDraft.subcontractor_id)) : null
    const isEdit = Boolean(editingContractId)
    const contractPayload: any = { project_id: projectId, subcontractor_id: contractDraft.subcontractor_id || null, subcontractor_name: selectedSub?.name ?? null, contract_no: safeNo, contract_title: contractDraft.scope_of_work || `Subcontract ${safeNo}`, status: isEdit ? (selectedContract?.status ?? 'Draft') : 'Draft', scope_of_work: contractDraft.scope_of_work || null, contract_date: contractDraft.contract_date || null, start_date: contractDraft.start_date || null, end_date: contractDraft.end_date || null, currency: 'EGP', contract_value: Number(contractDraft.contract_value || 0), contract_type: contractDraft.contract_type || 'BOQ Unit Rate', pricing_basis: contractDraft.pricing_basis || 'boq_unit_rate', lump_sum_amount: Number(contractDraft.lump_sum_amount || 0), notes: contractDraft.special_conditions || null, updated_by: user?.id ?? null }
    if (!isEdit) contractPayload.created_by = user?.id ?? null
    try {
      const { data: savedContract, error: contractError } = isEdit ? await supabase.from('subcontractor_contracts').update(contractPayload).eq('id', editingContractId).select('*').single() : await supabase.from('subcontractor_contracts').insert(contractPayload).select('*').single()
      if (contractError) throw contractError
      const contractId = savedContract?.id
      if (!contractId) throw new Error('Contract save returned no id.')
      const termsPayload: any = { contract_id: contractId, scope_of_work: contractDraft.scope_of_work || null, start_date: contractDraft.start_date || null, completion_date: contractDraft.end_date || null, payment_terms: contractDraft.payment_terms || null, contract_type: contractDraft.contract_type || 'BOQ Unit Rate', pricing_basis: contractDraft.pricing_basis || 'boq_unit_rate', lump_sum_amount: Number(contractDraft.lump_sum_amount || 0), advance_payment_type: contractDraft.advance_payment_type === 'fixed' ? 'fixed_amount' : contractDraft.advance_payment_type, advance_payment_value: Number(contractDraft.advance_payment_value || 0), advance_recovery_method: contractDraft.advance_recovery_pct ? `${contractDraft.advance_recovery_pct}% from each invoice` : null, advance_recovery_percent: Number(contractDraft.advance_recovery_pct || 0), retention_percent: Number(contractDraft.retention_pct || 0), delay_penalty_rate: Number(String(contractDraft.delay_penalty_rate || '').replace(/[^0-9.]/g, '') || 0), insurance_requirements: 'Required documents before release', back_charges_rules: 'Manual back charges with reason and audit trail', variation_approval_rules: 'Approved variations, claims, and extra works only', special_conditions: contractDraft.special_conditions || null, notes: contractDraft.special_conditions || null, updated_by: user?.id ?? null }
      if (!isEdit) termsPayload.created_by = user?.id ?? null
      const { error: termsError } = await supabase.from('subcontractor_contract_terms').upsert(termsPayload, { onConflict: 'contract_id' })
      if (termsError) throw termsError
      if (!isEdit) {
        const contractSubId = contractDraft.subcontractor_id ? String(contractDraft.subcontractor_id) : ''
        const sourceRows = (breakdowns as any[]).filter((b: any) => !contractSubId || String(b.subcontractor_id ?? '') === contractSubId)
        if (sourceRows.length) {
          const initialItems = sourceRows.map((b: any, idx: number) => ({ contract_id: contractId, boq_item_id: b.boq_item_id ?? null, breakdown_item_id: b.id ?? null, item_code: b.boq_items?.item_code ?? b.item_code ?? b.assignment_key ?? null, description: b.boq_items?.description ?? b.description ?? b.assignment_key ?? 'Contract item', unit: b.boq_items?.unit ?? b.unit ?? null, quantity: Number(b.subcontract_qty ?? b.boq_qty ?? 0), rate: Number(b.rate ?? 0), sort_order: idx + 1, notes: b.assignment_key ?? null, created_by: user?.id ?? null, updated_by: user?.id ?? null }))
          const { error: itemsError } = await supabase.from('subcontractor_contract_items').insert(initialItems as any)
          if (itemsError) throw itemsError
        }
      }
      setShowNewContractModal(false); setEditingContractId(null); await loadContractsFromSupabase(contractId); setContractTab('overview')
      setMessage(isEdit ? 'Contract and terms updated in Supabase.' : 'Contract, terms and initial items saved to Supabase.')
    } catch (e: any) { setMessage(`Contract save failed: ${e?.message ?? e}`); throw e }
  }

  const syncContractItemsFromBreakdowns = async () => {
    if (!selectedContract?.id) { setMessage('Select a saved contract first.'); return }
    const contractSubId = selectedContract.subcontractor_id ? String(selectedContract.subcontractor_id) : ''
    const sourceRows = (breakdowns as any[]).filter((b: any) => !contractSubId || String(b.subcontractor_id ?? '') === contractSubId)
    try {
      const { error: deleteError } = await supabase.from('subcontractor_contract_items').delete().eq('contract_id', selectedContract.id)
      if (deleteError) throw deleteError
      if (sourceRows.length) {
        const rows = sourceRows.map((b: any, idx: number) => ({ contract_id: selectedContract.id, boq_item_id: b.boq_item_id ?? null, breakdown_item_id: b.id ?? null, item_code: b.boq_items?.item_code ?? b.item_code ?? b.assignment_key ?? null, description: b.boq_items?.description ?? b.description ?? b.assignment_key ?? 'Contract item', unit: b.boq_items?.unit ?? b.unit ?? null, quantity: Number(b.subcontract_qty ?? b.boq_qty ?? 0), rate: Number(b.rate ?? 0), sort_order: idx + 1, notes: b.assignment_key ?? null, created_by: user?.id ?? null, updated_by: user?.id ?? null }))
        const { error: insertError } = await supabase.from('subcontractor_contract_items').insert(rows as any)
        if (insertError) throw insertError
      }
      await loadContractDetails(selectedContract.id)
      setMessage(sourceRows.length ? 'Contract items synced to subcontractor_contract_items.' : 'No matching breakdown rows found; existing contract items were cleared.')
    } catch (e: any) { setMessage(`Contract items sync failed: ${e?.message ?? e}`) }
  }

  const startEditContractItem = (item: any) => { setEditingContractItemId(item.id); setEditContractItemForm({ item_code: item.item_code ?? '', description: item.description ?? '', unit: item.unit ?? '', quantity: String(item.quantity ?? ''), rate: String(item.rate ?? ''), notes: item.notes ?? '' }) }
  const saveContractItemEdit = async (itemId: string) => {
    if (!selectedContract?.id) return
    const payload = { item_code: editContractItemForm.item_code || null, description: editContractItemForm.description || 'Contract item', unit: editContractItemForm.unit || null, quantity: Number(editContractItemForm.quantity || 0), rate: Number(editContractItemForm.rate || 0), notes: editContractItemForm.notes || null, updated_by: user?.id ?? null }
    const { error } = await supabase.from('subcontractor_contract_items').update(payload as any).eq('id', itemId)
    if (error) { setMessage(`Contract item update failed: ${error.message}`); return }
    setEditingContractItemId(null); await loadContractDetails(selectedContract.id); setMessage('Contract item updated in subcontractor_contract_items.')
  }

  const createInvoiceFromSelectedContract = async () => {
    if (!projectId || !selectedContract?.id) { setMessage('Create or select a saved contract first.'); openNewContractModal(); return }
    if (!selectedContract.subcontractor_id) { setMessage('Selected contract has no subcontractor. Edit the contract and select a subcontractor first.'); return }
    await run('Invoice from Contract', async () => {
      const sub = subcontractors.find((s: any) => String(s.id) === String(selectedContract.subcontractor_id))
      const sourceName = sub?.name ?? selectedContract.subcontractor_name ?? 'XXX'
      const prefix = sourceName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'XXX'
      const { data: existingNos, error: existingErr } = await supabase.from('subcontractor_invoices').select('invoice_no').eq('project_id', projectId).eq('subcontractor_id', selectedContract.subcontractor_id)
      if (existingErr) throw existingErr
      const maxNo = (existingNos ?? []).reduce((max: number, row: any) => { const trailing = String(row.invoice_no ?? '').match(/(\d+)\s*$/)?.[1]; const num = Number(trailing ?? 0); return Number.isFinite(num) ? Math.max(max, num) : max }, 0)
      const invoiceNo = `INV-${prefix}-${String(maxNo + 1).padStart(3, '0')}`
      const itemsGross = contractItems.reduce((sum: number, item: any) => sum + Number(item.amount ?? (Number(item.quantity ?? 0) * Number(item.rate ?? 0))), 0)
      const gross = itemsGross > 0 ? itemsGross : Number(selectedContract.contract_value ?? 0)
      const retentionPct = Number(contractTerms?.retention_percent ?? sub?.default_retention_pct ?? 0)
      const retentionAmount = gross * retentionPct / 100
      const advanceRecoveryAmount = Number(contractTerms?.advance_recovery_percent ?? 0) > 0 ? gross * Number(contractTerms.advance_recovery_percent) / 100 : 0
      const netPayable = Math.max(gross - retentionAmount - advanceRecoveryAmount, 0)
      await createCertificate.mutateAsync({ project_id: projectId, subcontractor_id: selectedContract.subcontractor_id, invoice_no: invoiceNo, invoice_date: today(), period_end: today(), gross_amount: gross, retention_pct: retentionPct, retention_amount: retentionAmount, advance_recovery_amount: advanceRecoveryAmount, retention_release_amount: 0, net_amount: netPayable, net_payable: netPayable, previous_paid_amount: 0, contract_id: selectedContract.id, contract_no: selectedContract.contract_no, contract_terms_snapshot: { contract_no: selectedContract.contract_no, contract_value: selectedContract.contract_value, terms: contractTerms, items_total: itemsGross, generated_from: 'Create Invoice from Contract' }, status: 'Draft', remarks: `Created from contract ${selectedContract.contract_no}` } as any)
      await queryClient.invalidateQueries(); setActiveView('certificates'); setMessage(`Draft invoice ${invoiceNo} created and linked to contract ${selectedContract.contract_no}.`)
    })
  }

  const [bdNode, setBdNode] = useState('')
  const [bdTrade, setBdTrade] = useState('Structural')
  const [bdSub, setBdSub] = useState('')
  const [bdContractType, setBdContractType] = useState('BOQ Unit Rate')
  const [bdPricingBasis, setBdPricingBasis] = useState('boq_unit_rate')
  const [bdLumpSumAmount, setBdLumpSumAmount] = useState('')
  const [bdRates, setBdRates] = useState<Record<string, string>>({})
  const [bdListGroupBy, setBdListGroupBy] = useState<'villa'|'boq'|'subcontractor'|'flat'>('villa')
  const [bdInlineRateEdits, setBdInlineRateEdits] = useState<Record<string, string>>({})
  const [editingBreakdownId, setEditingBreakdownId] = useState<string | null>(null)
  const [breakdownEditForm, setBreakdownEditForm] = useState({
    assignment_key: '',
    subcontractor_id: '',
    boq_item_id: '',
    structure_id: '',
    subcontract_qty: '',
    rate: '',
    contract_type: 'BOQ Unit Rate',
    pricing_basis: 'boq_unit_rate',
    lump_sum_amount: '',
    notes: '',
    apply_rate_to_same_code: true,
  })
  const [bdVillaCount, setBdVillaCount] = useState('1')
  const [bdVillaSelection, setBdVillaSelection] = useState<'count'|'select'>('count')
  const [bdSelectedVillas, setBdSelectedVillas] = useState<Set<string>>(new Set())
  const [assignTab, setAssignTab] = useState<'assign'|'breakdown'|'summary'>('assign')
  const [selectedVillaForAssign, setSelectedVillaForAssign] = useState('')
  const { data: villaProgress = [] } = useVillaProgress(projectId)
  const bulkCreateVillaUnits = useBulkCreateVillaUnits()
  const updateVillaUnit = useUpdateVillaUnit()
  const deleteVillaUnit = useDeleteVillaUnit()
  const upsertVillaProgress = useUpsertVillaProgress()
  const TRADES: TradeType[] = ['Structural', 'MEP', 'Finishing', 'External Works', 'Landscaping', 'Other']
  const [villaTab, setVillaTab] = useState<'overview'|'generate'|'tracker'|'progress'>('overview')
  const [selectedPhaseForVilla, setSelectedPhaseForVilla] = useState('')
  const [selectedTypeForVilla, setSelectedTypeForVilla] = useState('')
  const [selectedVillaUnit, setSelectedVillaUnit] = useState('')
  const [villaGenForm, setVillaGenForm] = useState({ phase_id: '', villa_type_id: '', count: '10', prefix: '', subcontractor_id: '' })
  const [villaFilterPhase, setVillaFilterPhase] = useState('')
  const [villaFilterType, setVillaFilterType] = useState('')
  const [villaFilterSub, setVillaFilterSub] = useState('')
  const [progressForm, setProgressForm] = useState<Record<string, string>>({})
  const { data: qtoLines = [] } = useQtoLines(projectId)
  const createQtoLine = useCreateQtoLine()
  const updateQtoLine = useUpdateQtoLine()
  const deleteQtoLine = useDeleteQtoLine()
  const [qsTab, setQsTab] = useState<'takeoff'|'summary'|'edit'>('takeoff')
  const [bbsQsTab, setBbsQsTab] = useState<'summary'|'qs'|'bbs'>('summary')
  const [selectedBoqForQto, setSelectedBoqForQto] = useState('')
  const [selectedStructureForQto, setSelectedStructureForQto] = useState('')
  const [editingQtoLine, setEditingQtoLine] = useState<string | null>(null)
  const [qtoLineForm, setQtoLineForm] = useState({ description: '', times: '1', length: '', width: '', height: '', notes: '' })
  const [editQtoForm, setEditQtoForm] = useState({ description: '', times: '1', length: '', width: '', height: '', notes: '' })
  const bulkUpsertSchedule = useBulkUpsertSchedule()
  const [scheduleTab, setScheduleTab] = useState<'overview'|'list'|'critical'>('overview')
  const [scheduleFilter, setScheduleFilter] = useState('')
  const [scheduleUploadMsg, setScheduleUploadMsg] = useState('')
  const { data: tenderItems = [] } = useTenderItems(projectId)
  const createTenderItem = useCreateTenderItem()
  const updateTenderItem = useUpdateTenderItem()
  const deleteTenderItem = useDeleteTenderItem()
  const [tenderForm, setTenderForm] = useState({ boq_item_id: '', category: 'Material' as CostCategory, resource_id: '', resource_code: '', description: '', unit: '', qty: '0', waste_pct: '0', steel_ratio: '', unit_rate: '0', overhead_pct: '0', profit_pct: '0', notes: '' })
  const [editingTenderLineId, setEditingTenderLineId] = useState<string | null>(null)
  const [selectedBoqForTender, setSelectedBoqForTender] = useState('')
  const [selectedStructureForTender, setSelectedStructureForTender] = useState('')
  const [boqUploadError, setBoqUploadError] = useState('')
  const [boqFilters, setBoqFilters] = useState({ search: '', structure: 'all', discipline: 'all', unit: 'all', qtyStatus: 'all', qsStatus: 'all', subcontractorStatus: 'all', duplicateStatus: 'all', minQty: '', maxQty: '', minRate: '', maxRate: '' })
  const [boqGroupBy, setBoqGroupBy] = useState<'none' | 'structure' | 'code'>('structure')
  const [boqDisciplineGrouping, setBoqDisciplineGrouping] = useState(true)
  const [collapsedBoqGroups, setCollapsedBoqGroups] = useState<string[]>([])
  const toggleBoqGroup = (key: string) => setCollapsedBoqGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const [tenderTab, setTenderTab] = useState<'input'|'library'|'sheet'|'summary'>('input')
  const COST_CATEGORIES: CostCategory[] = ['Material', 'Labor', 'Equipment', 'Subcontract', 'Overhead']
  const [tenderResources, setTenderResources] = useState<TenderResource[]>([])
  const [resourceForm, setResourceForm] = useState({ category: 'Material' as CostCategory, code: '', description: '', unit: '', unit_rate: '0', default_waste_pct: '0', notes: '' })
  const [resourceSearch, setResourceSearch] = useState('')
  const [libraryManagerSearch, setLibraryManagerSearch] = useState('')
  const [libraryManagerCategory, setLibraryManagerCategory] = useState('all')
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [pasteMode, setPasteMode] = useState<'add'|'replace'>('add')
  const [costSheetFilters, setCostSheetFilters] = useState({ view: 'villa' as 'villa' | 'boq', villa: 'all', model: 'all', phase: 'all', search: '' })
  const [bulkMarkup, setBulkMarkup] = useState({ overhead_pct: '0', profit_pct: '0', target: 'all' as 'all' | CostCategory })
  // v84: Cost Library is persistent in Supabase and GLOBAL.
  // It reads public.cost_library without project_id filtering and does not store real library data in localStorage.
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const loadTenderResources = async () => {
    setResourcesLoading(true)
    try {
      const { data, error } = await (supabase as any)
        .from('cost_library')
        .select('id, project_id, category, code, description, unit, default_rate, waste_percent, notes')
        .order('code', { ascending: true })
      if (error) throw error
      setTenderResources((data ?? []).map((r: any) => ({
        id: r.id,
        project_id: r.project_id ?? null,
        category: (r.category || 'Material') as CostCategory,
        code: normalizeCode(r.code),
        description: r.description || '',
        unit: r.unit || '',
        unit_rate: Number(r.default_rate ?? 0),
        default_waste_pct: Number(r.waste_percent ?? 0),
        notes: r.notes || undefined,
      })))
    } catch (err) {
      console.error('Failed to load cost_library', err)
      setTenderResources([])
      setMessage('Cost Library could not load. Check Supabase table public.cost_library.')
    } finally {
      setResourcesLoading(false)
    }
  }
  useEffect(() => {
    loadTenderResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const categoryResources = tenderResources.filter(r => r.category === tenderForm.category)
  const filteredCategoryResources = categoryResources.filter(r => {
    const q = resourceSearch.trim().toLowerCase()
    if (!q) return true
    return [r.code, r.description, r.unit, String(r.unit_rate)].join(' ').toLowerCase().includes(q)
  })
  const saveTenderResource = async () => {
    if (!resourceForm.code || !resourceForm.description) return
    const code = normalizeCode(resourceForm.code)
    const existing = tenderResources.find(r => r.id === editingResourceId || (r.category === resourceForm.category && normalizeCode(r.code) === code))
    const dbPayload: any = {
      project_id: null,
      category: resourceForm.category,
      code,
      description: resourceForm.description,
      unit: resourceForm.unit || null,
      default_rate: n(resourceForm.unit_rate),
      waste_percent: resourceForm.category === 'Material' ? n(resourceForm.default_waste_pct) : 0,
      notes: resourceForm.notes || null,
      updated_at: new Date().toISOString(),
    }
    const saved = await run('Save resource', async () => {
      if (existing?.id) {
        const { data, error } = await (supabase as any).from('cost_library').update(dbPayload).eq('id', existing.id).select().single()
        if (error) throw error
        return data
      }
      const { data, error } = await (supabase as any).from('cost_library').insert(dbPayload).select().single()
      if (error) throw error
      return data
    })
    if (!saved) return
    const resource: TenderResource = {
      id: saved.id,
      project_id: saved.project_id ?? null,
      category: (saved.category || 'Material') as CostCategory,
      code: normalizeCode(saved.code),
      description: saved.description || '',
      unit: saved.unit || '',
      unit_rate: Number(saved.default_rate ?? 0),
      default_waste_pct: Number(saved.waste_percent ?? 0),
      notes: saved.notes || undefined,
    }
    // v93: update UI state immediately, then sync linked breakdown lines and optionally update BOQ rates.
    setTenderResources(prev => {
      const others = prev.filter(r => r.id !== resource.id && !(normalizeCode(r.code) === normalizeCode(resource.code) && r.category === resource.category))
      return [...others, resource].sort((a, b) => a.code.localeCompare(b.code))
    })
    setTenderForm({ ...tenderForm, category: resource.category, resource_id: resource.id, resource_code: resource.code, description: resource.description, unit: resource.unit, unit_rate: String(resource.unit_rate), waste_pct: String(resource.default_waste_pct ?? 0), steel_ratio: tenderForm.steel_ratio || '' })
    const syncedCount = await applyResourceUpdateToTenderLines(resource)
    await refreshTenderLiveData()
    setEditingResourceId(null)
    setResourceForm({ category: 'Material' as CostCategory, code: '', description: '', unit: '', unit_rate: '0', default_waste_pct: '0', notes: '' })
    setMessage(syncedCount > 0 ? `Resource saved and ${syncedCount} linked breakdown line(s) updated. BOQ selling rates were NOT changed.` : 'Resource saved successfully. BOQ selling rates were NOT changed.')
  }
  const selectTenderResource = (id: string) => {
    const r = tenderResources.find(x => x.id === id)
    if (!r) { setTenderForm({ ...tenderForm, resource_id: '', resource_code: '', description: '', unit: '', unit_rate: '0', waste_pct: '0', steel_ratio: '' }); return }
    setTenderForm({ ...tenderForm, category: r.category, resource_id: r.id, resource_code: r.code, description: r.description, unit: r.unit, unit_rate: String(r.unit_rate), waste_pct: String(r.default_waste_pct ?? 0), steel_ratio: tenderForm.steel_ratio || '' })
  }
  const editTenderResource = (r: TenderResource) => {
    setEditingResourceId(r.id)
    setResourceForm({ category: r.category, code: r.code, description: r.description, unit: r.unit, unit_rate: String(r.unit_rate), default_waste_pct: String(r.default_waste_pct ?? 0), notes: r.notes ?? '' })
    setTenderTab('library')
  }
  const deleteTenderResource = async (id: string) => {
    const resource = tenderResources.find(r => r.id === id)
    const isUsed = !!resource && tenderItems.some((t: any) => String(t.description ?? '').includes(resource.code))
    if (isUsed && !confirm('This resource appears to be used in cost lines. Delete anyway? Existing cost lines will not be deleted.')) return
    const ok = await run('Delete resource', async () => {
      const { error } = await (supabase as any).from('cost_library').delete().eq('id', id)
      if (error) throw error
      return true
    })
    if (!ok) return
    setTenderResources(prev => prev.filter(r => r.id !== id))
    if (editingResourceId === id) setEditingResourceId(null)
  }
  const cancelTenderResourceEdit = () => {
    setEditingResourceId(null)
    setResourceForm({ category: 'Material' as CostCategory, code: '', description: '', unit: '', unit_rate: '0', default_waste_pct: '0', notes: '' })
  }


  // v94: central live sync + printable reports for Tender tabs.
  const refreshTenderLiveData = async () => {
    await Promise.all([
      loadTenderResources(),
      queryClient.invalidateQueries({ queryKey: ['tender_items', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['boq'] }),
    ])
  }


  // v96 Smart Cost Input: bulk OH/Profit saved to Supabase so Cost Sheets update immediately.
  const applyBulkMarkupToTenderLines = async (rows: any[], mode: 'all' | CostCategory = bulkMarkup.target) => {
    if (!projectId || !rows.length) return
    const oh = n(bulkMarkup.overhead_pct)
    const pr = n(bulkMarkup.profit_pct)
    const targets = rows.filter((line: any) => mode === 'all' || line.category === mode)
    if (!targets.length) { setMessage('No matching cost lines for selected OH/Profit target.'); return }
    if (!confirm(`Apply OH ${oh}% and Profit ${pr}% to ${targets.length} cost line(s)?

This will update the Cost Sheet automatically.`)) return
    for (const line of targets) {
      await updateTenderItem.mutateAsync({
        id: line.id,
        project_id: projectId,
        patch: { overhead_pct: oh, profit_pct: pr } as any,
      })
    }
    await refreshTenderLiveData()
    setMessage(`OH/Profit applied to ${targets.length} line(s). Cost Sheet updated automatically.`)
  }

  const quickApplyBulkMarkup = async (rows: any[], overhead: number, profit: number, mode: 'all' | CostCategory = 'all') => {
    setBulkMarkup({ overhead_pct: String(overhead), profit_pct: String(profit), target: mode })
    if (!projectId || !rows.length) return
    const targets = rows.filter((line: any) => mode === 'all' || line.category === mode)
    for (const line of targets) {
      await updateTenderItem.mutateAsync({
        id: line.id,
        project_id: projectId,
        patch: { overhead_pct: overhead, profit_pct: profit } as any,
      })
    }
    await refreshTenderLiveData()
    setMessage(`Preset OH ${overhead}% / Profit ${profit}% applied to ${targets.length} line(s). Cost Sheet updated.`)
  }

  const printTenderSection = (sectionId: string, title: string) => {
    if (typeof window === 'undefined') return
    const el = document.getElementById(sectionId) || document.querySelector('main') || document.body
    const w = window.open('', '_blank', 'width=1200,height=800')
    if (!w) { window.print(); return }
    w.document.write(`<!doctype html><html><head><title>${title}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111} h1{font-size:20px;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}
      button,input,select,textarea,.no-print{display:none!important}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact} @page{size:A4 landscape;margin:12mm}
    </style></head><body><h1>${title}</h1>${el.innerHTML}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close() }, 250)
  }




  // v134: professional print/PDF + CSV exports for Finance and Inventory reports.
  const escHtml = (value: any) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch])
  const downloadCsvFile = (filename: string, rows: any[][]) => {
    if (typeof window === 'undefined') return
    const csv = '\uFEFF' + rows.map((row) => row.map((cell) => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = filename
    a.click()
  }
  // v135: Excel import/export helpers for Finance and Inventory.
  const excelSafeSheetName = (name: string) => String(name || 'Sheet').replace(/[\/?*\[\]:]/g, ' ').slice(0, 31)
  const downloadXlsxFile = async (filename: string, sheets: Record<string, any[][]>) => {
    if (typeof window === 'undefined') return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    Object.entries(sheets).forEach(([sheetName, rows]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const maxCols = Math.max(...rows.map((r) => r.length), 1)
      ;(ws as any)['!cols'] = Array.from({ length: maxCols }).map((_, i) => ({ wch: Math.min(Math.max(...rows.map((r) => String(r[i] ?? '').length), 10), 34) }))
      XLSX.utils.book_append_sheet(wb, ws, excelSafeSheetName(sheetName))
    })
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
  }
  const readXlsxFirstSheetRows = async (file: File): Promise<any[][]> => {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][]
  }
  const excelHeaderKey = (value: any) => String(value ?? '').trim().toLowerCase().replace(/[\s\-\/]+/g, '_').replace(/[^a-z0-9_؀-ۿ]/g, '').replace(/^_+|_+$/g, '')
  const excelObjectsFromRows = (rows: any[][]) => {
    const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? '').trim()))
    if (headerIndex < 0) return [] as Record<string, any>[]
    const headers = rows[headerIndex].map(excelHeaderKey)
    return rows.slice(headerIndex + 1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim()))
      .map((row) => Object.fromEntries(headers.map((h, idx) => [h, row[idx]])))
  }
  const excelPick = (row: Record<string, any>, keys: string[]) => {
    for (const key of keys) {
      const direct = row[excelHeaderKey(key)]
      if (direct !== undefined && String(direct ?? '').trim() !== '') return direct
    }
    return ''
  }
  const excelNumber = (value: any) => {
    const raw = String(value ?? '').replace(/,/g, '').replace(/egp/ig, '').replace(/جنيه/g, '').trim()
    const num = Number(raw.replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(num) ? num : 0
  }
  const excelBool = (value: any) => ['yes','true','1','y','charged','charge','خصم','نعم'].includes(String(value ?? '').trim().toLowerCase())
  const excelDateIso = (value: any) => {
    if (!value) return today()
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
    if (typeof value === 'number') {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000))
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
    }
    const raw = String(value ?? '').trim()
    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    const slash = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
    if (slash) {
      const a = Number(slash[1]), b = Number(slash[2]), y = slash[3]
      const month = a > 12 ? b : a
      const day = a > 12 ? a : b
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().slice(0, 10)
  }

  const printProfessionalTableReport = (title: string, meta: string[], kpis: { label: string; value: string; note?: string }[], heads: string[], rows: any[][], totals?: string[]) => {
    if (typeof window === 'undefined') return
    const w = window.open('', '_blank', 'width=1300,height=850')
    if (!w) { window.print(); return }
    const kpiHtml = kpis.map((k) => `<div class="kpi"><div class="k-label">${escHtml(k.label)}</div><div class="k-val">${escHtml(k.value)}</div>${k.note ? `<div class="k-note">${escHtml(k.note)}</div>` : ''}</div>`).join('')
    const tableRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escHtml(cell)}</td>`).join('')}</tr>`).join('')
    const totalHtml = totals?.length ? `<tfoot><tr>${totals.map((cell) => `<td>${escHtml(cell)}</td>`).join('')}</tr></tfoot>` : ''
    w.document.write(`<!doctype html><html><head><title>${escHtml(title)}</title><style>
      body{font-family:Arial,Tahoma,sans-serif;margin:0;color:#111;background:#f5f7f8}.page{padding:22px}.header{background:#0f3d2e;color:#fff;padding:18px 22px;border-radius:12px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.title{font-size:22px;font-weight:900;margin-bottom:6px}.meta{font-size:12px;line-height:1.6;color:#dfeee8}.badge{background:#e8f5e9;color:#0f3d2e;border-radius:999px;padding:7px 12px;font-weight:900;white-space:nowrap}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.kpi{background:#fff;border:1px solid #dde6df;border-radius:10px;padding:12px}.k-label{font-size:10px;color:#667;text-transform:uppercase;letter-spacing:.06em}.k-val{font-size:18px;font-weight:900;margin-top:5px}.k-note{font-size:11px;color:#888;margin-top:3px}.box{background:#fff;border:1px solid #dde6df;border-radius:12px;overflow:hidden}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#edf4ef;color:#0f3d2e;text-align:left;border-bottom:1px solid #cfded5;padding:8px;white-space:nowrap}td{border-bottom:1px solid #eee;padding:7px;vertical-align:top}tfoot td{background:#101827;color:#fff;font-weight:900}.actions{padding:12px 22px}.actions button{padding:9px 14px;border-radius:8px;border:0;background:#0f6b4a;color:#fff;font-weight:900;cursor:pointer}@media print{.actions{display:none}.page{padding:0}.header{border-radius:0}.box{border-radius:0}@page{size:A4 landscape;margin:10mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><div class="page"><div class="header"><div><div class="title">${escHtml(title)}</div><div class="meta">${meta.map(escHtml).join('<br/>')}</div></div><div class="badge">${rows.length} rows</div></div><div class="kpis">${kpiHtml}</div><div class="box"><table><thead><tr>${heads.map((h) => `<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${tableRows || `<tr><td colspan="${heads.length}" style="text-align:center;color:#999;padding:24px">No records found</td></tr>`}</tbody>${totalHtml}</table></div></div></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close() }, 250)
  }

  const printProfessionalBoqReport = () => {
    if (typeof window === 'undefined') return
    const esc = (v: any) => String(v ?? '').replace(/[&<>\"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' } as any)[ch])
    const divisionTitle = (code: any) => {
      const n = String(code ?? '').trim().split('.')[0]
      const padded = n ? n.padStart(2, '0') : '00'
      const known: Record<string, string> = { '01': 'GENERAL REQUIREMENTS', '02': 'SITEWORKS', '03': 'CONCRETE', '04': 'MASONRY', '05': 'METALS', '06': 'WOOD & PLASTICS', '07': 'THERMAL & MOISTURE', '08': 'OPENINGS', '09': 'FINISHES', '10': 'SPECIALTIES', '11': 'EQUIPMENT', '12': 'FURNISHINGS', '13': 'SPECIAL CONSTRUCTION', '14': 'CONVEYING', '15': 'MECHANICAL', '16': 'ELECTRICAL' }
      return `DIVISION ${padded} — ${known[padded] || 'BOQ ITEMS'}`
    }
    const nodeById = new Map((structureNodes as any[]).map((n: any) => [n.id, n]))
    const structureMap = new Map<string, { title: string; disciplines: Map<string, any[]> }>()
    ;(filteredBoqItems as any[]).forEach((item: any) => {
      const node = nodeById.get(item.structure_id)
      const structureTitle = node ? `${node.code} — ${node.name}` : 'No Structure'
      const structureKey = String(item.structure_id || 'none')
      if (!structureMap.has(structureKey)) structureMap.set(structureKey, { title: structureTitle, disciplines: new Map() })
      const discipline = String(item.discipline || 'No Discipline')
      const discMap = structureMap.get(structureKey)!.disciplines
      if (!discMap.has(discipline)) discMap.set(discipline, [])
      discMap.get(discipline)!.push(item)
    })
    let body = ''
    Array.from(structureMap.values()).sort((a,b)=>a.title.localeCompare(b.title)).forEach((structure) => {
      let structureTotal = 0
      body += `<section class="villa"><h2>${esc(structure.title)}</h2>`
      Array.from(structure.disciplines.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([discipline, items]) => {
        body += `<h3>${esc(discipline)}</h3>`
        const divMap = new Map<string, any[]>()
        items.forEach((item: any) => {
          const div = divisionTitle(item.item_code)
          if (!divMap.has(div)) divMap.set(div, [])
          divMap.get(div)!.push(item)
        })
        Array.from(divMap.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([division, divItems]) => {
          const divTotal = divItems.reduce((sum, b: any) => sum + Number(b.boq_qty || 0) * Number(b.client_rate ?? b.rate ?? 0), 0)
          structureTotal += divTotal
          body += `<div class="division"><div class="division-title"><span>${esc(division)}</span><span>${esc(money(divTotal))}</span></div>`
          body += `<table><thead><tr><th>Code</th><th>Description</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>`
          divItems.sort((a:any,b:any)=>String(a.item_code).localeCompare(String(b.item_code))).forEach((b:any) => {
            const qty = Number(b.boq_qty || 0)
            const rate = Number(b.client_rate ?? b.rate ?? 0)
            body += `<tr><td>${esc(b.item_code)}</td><td class="desc">${esc(b.description)}</td><td>${esc(b.unit)}</td><td class="num">${esc(round3(qty))}</td><td class="num">${esc(money(rate))}</td><td class="num strong">${esc(money(qty*rate))}</td></tr>`
          })
          body += `</tbody><tfoot><tr><td colspan="5">Division subtotal</td><td class="num">${esc(money(divTotal))}</td></tr></tfoot></table></div>`
        })
      })
      body += `<div class="villa-total">${esc(structure.title)} Total: ${esc(money(structureTotal))}</div></section>`
    })
    const grandTotal = (filteredBoqItems as any[]).reduce((sum, b:any) => sum + Number(b.boq_qty || 0) * Number(b.client_rate ?? b.rate ?? 0), 0)
    const w = window.open('', '_blank', 'width=1200,height=850')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Professional BOQ Report</title><style>
      body{font-family:Arial,'Segoe UI',Tahoma,sans-serif;margin:0;color:#111;background:#fff} .page{padding:22px 28px}
      .cover{border-bottom:4px solid #1e3f73;margin-bottom:18px;padding-bottom:12px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
      .title{font-size:24px;font-weight:900;color:#1e3f73;margin-bottom:5px}.meta{font-size:12px;color:#666;line-height:1.6}.badge{background:#eaf1fb;color:#1e3f73;padding:8px 12px;border-radius:999px;font-weight:800;font-size:12px}
      h2{background:#1e3f73;color:white;margin:18px 0 0;padding:10px 12px;font-size:16px;letter-spacing:.2px} h3{background:#555;color:#fff;margin:0;padding:8px 12px;font-size:13px}
      .division-title{background:#d9eaf7;border-top:2px solid #9ec3df;padding:8px 10px;display:flex;justify-content:space-between;font-weight:900;color:#183b5c}
      table{width:100%;border-collapse:collapse;font-size:11.5px;margin:0 0 8px} th{background:#f2f5f8;color:#111;text-align:left;border:1px solid #d9d9d9;padding:7px}td{border:1px solid #e3e3e3;padding:7px;vertical-align:top}td.desc{direction:rtl;text-align:right}.num{text-align:right;white-space:nowrap}.strong{font-weight:800}tfoot td{background:#f4faf7;font-weight:900}.villa-total{background:#eef7f2;border:1px solid #cfe8d8;padding:10px 12px;text-align:right;font-weight:900;color:#0f5c3f;margin-bottom:18px}.grand{margin-top:18px;background:#111827;color:#fff;padding:14px 16px;border-radius:8px;text-align:right;font-size:18px;font-weight:900}.actions{padding:12px 28px;background:#f8fafc;border-bottom:1px solid #ddd}.actions button{padding:9px 14px;border-radius:8px;border:1px solid #1e3f73;background:#1e3f73;color:#fff;font-weight:800;cursor:pointer}@media print{.actions{display:none}.page{padding:0}.villa{page-break-inside:auto}h2{page-break-before:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4 landscape;margin:10mm}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><div class="page"><div class="cover"><div><div class="title">Professional BOQ Report</div><div class="meta">Project: ${esc(projects.find((p:any)=>p.id===projectId)?.project_name || 'Project')}<br/>Generated: ${new Date().toLocaleDateString()}<br/>Layout: Structure / Villa → Discipline → Division → BOQ Items</div></div><div class="badge">${esc(filteredBoqItems.length)} BOQ Items</div></div>${body}<div class="grand">Grand Total: ${esc(money(grandTotal))}</div></div></body></html>`)
    w.document.close(); w.focus()
  }
  // v92: hoisted safe helper for Tender/Cost Sheets.
  // Using a function declaration prevents runtime ReferenceError from stale/ordered render expressions.
  function getTenderItemsForBoq(boqId: any) {
    if (!boqId) return []
    const rows = Array.isArray(tenderItems) ? tenderItems : []
    return rows.filter((t: any) => String(t.boq_item_id ?? '') === String(boqId))
  }

  // v93 Live Cost Engine: resource code prefix keeps breakdown lines linked to Cost Library.
  const tenderLineCode = (line: any) => normalizeCode(String(line?.description ?? '').split('—')[0])
  const tenderLineResource = (line: any) => tenderResources.find(r => normalizeCode(r.code) === tenderLineCode(line))
  const liveTenderRate = (line: any) => Number(tenderLineResource(line)?.unit_rate ?? line?.unit_rate ?? 0)
  const liveTenderUnit = (line: any) => tenderLineResource(line)?.unit || line?.unit || ''
  const liveTenderDescription = (line: any) => {
    const r = tenderLineResource(line)
    return r ? `${r.code} — ${r.description}` : (line?.description ?? '')
  }
  const getTenderLinesForResource = (resource: TenderResource) => {
    const code = normalizeCode(resource.code)
    return (Array.isArray(tenderItems) ? (tenderItems as any[]) : []).filter((t: any) => tenderLineCode(t) === code || normalizeCode(t.description).startsWith(code + ' '))
  }
  const askUpdateBoqRatesForResource = async (resource: TenderResource) => {
    if (!projectId) return 0
    const affectedBoqIds = Array.from(new Set(getTenderLinesForResource(resource).map((l: any) => l.boq_item_id).filter(Boolean)))
    let updated = 0
    for (const boqId of affectedBoqIds) {
      const boq = (boqItems as any[]).find((b: any) => String(b.id) === String(boqId))
      if (!boq) continue
      const lines = getTenderItemsForBoq(boqId).map((l: any) => tenderLineCode(l) === normalizeCode(resource.code) ? { ...l, unit_rate: Number(resource.unit_rate ?? 0), unit: resource.unit, description: `${resource.code} — ${resource.description}` } : l)
      const total = lines.reduce((sum: number, l: any) => {
        const rate = Number(l.unit_rate ?? 0)
        const base = Number(l.qty ?? 0) * rate
        return sum + base + (base * Number(l.overhead_pct ?? 0) / 100) + (base * Number(l.profit_pct ?? 0) / 100)
      }, 0)
      const calcRate = Number(boq.boq_qty ?? 0) > 0 ? round3(total / Number(boq.boq_qty ?? 0)) : 0
      const currentBoqRate = Number((boq as any).client_rate ?? (boq as any).rate ?? 0)
      if (calcRate > 0 && Math.abs(calcRate - currentBoqRate) > 0.01) {
        const ok = confirm(`Calculated rate for BOQ ${boq.item_code} is different from BOQ rate.\n\nBOQ Rate: ${money(currentBoqRate)}\nCalculated Rate: ${money(calcRate)}\n\nDo you want to update the BOQ rate?`)
        if (ok) {
          await updateBoqItem.mutateAsync({ id: boq.id, data: { client_rate: calcRate } as any })
          updated += 1
        }
      }
    }
    if (updated > 0) await queryClient.invalidateQueries({ queryKey: ['boq'] })
    return updated
  }

  const applyResourceUpdateToTenderLines = async (resource: TenderResource) => {
    if (!projectId) return 0
    const matchingLines = getTenderLinesForResource(resource)
    for (const line of matchingLines) {
      const baseQty = tenderBaseQtyFromNotes(line)
      const wastePct = resource.category === 'Material' ? Number(resource.default_waste_pct ?? 0) : 0
      const cleanNote = cleanTenderNote(line.notes)
      const existingSteelRatio = tenderSteelRatioFromNotes(line)
      const effectiveQty = tenderEffectiveQty(baseQty, wastePct, resource.category, existingSteelRatio)
      const extraNote = resource.category === 'Material' ? `Base Qty: ${baseQty} | Waste: ${wastePct}%${existingSteelRatio > 0 ? ` | Steel Ratio: ${existingSteelRatio} ton/m3` : ''}` : ''
      await updateTenderItem.mutateAsync({
        id: line.id,
        project_id: projectId,
        patch: {
          category: resource.category as any,
          description: `${resource.code} — ${resource.description}`,
          unit: resource.unit || null,
          qty: effectiveQty,
          unit_rate: Number(resource.unit_rate ?? 0),
          notes: [cleanNote, extraNote].filter(Boolean).join(' | ') || null,
        } as any,
      })
    }
    if (matchingLines.length > 0) await queryClient.invalidateQueries({ queryKey: ['tender_items', projectId] })
    return matchingLines.length
  }

  const tenderBaseQtyFromNotes = (t: any) => {
    const m = String(t.notes ?? '').match(/Base Qty:\s*([0-9.]+)/i)
    return m ? parseFloat(m[1]) || (t.qty ?? 0) : (t.qty ?? 0)
  }
  const tenderWasteFromNotes = (t: any) => {
    const m = String(t.notes ?? '').match(/Waste:\s*([0-9.]+)%/i)
    return m ? parseFloat(m[1]) || 0 : 0
  }
  const tenderSteelRatioFromNotes = (t: any) => {
    const m = String(t.notes ?? '').match(/Steel Ratio:\s*([0-9.]+)\s*(?:ton\/m3|ton\/m³|kg\/m3|kg\/m³)/i)
    return m ? parseFloat(m[1]) || 0 : 0
  }
  const tenderEffectiveQty = (baseQty: number, wastePct: number, category?: string, steelRatioTonPerM3: number = 0) => {
    const qtyAfterWaste = String(category ?? tenderForm.category) === 'Material' ? baseQty * (1 + (wastePct || 0) / 100) : baseQty
    return round3(steelRatioTonPerM3 > 0 ? qtyAfterWaste * steelRatioTonPerM3 : qtyAfterWaste)
  }
  const cleanTenderNote = (note: any) => String(note ?? '').replace(/\s*\|?\s*Base Qty:\s*[0-9.]+\s*\|\s*Waste:\s*[0-9.]+%(\s*\|\s*Steel Ratio:\s*[0-9.]+\s*(?:ton\/m3|ton\/m³|kg\/m3|kg\/m³))?/i, '').replace(/\s*\|?\s*Steel Ratio:\s*[0-9.]+\s*(?:ton\/m3|ton\/m³|kg\/m3|kg\/m³)/i, '').trim()
  const startEditTenderLine = (t: any) => {
    setEditingTenderLineId(t.id)
    setTenderForm({
      ...tenderForm,
      boq_item_id: t.boq_item_id || selectedBoqForTender,
      category: t.category,
      resource_id: '',
      resource_code: String(t.description ?? '').includes('—') ? String(t.description ?? '').split('—')[0].trim() : '',
      description: String(t.description ?? '').includes('—') ? String(t.description ?? '').split('—').slice(1).join('—').trim() : String(t.description ?? ''),
      unit: t.unit ?? '',
      qty: String(tenderBaseQtyFromNotes(t)),
      waste_pct: String(tenderWasteFromNotes(t)),
      steel_ratio: String(tenderSteelRatioFromNotes(t) || ''),
      unit_rate: String(liveTenderRate(t)),
      overhead_pct: String(t.overhead_pct ?? 0),
      profit_pct: String(t.profit_pct ?? 0),
      notes: cleanTenderNote(t.notes),
    })
    setMessage('Editing cost line. Update values then press Update Cost Line.')
  }
  const cancelEditTenderLine = () => {
    setEditingTenderLineId(null)
    setTenderForm({ ...tenderForm, resource_id: '', resource_code: '', description: '', unit: '', qty: '0', waste_pct: '0', steel_ratio: '', unit_rate: '0', overhead_pct: '0', profit_pct: '0', notes: '' })
  }
  const copyTenderBreakdown = () => {
    if (!selectedBoqForTender || typeof window === 'undefined') return
    const sourceRows = getTenderItemsForBoq(selectedBoqForTender)
    if (!sourceRows.length) { alert('No breakdown lines to copy.'); return }
    const rows = sourceRows.map((t: any) => ({
      category: t.category,
      description: t.description,
      unit: t.unit,
      qty: tenderBaseQtyFromNotes(t),
      waste_pct: tenderWasteFromNotes(t),
      steel_ratio: tenderSteelRatioFromNotes(t),
      unit_rate: liveTenderRate(t),
      overhead_pct: t.overhead_pct ?? 0,
      profit_pct: t.profit_pct ?? 0,
      notes: cleanTenderNote(t.notes),
    }))
    window.localStorage.setItem('pcs_copied_tender_breakdown', JSON.stringify(rows))
    alert('Breakdown copied ✅')
    setMessage('Tender breakdown copied. Select another BOQ item and paste it.')
  }
  const pasteTenderBreakdown = async () => {
    if (!projectId || !selectedBoqForTender || typeof window === 'undefined') return
    const raw = window.localStorage.getItem('pcs_copied_tender_breakdown')
    const rows = raw ? JSON.parse(raw) : []
    if (!Array.isArray(rows) || rows.length === 0) { alert('No copied breakdown found.'); return }
    if (pasteMode === 'replace') {
      const existing = getTenderItemsForBoq(selectedBoqForTender)
      for (const row of existing as any[]) await deleteTenderItem.mutateAsync(row.id)
    }
    for (const r of rows) {
      const baseQty = Number(r.qty ?? 0)
      const wastePct = Number(r.waste_pct ?? 0)
      const steelRatio = Number(r.steel_ratio ?? 0)
      const effectiveQty = tenderEffectiveQty(baseQty, wastePct, r.category, steelRatio)
      const extraNote = r.category === 'Material' ? `Base Qty: ${baseQty} | Waste: ${wastePct}%${steelRatio > 0 ? ` | Steel Ratio: ${steelRatio} ton/m3` : ''}` : ''
      await createTenderItem.mutateAsync({
        project_id: projectId,
        boq_item_id: selectedBoqForTender,
        category: r.category,
        description: r.description,
        unit: r.unit || null,
        qty: effectiveQty,
        unit_rate: Number(r.unit_rate ?? 0),
        overhead_pct: Number(r.overhead_pct ?? 0),
        profit_pct: Number(r.profit_pct ?? 0),
        notes: [r.notes, extraNote].filter(Boolean).join(' | ') || null,
      })
    }
    setMessage(pasteMode === 'replace' ? 'Breakdown replaced successfully.' : 'Breakdown pasted successfully.')
  }
  const [projectForm, setProjectForm] = useState({ project_code: '', project_name: '', client: '', location: '' })
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editProjectForm, setEditProjectForm] = useState({ project_code: '', project_name: '', client: '', location: '', status: 'Active' })
  const SUBCONTRACTOR_TRADES = ['Excavation / حفر', 'Concrete / خرسانات', 'Finishing / تشطيبات', 'MEP / كهرباء وميكانيكا', 'Infrastructure / مرافق', 'Landscape / لاندسكيب', 'Other / أخرى']
  const [subForm, setSubForm] = useState({ subcontractor_code: '', name: '', trade_scope: '', contact_person: '', phone: '', email: '' })
  const BOQ_WORK_TYPES = ['Excavation / حفر', 'Concrete / خرسانات', 'Finishing / تشطيبات', 'MEP / كهرباء وميكانيكا', 'Infrastructure / مرافق', 'Landscape / لاندسكيب', 'Other / أخرى']
  const [boqForm, setBoqForm] = useState({ structure_id: '', work_type: '', item_code: '', description: '', unit: 'm2', boq_qty: '0', rate: '0', chapter: '', discipline: 'Structural' as Discipline, source_note: '' })
  const [breakdownForm, setBreakdownForm] = useState({ subcontractor_id: '', boq_item_id: '', assignment_key: '', boq_qty: '0', rate: '0', structure_id: '', structure_label: '', project_model: '', notes: '' })
  const [qsForm, setQsForm] = useState({ boq_item_id: '', assignment_key: '', actual_survey_qty: '', notes: '' })
  const [certForm, setCertForm] = useState({ subcontractor_id: '', invoice_no: '', invoice_date: today(), period_end: today(), gross_amount: '0', retention_pct: '5', retention_release_amount: '0', retention_release_remarks: '', remarks: '' })
  const [technicalForm, setTechnicalForm] = useState({ subcontractor_id: '', record_type: 'Shop Drawing', reference_no: '', subject: '', discipline: 'Structural' as Discipline, due_date: today(), priority: 'Medium', comments: '' })

  // V140_06: Disciplines are project-configurable, and Contract Smart Breakdown
  // uses the exact BOQ Discipline values as Trades instead of hard-coded trade groups.
  const cleanDiscipline = (value: any) => String(value ?? '').trim()
  const uniqueSortedDisciplines = (values: any[]) => Array.from(new Set(values.map(cleanDiscipline).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const [projectDisciplines, setProjectDisciplines] = useState<string[]>([])
  const [newDisciplineName, setNewDisciplineName] = useState('')
  const [disciplineLoading, setDisciplineLoading] = useState(false)
  const defaultDisciplineOptions = useMemo(() => uniqueSortedDisciplines(DISCIPLINES), [])
  const boqDisciplines = useMemo(() => uniqueSortedDisciplines((boqItems as any[]).map((b: any) => b.discipline)), [boqItems])
  const disciplineOptions = useMemo(() => {
    const base = projectDisciplines.length ? projectDisciplines : defaultDisciplineOptions
    return uniqueSortedDisciplines([...base, ...boqDisciplines])
  }, [projectDisciplines, defaultDisciplineOptions, boqDisciplines])
  const contractTradeOptions = useMemo(() => boqDisciplines.length ? boqDisciplines : disciplineOptions, [boqDisciplines, disciplineOptions])
  const firstDiscipline = disciplineOptions[0] ?? 'Other'

  const loadProjectDisciplines = async () => {
    if (!projectId) { setProjectDisciplines(defaultDisciplineOptions); return }
    try {
      const { data, error } = await supabase
        .from('project_disciplines')
        .select('name')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      const rows = uniqueSortedDisciplines((data ?? []).map((r: any) => r.name))
      setProjectDisciplines(rows.length ? rows : defaultDisciplineOptions)
    } catch (_e) {
      setProjectDisciplines(defaultDisciplineOptions)
    }
  }

  useEffect(() => { void loadProjectDisciplines(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  useEffect(() => {
    if (!disciplineOptions.length) return
    if (!boqForm.discipline || !disciplineOptions.includes(String(boqForm.discipline))) setBoqForm(prev => ({ ...prev, discipline: firstDiscipline as Discipline }))
    if (!technicalForm.discipline || !disciplineOptions.includes(String(technicalForm.discipline))) setTechnicalForm(prev => ({ ...prev, discipline: firstDiscipline as Discipline }))
    if (!bdTrade || !contractTradeOptions.includes(String(bdTrade))) setBdTrade(contractTradeOptions[0] ?? firstDiscipline)
    if (!assignForm.trade || !contractTradeOptions.includes(String(assignForm.trade))) setAssignForm(prev => ({ ...prev, trade: (contractTradeOptions[0] ?? firstDiscipline) as any }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disciplineOptions.join('|'), contractTradeOptions.join('|')])

  const addProjectDiscipline = async () => {
    if (!projectId) { setMessage('Select a project first.'); return }
    const name = cleanDiscipline(newDisciplineName)
    if (!name) { setMessage('Write a discipline name first.'); return }
    if (disciplineOptions.map((x: string) => x.toLowerCase()).includes(name.toLowerCase())) { setMessage(`Discipline already exists: ${name}`); setNewDisciplineName(''); return }
    setDisciplineLoading(true)
    try {
      const { error } = await supabase.from('project_disciplines').upsert({ project_id: projectId, name, is_active: true, sort_order: projectDisciplines.length + 1, created_by: user?.id ?? null, updated_by: user?.id ?? null } as any, { onConflict: 'project_id,name' })
      if (error) throw error
      setNewDisciplineName('')
      await loadProjectDisciplines()
      setMessage(`Discipline added: ${name}`)
    } catch (e: any) {
      setProjectDisciplines((prev: string[]) => uniqueSortedDisciplines([...prev, name]))
      setNewDisciplineName('')
      setMessage(`Discipline added locally. Run database/V140_06_DISCIPLINE_LIBRARY.sql to persist it. ${e?.message ?? ''}`.trim())
    } finally { setDisciplineLoading(false) }
  }

  const removeProjectDiscipline = async (name: string) => {
    if (!projectId) return
    const usedCount = (boqItems as any[]).filter((b: any) => cleanDiscipline(b.discipline).toLowerCase() === cleanDiscipline(name).toLowerCase()).length
    const warning = usedCount > 0
      ? `This discipline is used by ${usedCount} BOQ item(s). Removing it from the library will NOT delete or change those BOQ items, so it will still appear in contract trades while BOQ rows use it. Continue?`
      : `Remove discipline ${name}?`
    if (!confirm(warning)) return
    setDisciplineLoading(true)
    try {
      const { error } = await supabase.from('project_disciplines').update({ is_active: false, updated_by: user?.id ?? null } as any).eq('project_id', projectId).eq('name', name)
      if (error) throw error
      setProjectDisciplines((prev: string[]) => prev.filter((d: string) => d !== name))
      setMessage(`Discipline removed from project library: ${name}`)
    } catch (e: any) {
      setProjectDisciplines((prev: string[]) => prev.filter((d: string) => d !== name))
      setMessage(`Discipline removed locally. Run V140_06 SQL for database persistence. ${e?.message ?? ''}`.trim())
    } finally { setDisciplineLoading(false) }
  }
  const [procNode, setProcNode] = useState('')
  const [procForm, setProcForm] = useState({ material: '', resource_id: '', resource_code: '', boq_item_id: '', structure_id: '', structure_ids: [] as string[], required_qty: '0', unit: 'm2', budget_unit_rate: '0', budget_amount: '0', actual_unit_rate: '0', actual_amount: '0', supplier: '', pr_date: today(), planned_delivery: today(), status: 'PR Raised' as ProcurementStatus, notes: '' })
  const [storeForm, setStoreForm] = useState({ code: '', name: '', location_type: 'Main Store', notes: '' })
  const [grnForm, setGrnForm] = useState({ procurement_id: '', location_id: '', grn_no: '', delivery_note_no: '', supplier: '', received_date: today(), material: '', resource_id: '', resource_code: '', boq_item_id: '', structure_id: '', structure_ids: [] as string[], received_qty: '0', unit: 'm2', unit_rate: '0', notes: '' })
  const [issueForm, setIssueForm] = useState({ stock_index: '', location_id: '', issue_no: '', issue_date: today(), material: '', resource_code: '', boq_item_id: '', structure_id: '', issued_qty: '0', unit: 'm2', issue_to: '', charge_to_subcontractor: false, subcontractor_id: '', deduction_amount: '0', unit_rate: '0', notes: '' })
  const [variationForm, setVariationForm] = useState({ subcontractor_id: '', boq_item_id: '', vo_no: '', description: '', type: 'Addition', qty_impact: '0', unit: 'm2', rate: '0', time_impact_days: '0', notes: '' })
  const [invoiceForm, setInvoiceForm] = useState({ id: '', invoice_no: '', invoice_date: today(), client_name: activeProject?.client ?? '', description: '', amount: '0', status: 'Draft' as ClientInvoice['status'], notes: '' })
  const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([])
  const [structureForm, setStructureForm] = useState({ code: '', name: '', type: 'Phase' as ProjectStructure['type'], parent_id: '' })
  // New tree-based structure
  const { data: structureNodes = [] } = useStructureNodes(projectId)
  const createStructureNode = useCreateStructureNode()
  const updateStructureNode = useUpdateStructureNode()
  const deleteStructureNode = useDeleteStructureNode()
  const bulkCreateStructureNodes = useBulkCreateStructureNodes()
  const reorderStructureNode = useReorderStructureNode()
  const NODE_TYPES: NodeType[] = ['project','phase','zone','cluster','building','tower','block','villa','mall','section','floor','unit','wing','basement','podium','part','custom']
  const NODE_COLORS: Record<string, string> = { project:'#1a1a2e', phase:'#1565c0', zone:'#6a1b9a', cluster:'#00695c', building:'#1a6b4a', tower:'#2e7d32', block:'#33691e', villa:'#e65100', mall:'#b71c1c', section:'#4e342e', floor:'#37474f', unit:'#546e7a', wing:'#00838f', basement:'#4527a0', podium:'#ad1457', part:'#558b2f', custom:'#888' }
  const [nodeView, setNodeView] = useState<'tree'|'table'>('tree')
  const [nodeForm, setNodeForm] = useState<{ parent_id: string; code: string; name: string; type: NodeType; description: string }>({ parent_id: '', code: '', name: '', type: 'building', description: '' })
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editNodeForm, setEditNodeForm] = useState<any>({})
  const [nodeSearch, setNodeSearch] = useState('')
  const [nodeTypeFilter, setNodeTypeFilter] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [structureImportMsg, setStructureImportMsg] = useState('')
  const [boqImportMsg, setBoqImportMsg] = useState('')
  const [structures, setStructures] = useState<ProjectStructure[]>([])
  const [selectedStructureId, setSelectedStructureId] = useState('')
  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState<string>('')
  const certSubId = certForm.subcontractor_id || null
  const { data: nextCertNo = 1 } = useNextCertNo(projectId, certSubId)
  const breakdownLookup = useMemo(() => new Map(breakdowns.map((b) => [b.id, b])), [breakdowns])
  const boqStructures = useMemo(() => structureNodes.filter((s: StructureNode) => ['project','phase','zone','cluster','building','tower','block','villa','mall','section','floor','unit','part','custom'].includes(s.type)), [structureNodes])
  const selectedBoqStructure = useMemo(() => boqStructures.find((s: StructureNode) => s.id === boqForm.structure_id) ?? null, [boqStructures, boqForm.structure_id])
  const structurePath = (id: string | null | undefined): string => {
    if (!id) return ''
    const node = structureNodes.find((n: StructureNode) => n.id === id)
    if (!node) return ''
    return node.parent_id ? structurePath(node.parent_id) + " > " + node.code : node.code
  }

  const procurementMaterialResources = useMemo(() => tenderResources.filter((r: any) => r.category === 'Material'), [tenderResources])
  // V129: BOQ is model-based; procurement can be requested for one villa or a group of villas/structures.
  // Required Qty = model BOQ material quantity × selected target structures count.
  const procurementBoqOptions = useMemo(() => (boqItems as any[]), [boqItems])
  const procurementTargetStructures = useMemo(() => structureNodes.filter((n: StructureNode) => ['villa','unit','building','tower','block','zone','phase','cluster','part','custom'].includes(n.type)), [structureNodes])
  const procurementBoqById = useMemo(() => new Map((boqItems as any[]).map((b: any) => [b.id, b])), [boqItems])
  const procurementBudgetAmount = (qty: any, rate: any) => Number(qty || 0) * Number(rate || 0)
  const procurementActualAmount = (qty: any, actualRate: any) => Number(qty || 0) * Number(actualRate || 0)
  const procurementRateVariance = (actualRate: any, budgetRate: any) => Number(actualRate || 0) - Number(budgetRate || 0)
  const procurementAmountVariance = (qty: any, actualRate: any, budgetRate: any) => procurementActualAmount(qty, actualRate) - procurementBudgetAmount(qty, budgetRate)
  const procurementActualRateValue = (row: any) => Number(row?.actual_unit_rate ?? row?.po_unit_rate ?? 0)
  const procurementActualAmountValue = (row: any) => {
    const stored = Number(row?.actual_amount ?? 0)
    if (stored) return stored
    const rate = procurementActualRateValue(row)
    return rate ? procurementActualAmount(row?.required_qty, rate) : 0
  }
  const procurementSelectedCount = (ids?: string[]) => Math.max((ids ?? procForm.structure_ids ?? []).length, 1)
  const procurementCalculatedQty = (baseQty: any, ids?: string[]) => Number(baseQty || 0) * procurementSelectedCount(ids)
  const findTenderBudgetLine = (resourceCode: string, boqId: string) => {
    const code = normalizeCode(resourceCode)
    if (!code || !boqId) return null
    return (tenderItems as any[]).find((t: any) =>
      t.category === 'Material' &&
      String(t.boq_item_id ?? '') === String(boqId) &&
      tenderLineCode(t) === code
    ) ?? null
  }
  const getProcurementMaterialOptions = (boqId: string) => {
    const tenderLines = (tenderItems as any[])
      .filter((t: any) => t.category === 'Material' && String(t.boq_item_id ?? '') === String(boqId ?? ''))
      .map((t: any) => {
        const code = tenderLineCode(t)
        const r = procurementMaterialResources.find((x: any) => normalizeCode(x.code) === code)
        const fallbackDescription = String(t.description ?? '').replace(/^.*?—\s*/, '')
        return {
          value: r?.id ?? code,
          id: r?.id ?? '',
          code,
          description: r?.description ?? fallbackDescription,
          unit: t.unit ?? r?.unit ?? '',
          unit_rate: Number(t.unit_rate ?? r?.unit_rate ?? 0),
          tender_qty: Number(t.qty ?? 0),
          source: 'cost-sheet',
        }
      })
    if (tenderLines.length) return tenderLines
    return procurementMaterialResources.map((r: any) => ({
      value: r.id,
      id: r.id,
      code: r.code,
      description: r.description,
      unit: r.unit,
      unit_rate: Number(r.unit_rate ?? 0),
      tender_qty: 0,
      source: 'library',
    }))
  }
  const applyProcurementResource = (resourceId: string) => {
    const selected = getProcurementMaterialOptions(procForm.boq_item_id).find((x: any) =>
      String(x.value ?? '') === String(resourceId ?? '') || normalizeCode(x.code) === normalizeCode(resourceId)
    )
    const r = procurementMaterialResources.find((x: any) => x.id === resourceId || normalizeCode(x.code) === normalizeCode(selected?.code ?? resourceId))
    if (!r && !selected) return setProcForm({ ...procForm, resource_id: '', resource_code: '', material: '', unit: 'm2', budget_unit_rate: '0', budget_amount: String(procurementBudgetAmount(procForm.required_qty, 0)), actual_unit_rate: '0', actual_amount: '0' })
    const resourceCode = r?.code ?? selected?.code ?? ''
    const tb: any = findTenderBudgetLine(resourceCode, procForm.boq_item_id)
    const b: any = procurementBoqById.get(procForm.boq_item_id)
    const modelQty = Number(tb?.qty ?? selected?.tender_qty ?? b?.boq_qty ?? procForm.required_qty ?? 0)
    const qty = procurementCalculatedQty(modelQty)
    const rate = Number(tb?.unit_rate ?? selected?.unit_rate ?? r?.unit_rate ?? 0)
    setProcForm({
      ...procForm,
      resource_id: r?.id ?? '',
      resource_code: resourceCode,
      material: r?.description ?? selected?.description ?? '',
      unit: tb?.unit || selected?.unit || r?.unit || procForm.unit || 'm2',
      required_qty: String(qty),
      budget_unit_rate: String(rate),
      budget_amount: String(procurementBudgetAmount(qty, rate)),
      actual_amount: String(procurementActualAmount(qty, procForm.actual_unit_rate)),
      notes: `Model qty: ${modelQty} × ${procurementSelectedCount()} selected villa(s)`,
    })
  }
  const applyProcurementBoq = (boqId: string) => {
    const b: any = procurementBoqById.get(boqId)
    if (!b) return setProcForm({ ...procForm, boq_item_id: '', required_qty: '0', budget_amount: String(procurementBudgetAmount(0, procForm.budget_unit_rate)), actual_amount: '0' })
    const tb: any = findTenderBudgetLine(procForm.resource_code, boqId)
    const modelQty = Number(tb?.qty ?? b.boq_qty ?? 0)
    const qty = procurementCalculatedQty(modelQty)
    const rate = Number(tb?.unit_rate ?? procForm.budget_unit_rate ?? 0)
    setProcForm({ ...procForm, boq_item_id: boqId, required_qty: String(qty), unit: tb?.unit || procForm.unit || b.unit || 'm2', budget_unit_rate: String(rate), budget_amount: String(procurementBudgetAmount(qty, rate)), actual_amount: String(procurementActualAmount(qty, procForm.actual_unit_rate)), notes: procForm.notes || `Model qty: ${modelQty} × ${procurementSelectedCount()} structure(s)` })
  }
  const applyProcurementStructure = (structureId: string) => {
    const ids = structureId ? [structureId] : []
    applyProcurementStructures(ids)
  }
  const applyProcurementStructures = (ids: string[]) => {
    const b: any = procurementBoqById.get(procForm.boq_item_id)
    const tb: any = findTenderBudgetLine(procForm.resource_code, procForm.boq_item_id)
    const modelQty = Number(tb?.qty ?? b?.boq_qty ?? procForm.required_qty ?? 0)
    const qty = procurementCalculatedQty(modelQty, ids)
    setProcForm({ ...procForm, structure_id: ids[0] || '', structure_ids: ids, required_qty: String(qty), budget_amount: String(procurementBudgetAmount(qty, procForm.budget_unit_rate)), actual_amount: String(procurementActualAmount(qty, procForm.actual_unit_rate)), notes: procForm.notes || `Model qty: ${modelQty} × ${Math.max(ids.length, 1)} structure(s)` })
  }

  const procurementById = useMemo(() => new Map((procurement as any[]).map((p: any) => [p.id, p])), [procurement])
  const getProcurementStructureIds = (p: any): string[] => {
    if (Array.isArray(p?.structure_ids) && p.structure_ids.length) return p.structure_ids.filter(Boolean)
    return p?.structure_id ? [p.structure_id] : []
  }
  const inventoryReceivedByProcurement = useMemo(() => {
    const m = new Map<string, number>()
    ;(inventoryGrnLines as any[]).forEach((g: any) => {
      const id = String(g.procurement_id ?? '')
      if (!id) return
      m.set(id, (m.get(id) ?? 0) + Number(g.received_qty ?? 0))
    })
    return m
  }, [inventoryGrnLines])
  const inventoryTotals = useMemo(() => {
    const receivedQty = (inventoryGrnLines as any[]).reduce((sum: number, r: any) => sum + Number(r.received_qty ?? 0), 0)
    const receivedValue = (inventoryGrnLines as any[]).reduce((sum: number, r: any) => sum + Number(r.amount ?? (Number(r.received_qty ?? 0) * Number(r.unit_rate ?? 0))), 0)
    const issuedQty = (inventoryIssueLines as any[]).reduce((sum: number, r: any) => sum + Number(r.issued_qty ?? 0), 0)
    const stockValue = (inventoryStock as any[]).reduce((sum: number, r: any) => sum + Number(r.stock_value ?? 0), 0)
    const overBudget = (inventoryCostControl as any[]).filter((r: any) => Number(r.budget_variance_amount ?? 0) > 0).length
    return { receivedQty, receivedValue, issuedQty, stockValue, overBudget }
  }, [inventoryGrnLines, inventoryIssueLines, inventoryStock, inventoryCostControl])
  const filteredInventoryStock = useMemo(() => {
    const q = String(inventoryFilter.search ?? '').toLowerCase()
    return (inventoryStock as any[]).filter((r: any) => {
      if (inventoryFilter.material && String(r.material ?? '') !== String(inventoryFilter.material)) return false
      if (inventoryFilter.locationId && String(r.location_id ?? '') !== String(inventoryFilter.locationId)) return false
      if (inventoryFilter.boqItemId && String(r.boq_item_id ?? '') !== String(inventoryFilter.boqItemId)) return false
      if (inventoryFilter.structureId && String(r.structure_id ?? '') !== String(inventoryFilter.structureId)) return false
      if (inventoryFilter.stockStatus === 'available' && Number(r.stock_qty ?? 0) <= 0) return false
      if (inventoryFilter.stockStatus === 'zero' && Number(r.stock_qty ?? 0) !== 0) return false
      if (q && ![r.material, r.resource_code, r.boq_item_code, r.boq_description, r.structure_code, r.structure_name, r.location_code, r.location_name].some((x:any)=>String(x??'').toLowerCase().includes(q))) return false
      return true
    })
  }, [inventoryStock, inventoryFilter])
  const filteredInventoryGrns = useMemo(() => {
    const q = String(inventoryFilter.search ?? '').toLowerCase()
    return (inventoryGrnLines as any[]).filter((r: any) => {
      if (!['all','grn'].includes(inventoryFilter.movement)) return false
      if (inventoryFilter.material && String(r.material ?? '') !== String(inventoryFilter.material)) return false
      if (inventoryFilter.locationId && String(r.location_id ?? '') !== String(inventoryFilter.locationId)) return false
      if (inventoryFilter.boqItemId && String(r.boq_item_id ?? '') !== String(inventoryFilter.boqItemId)) return false
      if (inventoryFilter.structureId && String(r.structure_id ?? '') !== String(inventoryFilter.structureId)) return false
      if (inventoryFilter.from && String(r.received_date ?? '') < inventoryFilter.from) return false
      if (inventoryFilter.to && String(r.received_date ?? '') > inventoryFilter.to) return false
      if (q && ![r.material, r.resource_code, r.grn_no, r.delivery_note_no, r.supplier].some((x:any)=>String(x??'').toLowerCase().includes(q))) return false
      return true
    })
  }, [inventoryGrnLines, inventoryFilter])
  const filteredInventoryIssues = useMemo(() => {
    const q = String(inventoryFilter.search ?? '').toLowerCase()
    return (inventoryIssueLines as any[]).filter((r: any) => {
      if (!['all','issue'].includes(inventoryFilter.movement)) return false
      if (inventoryFilter.material && String(r.material ?? '') !== String(inventoryFilter.material)) return false
      if (inventoryFilter.locationId && String(r.location_id ?? '') !== String(inventoryFilter.locationId)) return false
      if (inventoryFilter.boqItemId && String(r.boq_item_id ?? '') !== String(inventoryFilter.boqItemId)) return false
      if (inventoryFilter.structureId && String(r.structure_id ?? '') !== String(inventoryFilter.structureId)) return false
      if (inventoryFilter.from && String(r.issue_date ?? '') < inventoryFilter.from) return false
      if (inventoryFilter.to && String(r.issue_date ?? '') > inventoryFilter.to) return false
      if (q && ![r.material, r.resource_code, r.issue_no, r.issue_to, r.notes].some((x:any)=>String(x??'').toLowerCase().includes(q))) return false
      return true
    })
  }, [inventoryIssueLines, inventoryFilter])
  const inventoryMaterialOptions = useMemo(() => Array.from(new Set([...(inventoryStock as any[]), ...(inventoryGrnLines as any[]), ...(inventoryIssueLines as any[])].map((r:any)=>String(r.material ?? '').trim()).filter(Boolean))).sort(), [inventoryStock, inventoryGrnLines, inventoryIssueLines])
  const availableStockRows = useMemo(() => (inventoryStock as any[]).filter((s: any) => Number(s.stock_qty ?? 0) > 0.0001), [inventoryStock])
  const issueMatchesSelectedMaterial = (s: any) => {
    const codeOk = issueForm.resource_code ? normalizeCode(s.resource_code) === normalizeCode(issueForm.resource_code) : true
    const matOk = issueForm.material ? String(s.material ?? '') === String(issueForm.material ?? '') : true
    return codeOk && matOk
  }
  const issueBoqOptions = useMemo(() => {
    const rows = availableStockRows.filter(issueMatchesSelectedMaterial)
    const seen = new Set<string>()
    return rows.filter((r: any) => {
      const id = String(r.boq_item_id ?? '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [availableStockRows, issueForm.resource_code, issueForm.material])
  const issueStructureOptions = useMemo(() => {
    const rows = availableStockRows.filter((r: any) => issueMatchesSelectedMaterial(r) && (!issueForm.boq_item_id || String(r.boq_item_id ?? '') === String(issueForm.boq_item_id)))
    const seen = new Set<string>()
    return rows.filter((r: any) => {
      const id = String(r.structure_id ?? '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [availableStockRows, issueForm.resource_code, issueForm.material, issueForm.boq_item_id])
  const issueDeductionAmount = (qty: any, rate: any) => Number(qty || 0) * Number(rate || 0)
  const applyInventoryProcurement = (procurementId: string) => {
    const p: any = procurementById.get(procurementId)
    if (!p) return setGrnForm({ ...grnForm, procurement_id: '', material: '', resource_id: '', resource_code: '', boq_item_id: '', structure_id: '', structure_ids: [], received_qty: '0', unit_rate: '0' })
    const alreadyReceived = inventoryReceivedByProcurement.get(procurementId) ?? 0
    const remainingQty = Math.max(Number(p.required_qty ?? 0) - alreadyReceived, 0)
    const structureIds = getProcurementStructureIds(p)
    const structureText = structureIds.length ? structureIds.map(id => structurePath(id)).filter(Boolean).join(', ') : 'No structure link'
    setGrnForm({
      ...grnForm,
      procurement_id: procurementId,
      supplier: grnForm.supplier || p.supplier || '',
      material: p.material || '',
      resource_id: p.resource_id || '',
      resource_code: p.resource_code || '',
      boq_item_id: p.boq_item_id || '',
      structure_id: structureIds[0] || p.structure_id || '',
      structure_ids: structureIds,
      received_qty: String(remainingQty || p.required_qty || 0),
      unit: p.unit || grnForm.unit || 'm2',
      unit_rate: String(procurementActualRateValue(p) || p.budget_unit_rate || 0),
      notes: grnForm.notes || `From ${p.pr_no || 'PR'} | ${structureIds.length || 1} selected villa(s) | ${structureText} | Budget: ${money(Number(p.budget_amount ?? 0))}`,
    })
  }
  const applyInventoryStock = (index: string) => {
    const row: any = availableStockRows[Number(index)]
    if (!row) return setIssueForm({ ...issueForm, stock_index: '', material: '', resource_code: '', boq_item_id: '', structure_id: '', issued_qty: '0', unit_rate: '0', deduction_amount: '0' })
    const qty = Math.max(Number(row.stock_qty ?? 0), 0)
    const avgRate = Number(row.avg_unit_rate ?? 0)
    setIssueForm({
      ...issueForm,
      stock_index: index,
      location_id: row.location_id || issueForm.location_id || '',
      material: row.material || '',
      resource_code: row.resource_code || '',
      boq_item_id: row.boq_item_id || '',
      structure_id: row.structure_id || '',
      issued_qty: String(qty),
      unit: row.unit || issueForm.unit || 'm2',
      unit_rate: String(avgRate),
      deduction_amount: String(issueForm.charge_to_subcontractor ? issueDeductionAmount(qty, avgRate) : issueForm.deduction_amount || '0'),
    })
  }

  const boqFilterOptions = useMemo(() => {
    const units = Array.from(new Set(boqItems.map((b: any) => String(b.unit ?? '').trim()).filter(Boolean))).sort()
    const disciplines = Array.from(new Set(boqItems.map((b: any) => String(b.discipline ?? '').trim()).filter(Boolean))).sort()
    const structureIds = Array.from(new Set(boqItems.map((b: any) => b.structure_id).filter(Boolean)))
    const usedStructures = structureNodes
      .filter((node: StructureNode) => structureIds.includes(node.id))
      .sort((a: StructureNode, b: StructureNode) => String(a.code).localeCompare(String(b.code)))
    return { units, disciplines, usedStructures }
  }, [boqItems, structureNodes])

  const filteredBoqItems = useMemo(() => {
    const search = boqFilters.search.trim().toLowerCase()
    const qsBoqIds = new Set([
      ...qsEntries.map((q: any) => q.boq_item_id).filter(Boolean),
      ...qtoLines.map((q: any) => q.boq_item_id).filter(Boolean),
    ])
    const subcontractBoqIds = new Set(breakdowns.map((b: any) => b.boq_item_id).filter(Boolean))
    const duplicateKeys = new Map<string, number>()
    boqItems.forEach((b: any) => {
      const key = [normalizeCode(b.item_code), String(b.description ?? '').trim().toLowerCase(), String(b.unit ?? '').trim().toLowerCase()].join('|')
      duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1)
    })
    const minQty = boqFilters.minQty === '' ? null : Number(boqFilters.minQty)
    const maxQty = boqFilters.maxQty === '' ? null : Number(boqFilters.maxQty)
    const minRate = boqFilters.minRate === '' ? null : Number(boqFilters.minRate)
    const maxRate = boqFilters.maxRate === '' ? null : Number(boqFilters.maxRate)

    return boqItems.filter((b: any) => {
      const node = structureNodes.find((n: StructureNode) => n.id === b.structure_id)
      const rate = Number(b.client_rate ?? b.rate ?? 0)
      const qty = Number(b.boq_qty ?? 0)
      const dupKey = [normalizeCode(b.item_code), String(b.description ?? '').trim().toLowerCase(), String(b.unit ?? '').trim().toLowerCase()].join('|')
      const haystack = [b.item_code, b.description, b.unit, b.discipline, b.chapter, b.source_note, node?.code, node?.name, node?.type, String(qty), String(rate)].filter(Boolean).join(' ').toLowerCase()
      if (search && !haystack.includes(search)) return false
      if (boqFilters.structure !== 'all' && b.structure_id !== boqFilters.structure) return false
      if (boqFilters.discipline !== 'all' && String(b.discipline ?? '') !== boqFilters.discipline) return false
      if (boqFilters.unit !== 'all' && String(b.unit ?? '') !== boqFilters.unit) return false
      if (boqFilters.qtyStatus === 'hasQty' && qty <= 0) return false
      if (boqFilters.qtyStatus === 'emptyQty' && qty > 0) return false
      if (boqFilters.qsStatus === 'used' && !qsBoqIds.has(b.id)) return false
      if (boqFilters.qsStatus === 'notUsed' && qsBoqIds.has(b.id)) return false
      if (boqFilters.subcontractorStatus === 'linked' && !subcontractBoqIds.has(b.id)) return false
      if (boqFilters.subcontractorStatus === 'notLinked' && subcontractBoqIds.has(b.id)) return false
      if (boqFilters.duplicateStatus === 'duplicates' && (duplicateKeys.get(dupKey) ?? 0) < 2) return false
      if (boqFilters.duplicateStatus === 'unique' && (duplicateKeys.get(dupKey) ?? 0) > 1) return false
      if (minQty !== null && !Number.isNaN(minQty) && qty < minQty) return false
      if (maxQty !== null && !Number.isNaN(maxQty) && qty > maxQty) return false
      if (minRate !== null && !Number.isNaN(minRate) && rate < minRate) return false
      if (maxRate !== null && !Number.isNaN(maxRate) && rate > maxRate) return false
      return true
    })
  }, [boqItems, boqFilters, structureNodes, qsEntries, qtoLines, breakdowns])

  const groupedBoqItems = useMemo(() => {
    type BoqGroup = { key: string; title: string; items: any[]; totalQty: number; totalValue: number }
    type OuterGroup = { key: string; title: string; groups: BoqGroup[]; totalQty: number; totalValue: number; kind: 'structure' | 'discipline' }
    const nodeById = new Map((structureNodes as any[]).map((node: any) => [node.id, node]))
    const lineValue = (item: any) => Number(item.boq_qty || 0) * Number(item.client_rate ?? item.rate ?? 0)

    // v98 Professional BOQ hierarchy: Villa / Structure → Discipline → BOQ Items.
    // This matches the requested Excel-style report layout while keeping Code grouping available.
    if (boqGroupBy === 'structure' && boqDisciplineGrouping) {
      const structureMap = new Map<string, Map<string, BoqGroup>>()
      filteredBoqItems.forEach((item: any) => {
        const node = nodeById.get(item.structure_id)
        const outerTitle = node ? `${node.code} — ${node.name} (${node.type})` : 'No Structure'
        const outerKey = `structure:${item.structure_id || 'none'}|${outerTitle}`
        if (!structureMap.has(outerKey)) structureMap.set(outerKey, new Map())
        const discipline = String(item.discipline || 'No Discipline')
        const innerKey = `${outerKey}|discipline:${discipline}`
        const groupMap = structureMap.get(outerKey)!
        if (!groupMap.has(innerKey)) groupMap.set(innerKey, { key: innerKey, title: discipline, items: [], totalQty: 0, totalValue: 0 })
        const group = groupMap.get(innerKey)!
        group.items.push(item)
        group.totalQty += Number(item.boq_qty || 0)
        group.totalValue += lineValue(item)
      })
      return Array.from(structureMap.entries()).map(([outerKey, groupMap]) => {
        const groups = Array.from(groupMap.values()).sort((a, b) => a.title.localeCompare(b.title))
        return {
          key: outerKey,
          title: outerKey.split('|').slice(1).join('|'),
          kind: 'structure',
          groups,
          totalQty: groups.reduce((sum, g) => sum + g.totalQty, 0),
          totalValue: groups.reduce((sum, g) => sum + g.totalValue, 0),
        } as OuterGroup
      }).sort((a, b) => a.title.localeCompare(b.title))
    }

    const makeGroupTitle = (item: any) => {
      const node = nodeById.get(item.structure_id)
      if (boqGroupBy === 'structure') return node ? `${node.code} — ${node.name} (${node.type})` : 'No Structure'
      if (boqGroupBy === 'code') return `${item.item_code || 'No Code'} — ${item.description || ''}`
      return 'All Items'
    }
    const makeGroupKey = (item: any) => {
      if (boqGroupBy === 'structure') return `structure:${item.structure_id || 'none'}`
      if (boqGroupBy === 'code') return `code:${String(item.item_code || 'none').trim().toUpperCase()}|${String(item.description || '').trim().toLowerCase()}`
      return 'all'
    }
    const disciplineMap = new Map<string, Map<string, BoqGroup>>()
    filteredBoqItems.forEach((item: any) => {
      const discipline = boqDisciplineGrouping ? String(item.discipline || 'No Discipline') : 'All BOQ Items'
      const disciplineKey = `discipline:${discipline}`
      if (!disciplineMap.has(disciplineKey)) disciplineMap.set(disciplineKey, new Map())
      const groupKey = makeGroupKey(item)
      const fullKey = `${disciplineKey}|${groupKey}`
      const groupMap = disciplineMap.get(disciplineKey)!
      if (!groupMap.has(fullKey)) groupMap.set(fullKey, { key: fullKey, title: makeGroupTitle(item), items: [], totalQty: 0, totalValue: 0 })
      const group = groupMap.get(fullKey)!
      group.items.push(item)
      group.totalQty += Number(item.boq_qty || 0)
      group.totalValue += lineValue(item)
    })
    return Array.from(disciplineMap.entries()).map(([disciplineKey, groupMap]) => {
      const groups = Array.from(groupMap.values()).sort((a, b) => a.title.localeCompare(b.title))
      return {
        key: disciplineKey,
        title: disciplineKey.replace('discipline:', ''),
        kind: 'discipline',
        groups,
        totalQty: groups.reduce((sum, g) => sum + g.totalQty, 0),
        totalValue: groups.reduce((sum, g) => sum + g.totalValue, 0),
      } as OuterGroup
    }).sort((a, b) => a.title.localeCompare(b.title))
  }, [filteredBoqItems, structureNodes, boqGroupBy, boqDisciplineGrouping])

  // v86: project structure multipliers for BOQ / contract totals.
  // BOQ is often stored once per model/type (V1, V2, Building Type A). The contract value
  // must multiply that model BOQ by the number of real villa/unit descendants in the structure.
  const structureNodeById = useMemo(() => new Map((structureNodes as any[]).map((node: any) => [node.id, node])), [structureNodes])
  const structureChildrenByParent = useMemo(() => {
    const map = new Map<string, any[]>()
    ;(structureNodes as any[]).forEach((node: any) => {
      if (!node.parent_id) return
      const arr = map.get(node.parent_id) ?? []
      arr.push(node)
      map.set(node.parent_id, arr)
    })
    return map
  }, [structureNodes])
  const getStructureDescendants = (parentId: string): any[] => {
    const direct = structureChildrenByParent.get(parentId) ?? []
    return direct.flatMap((child: any) => [child, ...getStructureDescendants(child.id)])
  }
  // V140_07: Structure-scoped BOQ selectors.
  // Any screen that has both Structure + BOQ now filters BOQ rows to the selected structure/model.
  // If a real villa/unit is selected, we fallback to its model/ancestor BOQ scope. Repeated model codes
  // across phases are grouped together, matching the existing smart model behavior.
  const getStructureBoqScopeIds = (structureId?: string | null): Set<string> => {
    const empty = new Set<string>()
    if (!structureId) return empty
    const collectForNode = (node: any): Set<string> => {
      const ids = new Set<string>()
      const code = normalizeCode(node?.code)
      const sameCodeNodes = code
        ? (structureNodes as any[]).filter((n: any) => normalizeCode(n.code) === code)
        : [node]
      ;(sameCodeNodes.length ? sameCodeNodes : [node]).forEach((n: any) => {
        if (!n?.id) return
        ids.add(String(n.id))
        getStructureDescendants(String(n.id)).forEach((child: any) => child?.id && ids.add(String(child.id)))
      })
      return ids
    }

    let current: any = structureNodeById.get(structureId)
    while (current) {
      const scoped = collectForNode(current)
      const hasBoq = (boqItems as any[]).some((b: any) => scoped.has(String(b.structure_id ?? '')))
      if (hasBoq) return scoped
      current = current.parent_id ? structureNodeById.get(current.parent_id) : null
    }
    return new Set([String(structureId)])
  }

  const boqMatchesStructure = (item: any, structureId?: string | null) => {
    if (!structureId) return true
    return getStructureBoqScopeIds(structureId).has(String(item?.structure_id ?? ''))
  }

  const sortBoqRows = (rows: any[]) => [...rows].sort((a: any, b: any) =>
    String(a.item_code ?? a.code ?? '').localeCompare(String(b.item_code ?? b.code ?? ''), undefined, { numeric: true }) ||
    String(a.description ?? '').localeCompare(String(b.description ?? ''), undefined, { numeric: true })
  )

  const getBoqItemsForStructure = (structureId?: string | null, dedupe = false): any[] => {
    const rows = sortBoqRows((boqItems as any[]).filter((b: any) => boqMatchesStructure(b, structureId)))
    if (!dedupe) return rows
    const seen = new Set<string>()
    const unique: any[] = []
    rows.forEach((b: any) => {
      const key = [normalizeCode(b.item_code ?? b.code), String(b.description ?? '').trim().toLowerCase(), String(b.unit ?? '').trim().toLowerCase()].join('|')
      if (seen.has(key)) return
      seen.add(key)
      unique.push(b)
    })
    return unique
  }

  const structureHasBoq = (structureId?: string | null) => !!structureId && getBoqItemsForStructure(structureId, true).length > 0
  const structureBoqOptionLabel = (b: any) => {
    const node = structureNodeById.get(b?.structure_id)
    const code = b?.item_code ?? b?.code ?? 'BOQ'
    return `${code} — ${b?.description ?? ''}${b?.unit ? ` (${b.unit})` : ''}${node ? ` · ${node.code}` : ''}`
  }

  const pricingBasisToContractType = (basis: string) => (
    basis === 'lump_sum' ? 'Lump Sum / مقطوعية' :
    basis === 'dayworks' ? 'Dayworks / يوميات' :
    basis === 'supply_apply' ? 'Supply & Apply / توريد وتركيب' :
    basis === 'labor_only' ? 'Labor Only / مصنعية فقط' :
    'BOQ Unit Rate'
  )

  const startEditBreakdownLine = (row: any) => {
    setEditingBreakdownId(String(row.id))
    setBreakdownEditForm({
      assignment_key: String(row.assignment_key ?? ''),
      subcontractor_id: String(row.subcontractor_id ?? ''),
      boq_item_id: String(row.boq_item_id ?? ''),
      structure_id: String(row.structure_id ?? ''),
      subcontract_qty: String(row.subcontract_qty ?? ''),
      rate: String(row.rate ?? ''),
      contract_type: String(row.contract_type ?? pricingBasisToContractType(row.pricing_basis ?? 'boq_unit_rate')),
      pricing_basis: String(row.pricing_basis ?? 'boq_unit_rate'),
      lump_sum_amount: String(row.lump_sum_amount ?? ''),
      notes: String(row.notes ?? ''),
      apply_rate_to_same_code: true,
    })
  }

  const cancelEditBreakdownLine = () => {
    setEditingBreakdownId(null)
    setBreakdownEditForm(prev => ({ ...prev, notes: '', assignment_key: '', boq_item_id: '', structure_id: '', subcontractor_id: '', subcontract_qty: '', rate: '', lump_sum_amount: '', pricing_basis: 'boq_unit_rate', contract_type: 'BOQ Unit Rate', apply_rate_to_same_code: true }))
  }

  const saveBreakdownLineEdit = async (sourceRow: any) => {
    const isLumpSumEdit = breakdownEditForm.pricing_basis === 'lump_sum'
    const lumpSumAmount = Number(breakdownEditForm.lump_sum_amount || breakdownEditForm.rate || 0)
    const qty = isLumpSumEdit ? 1 : Number(breakdownEditForm.subcontract_qty || 0)
    const rate = isLumpSumEdit ? lumpSumAmount : Number(breakdownEditForm.rate || 0)
    if (!breakdownEditForm.subcontractor_id) { setMessage('Select subcontractor first.'); return }
    if (!breakdownEditForm.boq_item_id) { setMessage('Select BOQ item first.'); return }
    if (!Number.isFinite(qty) || qty < 0) { setMessage('Enter a valid quantity.'); return }
    if (!Number.isFinite(rate) || rate < 0) { setMessage('Enter a valid rate.'); return }
    if (isLumpSumEdit && (!Number.isFinite(lumpSumAmount) || lumpSumAmount <= 0)) { setMessage('Enter a valid lump sum amount.'); return }

    const selectedBoq = (boqItems as any[]).find((b: any) => String(b.id) === String(breakdownEditForm.boq_item_id))
    const selectedNode = (structureNodes as any[]).find((n: any) => String(n.id) === String(breakdownEditForm.structure_id))
    const fallbackCode = sourceRow.boq_items?.item_code ?? selectedBoq?.item_code ?? selectedBoq?.code ?? 'BOQ'
    const fallbackNodeCode = selectedNode?.code ?? sourceRow.project_model ?? 'NA'
    const assignmentKey = breakdownEditForm.assignment_key.trim() || `${fallbackCode}-${fallbackNodeCode}`
    const nextBoqCode = normalizeCode(selectedBoq?.item_code ?? selectedBoq?.code ?? sourceRow.boq_items?.item_code ?? '')

    await run('Edit subcontractor breakdown item', async () => {
      const payload: any = {
        subcontractor_id: breakdownEditForm.subcontractor_id,
        boq_item_id: breakdownEditForm.boq_item_id,
        structure_id: breakdownEditForm.structure_id || null,
        assignment_key: assignmentKey,
        project_model: selectedNode?.name ?? sourceRow.project_model ?? null,
        subcontract_qty: qty,
        rate,
        client_rate: selectedBoq?.client_rate ?? sourceRow.client_rate ?? null,
        contract_type: breakdownEditForm.contract_type || pricingBasisToContractType(breakdownEditForm.pricing_basis),
        pricing_basis: breakdownEditForm.pricing_basis || 'boq_unit_rate',
        rate_source: breakdownEditForm.pricing_basis === 'lump_sum' ? 'manual_edit_lump_sum_qty_1' : 'manual_edit',
        lump_sum_amount: breakdownEditForm.pricing_basis === 'lump_sum' ? lumpSumAmount : null,
        notes: breakdownEditForm.notes || null,
        is_active: true,
      }
      await updateBreakdown.mutateAsync({ id: sourceRow.id, data: payload })

      if (breakdownEditForm.apply_rate_to_same_code && nextBoqCode) {
        const sameRows = (breakdowns as any[]).filter((row: any) =>
          String(row.id) !== String(sourceRow.id) &&
          String(row.subcontractor_id ?? '') === String(breakdownEditForm.subcontractor_id) &&
          normalizeCode(row.boq_items?.item_code ?? row.item_code ?? '') === nextBoqCode
        )
        for (const row of sameRows) {
          await updateBreakdown.mutateAsync({
            id: row.id,
            data: {
              rate,
              ...(payload.pricing_basis === 'lump_sum' ? { subcontract_qty: 1 } : {}),
              contract_type: payload.contract_type,
              pricing_basis: payload.pricing_basis,
              rate_source: payload.pricing_basis === 'lump_sum' ? 'manual_edit_same_subcontractor_boq_code_lump_sum_qty_1' : 'manual_edit_same_subcontractor_boq_code',
              lump_sum_amount: payload.pricing_basis === 'lump_sum' ? lumpSumAmount : null,
            } as any,
          })
        }
      }
      setBdInlineRateEdits(prev => { const next = { ...prev }; delete next[sourceRow.id]; return next })
      setEditingBreakdownId(null)
    })
  }
  const isRealUnitNode = (node: any) => ['villa', 'unit'].includes(String(node?.type ?? '').toLowerCase())
  const structureMultiplier = (structureId: any) => {
    const node = structureNodeById.get(structureId)
    if (!node) return 1
    const code = normalizeCode(node.code)
    const sameCodeNodes = (structureNodes as any[]).filter((n: any) => normalizeCode(n.code) === code)
    const sameCodeIds = new Set(sameCodeNodes.map((n: any) => n.id))
    const units = new Map<string, any>()
    sameCodeNodes.forEach((modelNode: any) => {
      getStructureDescendants(modelNode.id).forEach((child: any) => {
        if (isRealUnitNode(child) && !sameCodeIds.has(child.id)) units.set(child.id, child)
      })
    })
    if (units.size > 0) return units.size
    return isRealUnitNode(node) ? 1 : 1
  }
  const boqItemContractValue = (b: any) => Number(b.boq_qty ?? 0) * Number((b as any).client_rate ?? (b as any).rate ?? 0) * structureMultiplier(b.structure_id)

  // V131: Procurement ordering uses the same smart model selector style as the subcontractor breakdown.
  // The BOQ remains model-based; procurement targets real villas/units under the selected model node.
  const getProcurementSameTypeNodes = (nodeId: string): StructureNode[] => {
    const node = structureNodes.find((n: StructureNode) => n.id === nodeId)
    if (!node) return []
    const code = normalizeCode(node.code)
    return structureNodes.filter((n: StructureNode) => normalizeCode(n.code) === code)
  }
  const getProcurementVillasForNode = (nodeId: string): StructureNode[] => {
    const sameTypeNodes = getProcurementSameTypeNodes(nodeId)
    const sameTypeIds = new Set(sameTypeNodes.map((n: StructureNode) => n.id))
    const byId = new Map<string, StructureNode>()
    sameTypeNodes.forEach((modelNode: StructureNode) => {
      getStructureDescendants(modelNode.id).forEach((child: any) => {
        if (isRealUnitNode(child) && !sameTypeIds.has(child.id)) byId.set(child.id, child as StructureNode)
      })
    })
    return Array.from(byId.values()).sort((a: StructureNode, b: StructureNode) => {
      const aPath = structurePath(a.id)
      const bPath = structurePath(b.id)
      return aPath.localeCompare(bPath, undefined, { numeric: true })
    })
  }
  const getProcurementBoqForNode = (nodeId: string): any[] => {
    const sameTypeNodes = getProcurementSameTypeNodes(nodeId)
    const sameTypeIds = new Set(sameTypeNodes.map((n: StructureNode) => n.id))
    const byKey = new Map<string, any>()
    ;(boqItems as any[]).forEach((b: any) => {
      if (!sameTypeIds.has(String(b.structure_id ?? ''))) return
      const key = [normalizeCode(b.item_code), String(b.description ?? '').trim().toLowerCase(), String(b.unit ?? '').trim().toLowerCase()].join('|')
      if (!byKey.has(key)) byKey.set(key, b)
    })
    return Array.from(byKey.values()).sort((a: any, b: any) => String(a.item_code ?? '').localeCompare(String(b.item_code ?? ''), undefined, { numeric: true }))
  }
  const getProcurementNodeOptions = () => {
    return structureNodes
      .filter((n: StructureNode) => {
        const sameCode = structureNodes.filter((s: StructureNode) => normalizeCode(s.code) === normalizeCode(n.code))
        const firstWithBoq = sameCode.find((s: StructureNode) => (boqItems as any[]).some((b: any) => b.structure_id === s.id))
        const isCanonical = firstWithBoq ? firstWithBoq.id === n.id : sameCode[0]?.id === n.id
        const hasAnyBoq = sameCode.some((s: StructureNode) => (boqItems as any[]).some((b: any) => b.structure_id === s.id))
        return isCanonical && hasAnyBoq
      })
      .map((n: StructureNode) => {
        const sameTypeNodes = structureNodes.filter((s: StructureNode) => normalizeCode(s.code) === normalizeCode(n.code))
        const sameTypeIds = new Set(sameTypeNodes.map((s: StructureNode) => s.id))
        const totalBoq = getProcurementBoqForNode(n.id).length
        const totalVillas = sameTypeNodes.reduce((sum: number, modelNode: StructureNode) => {
          return sum + getStructureDescendants(modelNode.id).filter((v: any) => isRealUnitNode(v) && !sameTypeIds.has(v.id)).length
        }, 0)
        return { node: n, totalBoq, totalVillas }
      })
      .sort((a: any, b: any) => String(a.node.code ?? '').localeCompare(String(b.node.code ?? ''), undefined, { numeric: true }))
  }
  const getPhaseForProcurementNode = (node: StructureNode) => {
    let current: StructureNode | undefined = node
    while (current?.parent_id) {
      const parent = structureNodes.find((n: StructureNode) => n.id === current?.parent_id)
      if (!parent) break
      if (String(parent.type ?? '').toLowerCase() === 'phase') return parent
      current = parent
    }
    return null
  }
  const applyProcurementNode = (nodeId: string) => {
    setProcNode(nodeId)
    setProcForm({
      ...procForm,
      boq_item_id: '',
      structure_id: '',
      structure_ids: [] as string[],
      resource_id: '',
      resource_code: '',
      material: '',
      required_qty: '0',
      budget_unit_rate: '0',
      budget_amount: '0',
      actual_unit_rate: '0',
      actual_amount: '0',
      notes: '',
    })
  }

  useEffect(() => {
    if (!activeProject && projects.length > 0) setActiveProject(projects[0])
  }, [activeProject, projects, setActiveProject])

  useEffect(() => {
    let cancelled = false
    async function loadClientInvoices() {
      if (!projectId) {
        setClientInvoices([])
        return
      }
      setInvoiceForm((prev) => ({ ...prev, client_name: activeProject?.client ?? prev.client_name }))

      // v87: client invoices are persistent in Supabase when public.client_invoices exists.
      // localStorage is only a fallback for old deployments, not the source of truth.
      const { data, error } = await (supabase as any)
        .from('client_invoices')
        .select('id, invoice_no, invoice_date, client_name, description, amount, status, notes')
        .eq('project_id', projectId)
        .order('invoice_date', { ascending: false })

      if (!cancelled && !error) {
        setClientInvoices((data ?? []).map((row: any) => ({
          id: row.id,
          invoice_no: row.invoice_no || '',
          invoice_date: row.invoice_date || today(),
          client_name: row.client_name || '',
          description: row.description || '',
          amount: Number(row.amount ?? 0),
          status: (row.status || 'Draft') as ClientInvoice['status'],
          notes: row.notes || '',
        })))
        return
      }

      const key = `client_invoices_${projectId}`
      try {
        if (!cancelled) setClientInvoices(JSON.parse(window.localStorage.getItem(key) ?? '[]'))
      } catch {
        if (!cancelled) setClientInvoices([])
      }
    }
    loadClientInvoices()
    return () => { cancelled = true }
  }, [projectId, activeProject?.client, supabase])

  useEffect(() => {
    let cancelled = false
    async function loadStructures() {
      if (!projectId) {
        setStructures([])
        setSelectedStructureId('')
        setBoqForm((prev) => ({ ...prev, structure_id: '' }))
        setStructureForm({ code: '', name: '', type: 'Phase', parent_id: '' })
        return
      }

      const key = `project_structures_${projectId}`
      let localRows: ProjectStructure[] = []
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
        localRows = Array.isArray(parsed) ? parsed : []
      } catch {
        localRows = []
      }

      const { data: dbRows, error } = await supabase
        .from('project_structures')
        .select('id, project_id, structure_code, structure_name, structure_type, parent_id')
        .eq('project_id', projectId)
        .order('structure_name', { ascending: true })

      if (error) {
        console.error('Failed to load project structures', error)
      }

      let mapped: ProjectStructure[] = (dbRows ?? []).map((row: any) => ({
        id: row.id,
        project_id: row.project_id,
        code: row.structure_code,
        name: row.structure_name,
        type: row.structure_type,
        parent_id: row.parent_id,
      }))

      if (!mapped.length && localRows.length) {
        const tempMap = new Map<string, string>()
        const phases = localRows.filter((r) => r.type === 'Phase')
        const buildings = localRows.filter((r) => r.type === 'Building')
        const villas = localRows.filter((r) => r.type === 'Villa')
        const ordered = [...phases, ...buildings, ...villas]
        for (const row of ordered) {
          const payload = {
            project_id: projectId,
            structure_code: row.code,
            structure_name: row.name,
            structure_type: row.type,
            parent_id: row.parent_id ? (tempMap.get(row.parent_id) ?? null) : null,
            level_no: row.type === 'Phase' ? 1 : row.type === 'Building' ? 2 : 3,
            sort_order: 0,
            is_active: true,
          }
          const { data: inserted, error: insertError } = await supabase
            .from('project_structures')
            .insert(payload as any)
            .select('id, project_id, structure_code, structure_name, structure_type, parent_id')
            .single()
          if (insertError) {
            console.error('Failed to migrate local structure', insertError)
            continue
          }
          tempMap.set(row.id, inserted.id)
          mapped.push({
            id: inserted.id,
            project_id: inserted.project_id,
            code: inserted.structure_code,
            name: inserted.structure_name,
            type: inserted.structure_type,
            parent_id: inserted.parent_id,
          })
        }
      }

      if (cancelled) return
      setStructures(mapped)
      if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(mapped))
      setSelectedStructureId('')
      setBoqForm((prev) => ({ ...prev, structure_id: isUuid(prev.structure_id) && mapped.some((s) => s.id === prev.structure_id) ? prev.structure_id : '' }))
      setStructureForm({ code: '', name: '', type: 'Phase', parent_id: '' })
    }

    loadStructures()
    return () => { cancelled = true }
  }, [projectId, supabase])

  function saveStructures(next: ProjectStructure[]) {
    if (!projectId) return
    setStructures(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(`project_structures_${projectId}`, JSON.stringify(next))
  }

  async function addStructure() {
    if (!projectId || !structureForm.name || !structureForm.code) return
    const payload = {
      project_id: projectId,
      structure_code: structureForm.code,
      structure_name: structureForm.name,
      structure_type: structureForm.type,
      parent_id: structureForm.parent_id || null,
      level_no: structureForm.type === 'Phase' ? 1 : structureForm.type === 'Building' ? 2 : 3,
      sort_order: 0,
      is_active: true,
    }
    const { data, error } = await supabase
      .from('project_structures')
      .insert(payload as any)
      .select('id, project_id, structure_code, structure_name, structure_type, parent_id')
    if (error) {
      setMessage(error.message)
      return
    }
    const inserted = ((data ?? []).map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      code: row.structure_code,
      name: row.structure_name,
      type: row.structure_type,
      parent_id: row.parent_id,
    })) as ProjectStructure[])
    const next = [...inserted, ...structures]
    saveStructures(next)
    const first = inserted[0]
    if (first && (first.type === 'Building' || first.type === 'Villa') && !boqForm.structure_id) {
      setBoqForm((prev) => ({ ...prev, structure_id: first.id }))
    }
    setStructureForm({ code: '', name: '', type: structureForm.type, parent_id: '' })
    setMessage('Project structure row saved successfully.')
  }

  async function removeStructure(id: string) {
    const { error } = await supabase.from('project_structures').delete().eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    saveStructures(structures.filter((s) => s.id !== id && s.parent_id !== id))
    if (selectedStructureId === id) setSelectedStructureId('')
    if (boqForm.structure_id === id) setBoqForm((prev) => ({ ...prev, structure_id: '' }))
    setMessage('Project structure row deleted successfully.')
  }

  useEffect(() => {
    if (!boqStructures.length) {
      setBoqForm((prev) => ({ ...prev, structure_id: '' }))
      return
    }
    setBoqForm((prev) => {
      if (prev.structure_id && boqStructures.some((s) => s.id === prev.structure_id)) return prev
      return { ...prev, structure_id: boqStructures[0].id }
    })
  }, [boqStructures])

  function saveInvoices(next: ClientInvoice[]) {
    if (!projectId) return
    setClientInvoices(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(`client_invoices_${projectId}`, JSON.stringify(next))
  }

  async function saveInvoice() {
    if (!projectId) return
    const row: ClientInvoice = {
      id: invoiceForm.id || crypto.randomUUID(),
      invoice_no: invoiceForm.invoice_no,
      invoice_date: invoiceForm.invoice_date,
      client_name: invoiceForm.client_name,
      description: invoiceForm.description,
      amount: n(invoiceForm.amount),
      status: invoiceForm.status,
      notes: invoiceForm.notes || '',
    }
    const payload = {
      id: row.id,
      project_id: projectId,
      invoice_no: row.invoice_no,
      invoice_date: row.invoice_date,
      client_name: row.client_name,
      description: row.description,
      amount: row.amount,
      status: row.status,
      notes: row.notes || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await (supabase as any).from('client_invoices').upsert(payload, { onConflict: 'id' })
    const next = invoiceForm.id ? clientInvoices.map((i) => i.id === row.id ? row : i) : [row, ...clientInvoices]
    if (error) {
      console.error('Failed to save client invoice in Supabase; using local fallback', error)
      saveInvoices(next)
      setMessage('Client invoice saved locally. Run SUPABASE_V87_PRODUCTION_SAFE.sql to make it persistent.')
    } else {
      setClientInvoices(next)
      setMessage('Client invoice saved successfully.')
    }
    setInvoiceForm({ id: '', invoice_no: '', invoice_date: today(), client_name: activeProject?.client ?? '', description: '', amount: '0', status: 'Draft', notes: '' })
  }

  function editInvoice(i: ClientInvoice) {
    setInvoiceForm({ id: i.id, invoice_no: i.invoice_no, invoice_date: i.invoice_date, client_name: i.client_name, description: i.description, amount: String(i.amount), status: i.status, notes: i.notes ?? '' })
    setActiveView('client-invoices')
  }

  async function removeInvoice(id: string) {
    const { error } = await (supabase as any).from('client_invoices').delete().eq('id', id)
    const next = clientInvoices.filter((i) => i.id !== id)
    if (error) {
      console.error('Failed to delete client invoice in Supabase; using local fallback', error)
      saveInvoices(next)
      setMessage('Client invoice deleted locally. Run SUPABASE_V87_PRODUCTION_SAFE.sql to make it persistent.')
    } else {
      setClientInvoices(next)
      setMessage('Client invoice deleted successfully.')
    }
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn()
      setMessage(`${label} saved successfully.`)
      return result
    } catch (error) {
      console.error(error)
      const msg = error instanceof Error ? error.message : `Failed to save ${label.toLowerCase()}.`
      // If the DB trigger fires for cumulative qty, show a clear message
      // but don't block the user — the frontend already caps values correctly
      if (msg.toLowerCase().includes('cumulative') && msg.toLowerCase().includes('exceed')) {
        setMessage('⚠️ Database trigger blocked save. Please run SUPABASE_FIX_CUMULATIVE_TRIGGER.sql in your Supabase SQL Editor to fix this permanently.')
      } else {
        setMessage(msg)
      }
    }
  }


  function approvalMetaForTask(task: WorkflowTask) {
    if (task.entity === 'procurement') return { module: 'Procurement', action: 'PR', record_table: task.table, record_id: task.id, amount: Number(task.amount || 0) }
    if (task.entity === 'grn') return { module: 'GRN', action: 'Receive Material', record_table: task.table, record_id: task.id, amount: Number(task.amount || 0) }
    if (task.entity === 'issue') return { module: 'Issue Material', action: 'Issue to Site', record_table: task.table, record_id: task.id, amount: Number(task.amount || 0) }
    if (task.entity === 'finance') {
      const isSub = !!task.row?.subcontractor_id || !!task.row?.invoice_id || String(task.row?.record_type || '').toLowerCase().includes('subcontract')
      return { module: 'Payment', action: isSub ? 'Subcontractor Payment' : 'Supplier Payment', record_table: task.table, record_id: task.id, amount: Number(task.amount || 0) }
    }
    return { module: task.entity, action: 'Submit', record_table: task.table, record_id: task.id, amount: Number(task.amount || 0) }
  }

  async function tryApprovalEngine(task: WorkflowTask, action: WorkflowAction) {
    const meta = approvalMetaForTask(task)
    if (action === 'Submit') {
      const res = await (supabase as any).rpc('approval_submit_transaction', {
        p_module: meta.module,
        p_action: meta.action,
        p_record_table: meta.record_table,
        p_record_id: meta.record_id,
        p_project_id: projectId,
        p_amount: meta.amount,
        p_submitted_by: user?.id ?? null,
      })
      if (res.error) throw res.error
      return true
    }

    if (['Review','Approve','Return','Reject'].includes(action)) {
      const lookup = await (supabase as any).from('approval_requests')
        .select('id,status,current_step_order')
        .eq('record_table', meta.record_table)
        .eq('record_id', meta.record_id)
        .in('status', ['pending_review','pending_approval','missing_configuration'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lookup.error) throw lookup.error
      if (!lookup.data?.id) return false
      const isNegative = action === 'Return' || action === 'Reject'
      const comments = isNegative
        ? (typeof window !== 'undefined' ? window.prompt(`${action === 'Return' ? 'Not Approved / Return' : action} reason / السبب إجباري`) : '')
        : (typeof window !== 'undefined' ? window.prompt(`${action} comments / تعليق`) : '')
      if (isNegative && !String(comments || '').trim()) throw new Error('Reason is required for Not Approved / Return / Reject.')
      const res = await (supabase as any).rpc('approval_act_on_current_step', {
        p_request_id: lookup.data.id,
        p_action: action === 'Return' ? 'not_approved' : action,
        p_comments: comments || null,
        p_actor_user_id: user?.id ?? null,
        p_actor_name: user?.email ?? null,
        p_actor_email: user?.email ?? null,
      })
      if (res.error) throw res.error
      return true
    }
    return false
  }

  async function applyWorkflowAction(task: WorkflowTask, action: WorkflowAction) {
    if (!projectId) return
    await run(`Workflow ${action}`, async () => {
      if (['Submit','Review','Approve','Return','Reject'].includes(action)) {
        try {
          const handled = await tryApprovalEngine(task, action)
          if (handled) { await queryClient.invalidateQueries(); return }
        } catch (engineError) {
          console.warn('V138 approval engine fallback to V137 workflow:', engineError)
        }
      }
      const nowIso = new Date().toISOString()
      const currentStatus = wfEffectiveStatus(task.row)
      const update: any = { updated_at: nowIso }
      if (action === 'Submit') Object.assign(update, { workflow_status: 'Submitted', submitted_at: nowIso, submitted_by: user?.id ?? null })
      if (action === 'Review') Object.assign(update, { workflow_status: 'Reviewed', reviewed_at: nowIso, reviewed_by: user?.id ?? null, status: task.entity === 'finance' ? 'Reviewed' : task.row.status })
      if (action === 'Approve') Object.assign(update, { workflow_status: 'Approved', approved_at: nowIso, approved_by: user?.id ?? null })
      if (action === 'Return') Object.assign(update, { workflow_status: 'Returned', approval_status: 'returned', approval_locked: false, workflow_notes: 'Returned for correction' })
      if (action === 'Order') Object.assign(update, { workflow_status: 'Ordered', approved_at: task.row.approved_at ?? nowIso, approved_by: task.row.approved_by ?? user?.id ?? null, status: 'PO Issued', po_date: task.row.po_date ?? today(), po_number: task.row.po_number || `PO-${String(task.ref || '').replace(/[^A-Za-z0-9]/g, '').slice(-6) || crypto.randomUUID().slice(0,6).toUpperCase()}` })
      if (action === 'Post') Object.assign(update, { workflow_status: 'Posted', posted_at: nowIso, posted_by: user?.id ?? null, status: 'Posted' })
      if (action === 'Confirm') Object.assign(update, { workflow_status: 'Posted', posted_at: nowIso, posted_by: user?.id ?? null, status: 'Confirmed' })
      if (action === 'Reject') {
        const reason = typeof window !== 'undefined' ? window.prompt('Reject reason / سبب الرفض') : ''
        Object.assign(update, { workflow_status: 'Rejected', rejected_at: nowIso, rejected_by: user?.id ?? null, rejected_reason: reason || 'Rejected' })
      }
      if (action === 'Cancel') Object.assign(update, { workflow_status: 'Cancelled', status: 'Cancelled', rejected_at: nowIso, rejected_by: user?.id ?? null })

      const { error } = await (supabase as any).from(task.table).update(update).eq('id', task.id)
      if (error) throw error

      await (supabase as any).from('workflow_actions').insert({
        project_id: projectId,
        entity_type: task.entity,
        entity_table: task.table,
        entity_id: task.id,
        reference_no: task.ref,
        action,
        from_status: currentStatus,
        to_status: update.workflow_status || update.status || currentStatus,
        action_by: user?.id ?? null,
        notes: action === 'Reject' ? update.rejected_reason : null,
      })

      if (task.entity === 'issue' && action === 'Post' && task.row.is_subcontractor_charge && task.row.subcontractor_id && Number(task.row.amount || 0) > 0) {
        const sub: any = subcontractors.find((x: any) => x.id === task.row.subcontractor_id)
        await addFinanceRecord.mutateAsync({
          project_id: projectId!,
          subcontractor_id: task.row.subcontractor_id,
          invoice_id: null,
          record_type: 'Deduction',
          amount: Number(task.row.amount || 0),
          payment_date: task.row.issue_date || today(),
          payment_method: 'Inventory Issue',
          reference: task.row.issue_no,
          description: `خصم خامات منصرفة على المقاول / Material issue deduction: ${task.row.material}${task.row.structure_id ? ` | ${structurePath(task.row.structure_id)}` : ''}`,
          notes: `Auto deduction after posted inventory issue ${task.row.issue_no}`,
          status: 'Confirmed',
          workflow_status: 'Posted',
          payee_name: sub?.name ?? null,
          accounting_direction: 'خصم خامات على مقاول باطن',
          analysis: task.row.material || null,
          disbursement_entity: 'Inventory / Stores',
        } as any)
      }
      await queryClient.invalidateQueries()
    })
  }

  const financeExcelTemplateRows = () => [
    ['Date','Type','Amount','Method','Reference','Subcontractor Code','Certificate No','Cost Center Code','Description','Notes','Status','Receipt No','Payment No','Cheque No','Payee','Accounting Direction','Analysis','Disbursement Entity'],
    [today(),'Deduction',250,'Transfer','NCR-001','SC-001','','IC-001','NCR penalty / خصم مخالفة','This row will be deducted from the subcontractor certificate automatically','Confirmed','','PV-001','','شركة الالتزام','خصم على مقاول باطن','NCR','Finance'],
    [today(),'Payment',200000,'Transfer','TR-001','SC-001','CERT-001','','Payment against certificate / صرف مستخلص','','Confirmed','','PV-002','','شركة الالتزام','صرف مقاول باطن','','Bank'],
  ]

  const inventoryExcelTemplateRows = () => [
    ['Type','No','Date','Material','Resource Code','Store Code','BOQ Code','Structure Code','Qty','Unit','Rate','Supplier / Issue To','Charge To Subcontractor','Subcontractor Code','Notes'],
    ['GRN','GRN-001',today(),'Concrete','MAT-CON-180','MAIN','3.1','A2',50.4,'M3',3200,'Supplier Name','','','Receive material into stock'],
    ['Issue','ISS-001',today(),'Concrete','MAT-CON-180','MAIN','3.1','A2',10,'M3',3200,'Site / Foreman','Yes','SC-001','If charged, finance deduction will be created automatically'],
  ]

  const exportFinanceExcel = async (rows: any[]) => {
    const exportRows = [
      ['Date','Type','Amount','Debit','Credit','Method','Reference','Subcontractor Code','Subcontractor Name','Certificate No','Cost Center Code','Description','Notes','Status','Receipt No','Payment No','Cheque No','Payee','Accounting Direction','Analysis','Disbursement Entity'],
      ...rows.map((r: any) => {
        const sub: any = (r.subcontractors as any) || subcontractors.find((s: any) => s.id === r.subcontractor_id) || {}
        const cc: any = costCenters.find((c: any) => c.id === r.cost_center_id) || {}
        const direction = ['Receipt','Refund','Retention Release'].includes(r.record_type) ? 'debit' : 'credit'
        return [
          r.payment_date || '', r.record_type || '', Number(r.amount || 0), direction === 'debit' ? Number(r.amount || 0) : 0, direction === 'credit' ? Number(r.amount || 0) : 0,
          r.payment_method || '', r.reference || '', sub.subcontractor_code || '', sub.name || '', r.invoice_no || '', cc.code || '', r.description || '', r.notes || '', r.status || 'Confirmed',
          r.receipt_voucher_no || '', r.payment_voucher_no || '', r.cheque_no || '', r.payee_name || '', r.accounting_direction || '', r.analysis || '', r.disbursement_entity || '',
        ]
      }),
    ]
    await downloadXlsxFile('finance-records.xlsx', {
      'Finance Records': exportRows,
      'Import Template': financeExcelTemplateRows(),
      'Subcontractors': [['Code','Name'], ...subcontractors.map((s: any) => [s.subcontractor_code, s.name])],
      'Subcontractor Invoices': [['Invoice No','Subcontractor','Net Amount','Status'], ...certificates.map((c: any) => [c.invoice_no, (c.subcontractors as any)?.name ?? '', c.net_amount ?? 0, c.status ?? ''])],
      'Cost Centers': [['Code','Name','Type'], ...costCenters.map((c: any) => [c.code, c.name, c.type ?? ''])],
      'Valid Values': [['Finance Types'], ['Payment'], ['Receipt'], ['Retention Release'], ['Advance Payment'], ['Deduction'], ['Penalty'], ['Refund'], ['Other'], [], ['Methods'], ['Transfer'], ['Cheque'], ['Cash'], ['Bank Draft'], ['Letter of Credit'], [], ['Status'], ['Confirmed'], ['Pending'], ['Cancelled']],
    })
  }

  const exportInventoryExcel = async () => {
    const movementRows = [
      ['Type','No','Date','Material','Resource Code','Store Code','BOQ Code','Structure Code','Qty','Unit','Rate','Amount','Party','Notes'],
      ...filteredInventoryGrns.map((g: any) => ['GRN', g.grn_no || '', g.received_date || '', g.material || '', g.resource_code || '', g.location_code || '', g.boq_item_code || '', g.structure_code || '', Number(g.received_qty || 0), g.unit || '', Number(g.unit_rate || 0), Number(g.amount || 0), g.supplier || '', g.notes || '']),
      ...filteredInventoryIssues.map((i: any) => ['Issue', i.issue_no || '', i.issue_date || '', i.material || '', i.resource_code || '', i.location_code || '', i.boq_item_code || '', i.structure_code || '', Number(i.issued_qty || 0), i.unit || '', Number(i.unit_rate || 0), Number(i.amount || 0), i.issue_to || '', i.notes || '']),
    ]
    const stockRows = [
      ['Material','Resource Code','Store Code','BOQ Code','Structure Code','Stock Qty','Unit','Avg Rate','Stock Value'],
      ...filteredInventoryStock.map((s: any) => [s.material || '', s.resource_code || '', s.location_code || '', s.boq_item_code || '', s.structure_code || '', Number(s.stock_qty || 0), s.unit || '', Number(s.avg_unit_rate || 0), Number(s.stock_value || 0)]),
    ]
    await downloadXlsxFile('inventory-records.xlsx', {
      'Inventory Movements': movementRows,
      'Stock Balance': stockRows,
      'Import Template': inventoryExcelTemplateRows(),
      'Stores': [['Code','Name'], ...inventoryLocations.map((l: any) => [l.code, l.name])],
      'BOQ Items': [['Code','Description','Unit'], ...boqItems.map((b: any) => [b.item_code, b.description, b.unit])],
      'Structures': [['Code','Name','Path'], ...structureNodes.map((n: any) => [n.code, n.name, structurePath(n.id)])],
      'Subcontractors': [['Code','Name'], ...subcontractors.map((s: any) => [s.subcontractor_code, s.name])],
    })
  }

  const downloadFinanceTemplateExcel = () => downloadXlsxFile('finance-import-template.xlsx', {
    'Finance Import Template': financeExcelTemplateRows(),
    'Subcontractors': [['Code','Name'], ...subcontractors.map((s: any) => [s.subcontractor_code, s.name])],
    'Subcontractor Invoices': [['Invoice No','Subcontractor'], ...certificates.map((c: any) => [c.invoice_no, (c.subcontractors as any)?.name ?? ''])],
    'Cost Centers': [['Code','Name'], ...costCenters.map((c: any) => [c.code, c.name])],
  })

  const downloadInventoryTemplateExcel = () => downloadXlsxFile('inventory-import-template.xlsx', {
    'Inventory Import Template': inventoryExcelTemplateRows(),
    'Stores': [['Code','Name'], ...inventoryLocations.map((l: any) => [l.code, l.name])],
    'BOQ Items': [['Code','Description','Unit'], ...boqItems.map((b: any) => [b.item_code, b.description, b.unit])],
    'Structures': [['Code','Name','Path'], ...structureNodes.map((n: any) => [n.code, n.name, structurePath(n.id)])],
    'Subcontractors': [['Code','Name'], ...subcontractors.map((s: any) => [s.subcontractor_code, s.name])],
  })

  async function importFinanceExcel(file: File) {
    if (!projectId) return
    await run('Finance Excel import', async () => {
      const rows = excelObjectsFromRows(await readXlsxFirstSheetRows(file))
      let inserted = 0
      for (const row of rows) {
        const amount = excelNumber(excelPick(row, ['Amount','Debit','Credit']))
        if (!amount) continue
        const typeRaw = String(excelPick(row, ['Type','Record Type']) || (excelNumber(excelPick(row, ['Debit'])) ? 'Receipt' : 'Payment')).trim()
        const recordType = typeRaw || 'Payment'
        const subToken = String(excelPick(row, ['Subcontractor Code','Subcontractor','Subcontractor Name']) || '').trim().toLowerCase()
        const sub: any = subcontractors.find((s: any) => [s.subcontractor_code, s.name].some((x: any) => String(x ?? '').trim().toLowerCase() === subToken))
        const certNo = String(excelPick(row, ['Invoice No','Subcontractor Invoice No','Certificate No','Certificate']) || '').trim()
        const cert: any = certificates.find((c: any) => String(c.invoice_no ?? '').trim().toLowerCase() === certNo.toLowerCase())
        const ccToken = String(excelPick(row, ['Cost Center Code','Cost Center']) || '').trim().toLowerCase()
        const cc: any = costCenters.find((c: any) => [c.code, c.name].some((x: any) => String(x ?? '').trim().toLowerCase() === ccToken))
        await addFinanceRecord.mutateAsync({
          project_id: projectId!,
          subcontractor_id: sub?.id ?? null,
          invoice_id: cert?.id ?? null,
          invoice_no: cert?.invoice_no ?? (certNo || null),
          record_type: recordType,
          amount,
          payment_date: excelDateIso(excelPick(row, ['Date','Payment Date'])),
          payment_method: String(excelPick(row, ['Method','Payment Method']) || 'Transfer'),
          reference: String(excelPick(row, ['Reference','Ref']) || '') || null,
          bank_name: String(excelPick(row, ['Bank','Bank Name']) || '') || null,
          description: String(excelPick(row, ['Description','Statement','بيان']) || '') || null,
          notes: String(excelPick(row, ['Notes','ملاحظات']) || '') || null,
          status: String(excelPick(row, ['Status']) || 'Confirmed'),
          cost_center_id: cc?.id ?? null,
          cost_center_code: cc?.code ?? (ccToken || null),
          receipt_voucher_no: String(excelPick(row, ['Receipt No','Receipt Voucher No']) || '') || null,
          payment_voucher_no: String(excelPick(row, ['Payment No','Payment Voucher No']) || '') || null,
          cheque_no: String(excelPick(row, ['Cheque No','Check No']) || '') || null,
          payee_name: String(excelPick(row, ['Payee','Beneficiary']) || sub?.name || '') || null,
          accounting_direction: String(excelPick(row, ['Accounting Direction','Direction']) || '') || null,
          analysis: String(excelPick(row, ['Analysis']) || '') || null,
          disbursement_entity: String(excelPick(row, ['Disbursement Entity','Entity']) || '') || null,
        })
        inserted++
      }
      setMessage(`Finance Excel import completed: ${inserted} record(s).`)
    })
  }

  async function importInventoryExcel(file: File) {
    if (!projectId) return
    await run('Inventory Excel import', async () => {
      const rows = excelObjectsFromRows(await readXlsxFirstSheetRows(file))
      let grns = 0, issues = 0, deductions = 0
      for (const row of rows) {
        const type = String(excelPick(row, ['Type','Movement']) || 'GRN').trim().toLowerCase()
        const qty = excelNumber(excelPick(row, ['Qty','Quantity','Received Qty','Issued Qty']))
        if (!qty) continue
        const material = String(excelPick(row, ['Material','Material Description']) || '').trim()
        if (!material) continue
        const storeToken = String(excelPick(row, ['Store Code','Store']) || '').trim().toLowerCase()
        const loc: any = inventoryLocations.find((l: any) => [l.code, l.name].some((x: any) => String(x ?? '').trim().toLowerCase() === storeToken))
        const boqToken = String(excelPick(row, ['BOQ Code','BOQ','BOQ No']) || '').trim().toLowerCase()
        const boq: any = boqItems.find((b: any) => [b.item_code, b.description].some((x: any) => String(x ?? '').trim().toLowerCase() === boqToken))
        const structureToken = String(excelPick(row, ['Structure Code','Structure','Villa']) || '').trim().toLowerCase()
        const structure: any = structureNodes.find((n: any) => [n.code, n.name, structurePath(n.id)].some((x: any) => String(x ?? '').trim().toLowerCase() === structureToken))
        const rate = excelNumber(excelPick(row, ['Rate','Unit Rate']))
        const no = String(excelPick(row, ['No','GRN No','Issue No']) || '').trim()
        const date = excelDateIso(excelPick(row, ['Date','Received Date','Issue Date']))
        const resourceCode = String(excelPick(row, ['Resource Code','Material Code']) || '').trim()
        const unit = String(excelPick(row, ['Unit']) || boq?.unit || '').trim()
        const notes = String(excelPick(row, ['Notes']) || '').trim()
        if (type.includes('issue') || type.includes('صرف')) {
          const charge = excelBool(excelPick(row, ['Charge To Subcontractor','Charge','خصم']))
          const subToken = String(excelPick(row, ['Subcontractor Code','Subcontractor']) || '').trim().toLowerCase()
          const sub: any = subcontractors.find((s: any) => [s.subcontractor_code, s.name].some((x: any) => String(x ?? '').trim().toLowerCase() === subToken))
          const amount = qty * rate
          const issueNo = no || `ISS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
          await createInventoryIssueLine.mutateAsync({
            project_id: projectId,
            issue_no: issueNo,
            resource_code: resourceCode || null,
            material,
            boq_item_id: boq?.id ?? null,
            structure_id: structure?.id ?? null,
            location_id: loc?.id ?? null,
            issued_qty: qty,
            unit: unit || null,
            unit_rate: rate,
            amount,
            is_subcontractor_charge: charge,
            subcontractor_id: charge ? (sub?.id ?? null) : null,
            issue_date: date,
            issue_to: String(excelPick(row, ['Supplier / Issue To','Issue To','Party']) || '') || null,
            notes: notes || null,
            created_by: user?.id ?? null,
          })
          issues++
          if (charge && sub?.id && amount > 0) {
            await addFinanceRecord.mutateAsync({
              project_id: projectId,
              subcontractor_id: sub.id,
              invoice_id: null,
              record_type: 'Deduction',
              amount,
              payment_date: date,
              payment_method: 'Inventory Issue',
              reference: issueNo,
              description: `خصم خامات مستوردة من Excel / Imported material issue deduction: ${material}${structure?.id ? ` | ${structurePath(structure.id)}` : ''}`,
              notes,
              status: 'Confirmed',
              payee_name: sub.name ?? null,
              accounting_direction: 'خصم خامات على مقاول باطن',
              analysis: material,
              disbursement_entity: 'Inventory / Stores',
            })
            deductions++
          }
        } else {
          await createInventoryGrnLine.mutateAsync({
            project_id: projectId,
            grn_no: no || `GRN-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
            procurement_id: null,
            resource_id: null,
            resource_code: resourceCode || null,
            material,
            boq_item_id: boq?.id ?? null,
            structure_id: structure?.id ?? null,
            location_id: loc?.id ?? null,
            received_qty: qty,
            unit: unit || null,
            unit_rate: rate,
            supplier: String(excelPick(row, ['Supplier / Issue To','Supplier','Party']) || '') || null,
            received_date: date,
            delivery_note_no: String(excelPick(row, ['Delivery Note','DN']) || '') || null,
            status: 'Posted',
            notes: notes || null,
            created_by: user?.id ?? null,
          })
          grns++
        }
      }
      setMessage(`Inventory Excel import completed: ${grns} GRN, ${issues} issue(s), ${deductions} finance deduction(s).`)
    })
  }

  async function addProject() {
    await run('Project', async () => {
      const created = await createProject.mutateAsync({
        project_code: projectForm.project_code,
        project_name: projectForm.project_name,
        client: projectForm.client || null,
        location: projectForm.location || null,
        contract_value: null,
        start_date: null,
        end_date: null,
        status: 'Active',
        report_month: null,
        default_retention_pct: 5,
          notes: null,
          created_by: user?.id ?? null,
        })
      setProjectForm({ project_code: '', project_name: '', client: '', location: '' })
      setActiveProject(created)
    })
  }


  function startEditProject(p: any) {
    setEditingProjectId(p.id)
    setEditProjectForm({
      project_code: p.project_code ?? '',
      project_name: p.project_name ?? '',
      client: p.client ?? '',
      location: p.location ?? '',
      status: p.status ?? 'Active',
    })
  }

  async function saveProjectEdit(id: string) {
    await run('Project', async () => {
      const updated = await updateProject.mutateAsync({
        id,
        data: {
          project_code: editProjectForm.project_code,
          project_name: editProjectForm.project_name,
          client: editProjectForm.client || null,
          location: editProjectForm.location || null,
          status: (editProjectForm.status || 'Active') as ProjectStatus,
        },
      })
      setEditingProjectId(null)
      if (activeProject?.id === id) setActiveProject(updated)
    })
  }

  async function removeProject(id: string) {
    const p = projects.find((x: any) => x.id === id)
    const ok = window.confirm(`Delete project "${p?.project_name ?? ''}"?

If this project has linked BOQ, QS, certificates, finance, or structure data, Supabase may block deletion to protect your records.`)
    if (!ok) return
    await run('Project', async () => {
      await deleteProject.mutateAsync(id)
      if (activeProject?.id === id) setActiveProject(projects.find((x: any) => x.id !== id) ?? null)
      setMessage('Project deleted successfully.')
    })
  }

  async function linkSubcontractorToProject(subcontractorId: string, tradeScope?: string | null) {
    if (!projectId || !subcontractorId) return
    const { error } = await supabase.from('project_subcontractors').upsert({
      project_id: projectId,
      subcontractor_id: subcontractorId,
      trade_scope: tradeScope || null,
      is_active: true,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'project_id,subcontractor_id' })
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: ['subcontractors'] })
  }

  async function addSubcontractor() {
    if (!projectId) return
    await run('Subcontractor', async () => {
      const created = await createSubcontractor.mutateAsync({
        subcontractor_code: subForm.subcontractor_code,
        name: subForm.name,
        trade_scope: subForm.trade_scope || null,
        contact_person: subForm.contact_person || null,
        phone: subForm.phone || null,
        email: subForm.email || null,
        address: null,
        tax_registration_no: null,
        commercial_reg_no: null,
        default_retention_pct: 5,
        advance_amount: null,
        advance_recovery_pct: null,
        status: 'Active',
        notes: null,
      })
      await linkSubcontractorToProject(created.id, subForm.trade_scope || null)
      setAllSubcontractorsForLink((prev) => prev.some((s: any) => String(s.id) === String(created.id)) ? prev : [...prev, created])
      setSubForm({ subcontractor_code: '', name: '', trade_scope: '', contact_person: '', phone: '', email: '' })
    })
  }

  async function linkExistingSubcontractor() {
    if (!projectId || !linkExistingSubId) return
    const selected = allSubcontractorsForLink.find((s: any) => String(s.id) === String(linkExistingSubId))
    await run('Link subcontractor to project', async () => {
      await linkSubcontractorToProject(linkExistingSubId, selected?.trade_scope ?? null)
      setLinkExistingSubId('')
    })
  }

  async function addBoq() {
    if (!projectId) return
    await run('BOQ item', async () => {
      if (!isUuid(boqForm.structure_id)) throw new Error('Select a valid Building / Villa first.')
      await createBoq.mutateAsync({
        project_id: projectId,
        structure_id: boqForm.structure_id,
        item_code: boqForm.item_code,
        description: boqForm.description,
        unit: boqForm.unit,
        boq_qty: n(boqForm.boq_qty),
        client_rate: n(boqForm.rate),
        chapter: boqForm.chapter || null,
        discipline: boqForm.discipline,
        csi_ref: null,
        wbs_code: null,
        source_note: boqForm.source_note || null,
        work_type: boqForm.work_type || null,
        is_provisional: false,
      } as any)
      setBoqForm({ structure_id: boqForm.structure_id, work_type: boqForm.work_type, item_code: '', description: '', unit: 'm2', boq_qty: '0', rate: '0', chapter: '', discipline: (boqForm.discipline || firstDiscipline) as Discipline, source_note: '' })
    })
  }

  async function addBreakdown() {
    if (!projectId) return
    await run('Breakdown row', async () => {
      const boq = boqItems.find((b) => b.id === breakdownForm.boq_item_id) as BoqItemWithStructure | undefined
      if (!boq) throw new Error('Select a valid BOQ item first.')
      await createBreakdown.mutateAsync({
        project_id: projectId,
        subcontractor_id: breakdownForm.subcontractor_id,
        boq_item_id: breakdownForm.boq_item_id,
        structure_id: boq.structure_id,
        assignment_key: breakdownForm.assignment_key,
        project_model: breakdownForm.project_model || null,
        subcontract_qty: boq.boq_qty,
        rate: n(breakdownForm.rate),
        notes: breakdownForm.notes || null,
        is_active: true,
      } as any)
      setBreakdownForm({ subcontractor_id: '', boq_item_id: '', assignment_key: '', boq_qty: '0', rate: '0', structure_id: '', structure_label: '', project_model: '', notes: '' })
    })
  }

  async function addQs() {
    if (!projectId) return
    await run('QS entry', async () => {
      await createQs.mutateAsync({
        projectId,
        entries: [{
          breakdown_id: null,
          boq_item_id: qsForm.boq_item_id,
          assignment_key: qsForm.assignment_key,
          cert_no: 1,
          period_end: today(),
          boq_qty: 0,
          actual_survey_qty: qsForm.actual_survey_qty ? n(qsForm.actual_survey_qty) : null,
          notes: qsForm.notes || null,
          submitted_by: user?.id ?? null,
          submitted_at: null,
          status: 'Draft',
        }],
      })
      setQsForm({ boq_item_id: '', assignment_key: '', actual_survey_qty: '', notes: '' })
    })
  }

  async function addCertificate() {
    if (!projectId || !certForm.subcontractor_id) return
    await run('Certificate', async () => {
      const gross = n(certForm.gross_amount)
      const retentionPct = n(certForm.retention_pct)
      const retentionAmount = gross * retentionPct / 100
      const retentionReleaseAmount = n(certForm.retention_release_amount)
      const netAmount = gross - retentionAmount + retentionReleaseAmount

      // v108: restore safe auto-numbering at save-time, not only at render-time.
      // This prevents duplicate key errors when invoices were deleted/skipped or another invoice was added meanwhile.
      const subcontractorName = subcontractors.find(s => s.id === certForm.subcontractor_id)?.name ?? 'XXX'
      const prefix = subcontractorName.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase() || 'XXX'
      const buildNo = (num: number) => `INV-${prefix}-${String(num).padStart(3,'0')}`
      let invoiceNo = certForm.invoice_no.trim()
      if (!invoiceNo) {
        const { data: existingNos, error: existingErr } = await supabase
          .from('subcontractor_invoices')
          .select('invoice_no')
          .eq('project_id', projectId)
          .eq('subcontractor_id', certForm.subcontractor_id)
        if (existingErr) throw existingErr
        const maxNo = (existingNos ?? []).reduce((max: number, row: any) => {
          const raw = String(row.invoice_no ?? '')
          const trailing = raw.match(/(\d+)\s*$/)?.[1]
          const num = Number(trailing ?? 0)
          return Number.isFinite(num) ? Math.max(max, num) : max
        }, 0)
        invoiceNo = buildNo(maxNo + 1)
      } else {
        // Manual number: fail early with a clear message instead of raw DB constraint error.
        const { data: existingManual, error: manualErr } = await supabase
          .from('subcontractor_invoices')
          .select('id')
          .eq('project_id', projectId)
          .eq('subcontractor_id', certForm.subcontractor_id)
          .eq('invoice_no', invoiceNo)
          .maybeSingle()
        if (manualErr) throw manualErr
        if (existingManual?.id) throw new Error(`Invoice No ${invoiceNo} already exists for this subcontractor. Open it to edit, or leave Invoice No empty for auto numbering.`)
      }

      const draftInvoiceForPreviousPaid = {
        id: null,
        invoice_no: invoiceNo,
        subcontractor_id: certForm.subcontractor_id,
        invoice_date: certForm.invoice_date || today(),
        period_end: certForm.period_end,
      }
      const previousPaidFromFinance = financePreviousPaidForSub(certForm.subcontractor_id, draftInvoiceForPreviousPaid)

      await createCertificate.mutateAsync({
        project_id: projectId,
        subcontractor_id: certForm.subcontractor_id,
        invoice_no: invoiceNo,
        invoice_date: certForm.invoice_date || today(),
        period_end: certForm.period_end,
        gross_amount: gross,
        retention_pct: retentionPct,
        retention_amount: retentionAmount,
        retention_release_amount: retentionReleaseAmount,
        retention_release_remarks: certForm.retention_release_remarks || null,
        net_amount: Math.max(netAmount - previousPaidFromFinance, 0),
        net_payable: Math.max(netAmount - previousPaidFromFinance, 0),
        previous_paid_amount: previousPaidFromFinance,
        status: 'Draft',
        remarks: certForm.remarks || null,
      } as any)
      setCertForm({ subcontractor_id: '', invoice_no: '', invoice_date: today(), period_end: today(), gross_amount: '0', retention_pct: '5', retention_release_amount: '0', retention_release_remarks: '', remarks: '' })
    })
  }

  async function releaseSubcontractorInvoiceForApproval(invoice: any) {
    if (!projectId || !invoice?.id) return
    await run('Release Subcontractor Invoice', async () => {
      const { data, error } = await (supabase as any).rpc('certificate_release_for_approval', {
        p_invoice_id: invoice.id,
        p_released_by: user?.id ?? null,
      })
      if (error) throw error
      await queryClient.invalidateQueries()
      setMessage(`Subcontractor invoice released for approval. Request: ${String(data || '').slice(0, 8)}`)
    })
  }


  // v110: Retention release is a separate financial invoice. It does not edit old progress invoices.
  const retentionBalanceForSub = (subcontractorId: string) => {
    const activeInvoices = certificates.filter((c: any) => c.subcontractor_id === subcontractorId && String(c.status ?? '').toLowerCase() === 'approved') as any[]
    const held = activeInvoices
      .filter((c: any) => (c.invoice_type ?? 'progress') !== 'retention_release')
      .reduce((sum: number, c: any) => sum + Number(c.retention_amount ?? 0), 0)
    const released = activeInvoices
      .reduce((sum: number, c: any) => sum + Number(c.retention_release_amount ?? 0), 0)
    return { held, released, balance: Math.max(held - released, 0) }
  }

  // v111: Retention release is unified inside the normal progress invoice form.

  async function addTechnical() {
    if (!projectId) return
    await run('Technical record', async () => {
      await createTechnical.mutateAsync({
        project_id: projectId,
        subcontractor_id: technicalForm.subcontractor_id || null,
        record_type: technicalForm.record_type as any,
        reference_no: technicalForm.reference_no,
        subject: technicalForm.subject,
        discipline: technicalForm.discipline,
        revision_no: null,
        submission_date: today(),
        due_date: technicalForm.due_date,
        response_date: null,
        status: 'Submitted',
        priority: technicalForm.priority as any,
        responsible_person: null,
        comments: technicalForm.comments || null,
        attachment_url: null,
        rejection_reason: null,
        boq_item_id: null,
        created_by: user?.id ?? null,
      })
      setTechnicalForm({ subcontractor_id: '', record_type: 'Shop Drawing', reference_no: '', subject: '', discipline: (technicalForm.discipline || firstDiscipline) as Discipline, due_date: today(), priority: 'Medium', comments: '' })
    })
  }

  async function addProcurement() {
    if (!projectId) return
    await run('Procurement record', async () => {
      if (!procForm.boq_item_id) throw new Error('Select BOQ item first.')
      if (!procForm.material) throw new Error('Select material first.')
      if (procNode && getProcurementVillasForNode(procNode).length > 0 && !(procForm.structure_ids?.length)) throw new Error('Select at least one villa / structure for the order.')
      await createProcurement.mutateAsync({
        project_id: projectId,
        pr_no: `PR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        material: procForm.material,
        boq_item_id: procForm.boq_item_id || null,
        structure_id: procForm.structure_id || null,
        structure_ids: procForm.structure_ids?.length ? procForm.structure_ids : (procForm.structure_id ? [procForm.structure_id] : null),
        structure_count: procForm.structure_ids?.length || (procForm.structure_id ? 1 : 0),
        model_boq_qty: n(procForm.required_qty) / Math.max(procForm.structure_ids?.length || (procForm.structure_id ? 1 : 0), 1),
        project_model: null,
        resource_id: procForm.resource_id || null,
        resource_code: procForm.resource_code || null,
        budget_unit_rate: n(procForm.budget_unit_rate),
        budget_amount: n(procForm.budget_amount) || procurementBudgetAmount(procForm.required_qty, procForm.budget_unit_rate),
        actual_unit_rate: n(procForm.actual_unit_rate),
        actual_amount: n(procForm.actual_amount) || procurementActualAmount(procForm.required_qty, procForm.actual_unit_rate),
        rate_variance: procurementRateVariance(procForm.actual_unit_rate, procForm.budget_unit_rate),
        amount_variance: procurementAmountVariance(procForm.required_qty, procForm.actual_unit_rate, procForm.budget_unit_rate),
        required_qty: n(procForm.required_qty),
        unit: procForm.unit || null,
        supplier: procForm.supplier || null,
        pr_date: procForm.pr_date,
        rfq_date: null,
        po_date: null,
        po_number: null,
        po_value: null,
        planned_delivery: procForm.planned_delivery,
        actual_delivery: null,
        notes: procForm.notes || null,
        status: procForm.status,
        workflow_status: 'Draft',
        created_by: user?.id ?? null,
      })
      setProcForm({ material: '', resource_id: '', resource_code: '', boq_item_id: '', structure_id: '', structure_ids: [] as string[], required_qty: '0', unit: 'm2', budget_unit_rate: '0', budget_amount: '0', actual_unit_rate: '0', actual_amount: '0', supplier: '', pr_date: today(), planned_delivery: today(), status: 'PR Raised', notes: '' })
      setProcNode('')
    })
  }

  async function addInventoryLocation() {
    if (!projectId) return
    await run('Store location', async () => {
      await createInventoryLocation.mutateAsync({
        project_id: projectId,
        code: storeForm.code,
        name: storeForm.name,
        location_type: storeForm.location_type || 'Main Store',
        notes: storeForm.notes || null,
        is_active: true,
      })
      setStoreForm({ code: '', name: '', location_type: 'Main Store', notes: '' })
    })
  }

  async function addInventoryGrn() {
    if (!projectId) return
    await run('GRN', async () => {
      const grnNo = grnForm.grn_no || `GRN-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      const structureIds = (grnForm.structure_ids && grnForm.structure_ids.length)
        ? grnForm.structure_ids
        : (grnForm.structure_id ? [grnForm.structure_id] : [''])
      const splitCount = Math.max(structureIds.length, 1)
      const qtyPerStructure = n(grnForm.received_qty) / splitCount
      for (const structureId of structureIds) {
        await createInventoryGrnLine.mutateAsync({
          project_id: projectId,
          grn_no: grnNo,
          procurement_id: grnForm.procurement_id || null,
          resource_id: grnForm.resource_id || null,
          resource_code: grnForm.resource_code || null,
          material: grnForm.material,
          boq_item_id: grnForm.boq_item_id || null,
          structure_id: structureId || null,
          location_id: grnForm.location_id || null,
          received_qty: qtyPerStructure,
          unit: grnForm.unit || null,
          unit_rate: n(grnForm.unit_rate),
          supplier: grnForm.supplier || null,
          received_date: grnForm.received_date,
          delivery_note_no: grnForm.delivery_note_no || null,
          status: 'Draft',
          workflow_status: 'Draft',
          notes: [grnForm.notes, splitCount > 1 ? `Auto split GRN: total ${grnForm.received_qty} / ${splitCount} selected villa(s)` : ''].filter(Boolean).join(' | ') || null,
          created_by: user?.id ?? null,
        })
      }
      setGrnForm({ procurement_id: '', location_id: grnForm.location_id, grn_no: '', delivery_note_no: '', supplier: '', received_date: today(), material: '', resource_id: '', resource_code: '', boq_item_id: '', structure_id: '', structure_ids: [] as string[], received_qty: '0', unit: 'm2', unit_rate: '0', notes: '' })
    })
  }

  async function addInventoryIssue() {
    if (!projectId) return
    await run('Material issue', async () => {
      const issueNo = issueForm.issue_no || `ISS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      const issueAmount = n(issueForm.deduction_amount) || issueDeductionAmount(issueForm.issued_qty, issueForm.unit_rate)
      await createInventoryIssueLine.mutateAsync({
        project_id: projectId,
        issue_no: issueNo,
        resource_code: issueForm.resource_code || null,
        material: issueForm.material,
        boq_item_id: issueForm.boq_item_id || null,
        structure_id: issueForm.structure_id || null,
        location_id: issueForm.location_id || null,
        issued_qty: n(issueForm.issued_qty),
        unit: issueForm.unit || null,
        unit_rate: n(issueForm.unit_rate),
        amount: issueAmount,
        is_subcontractor_charge: !!issueForm.charge_to_subcontractor,
        subcontractor_id: issueForm.charge_to_subcontractor ? (issueForm.subcontractor_id || null) : null,
        issue_date: issueForm.issue_date,
        issue_to: issueForm.issue_to || null,
        notes: issueForm.notes || null,
        status: 'Draft',
        workflow_status: 'Draft',
        created_by: user?.id ?? null,
      })
      if (false && issueForm.charge_to_subcontractor && issueForm.subcontractor_id && issueAmount > 0) {
        const sub: any = subcontractors.find((x: any) => x.id === issueForm.subcontractor_id)
        await addFinanceRecord.mutateAsync({
          project_id: projectId!,
          subcontractor_id: issueForm.subcontractor_id,
          invoice_id: null,
          record_type: 'Deduction',
          amount: issueAmount,
          payment_date: issueForm.issue_date,
          payment_method: 'Inventory Issue',
          reference: issueNo,
          description: `خصم خامات منصرفة على المقاول / Material issue deduction: ${issueForm.material}${issueForm.structure_id ? ` | ${structurePath(issueForm.structure_id)}` : ''}`,
          notes: [`Auto deduction from inventory issue ${issueNo}`, issueForm.notes].filter(Boolean).join(' | '),
          status: 'Confirmed',
          payee_name: sub?.name ?? null,
          accounting_direction: 'خصم خامات على مقاول باطن',
          analysis: issueForm.material || null,
          disbursement_entity: 'Inventory / Stores',
        })
      }
      setIssueForm({ stock_index: '', location_id: issueForm.location_id, issue_no: '', issue_date: today(), material: '', resource_code: '', boq_item_id: '', structure_id: '', issued_qty: '0', unit: 'm2', issue_to: '', charge_to_subcontractor: false, subcontractor_id: '', deduction_amount: '0', unit_rate: '0', notes: '' })
    })
  }

  async function addVariation() {
    if (!projectId) return
    await run('Variation', async () => {
      await createVariation.mutateAsync({
        project_id: projectId,
        subcontractor_id: variationForm.subcontractor_id || null,
        boq_item_id: variationForm.boq_item_id || null,
        vo_no: variationForm.vo_no,
        description: variationForm.description,
        structure_id: null,
        type: variationForm.type as any,
        qty_impact: n(variationForm.qty_impact),
        unit: variationForm.unit || null,
        rate: n(variationForm.rate),
        time_impact_days: n(variationForm.time_impact_days),
        status: 'Draft',
        approved_value: null,
        submitted_by: user?.id ?? null,
        approved_by: null,
        approved_at: null,
        remarks: variationForm.notes || null,
      })
      setVariationForm({ subcontractor_id: '', boq_item_id: '', vo_no: '', description: '', type: 'Addition', qty_impact: '0', unit: 'm2', rate: '0', time_impact_days: '0', notes: '' })
    })
  }

  const invoiceTotal = clientInvoices.reduce((a, b) => a + (b.amount || 0), 0)
  const invoicePaid = clientInvoices.filter((i) => i.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0)
  const invoiceCertified = clientInvoices.filter((i) => i.status === 'Certified').reduce((a, b) => a + (b.amount || 0), 0)
  const invoiceOverdue = clientInvoices.filter((i) => i.status !== 'Paid' && i.status !== 'Draft').length
  const techPending = technical.filter((r) => ['Submitted', 'Under Review', 'Overdue'].includes(r.status)).length
  const techApproved = technical.filter((r) => ['Approved', 'Approved with Comments', 'Closed'].includes(r.status)).length
  const techRejected = technical.filter((r) => r.status === 'Rejected').length
  const delayedProcurement = procurement.filter((r) => ['Delayed', 'Cancelled'].includes(r.status)).length
  const variationValue = variations.reduce((sum, v) => sum + ((v.approved_value ?? v.financial_impact ?? 0) || 0), 0)
  const forecastFinal = (activeProject?.contract_value ?? 0) + variationValue
  const phaseCount = structures.filter((s) => s.type === 'Phase').length
  const buildingCount = structures.filter((s) => s.type === 'Building').length
  const villaCount = structures.filter((s) => s.type === 'Villa').length
  const selectedStructure = structures.find((s) => s.id === selectedStructureId) ?? null
  const structureBadge = selectedStructure ? `${selectedStructure.type}: ${selectedStructure.name}` : 'All Project Areas'

  const workflowTasks = useMemo<WorkflowTask[]>(() => {
    const tasks: WorkflowTask[] = []
    ;(procurement as any[]).forEach((r: any) => {
      const status = wfEffectiveStatus(r)
      const raw = wfLower(status)
      if (!['posted','confirmed','delivered','cancelled','canceled','rejected','closed'].includes(raw)) {
        tasks.push({ entity: 'procurement', table: 'procurement_records', id: r.id, ref: r.pr_no || 'PR', title: r.material || 'Procurement request', qty: Number(r.required_qty || 0), amount: Number(r.actual_amount || r.budget_amount || r.po_value || 0), date: r.pr_date, status, owner: r.supplier || 'Procurement', row: r })
      }
    })
    ;(inventoryGrnLines as any[]).forEach((r: any) => {
      const status = wfEffectiveStatus(r)
      if (!['posted','cancelled','canceled','rejected'].includes(wfLower(status))) {
        tasks.push({ entity: 'grn', table: 'inventory_grn_lines', id: r.id, ref: r.grn_no || 'GRN', title: r.material || 'GRN', qty: Number(r.received_qty || 0), amount: Number(r.amount || 0), date: r.received_date, status, owner: r.inventory_locations?.name || 'Stores', row: r })
      }
    })
    ;(inventoryIssueLines as any[]).forEach((r: any) => {
      const status = wfEffectiveStatus(r)
      if (!['posted','cancelled','canceled','rejected'].includes(wfLower(status))) {
        tasks.push({ entity: 'issue', table: 'inventory_issue_lines', id: r.id, ref: r.issue_no || 'ISS', title: r.material || 'Material issue', qty: Number(r.issued_qty || 0), amount: Number(r.amount || 0), date: r.issue_date, status, owner: r.issue_to || 'Stores', row: r })
      }
    })
    ;(financeRecords as any[]).forEach((r: any) => {
      const status = wfEffectiveStatus(r)
      if (!['confirmed','posted','cancelled','canceled','rejected'].includes(wfLower(status))) {
        tasks.push({ entity: 'finance', table: 'finance_records', id: r.id, ref: r.reference || r.payment_voucher_no || r.receipt_voucher_no || 'FIN', title: `${r.record_type || 'Finance'} — ${r.description || r.payee_name || ''}`.trim(), amount: Number(r.amount || 0), date: r.payment_date, status, owner: r.payee_name || r.subcontractors?.name || 'Finance', row: r })
      }
    })
    return tasks.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  }, [procurement, inventoryGrnLines, inventoryIssueLines, financeRecords])

  const workflowActionsFor = (task: WorkflowTask): WorkflowAction[] => {
    const s = wfLower(task.status)
    if (['returned','missing configuration'].includes(s)) return ['Submit', 'Cancel']
    if (['submitted','pending review','pending_review'].includes(s)) return ['Review', 'Return', 'Reject']
    if (['reviewed','pending approval','pending_approval'].includes(s)) return ['Approve', 'Return', 'Reject']
    if (task.entity === 'procurement') {
      if (WORKFLOW_DRAFT.includes(s)) return ['Submit', 'Cancel']
      if (WORKFLOW_APPROVED.includes(s)) return ['Order', 'Cancel']
      return ['Cancel']
    }
    if (task.entity === 'finance') {
      if (WORKFLOW_DRAFT.includes(s)) return ['Submit', 'Cancel']
      if (WORKFLOW_REVIEWED.includes(s)) return ['Confirm', 'Cancel']
      return ['Submit', 'Cancel']
    }
    if (WORKFLOW_DRAFT.includes(s)) return ['Submit', 'Cancel']
    if (WORKFLOW_APPROVED.includes(s)) return ['Post', 'Cancel']
    return ['Cancel']
  }

  const workflowSummary = {
    total: workflowTasks.length,
    procurement: workflowTasks.filter((x) => x.entity === 'procurement').length,
    inventory: workflowTasks.filter((x) => x.entity === 'grn' || x.entity === 'issue').length,
    finance: workflowTasks.filter((x) => x.entity === 'finance').length,
  }


  const fetchCommercialScreens = async () => {
    if (!projectId) { setClaimsData([]); setBudgetData([]); setActualCostData([]); setCashflowData([]); setApprovalData([]); setInvoiceLinesAll([]); setMaterialActualData([]); return }
    const [claimsRes, budgetRes, txRes, cashflowRes, approvalsRes, invLinesRes, materialRes] = await Promise.all([
      supabase.from('claims').select('id,claim_no,title,claim_type,status,submitted_amount,approved_amount,submission_date').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_budgets').select('id,budget_code,description,discipline,budget_amount').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('cost_transactions').select('id,description,amount,transaction_date,source').eq('project_id', projectId).order('transaction_date', { ascending: false }),
      supabase.from('cashflow_forecast').select('id,period_month,planned_revenue,planned_cost,actual_revenue,actual_cost').eq('project_id', projectId).order('period_month', { ascending: true }),
      supabase.from('approvals').select('id,entity_type,status,requested_at,notes').eq('project_id', projectId).order('requested_at', { ascending: false }),
      supabase.from('subcontractor_invoice_lines').select('id,invoice_id,project_id,subcontractor_id,breakdown_id,boq_item_id,structure_id,current_qty,new_cumulative_qty,rate,current_value,cumulative_value,approved_qty,remarks').eq('project_id', projectId),
      supabase.from('material_control').select('*').eq('project_id', projectId),
    ])
    setClaimsData((claimsRes.data as V101Claim[]) ?? [])
    setBudgetData((budgetRes.data as V101Budget[]) ?? [])
    setActualCostData((txRes.data as V101CostTx[]) ?? [])
    setCashflowData((cashflowRes.data as V101Cashflow[]) ?? [])
    setApprovalData((approvalsRes.data as V101Approval[]) ?? [])
    setInvoiceLinesAll((invLinesRes.data as V103InvoiceLine[]) ?? [])
    setMaterialActualData((materialRes.data as V104ActualMaterial[]) ?? [])
  }

  const fetchBbsLines = async () => {
    if (!projectId) { setBbsLines([]); return }
    const { data } = await supabase.from('bbs_lines').select('id,structure_node_id,boq_item_id,steel_qty_ton,effective_qs_qty,steel_ratio_ton_m3,notes').eq('project_id', projectId).order('created_at', { ascending: false })
    setBbsLines((data as V101BbsLine[]) ?? [])
  }

  useEffect(() => { void fetchCommercialScreens(); void fetchBbsLines() }, [projectId])

  // v109: Load Previous Qty from DB using invoice_no order, not period/date and not first invoice.
  // Rule: previous = latest saved cumulative for the same subcontractor + BOQ + structure + breakdown before the selected invoice.
  useEffect(() => {
    prevQtyCache.current = {}
    if (!selectedInvoiceId || !projectId) return
    const load = async () => {
      try {
        const { createClient: cc2 } = await import('@/lib/supabase/client')
        const sb2 = cc2()
        const selInv = certificates.find((c: any) => c.id === selectedInvoiceId) as any
        const subId = selInv?.subcontractor_id
        if (!subId) return

        const cacheKey = `${selectedInvoiceId}:${subId}`
        const newCache: Record<string, number> = {}

        // Prefer DB function from SUPABASE_V109_SUBCONTRACTOR_INVOICES.sql.
        const rpc = await sb2.rpc('get_previous_invoice_lines_v109', { p_current_invoice_id: selectedInvoiceId })
        if (!rpc.error && Array.isArray(rpc.data)) {
          for (const row of rpc.data as any[]) {
            const val = Number(row.previous_cumulative_qty ?? 0) || 0
            if (row.breakdown_id) newCache[`${cacheKey}:${row.breakdown_id}`] = val
            if (row.boq_item_id) newCache[`${cacheKey}:boq:${row.boq_item_id}:${row.structure_id ?? ''}`] = val
          }
          prevQtyCache.current = newCache
          setInvoiceLineEdits(prev => ({ ...prev }))
          return
        }

        // Fallback if SQL function has not been installed yet: calculate in frontend by invoice_no descending.
        const currentNo = invoiceSortNumber(selInv?.invoice_no)
        const previousInvoices = certificates
          .filter((c: any) => c.subcontractor_id === subId && c.id !== selectedInvoiceId && String(c.status ?? '').toLowerCase() !== 'cancelled')
          .filter((c: any) => invoiceSortNumber(c.invoice_no) < currentNo)
          .sort((a: any, b: any) => invoiceSortNumber(b.invoice_no) - invoiceSortNumber(a.invoice_no))

        if (!previousInvoices.length) return
        const previousIds = previousInvoices.map((x: any) => x.id)
        const { data: prevLines, error: prevErr } = await sb2
          .from('subcontractor_invoice_lines')
          .select('breakdown_id,boq_item_id,structure_id,new_cumulative_qty,approved_qty,current_qty,invoice_id')
          .in('invoice_id', previousIds)
          .eq('project_id', projectId)
          .eq('subcontractor_id', subId)
        if (prevErr) throw prevErr

        const invoiceRank = new Map(previousInvoices.map((x: any, idx: number) => [x.id, idx]))
        const sortedLines = [...(prevLines ?? [])].sort((a: any, b: any) => (invoiceRank.get(a.invoice_id) ?? 9999) - (invoiceRank.get(b.invoice_id) ?? 9999))
        for (const line of sortedLines as any[]) {
          const val = Number(line.new_cumulative_qty ?? line.approved_qty ?? line.current_qty ?? 0) || 0
          if (line.breakdown_id) {
            const key = `${cacheKey}:${line.breakdown_id}`
            if (newCache[key] === undefined) newCache[key] = val
          }
          if (line.boq_item_id) {
            const key2 = `${cacheKey}:boq:${line.boq_item_id}:${line.structure_id ?? ''}`
            if (newCache[key2] === undefined) newCache[key2] = val
          }
        }
        prevQtyCache.current = newCache
        setInvoiceLineEdits(prev => ({ ...prev }))
      } catch (e) {
        console.error('v109 prevQtyCache load error:', e)
      }
    }
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceId, projectId, certificates.length])

  const addClaim = async () => {
    if (!projectId || !claimForm.title.trim()) return
    const { error } = await supabase.from('claims').insert({ project_id: projectId, claim_no: claimForm.claim_no || null, title: claimForm.title, claim_type: claimForm.claim_type, status: 'Draft', submitted_amount: Number(claimForm.submitted_amount) || 0, description: claimForm.description || null, submission_date: today() })
    if (error) { setMessage(error.message); return }
    setClaimForm({ claim_no: '', title: '', claim_type: 'Variation', submitted_amount: '', description: '' })
    await fetchCommercialScreens(); setMessage('Claim added')
  }
  const addBudget = async () => {
    if (!projectId || !budgetForm.description.trim()) return
    const { error } = await supabase.from('project_budgets').insert({ project_id: projectId, budget_code: budgetForm.budget_code || null, description: budgetForm.description, discipline: budgetForm.discipline, budget_amount: Number(budgetForm.budget_amount) || 0 })
    if (error) { setMessage(error.message); return }
    setBudgetForm({ budget_code: '', description: '', discipline: 'Structural', budget_amount: '' })
    await fetchCommercialScreens(); setMessage('Budget line added')
  }
  const addCashflow = async () => {
    if (!projectId || !cashflowForm.period_month) return
    const derivedActualRevenue = clientInvoices.filter((i) => i.status === 'Paid' || i.status === 'Certified').reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
    const derivedActualCost = actualCostFromSubInvoices + actualCostFromMaterials
    const { error } = await supabase.from('cashflow_forecast').upsert({ project_id: projectId, period_month: cashflowForm.period_month + '-01', planned_revenue: Number(cashflowForm.planned_revenue) || 0, planned_cost: Number(cashflowForm.planned_cost) || 0, actual_revenue: derivedActualRevenue, actual_cost: derivedActualCost }, { onConflict: 'project_id,period_month' })
    if (error) { setMessage(error.message); return }
    setCashflowForm({ period_month: '', planned_revenue: '', planned_cost: '' })
    await fetchCommercialScreens(); setMessage('Cashflow updated from subcontractor invoices/client invoices')
  }
  const effectiveQsQtyForBbs = (boqId?: string | null, structureId?: string | null) => {
    // Get the BOQ item code to match by assignment_key (qs_entries often have null boq_item_id)
    const boqItem = (boqItems as any[]).find((b: any) => b.id === boqId)
    const boqCode = boqItem?.item_code ?? boqItem?.code ?? ''
    const rows = (qsEntries as any[]).filter((q: any) => {
      // Match by boq_item_id if available, otherwise match by assignment_key = BOQ item code
      const matchesBoq = boqId
        ? (q.boq_item_id === boqId || (!q.boq_item_id && boqCode && (q.assignment_key === boqCode || String(q.assignment_key ?? '').startsWith(boqCode))))
        : true
      // Match by structure if specified
      const matchesStructure = !structureId || String(q.structure_id ?? q.structure_node_id ?? '') === String(structureId)
      return matchesBoq && matchesStructure
    })
    return round3(rows.reduce((sum: number, q: any) =>
      sum + (Number(q.effective_pay_qty ?? q.actual_survey_qty ?? q.approved_qty ?? 0) || 0), 0))
  }
  const addBbsLine = async () => {
    if (!projectId || !bbsForm.boq_item_id) return
    const steelQtyTon = Number(bbsForm.steel_qty_ton) || 0
    const effectiveQty = effectiveQsQtyForBbs(bbsForm.boq_item_id, bbsForm.structure_node_id)
    const steelRatio = effectiveQty > 0 ? round3(steelQtyTon / effectiveQty) : 0
    const { error } = await supabase.from('bbs_lines').insert({ project_id: projectId, structure_node_id: bbsForm.structure_node_id || null, boq_item_id: bbsForm.boq_item_id || null, steel_qty_ton: steelQtyTon, effective_qs_qty: effectiveQty, steel_ratio_ton_m3: steelRatio, notes: bbsForm.notes || null })
    if (error) { setMessage(error.message); return }
    setBbsForm({ structure_node_id: bbsForm.structure_node_id, boq_item_id: bbsForm.boq_item_id, steel_qty_ton: '', notes: '' })
    await fetchBbsLines(); setMessage('BBS steel ratio calculated from Effective QS')
  }
  const deleteBbsLine = async (id: string) => {
    const { error } = await supabase.from('bbs_lines').delete().eq('id', id)
    if (error) { setMessage(error.message); return }
    await fetchBbsLines(); setMessage('BBS line deleted')
  }
  const tenderLineTotalCost = (line: any) => {
    const qty = Number(line.qty ?? 0) || 0
    const rate = liveTenderRate(line)
    const direct = qty * rate
    return direct + (direct * (Number(line.overhead_pct ?? 0) || 0) / 100) + (direct * (Number(line.profit_pct ?? 0) || 0) / 100)
  }
  const invoiceLineActualValue = (line: V103InvoiceLine) => Number(line.current_value ?? 0) || ((Number(line.approved_qty ?? line.current_qty ?? 0) || 0) * (Number(line.rate ?? 0) || 0))
  const materialActualValue = (row: V104ActualMaterial) => Number(row.amount ?? row.total_cost ?? row.actual_cost ?? 0) || ((Number(row.qty ?? row.quantity ?? 0) || 0) * (Number(row.rate ?? row.unit_rate ?? 0) || 0))
  const structureMatch = (a?: string | null, b?: string | null) => !b || !a || String(a) === String(b)
  const boqContractValue = (b: any) => (Number(b.qty ?? b.quantity ?? 0) || 0) * (Number(b.rate ?? b.unit_rate ?? 0) || 0)
  const targetCostForBoq = (boqId?: string | null, structureId?: string | null) => (Array.isArray(tenderItems) ? (tenderItems as any[]) : [])
    .filter((line: any) => String(line.boq_item_id ?? '') === String(boqId ?? '') && structureMatch(String(line.structure_node_id ?? line.structure_id ?? ''), structureId))
    .reduce((sum: number, line: any) => sum + tenderLineTotalCost(line), 0)
  const targetBreakdownForBoq = (boqId?: string | null, structureId?: string | null) => (Array.isArray(tenderItems) ? (tenderItems as any[]) : [])
    .filter((line: any) => String(line.boq_item_id ?? '') === String(boqId ?? '') && structureMatch(String(line.structure_node_id ?? line.structure_id ?? ''), structureId))
  const actualSubForBoq = (boqId?: string | null, structureId?: string | null, resourceCode?: string | null) => invoiceLinesAll
    .filter((line) => String(line.boq_item_id ?? '') === String(boqId ?? '') && structureMatch(String((line as any).structure_node_id ?? line.structure_id ?? ''), structureId) && (!resourceCode || normalizeCode((line as any).resource_code ?? '') === normalizeCode(resourceCode)))
    .reduce((sum, line) => sum + invoiceLineActualValue(line), 0)
  const actualMaterialForBoq = (boqId?: string | null, structureId?: string | null, resourceCode?: string | null) => materialActualData
    .filter((row) => String(row.boq_item_id ?? '') === String(boqId ?? '') && structureMatch(String(row.structure_node_id ?? row.structure_id ?? ''), structureId) && (!resourceCode || normalizeCode(row.resource_code ?? row.code ?? '') === normalizeCode(resourceCode)))
    .reduce((sum, row) => sum + materialActualValue(row), 0)
  const actualCostForBoq = (boqId?: string | null, structureId?: string | null, resourceCode?: string | null) => actualSubForBoq(boqId, structureId, resourceCode) + actualMaterialForBoq(boqId, structureId, resourceCode)
  const costControlRows = (boqItems as any[])
    .filter((b: any) => {
      const matchesBoq = !ccFilterBoq || String(b.id) === String(ccFilterBoq)
      const matchesDiscipline = !ccFilterDiscipline || String(b.discipline ?? 'Structural') === ccFilterDiscipline
      const matchesStructure = !ccFilterStructure || boqMatchesStructure(b, ccFilterStructure) || targetCostForBoq(b.id, ccFilterStructure) > 0 || actualCostForBoq(b.id, ccFilterStructure) > 0
      return matchesBoq && matchesDiscipline && matchesStructure
    })
    .map((b: any) => {
      const structureId = ccFilterStructure || String(b.structure_node_id ?? b.structure_id ?? '') || null
      const target = targetCostForBoq(b.id, ccFilterStructure || null)
      const actualSub = actualSubForBoq(b.id, ccFilterStructure || null)
      const actualMaterial = actualMaterialForBoq(b.id, ccFilterStructure || null)
      const actual = actualSub + actualMaterial
      const contract = boqContractValue(b)
      const variance = target - actual
      const margin = contract - actual
      return { boq: b, structureId, contract, target, actualSub, actualMaterial, actual, variance, margin }
    }).filter((row) => row.target !== 0 || row.actual !== 0 || row.contract !== 0)
  const costControlTarget = costControlRows.reduce((sum, row) => sum + row.target, 0)
  const costControlActual = costControlRows.reduce((sum, row) => sum + row.actual, 0)
  const costControlActualSub = costControlRows.reduce((sum, row) => sum + row.actualSub, 0)
  const costControlActualMaterial = costControlRows.reduce((sum, row) => sum + row.actualMaterial, 0)
  const costControlContract = costControlRows.reduce((sum, row) => sum + row.contract, 0)
  const costControlTopOverrun = [...costControlRows].sort((a, b) => (a.variance - b.variance)).slice(0, 8)
  const maxCostControlBar = Math.max(1, costControlTarget, costControlActual, costControlContract, ...costControlTopOverrun.map((x) => Math.abs(x.variance)))
  const ccStructureName = (id?: string | null) => structureNodes.find((x) => x.id === id)?.code ?? (id ? 'Linked structure' : 'Project')
  const ccBreakdownRows = (boqId?: string | null, structureId?: string | null) => targetBreakdownForBoq(boqId, structureId).map((line: any) => {
    const code = line.resource_code ?? line.code ?? ''
    const target = tenderLineTotalCost(line)
    const actualSub = actualSubForBoq(boqId, structureId, code || null)
    const actualMaterial = actualMaterialForBoq(boqId, structureId, code || null)
    const actual = actualSub + actualMaterial
    return { line, code, target, actualSub, actualMaterial, actual, variance: target - actual }
  })
  const actualCostFromSubInvoices = costControlActualSub
  const actualCostFromMaterials = costControlActualMaterial
  const actualRevenueFromClientInvoices = clientInvoices.filter((i) => i.status === 'Paid' || i.status === 'Certified').reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  const autoBudgetFromCostSheet = costControlTarget
  const budgetByDiscipline = disciplineOptions.map((d: string) => {
    const amount = costControlRows.filter((row) => String(row.boq.discipline ?? 'Structural') === d).reduce((sum, row) => sum + row.target, 0)
    return { discipline: d, amount }
  }).filter((x) => x.amount > 0)
  const maxBudgetDiscipline = Math.max(1, ...budgetByDiscipline.map((x) => x.amount))
  const commercialTotals = {
    budget: costControlTarget,
    actual: costControlActual,
    submittedClaims: claimsData.reduce((sum, x) => sum + (Number(x.submitted_amount) || 0), 0),
    approvedClaims: claimsData.reduce((sum, x) => sum + (Number(x.approved_amount) || 0), 0),
  }

  const bbsFilteredLines = bbsLines.filter((line) => {
    const matchesStructure = !bbsFilterStructure ||
      String(line.structure_node_id ?? '') === String(bbsFilterStructure) ||
      Boolean(line.boq_item_id && getBoqItemsForStructure(bbsFilterStructure, true).some((b: any) => String(b.id) === String(line.boq_item_id)))
    const matchesBoq = !bbsFilterBoq || String(line.boq_item_id ?? '') === String(bbsFilterBoq)
    return matchesStructure && matchesBoq
  })
  const bbsTotalTon = bbsFilteredLines.reduce((sum, x) => sum + (Number(x.steel_qty_ton) || 0), 0)
  const bbsNodeName = (id?: string | null) => structureNodes.find((x) => x.id === id)?.code ?? 'General'
  const bbsBoqName = (id?: string | null) => { const item = boqItems.find((x: any) => x.id === id); return item ? (item.item_code ?? item.code) + ' — ' + item.description : 'Not linked' }

  const NAV = [
    { id: 'home',            label: 'Home',                    icon: '⌂' },
    { id: 'approval-center', label: 'Assigned Approvals',      icon: '✓' },
    { id: 'workflow',        label: 'Workflow',                 icon: '⟳' },
    { id: 'approval-matrix', label: 'Approval Matrix',         icon: '⚙' },
    { id: 'company-branding', label: 'Company Branding',        icon: '◎' },
    { id: 'permissions',     label: 'Permissions',             icon: '🔐' },
    { id: 'dashboard',       label: 'Dashboard',               icon: '◈' },
    { id: 'projects',        label: 'Projects',                icon: '⌂' },
    { id: 'structure',       label: 'Project Structure',       icon: '▦' },
    { id: 'boq',             label: 'BOQ',                     icon: '≡' },
    { id: 'subcontractors',  label: 'Subcontractors',          icon: '◉' },
    { id: 'subcontractor-dashboard', label: 'Subcontractor Dashboard', icon: '📊' },
    { id: 'workfronts',      label: 'Workfronts',              icon: '◇' },
    { id: 'breakdown',       label: 'Subcontractor Contracts', icon: '⊞' },
    { id: 'bbs-qs',          label: 'BBS & QS',                icon: '▥' },
    { id: 'approvals',       label: 'QS Approvals',            icon: '✓' },
    { id: 'certificates',    label: 'Subcontractor Invoices',  icon: '◧' },
    { id: 'client-invoices', label: 'Client Invoices',         icon: '₤' },
    { id: 'technical',       label: 'Technical Office',        icon: '📋' },
    { id: 'procurement',     label: 'Procurement',             icon: '⬡' },
    { id: 'rfqs',            label: 'RFQs',                    icon: 'RFQ' },
    { id: 'site-progress',   label: 'Site Progress',           icon: 'SP' },
    { id: 'supplier-offers', label: 'Supplier Offers',         icon: 'SO' },
    { id: 'procurement-quotations', label: 'Procurement Quotations', icon: '⇄' },
    { id: 'quotation-comparison', label: 'Quotation Comparison', icon: 'QC' },
    { id: 'inventory',       label: 'Inventory / Stores',      icon: '▤' },
    { id: 'variations',      label: 'Variations',              icon: '△' },
    { id: 'tendering',       label: 'Tendering & Cost',        icon: '💰' },
    { id: 'finance',         label: 'Finance',                 icon: '💳' },
    { id: 'payment-requests', label: 'Payment Requests',       icon: 'PR' },
    { id: 'commercial',      label: 'Commercial',              icon: '▣' },
    { id: 'schedule',        label: 'P6 Schedule',             icon: '📅' },
    { id: 'villas',          label: 'Villa Tracker',           icon: '🏠' },
  ]


  const NAV_SECTIONS = [
    { label: 'Main', ids: ['home', 'approval-center', 'workflow'] },
    { label: 'Project', ids: ['dashboard', 'projects', 'structure', 'boq', 'bbs-qs', 'subcontractors', 'subcontractor-dashboard', 'workfronts', 'site-progress', 'breakdown', 'certificates', 'technical', 'procurement', 'rfqs', 'supplier-offers', 'procurement-quotations', 'quotation-comparison', 'inventory', 'villas'] },
    { label: 'Finance', ids: ['finance', 'payment-requests', 'client-invoices', 'commercial', 'tendering', 'variations', 'schedule'] },
    { label: 'Settings', ids: ['company-branding', 'permissions', 'approval-matrix', 'approvals'] },
  ].map((section) => ({ ...section, items: section.ids.map((id) => NAV.find((item) => item.id === id)).filter(Boolean) as typeof NAV }))

  const pageTitle = NAV.find((n) => n.id === activeView || (n.id === 'bbs-qs' && (activeView === 'bbs' || activeView === 'qs')))?.label ?? activeView
  const projectName = activeProject?.project_name ?? 'No project selected'
  const currentBbsQsTab: 'summary'|'qs'|'bbs' = activeView === 'qs' ? 'qs' : activeView === 'bbs' ? 'bbs' : bbsQsTab

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f8f6', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <nav style={{ width: sidebarOpen ? 268 : 56, background: '#fff', borderRight: '1px solid #e0e0d8', transition: 'width 0.2s', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e0e0d8', display: 'flex', alignItems: 'center', gap: 10, minHeight: 60, overflow: 'hidden' }}>
          <CompanyLogo profile={companyProfile} size={sidebarOpen ? 34 : 28} showName={sidebarOpen} variant="sidebar" />
        </div>

        {sidebarOpen && (
          <div style={{ padding: 12, borderBottom: '1px solid #e0e0d8' }}>
            <Select value={activeProject?.id ?? ''} onChange={(e) => setActiveProject(projects.find((p) => p.id === e.target.value) ?? null)}>
              <option value="">— Select project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </Select>
            <div style={{ marginTop: 8 }}>
              <Select value={selectedStructureId} onChange={(e) => setSelectedStructureId(e.target.value)}>
                <option value="">All phases / buildings / villas</option>
                {structures.map((s) => <option key={s.id} value={s.id}>{s.type} · {s.code} · {s.name}</option>)}
              </Select>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => canView(item.id))
            if (visibleItems.length === 0) return null
            return (
              <div key={section.label} style={{ padding: '4px 0 8px', borderBottom: sidebarOpen ? '1px solid #f0f1ec' : 'none' }}>
                {sidebarOpen && <div style={{ fontSize: 10, color: '#9aa39d', padding: '6px 16px 3px', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>{section.label}</div>}
                {visibleItems.map((item) => {
                  const isActive = activeView === item.id ||
                    (item.id === 'bbs-qs' && (activeView === 'bbs' || activeView === 'qs'))
                  return (
                    <div
                      key={item.id}
                      onClick={() => navigateTo(item.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: sidebarOpen ? '8px 16px' : '11px 14px', cursor: 'pointer', background: isActive ? 'rgba(29,158,117,.07)' : 'transparent', color: isActive ? '#0f6e56' : '#555', borderLeft: `3px solid ${isActive ? '#1d9e75' : 'transparent'}`, fontWeight: isActive ? 800 : 500 }}
                    >
                      <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0, color: isActive ? '#1D9E75' : '#8a948f' }}>{item.icon}</span>
                      {sidebarOpen && <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {sidebarOpen && user && (
          <div style={{ borderTop: '1px solid #e0e0d8', padding: 14, fontSize: 12 }}>
            <div style={{ marginBottom: 8, color: '#444', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            <Button tone="secondary" onClick={signOut}>Sign out</Button>
          </div>
        )}
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 56, background: '#fff', borderBottom: '1px solid #e0e0d8', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px' }}>
          <button onClick={() => setSidebarOpen((s) => !s)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#666' }}>☰</button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{pageTitle}</div>
          {isAdminOwner && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#EEEDFE', color: '#3C3489', fontWeight: 600, flexShrink: 0 }}>Admin</span>}
          <Badge text={structureBadge} tone={selectedStructure ? 'default' : 'warn'} />
          <Badge text={projectName} tone={activeProject ? 'success' : 'warn'} />
        </div>

        <div style={{ padding: 18 }}>
          {!!message && <div style={{ marginBottom: 12, padding: '10px 12px', background: '#eef9f4', color: '#0c5c46', border: '1px solid #cceadf', borderRadius: 10 }}>{message}</div>}

          {activeView === 'home' && (() => {
            const totalBudget = costControlTarget || boqItems.reduce((sum: number, b: any) => sum + boqItemContractValue(b), 0)
            const paymentsOut = (financeRecords as any[]).filter((r: any) => ['Payment','Advance Payment','Deduction','Penalty','Other'].includes(String(r.record_type ?? '')) && ['confirmed','posted'].includes(String(r.status ?? '').toLowerCase())).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0)
            const receiptsIn = (financeRecords as any[]).filter((r: any) => ['Receipt','Refund','Retention Release'].includes(String(r.record_type ?? '')) && ['confirmed','posted'].includes(String(r.status ?? '').toLowerCase())).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0)
            const cashBalance = receiptsIn - paymentsOut
            const activeProjects = projects.filter((p: any) => String(p.status ?? 'Active') === 'Active').length
            const delayedProc = (procurement as any[]).filter((p: any) => ['Delayed','Cancelled'].includes(String(p.status ?? ''))).length
            const pendingPrs = (procurement as any[]).filter((p: any) => ['PR Raised','RFQ Issued','PO Issued'].includes(String(p.status ?? ''))).length
            const pendingCertificates = (certificates as any[]).filter((c: any) => ['Draft','Submitted','Approved'].includes(String(c.status ?? ''))).length
            const lowStockRows = (inventoryStock as any[]).filter((s: any) => Number(s.stock_qty ?? 0) > 0 && Number(s.stock_qty ?? 0) <= Number(s.min_stock_qty ?? s.minimum_qty ?? 0))
            const stockRows = (inventoryStock as any[]).filter((s: any) => Number(s.stock_qty ?? 0) > 0)
            const totalStockValue = stockRows.reduce((sum: number, s: any) => sum + Number(s.stock_value ?? 0), 0)
            const issuedThisMonth = (inventoryIssueLines as any[]).filter((i: any) => String(i.issue_date ?? '').slice(0, 7) === today().slice(0, 7)).reduce((sum: number, i: any) => sum + Number(i.amount ?? 0), 0)
            const receivedThisMonth = (inventoryGrnLines as any[]).filter((g: any) => String(g.received_date ?? '').slice(0, 7) === today().slice(0, 7)).reduce((sum: number, g: any) => sum + Number(g.amount ?? 0), 0)
            const totalCertified = (certificates as any[]).reduce((sum: number, c: any) => sum + Number(c.net_payable ?? c.net_amount ?? 0), 0)
            const spendPct = totalBudget > 0 ? Math.min(100, (paymentsOut / totalBudget) * 100) : 0
            const projectHealth = [
              { label: 'On Track', value: Math.max(0, activeProjects - delayedProc), color: '#1ca365' },
              { label: 'At Risk', value: delayedProc + pendingCertificates, color: '#f5a623' },
              { label: 'Delayed', value: delayedProc, color: '#ef5350' },
            ]
            const healthTotal = Math.max(1, projectHealth.reduce((sum, x) => sum + x.value, 0))
            const cashMonths = ['Jan','Feb','Mar','Apr','May','Jun']
            const cashBars = cashMonths.map((m, i) => {
              const income = Math.max(8, 25 + i * 6 + (i % 2 ? 7 : 0))
              const outflow = Math.max(6, 16 + i * 4 + (i % 2 ? 0 : 5))
              return { m, income, outflow }
            })
            const recentRows = [
              ...(procurement as any[]).slice(0, 3).map((r: any) => ({ type: 'PR', desc: r.material || r.description || r.pr_no || 'Procurement request', amount: Number(r.actual_amount ?? r.budget_amount ?? r.amount ?? 0), status: r.status || 'PR Raised', view: 'procurement' })),
              ...(inventoryGrnLines as any[]).slice(0, 2).map((r: any) => ({ type: 'GRN', desc: r.material || r.grn_no || 'Material received', amount: Number(r.amount ?? 0), status: 'Received', view: 'inventory' })),
              ...(financeRecords as any[]).slice(0, 2).map((r: any) => ({ type: r.record_type || 'Finance', desc: r.description || r.reference || 'Finance record', amount: Number(r.amount ?? 0), status: r.status || 'Confirmed', view: 'finance' })),
            ].slice(0, 6)
            const HomeKpi = ({ title, value, sub, icon, accent }: { title: string; value: string; sub: string; icon: string; accent: string }) => (
              <div style={{ background: '#fff', border: '0.5px solid #e8e8e0', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{title}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sub}</div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}16`, color: accent, display: 'grid', placeItems: 'center', fontSize: 16 }}>{icon}</div>
                </div>
              </div>
            )
            const Quick = ({ label, icon, view, onClick }: { label: string; icon: string; view?: string; onClick?: () => void }) => (
              <button onClick={() => onClick ? onClick() : view && setActiveView(view)} style={{ border: '1px solid #e7edf4', background: '#fff', borderRadius: 14, padding: '14px 12px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, margin: '0 auto 8px', background: '#edf5ff', display: 'grid', placeItems: 'center', fontSize: 20 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1f2937' }}>{label}</div>
              </button>
            )
            return (
              <div style={{ maxWidth: 1480, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.email?.split('@')[0] ?? 'there'} 👋</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>{activeProject ? activeProject.project_name : 'Select a project to get started'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 999, padding: '9px 13px', fontSize: 12, color: '#475569' }}>📅 {new Date().toLocaleDateString('en-GB')}</span>
                    <span style={{ background: '#e8f8f2', color: '#05614b', borderRadius: 999, padding: '9px 13px', fontSize: 12, fontWeight: 800 }}>{projectName}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
                  <HomeKpi title="Projects" value={String(activeProjects || projects.length)} sub="Active projects" icon="🏗️" accent="#0d47a1" />
                  <HomeKpi title="Budget" value={money(totalBudget)} sub="from Tender / Cost Sheet" icon="💰" accent="#0f766e" />
                  <HomeKpi title="Spent" value={money(paymentsOut)} sub={`${spendPct.toFixed(1)}% of budget`} icon="↗" accent="#2563eb" />
                  <HomeKpi title="Balance" value={money(totalBudget - paymentsOut)} sub="budget remaining" icon="▣" accent="#7c3aed" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 16, marginBottom: 16 }}>
                  <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 16, padding: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>Project Status</div>
                      <button onClick={() => setActiveView('dashboard')} style={{ border: 'none', background: '#eff6ff', color: '#0d47a1', borderRadius: 999, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Open Dashboard</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20, alignItems: 'center' }}>
                      <div style={{ width: 154, height: 154, borderRadius: '50%', background: `conic-gradient(#1ca365 0 ${Math.round((projectHealth[0].value / healthTotal) * 100)}%, #f5a623 ${Math.round((projectHealth[0].value / healthTotal) * 100)}% ${Math.round(((projectHealth[0].value + projectHealth[1].value) / healthTotal) * 100)}%, #ef5350 ${Math.round(((projectHealth[0].value + projectHealth[1].value) / healthTotal) * 100)}% 100%)`, display: 'grid', placeItems: 'center', margin: '0 auto' }}>
                        <div style={{ width: 92, height: 92, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', boxShadow: 'inset 0 0 0 1px #edf2f7' }}>
                          <div><div style={{ fontSize: 24, fontWeight: 900 }}>{healthTotal}</div><div style={{ fontSize: 11, color: '#64748b' }}>Total</div></div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {projectHealth.map((h) => <div key={h.label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 99, background: h.color }} /><span style={{ fontSize: 13, color: '#475569' }}>{h.label}</span><strong>{h.value}</strong></div>)}
                        <div style={{ height: 1, background: '#eef2f7', margin: '4px 0' }} />
                        <div style={{ fontSize: 12, color: '#64748b' }}>Pending PRs: <strong>{pendingPrs}</strong> · Pending subcontractor invoices: <strong>{pendingCertificates}</strong></div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 16, padding: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' }}>
                    <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 18 }}>Cash Flow (EGP)</div>
                    <div style={{ height: 190, display: 'flex', alignItems: 'end', gap: 14, padding: '0 8px 4px', borderBottom: '1px solid #edf2f7' }}>
                      {cashBars.map((b) => <div key={b.m} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'end', height: 150 }}>
                          <div title="Inflow" style={{ width: 12, height: `${b.income * 3}px`, background: '#20b26b', borderRadius: '6px 6px 0 0' }} />
                          <div title="Outflow" style={{ width: 12, height: `${b.outflow * 3}px`, background: '#ef5350', borderRadius: '6px 6px 0 0' }} />
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{b.m}</div>
                      </div>)}
                    </div>
                    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 12, fontSize: 12, color: '#64748b' }}><span>● Inflow</span><span style={{ color: '#ef5350' }}>● Outflow</span></div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr', gap: 16 }}>
                  <div style={{ display: 'grid', gap: 16 }}>
                    <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 16, padding: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' }}>
                      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 14 }}>Quick Actions</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                        <Quick label="New PR" icon="🛒" view="procurement" />
                        <Quick label="Issue Material" icon="📦" view="inventory" />
                        <Quick label="Receive GRN" icon="✅" view="inventory" />
                        <Quick label="New Payment" icon="💳" onClick={() => { setFinanceTab('add'); setActiveView('finance') }} />
                        <Quick label="New Subcontractor Invoice" icon="📄" view="certificates" />
                      </div>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 16, padding: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>Recent Transactions</div>
                        <button onClick={() => setActiveView('finance')} style={{ border: 'none', background: 'transparent', color: '#0d47a1', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>View all</button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead><tr style={{ background: '#f8fafc' }}>{['Type','Description','Amount','Status'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                          <tbody>{recentRows.length ? recentRows.map((r, idx) => <tr key={idx} onClick={() => setActiveView(r.view)} style={{ borderBottom: '1px solid #edf2f7', cursor: 'pointer' }}><td style={{ padding: '10px 12px', fontWeight: 800 }}>{r.type}</td><td style={{ padding: '10px 12px' }}>{r.desc}</td><td style={{ padding: '10px 12px', fontWeight: 800 }}>{money(r.amount)}</td><td style={{ padding: '10px 12px' }}><Badge text={String(r.status)} tone={String(r.status).includes('Delayed') ? 'danger' : 'success'} /></td></tr>) : <tr><td colSpan={4} style={{ padding: 16, color: '#64748b' }}>No recent activity yet.</td></tr>}</tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 16 }}>
                    {/* V140: Project Workspace */}
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>Project Workspace</div>
                      <ProjectWorkspace onNavigate={navigateTo} pendingApprovals={pending?.length ?? 0} canView={canView} />
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 16, padding: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>Alerts & Notifications</div>
                        <button onClick={() => setActiveView('inventory')} style={{ border: 'none', background: 'transparent', color: '#0d47a1', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Open inventory</button>
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ padding: 12, border: '1px solid #fee2e2', background: '#fff7f7', borderRadius: 12, fontSize: 13 }}>🚨 Low stock for <strong>{lowStockRows.length}</strong> item(s)</div>
                        <div style={{ padding: 12, border: '1px solid #ffedd5', background: '#fffaf1', borderRadius: 12, fontSize: 13 }}>⚠️ <strong>{pendingPrs}</strong> PR(s) waiting approval / delivery</div>
                        <div style={{ padding: 12, border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: 12, fontSize: 13 }}>📄 <strong>{pendingCertificates}</strong> subcontractor invoice(s) need action</div>
                      </div>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 16, padding: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' }}>
                      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 14 }}>Inventory Summary</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        <HomeKpi title="Stock Value" value={money(totalStockValue)} sub={`${stockRows.length} stock rows`} icon="🏬" accent="#0f766e" />
                        <HomeKpi title="Stores" value={String(inventoryLocations.length)} sub="active locations" icon="📍" accent="#2563eb" />
                        <HomeKpi title="Received MTD" value={money(receivedThisMonth)} sub="GRN this month" icon="⬇" accent="#16a34a" />
                        <HomeKpi title="Issued MTD" value={money(issuedThisMonth)} sub="site issue this month" icon="⬆" accent="#dc2626" />
                      </div>
                    </div>

                    <div style={{ background: 'linear-gradient(135deg,#082f49,#0f766e)', color: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,.12)' }}>
                      <div style={{ fontSize: 14, opacity: .8, marginBottom: 8 }}>Cost Control Snapshot</div>
                      <div style={{ fontSize: 24, fontWeight: 900 }}>{money(totalBudget - costControlActual)}</div>
                      <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Remaining budget after actual subcontract + material cost</div>
                      <div style={{ height: 8, background: 'rgba(255,255,255,.18)', borderRadius: 999, overflow: 'hidden', marginTop: 14 }}>
                        <div style={{ width: `${totalBudget > 0 ? Math.min(100, (costControlActual / totalBudget) * 100) : 0}%`, height: '100%', background: '#7dd3fc' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}


          {activeView === 'workflow' && (() => {
            const actionButton = (task: WorkflowTask, action: WorkflowAction) => (
              <Button key={action} tone={action === 'Reject' || action === 'Cancel' ? 'danger' : action === 'Post' || action === 'Confirm' || action === 'Order' ? 'primary' : 'secondary'} onClick={() => applyWorkflowAction(task, action)}>{action}</Button>
            )
            const stageCard = (title: string, value: number, color: string) => (
              <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: 14, padding: 16, borderLeft: `4px solid ${color}` }}>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color, marginTop: 6 }}>{value}</div>
              </div>
            )
            const blockedStock = (inventoryGrnLines as any[]).filter((x:any)=>!['posted','cancelled'].includes(wfLower(wfEffectiveStatus(x)))).reduce((s:number,x:any)=>s+Number(x.amount||0),0)
            const pendingFinanceValue = (financeRecords as any[]).filter((x:any)=>!['confirmed','posted','cancelled'].includes(wfLower(wfEffectiveStatus(x)))).reduce((s:number,x:any)=>s+Number(x.amount||0),0)
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
                  {stageCard('Pending Tasks', workflowSummary.total, '#0f766e')}
                  {stageCard('Procurement', workflowSummary.procurement, '#2563eb')}
                  {stageCard('Inventory / Stores', workflowSummary.inventory, '#b45309')}
                  {stageCard('Finance', workflowSummary.finance, '#7c3aed')}
                </div>

                <Card title="Workflow Control Center" action={<Badge text="Draft → Submitted → Approved → Posted" tone="success" />}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12, marginBottom: 14 }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>Rule 1</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>GRN and Issue do not affect live stock until they are <b>Posted</b>.</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>Rule 2</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Finance records only affect certificates when they are <b>Confirmed / Posted</b>.</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>Blocked Values</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Stock not posted: <b>{money(blockedStock)}</b> · Finance pending: <b>{money(pendingFinanceValue)}</b></div>
                    </div>
                  </div>

                  <Table
                    heads={['Module','Reference','Description','Qty','Amount','Status','Date','Owner','Actions']}
                    rows={workflowTasks.map((task) => [
                      <Badge key="m" text={task.entity === 'grn' ? 'GRN' : task.entity === 'issue' ? 'Issue' : task.entity === 'finance' ? 'Finance' : 'Procurement'} tone={task.entity === 'finance' ? 'default' : task.entity === 'procurement' ? 'success' : 'warn'} />,
                      <b key="r">{task.ref}</b>,
                      <span key="t">{task.title}</span>,
                      <span key="q">{task.qty ? round3(task.qty) : '-'}</span>,
                      <span key="a">{task.amount ? money(task.amount) : '-'}</span>,
                      <Badge key="s" text={task.status || 'Draft'} tone={wfTone(task.status)} />,
                      <span key="d">{task.date || '-'}</span>,
                      <span key="o">{task.owner || '-'}</span>,
                      <div key="x" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{workflowActionsFor(task).map((a) => actionButton(task, a))}<Button tone="secondary" onClick={() => setSelectedApprovalTask(task)}>Flow</Button></div>,
                    ])}
                  />
                </Card>

                {selectedApprovalTask && (
                  <ApprovalStatusPanel recordTable={selectedApprovalTask.table} recordId={selectedApprovalTask.id} />
                )}

                <Card title="Workflow Map">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                    <div style={{ padding: 14, borderRadius: 12, background: '#eef2ff' }}><b>Procurement</b><br/><span style={{ fontSize: 12 }}>Draft/PR → Submitted → Approved → Ordered</span></div>
                    <div style={{ padding: 14, borderRadius: 12, background: '#ecfeff' }}><b>GRN</b><br/><span style={{ fontSize: 12 }}>Draft → Submitted → Approved → Posted to Stock</span></div>
                    <div style={{ padding: 14, borderRadius: 12, background: '#fef3c7' }}><b>Issue Material</b><br/><span style={{ fontSize: 12 }}>Draft → Submitted → Approved → Posted, then deduct stock</span></div>
                    <div style={{ padding: 14, borderRadius: 12, background: '#f3e8ff' }}><b>Finance</b><br/><span style={{ fontSize: 12 }}>Pending → Reviewed → Confirmed / Posted</span></div>
                  </div>
                </Card>
              </>
            )
          })()}

          {activeView === 'approval-center' && <ApprovalCenter projectId={projectId} />}
          {activeView === 'approval-matrix' && <ApprovalMatrixSettings projects={projects} />}

          {activeView === 'dashboard' && (() => {
            // ── shared helpers ──────────────────────────────────────────
            const contractValue = activeProject?.contract_value ?? 0
            const totalSubcontract = kpis?.total_subcontract_value ?? 0
            const totalCertified = kpis?.total_certified_value ?? 0
            const remaining = totalSubcontract - totalCertified
            const certPct = totalSubcontract > 0 ? (totalCertified / totalSubcontract) * 100 : 0
            const overdueCount = technical.filter(r => r.status === 'Overdue').length
            const openTech = technical.filter(r => !['Approved','Approved with Comments','Closed'].includes(r.status)).length
            const delayedProc = procurement.filter(p => p.status === 'Delayed').length
            const pendingVars = variations.filter(v => ['Submitted','Under Review'].includes(v.status))
            const approvedVars = variations.filter(v => v.status === 'Approved')
            const varValue = approvedVars.reduce((s, v) => s + (v.approved_value ?? v.financial_impact ?? 0), 0)
            const pendingCerts = certificates.filter(c => c.status === 'Draft' || c.status === 'Submitted')
            const paidCerts = certificates.filter(c => c.status === 'Paid')
            const totalRetention = certificates.reduce((s, c) => s + (c.retention_amount ?? 0), 0)
            const totalPaid = paidCerts.reduce((s, c) => s + (c.net_payable ?? 0), 0)
            const boqBudget = boqItems.reduce((sum, b: any) => sum + boqItemContractValue(b), 0)

            const BAR = (pct: number, color: string, h = 8) => (
              <div style={{ height: h, background: '#e8e8e8', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.5s' }} />
              </div>
            )

            const KPI = ({ label, value, sub, color = '#1a6b4a', warn = false }: { label: string; value: string; sub?: string; color?: string; warn?: boolean }) => (
              <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #e8e8e8', borderLeft: `4px solid ${warn ? '#e53935' : color}` }}>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: warn ? '#e53935' : color }}>{value}</div>
                {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{sub}</div>}
              </div>
            )

            return (
              <>
                {/* Dashboard switcher */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
                  {([['ceo', '🏢 CEO / Executive Board'], ['client', '👤 Client Dashboard']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setDashView(id)} style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: dashView === id ? '#1a1a1a' : '#f0f0f0', color: dashView === id ? '#fff' : '#333' }}>{label}</button>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{activeProject?.project_name ?? 'No project selected'} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>

                {/* ══════════════════════════════════════════════════
                    CEO / EXECUTIVE BOARD DASHBOARD
                ══════════════════════════════════════════════════ */}
                {dashView === 'ceo' && <>

                  {/* Alert bar */}
                  {(overdueCount > 0 || delayedProc > 0 || pendingCerts.length > 0) && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                      {overdueCount > 0 && <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#c62828', fontWeight: 600 }}>🔴 {overdueCount} Overdue Technical Items</div>}
                      {delayedProc > 0 && <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#e65100', fontWeight: 600 }}>⚠️ {delayedProc} Delayed Procurement</div>}
                      {pendingCerts.length > 0 && <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#1565c0', fontWeight: 600 }}>📋 {pendingCerts.length} Subcontractor Invoices Pending</div>}
                      {pendingVars.length > 0 && <div style={{ background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#6a1b9a', fontWeight: 600 }}>📝 {pendingVars.length} Variations Under Review</div>}
                    </div>
                  )}

                  {/* Row 1 — Financial KPIs */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Financial Overview</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                    <KPI label="Contract Value (BOQ)" value={money(boqBudget)} sub={`${boqItems.length} BOQ items`} color="#1565c0" />
                    <KPI label="Total Subcontract" value={money(totalSubcontract)} sub={`${subcontractors.length} subcontractors`} color="#1a6b4a" />
                    <KPI label="Certified to Date" value={money(totalCertified)} sub={`${certPct.toFixed(1)}% of subcontract`} color="#2e7d32" />
                    <KPI label="Remaining to Certify" value={money(remaining)} sub={`${(100 - certPct).toFixed(1)}% remaining`} color="#e65100" />
                    <KPI label="Approved Variations" value={money(varValue)} sub={`${approvedVars.length} VOs approved`} color="#6a1b9a" />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 6 }}>
                      <span>Overall Certification Progress</span><span style={{ fontWeight: 700 }}>{certPct.toFixed(1)}%</span>
                    </div>
                    {BAR(certPct, '#2e7d32', 12)}
                  </div>

                  {/* Row 2 — Operations KPIs */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Operations & Risk</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                    <KPI label="Total Retention Held" value={money(totalRetention)} sub="from all certificates" color="#37474f" />
                    <KPI label="Total Paid to Subs" value={money(totalPaid)} sub={`${paidCerts.length} paid certificates`} color="#1a6b4a" />
                    <KPI label="Open Technical Items" value={openTech.toString()} sub={`${overdueCount} overdue`} color="#1565c0" warn={overdueCount > 0} />
                    <KPI label="Procurement Items" value={procurement.length.toString()} sub={`${delayedProc} delayed`} color="#e65100" warn={delayedProc > 0} />
                    <KPI label="Pending QS Approvals" value={pending.length.toString()} sub="awaiting review" color="#6a1b9a" warn={pending.length > 0} />
                  </div>

                  {/* Row 3 — Subcontractor performance + Certificates */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, marginBottom: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Subcontractor Performance</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: '#f5f5f5' }}>
                          {['Subcontractor', 'Contract', 'Certified', 'Retention', 'Progress'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #eee', fontWeight: 600 }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {commercial.map(r => {
                            const pct = r.total_contract_value > 0 ? (r.total_certified_gross / r.total_contract_value) * 100 : 0
                            const ret = certificates.filter(c => c.subcontractor_id === r.subcontractor_id).reduce((s, c) => s + (c.retention_amount ?? 0), 0)
                            return (
                              <tr key={r.subcontractor_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.subcontractor_name}</td>
                                <td style={{ padding: '8px 10px' }}>{money(r.total_contract_value)}</td>
                                <td style={{ padding: '8px 10px' }}>{money(r.total_certified_gross)}</td>
                                <td style={{ padding: '8px 10px', color: '#37474f' }}>{money(ret)}</td>
                                <td style={{ padding: '8px 10px', minWidth: 120 }}>
                                  {BAR(pct, pct >= 80 ? '#2e7d32' : pct >= 50 ? '#f9a825' : '#e53935')}
                                  <span style={{ fontSize: 11, color: '#666' }}>{pct.toFixed(1)}%</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Latest Subcontractor Invoices</div>
                      {certificates.slice(0, 7).map(c => {
                        const sub = subcontractors.find(s => s.id === c.subcontractor_id)
                        const statusColor: Record<string, string> = { Paid: '#2e7d32', Approved: '#1565c0', Submitted: '#e65100', Draft: '#888', Cancelled: '#c62828' }
                        return (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{sub?.subcontractor_code ?? '—'} · Cert #{c.cert_no}</div>
                              <div style={{ fontSize: 11, color: '#888' }}>{c.period_end}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{money(c.net_amount ?? c.net_payable ?? 0)}</div>
                              <div style={{ fontSize: 11, color: statusColor[c.status] ?? '#888', fontWeight: 600 }}>{c.status}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Row 4 — Technical + Procurement + Variations */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
                    {/* Technical */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Technical Office</div>
                      {(['RFI','Material Submittal','Shop Drawing','Method Statement','NCR','Inspection Request'] as const).map(type => {
                        const items = technical.filter(t => t.record_type === type)
                        const open = items.filter(t => !['Approved','Approved with Comments','Closed'].includes(t.status)).length
                        const overdue = items.filter(t => t.status === 'Overdue').length
                        if (!items.length) return null
                        return (
                          <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                            <span style={{ color: '#444' }}>{type}</span>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <span style={{ color: '#1565c0' }}>{open} open</span>
                              {overdue > 0 && <span style={{ color: '#c62828', fontWeight: 700 }}>⚠ {overdue}</span>}
                            </div>
                          </div>
                        )
                      })}
                      {!technical.length && <div style={{ color: '#888', fontSize: 13 }}>No technical records</div>}
                    </div>

                    {/* Procurement */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Procurement Status</div>
                      {(['PR Raised','RFQ Issued','PO Issued','Partially Delivered','Delivered','Delayed'] as const).map(status => {
                        const count = procurement.filter(p => p.status === status).length
                        if (!count) return null
                        const color: Record<string, string> = { Delayed: '#c62828', 'PR Raised': '#1565c0', 'RFQ Issued': '#e65100', 'PO Issued': '#f9a825', 'Partially Delivered': '#2e7d32', Delivered: '#1a6b4a' }
                        return (
                          <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                            <span style={{ color: color[status] ?? '#444', fontWeight: status === 'Delayed' ? 700 : 400 }}>{status === 'Delayed' ? '⚠ ' : ''}{status}</span>
                            <span style={{ fontWeight: 700, color: color[status] ?? '#333' }}>{count}</span>
                          </div>
                        )
                      })}
                      {!procurement.length && <div style={{ color: '#888', fontSize: 13 }}>No procurement records</div>}
                    </div>

                    {/* Variations */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Variations Register</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div style={{ background: '#e8f5e9', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, color: '#666' }}>Approved Value</div>
                          <div style={{ fontWeight: 800, color: '#2e7d32', fontSize: 16 }}>{money(varValue)}</div>
                        </div>
                        <div style={{ background: '#f3e5f5', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, color: '#666' }}>Under Review</div>
                          <div style={{ fontWeight: 800, color: '#6a1b9a', fontSize: 16 }}>{pendingVars.length} VOs</div>
                        </div>
                      </div>
                      {variations.slice(0, 5).map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                          <span style={{ color: '#444' }}>{v.vo_no} · {v.type}</span>
                          <span style={{ fontWeight: 600, color: v.status === 'Approved' ? '#2e7d32' : v.status === 'Rejected' ? '#c62828' : '#e65100' }}>{v.status}</span>
                        </div>
                      ))}
                      {!variations.length && <div style={{ color: '#888', fontSize: 13 }}>No variations</div>}
                    </div>
                  </div>

                  {/* Row 5 — BOQ Progress by Discipline */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>BOQ Budget by Discipline</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                      {(['Structural','Architectural','MEP','Civil','Landscaping','Fit-Out','Facade','Infrastructure','Other'] as const).map(disc => {
                        const items = boqItems.filter(b => b.discipline === disc)
                        if (!items.length) return null
                        const budget = items.reduce((s, b) => s + (b.boq_qty ?? 0) * ((b as any).client_rate ?? (b as any).rate ?? 0), 0)
                        const pct = boqBudget > 0 ? (budget / boqBudget) * 100 : 0
                        return (
                          <div key={disc} style={{ padding: '10px 14px', background: '#f8f8f8', borderRadius: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{disc}</div>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{money(budget)}</div>
                            {BAR(pct, '#1565c0')}
                            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{pct.toFixed(1)}% of total · {items.length} items</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>}

                {/* ══════════════════════════════════════════════════
                    CLIENT DASHBOARD
                ══════════════════════════════════════════════════ */}
                {dashView === 'client' && <>
                  {/* Header */}
                  <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', borderRadius: 14, padding: '24px 32px', marginBottom: 24, color: '#fff' }}>
                    <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Project Status Report</div>
                    <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{activeProject?.project_name ?? 'Project'}</div>
                    <div style={{ fontSize: 13, color: '#aaa' }}>Client: {activeProject?.client ?? '—'} &nbsp;·&nbsp; Location: {activeProject?.location ?? '—'} &nbsp;·&nbsp; As of {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20, marginTop: 20 }}>
                      {[
                        ['Contract Value', money(boqBudget)],
                        ['Certified to Date', money(totalCertified)],
                        ['Completion', certPct.toFixed(1) + '%'],
                        ['Status', activeProject?.status ?? '—'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ borderLeft: '3px solid rgba(255,255,255,0.2)', paddingLeft: 16 }}>
                          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{l}</div>
                          <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>Overall Project Progress</span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: '#1a6b4a' }}>{certPct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 20, background: '#e8f5e9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ width: `${certPct}%`, height: '100%', background: 'linear-gradient(90deg, #2e7d32, #66bb6a)', borderRadius: 999, transition: 'width 1s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
                      <span>Certified: {money(totalCertified)}</span>
                      <span>Remaining: {money(remaining)}</span>
                    </div>
                  </div>

                  {/* Client financial summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
                    {[
                      ['Total Certified (Gross)', money(totalCertified), '#1565c0', `${certPct.toFixed(1)}% complete`],
                      ['Retention Held', money(totalRetention), '#37474f', 'to be released at completion'],
                      ['Net Amount Certified', money(totalCertified - totalRetention), '#1a6b4a', 'after retention deductions'],
                    ].map(([l, v, c, s]) => (
                      <div key={l} style={{ background: '#fff', border: `2px solid ${c}`, borderRadius: 12, padding: '18px 22px' }}>
                        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{l}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{s}</div>
                      </div>
                    ))}
                  </div>

                  {/* Payment certificates table */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20, marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Subcontractor Invoice Payment History</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead><tr style={{ background: '#f5f5f5' }}>
                        {['Cert #','Period','Subcontractor','Gross Amount','Retention','Net Payable','Status'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #eee', fontWeight: 600 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {certificates.length ? certificates.map(c => {
                          const sub = subcontractors.find(s => s.id === c.subcontractor_id)
                          const statusColor: Record<string, string> = { Paid: '#2e7d32', Approved: '#1565c0', Submitted: '#e65100', Draft: '#888' }
                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 700 }}>#{c.cert_no}</td>
                              <td style={{ padding: '9px 12px', color: '#666' }}>{c.period_end}</td>
                              <td style={{ padding: '9px 12px' }}>{sub?.name ?? '—'}</td>
                              <td style={{ padding: '9px 12px' }}>{money(c.gross_amount)}</td>
                              <td style={{ padding: '9px 12px', color: '#37474f' }}>{money(c.retention_amount)}</td>
                              <td style={{ padding: '9px 12px', fontWeight: 700 }}>{money(c.net_amount ?? c.net_payable ?? 0)}</td>
                              <td style={{ padding: '9px 12px' }}><span style={{ background: statusColor[c.status] + '22', color: statusColor[c.status] ?? '#888', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{c.status}</span></td>
                            </tr>
                          )
                        }) : <tr><td colSpan={9} style={{ padding: 20, color: '#888', textAlign: 'center' }}>No certificates yet</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  {/* Approved Variations for client */}
                  {approvedVars.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20, marginBottom: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Approved Variations</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: '#f5f5f5' }}>{['VO No','Type','Description','Approved Value','Time Impact'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #eee' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {approvedVars.map(v => (
                            <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 700 }}>{v.vo_no}</td>
                              <td style={{ padding: '8px 12px' }}>{v.type}</td>
                              <td style={{ padding: '8px 12px' }}>{v.description}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#2e7d32' }}>{money(v.approved_value ?? v.financial_impact ?? 0)}</td>
                              <td style={{ padding: '8px 12px', color: v.time_impact_days ? '#e65100' : '#888' }}>{v.time_impact_days ? `+${v.time_impact_days} days` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* BOQ progress by discipline for client */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Scope Progress by Discipline</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                      {(['Structural','Architectural','MEP','Civil','Landscaping','Fit-Out','Facade','Infrastructure'] as const).map(disc => {
                        const items = boqItems.filter(b => b.discipline === disc)
                        if (!items.length) return null
                        const budget = items.reduce((s, b) => s + (b.boq_qty ?? 0) * ((b as any).client_rate ?? (b as any).rate ?? 0), 0)
                        const pct = boqBudget > 0 ? (budget / boqBudget) * 100 : 0
                        return (
                          <div key={disc} style={{ padding: '14px', background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a6b4a', marginBottom: 8 }}>{disc}</div>
                            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{money(budget)}</div>
                            {BAR(pct, '#1a6b4a', 6)}
                            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{pct.toFixed(1)}% of contract</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>}
              </>
            )
          })()}

          {activeView === 'projects' && (
            <>
              <Card title="Add project">
                <FormGrid>
                  <Field label="Project Code"><Input value={projectForm.project_code} onChange={(e) => setProjectForm({ ...projectForm, project_code: e.target.value })} /></Field>
                  <Field label="Project Name"><Input value={projectForm.project_name} onChange={(e) => setProjectForm({ ...projectForm, project_name: e.target.value })} /></Field>
                  <Field label="Client"><Input value={projectForm.client} onChange={(e) => setProjectForm({ ...projectForm, client: e.target.value })} /></Field>
                  <Field label="Location"><Input value={projectForm.location} onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })} /></Field>
                </FormGrid>
                <Toolbar><Button onClick={addProject} disabled={createProject.isPending || !projectForm.project_code || !projectForm.project_name}>Add Project</Button></Toolbar>
              </Card>
              <Card title="Projects list">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        {['Code', 'Name', 'Client', 'Location', 'Status', 'Actions'].map((h) => (
                          <th key={h} style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p: any) => {
                        const isEditing = editingProjectId === p.id
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: 12 }}>{isEditing ? <Input value={editProjectForm.project_code} onChange={(e) => setEditProjectForm({ ...editProjectForm, project_code: e.target.value })} /> : p.project_code}</td>
                            <td style={{ padding: 12 }}>{isEditing ? <Input value={editProjectForm.project_name} onChange={(e) => setEditProjectForm({ ...editProjectForm, project_name: e.target.value })} /> : p.project_name}</td>
                            <td style={{ padding: 12 }}>{isEditing ? <Input value={editProjectForm.client} onChange={(e) => setEditProjectForm({ ...editProjectForm, client: e.target.value })} /> : (p.client ?? '—')}</td>
                            <td style={{ padding: 12 }}>{isEditing ? <Input value={editProjectForm.location} onChange={(e) => setEditProjectForm({ ...editProjectForm, location: e.target.value })} /> : (p.location ?? '—')}</td>
                            <td style={{ padding: 12 }}>
                              {isEditing ? (
                                <Select value={editProjectForm.status} onChange={(e) => setEditProjectForm({ ...editProjectForm, status: e.target.value })}>
                                  <option>Active</option><option>On Hold</option><option>Closed</option><option>Archived</option>
                                </Select>
                              ) : (p.status ?? 'Active')}
                            </td>
                            <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <Button onClick={() => saveProjectEdit(p.id)} disabled={updateProject.isPending || !editProjectForm.project_code || !editProjectForm.project_name}>Save</Button>
                                  <button type="button" onClick={() => setEditingProjectId(null)} style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Cancel</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button type="button" onClick={() => startEditProject(p)} style={{ border: '1px solid #1a6b4a', color: '#1a6b4a', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>Edit</button>
                                  <button type="button" onClick={() => removeProject(p.id)} disabled={deleteProject.isPending} style={{ border: '1px solid #fecaca', color: '#b91c1c', background: '#fff5f5', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>Delete</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}


          {activeView === 'structure' && (() => {
            if (!projectId) return <Card title="Project Structure"><div>Select a project first.</div></Card>

            const TEMPLATES: Record<string, any[]> = {
  "Single Building": [
    {
      "code": "B1",
      "name": "Building 1",
      "type": "building",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    }
  ],
  "Building + Sections": [
    {
      "code": "B1",
      "name": "Building 1",
      "type": "building",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    },
    {
      "code": "S1",
      "name": "Section 1",
      "type": "section",
      "parent_code": "B1",
      "level": 1,
      "sort_order": 0
    },
    {
      "code": "S2",
      "name": "Section 2",
      "type": "section",
      "parent_code": "B1",
      "level": 1,
      "sort_order": 1
    }
  ],
  "Villas Compound": [
    {
      "code": "PH1",
      "name": "Phase 1",
      "type": "phase",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    },
    {
      "code": "CL1",
      "name": "Cluster 1",
      "type": "cluster",
      "parent_code": "PH1",
      "level": 1,
      "sort_order": 0
    },
    {
      "code": "V1",
      "name": "Villa Type 1",
      "type": "villa",
      "parent_code": "CL1",
      "level": 2,
      "sort_order": 0
    },
    {
      "code": "V2",
      "name": "Villa Type 2",
      "type": "villa",
      "parent_code": "CL1",
      "level": 2,
      "sort_order": 1
    }
  ],
  "Towers Compound": [
    {
      "code": "PH1",
      "name": "Phase 1",
      "type": "phase",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    },
    {
      "code": "T1",
      "name": "Tower 1",
      "type": "tower",
      "parent_code": "PH1",
      "level": 1,
      "sort_order": 0
    },
    {
      "code": "T2",
      "name": "Tower 2",
      "type": "tower",
      "parent_code": "PH1",
      "level": 1,
      "sort_order": 1
    }
  ],
  "Residential Compound": [
    {
      "code": "PH1",
      "name": "Phase 1",
      "type": "phase",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    },
    {
      "code": "ZR",
      "name": "Residential Zone",
      "type": "zone",
      "parent_code": "PH1",
      "level": 1,
      "sort_order": 0
    },
    {
      "code": "B1",
      "name": "Building 1",
      "type": "building",
      "parent_code": "ZR",
      "level": 2,
      "sort_order": 0
    },
    {
      "code": "CL1",
      "name": "Villa Cluster",
      "type": "cluster",
      "parent_code": "ZR",
      "level": 2,
      "sort_order": 1
    },
    {
      "code": "V1",
      "name": "Villa Type A",
      "type": "villa",
      "parent_code": "CL1",
      "level": 3,
      "sort_order": 0
    }
  ],
  "Mixed Use": [
    {
      "code": "POD",
      "name": "Podium",
      "type": "podium",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    },
    {
      "code": "BAS",
      "name": "Basement",
      "type": "basement",
      "parent_id": null,
      "level": 0,
      "sort_order": 1
    },
    {
      "code": "MALL",
      "name": "Mall",
      "type": "mall",
      "parent_id": null,
      "level": 0,
      "sort_order": 2
    },
    {
      "code": "T1",
      "name": "Residential Tower",
      "type": "tower",
      "parent_id": null,
      "level": 0,
      "sort_order": 3
    }
  ],
  "Infrastructure": [
    {
      "code": "ZN1",
      "name": "Zone 1",
      "type": "zone",
      "parent_id": null,
      "level": 0,
      "sort_order": 0
    },
    {
      "code": "PH1",
      "name": "Phase 1",
      "type": "phase",
      "parent_code": "ZN1",
      "level": 1,
      "sort_order": 0
    },
    {
      "code": "PT1",
      "name": "Part 1",
      "type": "part",
      "parent_code": "PH1",
      "level": 2,
      "sort_order": 0
    }
  ]
}

            const getChildren = (parentId: string | null) =>
              structureNodes.filter((n: StructureNode) => n.parent_id === parentId)
                .sort((a: StructureNode, b: StructureNode) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

            const getRoots = () => getChildren(null)

            const getNodePath = (id: string): string => {
              const node = structureNodes.find((n: StructureNode) => n.id === id)
              if (!node) return ''
              if (!node.parent_id) return node.code
              return getNodePath(node.parent_id) + ' > ' + node.code
            }

            const filteredNodes = structureNodes.filter((n: StructureNode) => {
              if (nodeTypeFilter && n.type !== nodeTypeFilter) return false
              if (nodeSearch && !n.code.toLowerCase().includes(nodeSearch.toLowerCase()) && !n.name.toLowerCase().includes(nodeSearch.toLowerCase())) return false
              return true
            })

            const toggleExpand = (id: string) => {
              const next = new Set(expandedNodes)
              if (next.has(id)) next.delete(id); else next.add(id)
              setExpandedNodes(next)
            }

            const expandAll = () => setExpandedNodes(new Set(structureNodes.map((n: StructureNode) => n.id)))
            const collapseAll = () => setExpandedNodes(new Set())

            const renderTreeNode = (node: StructureNode, depth: number = 0): any => {
              const children = getChildren(node.id)
              const hasChildren = children.length > 0
              const isExpanded = expandedNodes.has(node.id)
              const isEditing = editingNodeId === node.id
              const color = NODE_COLORS[node.type] ?? '#888'
              const isDragOver = dragOverId === node.id
              const isDragging = draggingId === node.id

              return (
                <div key={node.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
                  <div
                    draggable
                    onDragStart={() => setDraggingId(node.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                    onDragOver={e => { e.preventDefault(); setDragOverId(node.id) }}
                    onDrop={async e => {
                      e.preventDefault()
                      if (!draggingId || draggingId === node.id) return
                      await run('Move node', () => reorderStructureNode.mutateAsync({ id: draggingId, parent_id: node.parent_id, sort_order: (node.sort_order ?? 0) - 1, projectId: projectId! }))
                      setDragOverId(null); setDraggingId(null)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: `6px 10px 6px ${depth * 24 + 10}px`,
                      borderRadius: 8, marginBottom: 2, cursor: 'grab',
                      background: isDragOver ? '#e8f5e9' : isEditing ? '#f0f7f4' : 'white',
                      border: `1px solid ${isDragOver ? '#a5d6a7' : '#f0f0f0'}`,
                    }}
                  >
                    <span onClick={() => hasChildren && toggleExpand(node.id)} style={{ cursor: hasChildren ? 'pointer' : 'default', color: '#aaa', width: 16, userSelect: 'none', fontSize: 12 }}>
                      {hasChildren ? (isExpanded ? '▼' : '▶') : '◦'}
                    </span>
                    <span style={{ background: color + '22', color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, minWidth: 70, textAlign: 'center', textTransform: 'capitalize' }}>{node.type}</span>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Select value={editNodeForm.type ?? node.type} onChange={e => setEditNodeForm({...editNodeForm, type: e.target.value})}>
                          {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                        <Input value={editNodeForm.code ?? node.code} onChange={e => setEditNodeForm({...editNodeForm, code: e.target.value})} style={{width: 80}} placeholder="Code"/>
                        <Input value={editNodeForm.name ?? node.name} onChange={e => setEditNodeForm({...editNodeForm, name: e.target.value})} placeholder="Name"/>
                        <Input value={editNodeForm.description ?? ''} onChange={e => setEditNodeForm({...editNodeForm, description: e.target.value})} placeholder="Description" style={{width: 180}}/>
                        <Select value={editNodeForm.parent_id ?? node.parent_id ?? ''} onChange={e => setEditNodeForm({...editNodeForm, parent_id: e.target.value})}>
                          <option value="">Root (no parent)</option>
                          {structureNodes.filter((n: StructureNode) => n.id !== node.id).map((n: StructureNode) => <option key={n.id} value={n.id}>{getNodePath(n.id)} ({n.type})</option>)}
                        </Select>
                        <Button onClick={async () => {
                          await run('Update node', () => updateStructureNode.mutateAsync({ id: node.id, data: { code: editNodeForm.code, name: editNodeForm.name, type: editNodeForm.type as NodeType, description: editNodeForm.description || null, parent_id: editNodeForm.parent_id || null } }))
                          setEditingNodeId(null)
                        }} disabled={updateStructureNode.isPending}>Save</Button>
                        <Button tone="secondary" onClick={() => setEditingNodeId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, color: '#333', minWidth: 60 }}>{node.code}</span>
                        <span style={{ color: '#555', flex: 1 }}>{node.name}</span>
                        {node.description && <span style={{ color: '#aaa', fontSize: 12 }}>{node.description}</span>}
                        <span style={{ color: '#ccc', fontSize: 11 }}>Lv{node.level}</span>
                        {children.length > 0 && <span style={{ color: '#888', fontSize: 11 }}>{children.length} children</span>}
                        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                          <button onClick={() => setNodeForm({...nodeForm, parent_id: node.id, type: 'building'})} style={{ padding: '3px 8px', background: '#e8f5e9', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>+ Child</button>
                          <button onClick={() => { setEditingNodeId(node.id); setEditNodeForm({ code: node.code, name: node.name, type: node.type, description: node.description ?? '', parent_id: node.parent_id ?? '' }) }} style={{ padding: '3px 8px', background: '#e3f2fd', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#1565c0' }}>Edit</button>
                          <button onClick={async () => {
                            await run('Duplicate', () => createStructureNode.mutateAsync({
                              project_id: projectId!,
                              parent_id: node.parent_id,
                              code: node.code + '_copy',
                              name: node.name + ' (copy)',
                              type: node.type,
                              level: node.level,
                              sort_order: (node.sort_order ?? 0) + 1,
                              description: node.description,
                              is_active: true,
                            }))
                          }} style={{ padding: '3px 8px', background: '#fff3e0', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#e65100' }}>Copy</button>
                          <button onClick={() => { if (confirm('Delete ' + node.code + ' and all its children?')) run('Delete', () => deleteStructureNode.mutateAsync({ id: node.id, projectId: projectId! })) }} style={{ padding: '3px 8px', background: '#ffebee', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#c62828' }}>✕</button>
                        </div>
                      </>
                    )}
                  </div>
                  {isExpanded && hasChildren && children.map((child: StructureNode) => renderTreeNode(child, depth + 1))}
                </div>
              )
            }

            return <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['tree', 'table'] as const).map(id => (
                    <button key={id} onClick={() => setNodeView(id)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: nodeView === id ? '#1a6b4a' : '#f0f0f0', color: nodeView === id ? '#fff' : '#333' }}>
                      {id === 'tree' ? '🌳 Tree View' : '📋 Table View'}
                    </button>
                  ))}
                </div>
                <input value={nodeSearch} onChange={e => setNodeSearch(e.target.value)} placeholder="🔍 Search nodes..." style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, width: 200, fontFamily: 'inherit' }}/>
                <Select value={nodeTypeFilter} onChange={e => setNodeTypeFilter(e.target.value)} style={{ minWidth: 140 }}>
                  <option value="">All Types</option>
                  {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Button tone="secondary" onClick={expandAll}>Expand All</Button>
                <Button tone="secondary" onClick={collapseAll}>Collapse All</Button>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#666' }}>{structureNodes.length} nodes</span>

                {/* Export button */}
                <button onClick={() => {
                  const rows = [['code','name','type','parent_code','level','description']]
                  structureNodes.forEach((n: StructureNode) => {
                    const parent = structureNodes.find((p: StructureNode) => p.id === n.parent_id)
                    rows.push([n.code, n.name, n.type, parent?.code ?? '', String(n.level), n.description ?? ''])
                  })
                  const csv = '\uFEFF' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n')
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'project-structure.csv'; a.click()
                }} style={{ padding: '7px 14px', background: '#e3f2fd', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1565c0' }}>⬇ Export CSV</button>

                {/* Import button */}
                <label style={{ cursor: 'pointer' }}>
                  <span style={{ padding: '7px 14px', background: '#e8f5e9', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#2e7d32', display: 'inline-block' }}>⬆ Import CSV</span>
                  <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={async (e) => {
                    if (!projectId) return
                    const file = e.target.files?.[0]; if (!file) return
                    setStructureImportMsg('Importing...')
                    try {
                      let rows: string[][] = []
                      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                        const XLSX = await import('xlsx')
                        const buf = await file.arrayBuffer()
                        const wb = XLSX.read(buf, { type: 'array' })
                        const ws = wb.Sheets[wb.SheetNames[0]]
                        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
                      } else {
                        const text = await file.text()
                        rows = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => {
                          const result: string[] = []; let cur = '', inQ = false
                          for (let i = 0; i < line.length; i++) {
                            if (line[i] === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
                            else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = '' }
                            else cur += line[i]
                          }
                          result.push(cur.trim()); return result
                        })
                      }
                      const dataRows = rows.slice(1).filter(r => r[0] && r[1] && r[2])
                      // First pass: create all nodes without parents
                      const codeToId: Record<string, string> = {}
                      for (const row of dataRows) {
                        const [code, name, type, , level, description] = row.map(String)
                        const created = await createStructureNode.mutateAsync({
                          project_id: projectId, parent_id: null,
                          code: code.trim(), name: name.trim(), type: (type.trim() || 'building') as NodeType,
                          level: parseInt(level) || 0, sort_order: 0,
                          description: description.trim() || null, is_active: true,
                        })
                        codeToId[code.trim()] = created.id
                      }
                      // Second pass: set parent_id
                      for (const row of dataRows) {
                        const [code, , , parent_code] = row.map(String)
                        if (parent_code.trim() && codeToId[parent_code.trim()] && codeToId[code.trim()]) {
                          await updateStructureNode.mutateAsync({ id: codeToId[code.trim()], data: { parent_id: codeToId[parent_code.trim()] } })
                        }
                      }
                      setStructureImportMsg('✅ ' + dataRows.length + ' nodes imported')
                      expandAll()
                      e.target.value = ''
                    } catch(err) { setStructureImportMsg('❌ Error: ' + String(err)) }
                  }} />
                </label>
                {structureImportMsg && <span style={{ fontSize: 13, fontWeight: 600, color: structureImportMsg.startsWith('✅') ? '#2e7d32' : structureImportMsg === 'Importing...' ? '#1565c0' : '#c62828' }}>{structureImportMsg}</span>}
              </div>

              {structureNodes.length === 0 && (
                <div style={{ background: '#f0f7f4', border: '1px solid #c8e6c9', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a6b4a', marginBottom: 12 }}>🚀 Quick Start — Choose a Template</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {Object.keys(TEMPLATES).map(tname => (
                      <button key={tname} onClick={() => setSelectedTemplate(tname)}
                        style={{ padding: '10px 14px', background: selectedTemplate === tname ? '#1a6b4a' : '#fff', color: selectedTemplate === tname ? '#fff' : '#333', border: `2px solid ${selectedTemplate === tname ? '#1a6b4a' : '#e0e0e0'}`, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, textAlign: 'left' }}>
                        {tname}
                      </button>
                    ))}
                  </div>
                  {selectedTemplate && (
                    <div>
                      <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>Preview: {TEMPLATES[selectedTemplate].map((n: any) => n.code).join(' → ')}</div>
                      <Button onClick={async () => {
                        const nodes = TEMPLATES[selectedTemplate]
                        const codeToId: Record<string, string> = {}
                        for (const node of nodes) {
                          const parentId = node.parent_code ? codeToId[node.parent_code] : null
                          const created = await createStructureNode.mutateAsync({
                            project_id: projectId!,
                            parent_id: parentId ?? node.parent_id ?? null,
                            code: node.code, name: node.name, type: node.type as NodeType,
                            level: node.level ?? 0, sort_order: node.sort_order ?? 0,
                            description: null, is_active: true,
                          })
                          codeToId[node.code] = created.id
                        }
                        expandAll()
                        setSelectedTemplate('')
                      }} disabled={createStructureNode.isPending}>
                        Apply "{selectedTemplate}" Template
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <Card title="Add Node">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  <Field label="Type"><Select value={nodeForm.type} onChange={e => setNodeForm({...nodeForm, type: e.target.value as NodeType})}>{NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
                  <Field label="Code"><Input value={nodeForm.code} onChange={e => setNodeForm({...nodeForm, code: e.target.value})} placeholder="e.g. B1, PH1"/></Field>
                  <Field label="Name"><Input value={nodeForm.name} onChange={e => setNodeForm({...nodeForm, name: e.target.value})} placeholder="e.g. Building 1"/></Field>
                  <Field label="Parent">
                    <Select value={nodeForm.parent_id} onChange={e => setNodeForm({...nodeForm, parent_id: e.target.value})}>
                      <option value="">Root (no parent)</option>
                      {structureNodes.map((n: StructureNode) => <option key={n.id} value={n.id}>{getNodePath(n.id)} ({n.type})</option>)}
                    </Select>
                  </Field>
                  <Field label="Description"><Input value={nodeForm.description} onChange={e => setNodeForm({...nodeForm, description: e.target.value})} placeholder="Optional"/></Field>
                </div>
                <Toolbar>
                  <Button onClick={async () => {
                    if (!nodeForm.code || !nodeForm.name) return
                    const parentNode = nodeForm.parent_id ? structureNodes.find((n: StructureNode) => n.id === nodeForm.parent_id) : null
                    await run('Add node', () => createStructureNode.mutateAsync({
                      project_id: projectId!, parent_id: nodeForm.parent_id || null,
                      code: nodeForm.code, name: nodeForm.name, type: nodeForm.type,
                      level: parentNode ? (parentNode.level ?? 0) + 1 : 0,
                      sort_order: structureNodes.filter((n: StructureNode) => n.parent_id === (nodeForm.parent_id || null)).length,
                      description: nodeForm.description || null, is_active: true,
                    }))
                    if (nodeForm.parent_id) { const next = new Set(expandedNodes); next.add(nodeForm.parent_id); setExpandedNodes(next) }
                    setNodeForm({...nodeForm, code: '', name: '', description: ''})
                  }} disabled={createStructureNode.isPending || !nodeForm.code || !nodeForm.name}>+ Add Node</Button>
                </Toolbar>
              </Card>

              {nodeView === 'tree' && (
                <Card title="Project Structure Tree">
                  {structureNodes.length === 0 ? (
                    <div style={{ color: '#888', padding: 20, textAlign: 'center' }}>No nodes yet. Add a node above or choose a template.</div>
                  ) : (
                    <div style={{ background: '#fafafa', borderRadius: 10, padding: 12 }}>
                      {(nodeSearch || nodeTypeFilter ? filteredNodes : getRoots()).map((node: StructureNode) => renderTreeNode(node, 0))}
                    </div>
                  )}
                </Card>
              )}

              {nodeView === 'table' && (
                <Card title="All Nodes — Table View">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['Type','Code','Name','Parent','Level','Description','Actions'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredNodes.map((n: StructureNode) => {
                        const parent = structureNodes.find((p: StructureNode) => p.id === n.parent_id)
                        const color = NODE_COLORS[n.type] ?? '#888'
                        return (
                          <tr key={n.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '7px 12px' }}><span style={{ background: color + '22', color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{n.type}</span></td>
                            <td style={{ padding: '7px 12px', fontWeight: 700 }}>{n.code}</td>
                            <td style={{ padding: '7px 12px' }}>{n.name}</td>
                            <td style={{ padding: '7px 12px', color: '#888' }}>{parent ? parent.code + ' — ' + parent.name : '—'}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'center' }}>{n.level}</td>
                            <td style={{ padding: '7px 12px', color: '#888', fontSize: 12 }}>{n.description ?? '—'}</td>
                            <td style={{ padding: '7px 12px' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <Button tone="secondary" onClick={() => { setEditingNodeId(n.id); setEditNodeForm({ code: n.code, name: n.name, type: n.type, description: n.description ?? '', parent_id: n.parent_id ?? '' }); setNodeView('tree') }}>Edit</Button>
                                <Button tone="danger" onClick={() => { if (confirm('Delete?')) run('Delete', () => deleteStructureNode.mutateAsync({ id: n.id, projectId: projectId! })) }}>✕</Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
          })()}

          {activeView === 'boq' && (
            <>
              <Card title="Add BOQ item">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Building / Villa">
                      <Select value={boqForm.structure_id} onChange={(e) => setBoqForm({ ...boqForm, structure_id: e.target.value })}>
                        <option value="">Select project structure node</option>
                        {boqStructures.map((s: StructureNode) => <option key={s.id} value={s.id}>{structurePath(s.id)} — {s.name} ({s.type})</option>)}
                      </Select>
                    </Field>
                    <Field label="Work Type / نشاط البند"><Select value={boqForm.work_type} onChange={(e) => { const wt = e.target.value; const discipline = wt.includes("Concrete") ? "Structural" : wt.includes("Excavation") ? "Civil" : wt.includes("MEP") ? "MEP" : wt.includes("Infrastructure") ? "Infrastructure" : wt.includes("Landscape") ? "Landscaping" : wt.includes("Finishing") ? "Architectural" : boqForm.discipline; setBoqForm({ ...boqForm, work_type: wt, discipline: discipline as Discipline }) }}><option value="">Select work type</option>{BOQ_WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
                    <Field label="Item Code"><Input value={boqForm.item_code} onChange={(e) => setBoqForm({ ...boqForm, item_code: e.target.value })} /></Field>
                    <Field label="Description"><Input value={boqForm.description} onChange={(e) => setBoqForm({ ...boqForm, description: e.target.value })} /></Field>
                    <Field label="Unit"><Input value={boqForm.unit} onChange={(e) => setBoqForm({ ...boqForm, unit: e.target.value })} /></Field>
                    <Field label="BOQ Qty"><Input type="number" value={boqForm.boq_qty} onChange={(e) => setBoqForm({ ...boqForm, boq_qty: e.target.value })} /></Field>
                    <Field label="Client Rate"><Input type="number" value={boqForm.rate} onChange={(e) => setBoqForm({ ...boqForm, rate: e.target.value })} /></Field>
                    <Field label="Chapter"><Input value={boqForm.chapter} onChange={(e) => setBoqForm({ ...boqForm, chapter: e.target.value })} /></Field>
                    <Field label="Discipline"><Select value={boqForm.discipline} onChange={(e) => setBoqForm({ ...boqForm, discipline: e.target.value as Discipline })}>{disciplineOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}</Select></Field>
                    <Field label="Source Note"><Input value={boqForm.source_note} onChange={(e) => setBoqForm({ ...boqForm, source_note: e.target.value })} /></Field>
                  </FormGrid>
                  <Toolbar><Button onClick={addBoq} disabled={createBoq.isPending || !boqForm.structure_id || !boqForm.work_type || !boqForm.item_code || !boqForm.description}>Add BOQ Item</Button><span style={{fontSize:12,color:'#666'}}>BOQ is linked to Project Structure + Work Type.</span></Toolbar>
                </>}
              </Card>
              <Card title="BOQ Discipline Library / Trades">
                {!projectId ? <div>Select a project first.</div> : <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ color: '#667085', fontSize: 13 }}>Contract Smart Breakdown now uses the exact BOQ Discipline values below as Trades. Add disciplines like Concrete, Blockwork, Plaster, Paint, Aluminum, Waterproofing, etc.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                    <div style={{ minWidth: 260 }}><Field label="New Discipline / Trade"><Input value={newDisciplineName} onChange={(e) => setNewDisciplineName(e.target.value)} placeholder="e.g. Concrete / Blockwork / Paint" /></Field></div>
                    <Button onClick={() => void addProjectDiscipline()} disabled={disciplineLoading || !newDisciplineName.trim()}>+ Add Discipline</Button>
                    <Button tone="secondary" onClick={() => void loadProjectDisciplines()} disabled={disciplineLoading}>Refresh</Button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {disciplineOptions.map((d: string) => {
                      const usedCount = (boqItems as any[]).filter((b: any) => cleanDiscipline(b.discipline).toLowerCase() === d.toLowerCase()).length
                      const fromLibrary = projectDisciplines.map((x: string) => x.toLowerCase()).includes(d.toLowerCase())
                      return <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: usedCount ? '#e8f5e9' : '#f5f5f5', border: '1px solid #d9e3de', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 700, color: usedCount ? '#0f6e56' : '#475467' }}>
                        {d}<small style={{ fontWeight: 600, color: '#667085' }}>{usedCount} BOQ</small>
                        {fromLibrary && <button onClick={() => void removeProjectDiscipline(d)} disabled={disciplineLoading} title="Remove from project discipline library" style={{ border: 0, background: 'transparent', color: '#c62828', cursor: 'pointer', fontWeight: 900 }}>×</button>}
                      </span>
                    })}
                  </div>
                </div>}
              </Card>
              <Card title="BOQ list">
                <div style={{ marginBottom: 14, padding: 14, border: '1px solid #d7eadf', borderRadius: 12, background: '#f6fffa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, color: '#0f5c3f' }}>🔎 Professional BOQ Filters</div>
                    <div style={{ fontSize: 13, color: '#555' }}><strong>{filteredBoqItems.length}</strong> of <strong>{boqItems.length}</strong> items</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 10 }}>
                    <div style={{ minWidth: 220 }}>
                      <Field label="Group BOQ by">
                        <Select value={boqGroupBy} onChange={(e) => setBoqGroupBy(e.target.value as 'none' | 'structure' | 'code')}>
                          <option value="none">No grouping</option>
                          <option value="structure">Structure</option>
                          <option value="code">Code</option>
                        </Select>
                      </Field>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0f5c3f', paddingBottom: 10 }}>
                      <input type="checkbox" checked={boqDisciplineGrouping} onChange={(e) => setBoqDisciplineGrouping(e.target.checked)} />
                      Group each Discipline separately
                    </label>
                    <Button tone="secondary" onClick={() => setCollapsedBoqGroups([])}>Expand All</Button>
                    <Button tone="secondary" onClick={() => setCollapsedBoqGroups(groupedBoqItems.flatMap(d => [d.key, ...d.groups.map(g => g.key)]))}>Collapse All</Button>
                  </div>
                  <FormGrid>
                    <Field label="Search anything">
                      <Input placeholder="Code, description, unit, discipline, structure, qty, rate..." value={boqFilters.search} onChange={(e) => setBoqFilters({ ...boqFilters, search: e.target.value })} />
                    </Field>
                    <Field label="Structure / Model">
                      <Select value={boqFilters.structure} onChange={(e) => setBoqFilters({ ...boqFilters, structure: e.target.value })}>
                        <option value="all">All structures</option>
                        {boqFilterOptions.usedStructures.map((n: StructureNode) => <option key={n.id} value={n.id}>{n.code} — {n.name} ({n.type})</option>)}
                      </Select>
                    </Field>
                    <Field label="Discipline">
                      <Select value={boqFilters.discipline} onChange={(e) => setBoqFilters({ ...boqFilters, discipline: e.target.value })}>
                        <option value="all">All disciplines</option>
                        {boqFilterOptions.disciplines.map((d: string) => <option key={d} value={d}>{d}</option>)}
                      </Select>
                    </Field>
                    <Field label="Unit">
                      <Select value={boqFilters.unit} onChange={(e) => setBoqFilters({ ...boqFilters, unit: e.target.value })}>
                        <option value="all">All units</option>
                        {boqFilterOptions.units.map((u: string) => <option key={u} value={u}>{u}</option>)}
                      </Select>
                    </Field>
                    <Field label="Quantity status">
                      <Select value={boqFilters.qtyStatus} onChange={(e) => setBoqFilters({ ...boqFilters, qtyStatus: e.target.value })}>
                        <option value="all">All quantities</option>
                        <option value="hasQty">Has BOQ Qty</option>
                        <option value="emptyQty">Empty / Zero Qty</option>
                      </Select>
                    </Field>
                    <Field label="QS usage">
                      <Select value={boqFilters.qsStatus} onChange={(e) => setBoqFilters({ ...boqFilters, qsStatus: e.target.value })}>
                        <option value="all">All QS status</option>
                        <option value="used">Used in QS</option>
                        <option value="notUsed">Not used in QS</option>
                      </Select>
                    </Field>
                    <Field label="Subcontractor link">
                      <Select value={boqFilters.subcontractorStatus} onChange={(e) => setBoqFilters({ ...boqFilters, subcontractorStatus: e.target.value })}>
                        <option value="all">All subcontract status</option>
                        <option value="linked">Linked to subcontractor</option>
                        <option value="notLinked">Not linked</option>
                      </Select>
                    </Field>
                    <Field label="Duplicates">
                      <Select value={boqFilters.duplicateStatus} onChange={(e) => setBoqFilters({ ...boqFilters, duplicateStatus: e.target.value })}>
                        <option value="all">All items</option>
                        <option value="duplicates">Duplicated items</option>
                        <option value="unique">Unique only</option>
                      </Select>
                    </Field>
                    <Field label="Qty from / to">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Input type="number" placeholder="Min" value={boqFilters.minQty} onChange={(e) => setBoqFilters({ ...boqFilters, minQty: e.target.value })} />
                        <Input type="number" placeholder="Max" value={boqFilters.maxQty} onChange={(e) => setBoqFilters({ ...boqFilters, maxQty: e.target.value })} />
                      </div>
                    </Field>
                    <Field label="Rate from / to">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Input type="number" placeholder="Min" value={boqFilters.minRate} onChange={(e) => setBoqFilters({ ...boqFilters, minRate: e.target.value })} />
                        <Input type="number" placeholder="Max" value={boqFilters.maxRate} onChange={(e) => setBoqFilters({ ...boqFilters, maxRate: e.target.value })} />
                      </div>
                    </Field>
                  </FormGrid>
                  <Toolbar>
                    <Button tone="secondary" onClick={() => setBoqFilters({ search: '', structure: 'all', discipline: 'all', unit: 'all', qtyStatus: 'all', qsStatus: 'all', subcontractorStatus: 'all', duplicateStatus: 'all', minQty: '', maxQty: '', minRate: '', maxRate: '' })}>Reset Filters</Button>
                  </Toolbar>
                </div>
                <Toolbar>
                  <Button onClick={printProfessionalBoqReport}>🧾 Professional BOQ Report</Button>
                  <Button tone="secondary" onClick={() => {
                    // Export with node_code column for easy reimport
                    const rows = [['node_code','work_type','item_code','description','unit','qty','rate','discipline']]
                    filteredBoqItems.forEach((b: BoqItemWithStructure) => {
                      const node = structureNodes.find((n: StructureNode) => n.id === b.structure_id)
                      rows.push([node?.code ?? '', (b as any).work_type ?? '', b.item_code, b.description, b.unit, String(b.boq_qty), String(b.client_rate ?? (b as any).rate ?? 0), b.discipline ?? ''])
                    })
                    const csv = '\uFEFF' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n')
                    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'boq-export.csv'; a.click()
                  }}>⬇ Export BOQ</Button>
                  <Button tone="secondary" onClick={() => {
                    // Download template — one example row per structure node
                    const rows = [
                      ['node_code','work_type','item_code','description','unit','qty','rate','discipline'],
                      ['--- Available Node Codes Below ---','','','','','','',''],
                      ...structureNodes.map((n: StructureNode) => [n.code, 'Concrete / خرسانات', '', 'Enter description here', 'm2', '0', '0', 'Structural']),
                    ]
                    const csv = '\uFEFF' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n')
                    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'boq-template.csv'; a.click()
                  }}>⬇ Download Template</Button>
                  <label style={{cursor:'pointer'}}>
                    <span style={{padding:'6px 14px',background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:6,fontSize:13,fontWeight:600}}>⬆ Upload BOQ (CSV)</span>
                    <input type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={async (e) => {
                      if (!projectId) return
                      const file = e.target.files?.[0]; if (!file) return
                      setBoqUploadError('')
                      try {
                        let rows: string[][] = []
                        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                          // Use SheetJS for Excel files
                          const XLSX = await import('xlsx')
                          const buf = await file.arrayBuffer()
                          const wb = XLSX.read(buf, { type: 'array' })
                          const ws = wb.Sheets[wb.SheetNames[0]]
                          rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
                        } else {
                          // CSV parsing with proper quote handling
                          const text = await file.text()
                          const cleaned = text.replace(/^\uFEFF/, '') // strip BOM
                          rows = cleaned.trim().split(/\r?\n/).map(line => {
                            const result: string[] = []
                            let cur = '', inQ = false
                            for (let i = 0; i < line.length; i++) {
                              if (line[i] === '"') {
                                if (inQ && line[i+1] === '"') { cur += '"'; i++ }
                                else inQ = !inQ
                              } else if (line[i] === ',' && !inQ) {
                                result.push(cur.trim()); cur = ''
                              } else cur += line[i]
                            }
                            result.push(cur.trim())
                            return result
                          })
                        }
                        // Find header row - handle "node_code (from structure)" or "node_code"
                        const headerRow = rows[0].map(h => String(h).trim().toLowerCase())
                        const colIdx = {
                          node: headerRow.findIndex(h => h.includes('node') || h.includes('structure')),
                          work: headerRow.findIndex(h => h.includes('work') || h.includes('trade') || h.includes('scope')),
                          code: headerRow.findIndex(h => h === 'item_code' || h === 'code'),
                          desc: headerRow.findIndex(h => h.includes('desc')),
                          unit: headerRow.findIndex(h => h === 'unit'),
                          qty: headerRow.findIndex(h => h === 'qty' || h.includes('qty')),
                          rate: headerRow.findIndex(h => h === 'rate' || h.includes('rate')),
                          disc: headerRow.findIndex(h => h.includes('disc')),
                        }
                        // Fallback to positional if headers not found
                        const getCol = (row: string[], idx: number, fallback: number) => String(row[idx >= 0 ? idx : fallback] ?? '').trim()

                        const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim()) && !String(r[0]).includes('---') && !String(r[0]).includes('Available'))
                        const nodeMap = new Map(structureNodes.map((n: StructureNode) => [n.code.trim().toLowerCase(), n.id]))
                        const items = dataRows.map(cols => {
                          const nodeCode = getCol(cols, colIdx.node, 0)
                          const work_type = getCol(cols, colIdx.work, 1)
                          const item_code = getCol(cols, colIdx.code, 2)
                          const description = getCol(cols, colIdx.desc, 3)
                          const unit = getCol(cols, colIdx.unit, 4) || 'm2'
                          const qty = getCol(cols, colIdx.qty, 5)
                          const rate = getCol(cols, colIdx.rate, 6)
                          const discipline = getCol(cols, colIdx.disc, 7)
                          // Only set structure_id if node code matches - never send invalid id
                          const structure_id = nodeCode ? (nodeMap.get(nodeCode.toLowerCase()) ?? null) : null
                          const row: any = { item_code, description, unit, boq_qty: parseFloat(qty)||0, client_rate: parseFloat(rate)||0, discipline: discipline||null, work_type: work_type||null, is_provisional: false }
                          if (structure_id) row.structure_id = structure_id
                          return row
                        }).filter(i => i.item_code && i.description)
                        if (!items.length) { setBoqUploadError('No valid rows found. Make sure the file matches the downloaded template.'); return }
                        await bulkImportBoq.mutateAsync({ projectId, items })
                        e.target.value = ''
                      } catch(err) {
                        setBoqUploadError('Failed to parse file: ' + String(err))
                      }
                    }} />
                  </label>
                  {boqUploadError && <span style={{color:'#e53e3e',fontSize:13}}>{boqUploadError}</span>}
                  {bulkImportBoq.isPending && <span style={{fontSize:13,color:'#666'}}>Importing...</span>}
                  {bulkImportBoq.isSuccess && <span style={{fontSize:13,color:'#2e7d32'}}>✓ Import successful</span>}
                </Toolbar>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['Structure','Work Type','Code','Description','Unit','Qty','Rate','Discipline','Actions'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredBoqItems.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No BOQ items match the current filters.</td></tr>}
                      {groupedBoqItems.map((disciplineGroup) => {
                        const disciplineCollapsed = collapsedBoqGroups.includes(disciplineGroup.key)
                        return <Fragment key={disciplineGroup.key}>
                          {boqDisciplineGrouping && <tr style={{ background: '#eaf6ef' }}>
                            <td colSpan={9} style={{ padding: '10px 12px', fontWeight: 900, color: '#0f5c3f', borderTop: '1px solid #cfe8d8' }}>
                              <button onClick={() => toggleBoqGroup(disciplineGroup.key)} style={{ marginRight: 8, border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 900 }}>{disciplineCollapsed ? '▶' : '▼'}</button>
                              {disciplineGroup.kind === 'structure' ? 'Villa / Structure' : 'Discipline'}: {disciplineGroup.title} · {disciplineGroup.groups.reduce((sum, g) => sum + g.items.length, 0)} items · Total Qty {round3(disciplineGroup.totalQty)} · Total Value {money(disciplineGroup.totalValue)}
                            </td>
                          </tr>}
                          {!disciplineCollapsed && disciplineGroup.groups.map((boqGroup) => {
                            const groupCollapsed = collapsedBoqGroups.includes(boqGroup.key)
                            return <Fragment key={boqGroup.key}>
                              {boqGroupBy !== 'none' && <tr style={{ background: '#f7fbf8' }}>
                                <td colSpan={9} style={{ padding: '8px 12px', fontWeight: 800, color: '#333', borderTop: '1px solid #eee' }}>
                                  <button onClick={() => toggleBoqGroup(boqGroup.key)} style={{ marginRight: 8, border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 900 }}>{groupCollapsed ? '▶' : '▼'}</button>
                                  {boqGroup.title} · {boqGroup.items.length} items · Qty {round3(boqGroup.totalQty)} · Value {money(boqGroup.totalValue)}
                                </td>
                              </tr>}
                              {!groupCollapsed && boqGroup.items.map((b: BoqItemWithStructure) => {

                        const s = structureNodes.find((n: StructureNode) => n.id === b.structure_id)
                        const isEditing = editingBoqId === b.id
                        return (
                          <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0', background: isEditing ? '#f0f7f4' : 'white' }}>
                            {isEditing ? <>
                              <td style={{ padding: '5px 6px' }}><Select value={editBoqForm.structure_id ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, structure_id: e.target.value })}><option value="">—</option>{structureNodes.map((n: StructureNode) => <option key={n.id} value={n.id}>{n.code} — {n.name} ({n.type})</option>)}</Select></td>
                              <td style={{ padding: '5px 6px' }}><Select value={editBoqForm.work_type ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, work_type: e.target.value })}><option value="">—</option>{BOQ_WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</Select></td>
                              <td style={{ padding: '5px 6px' }}><Input value={editBoqForm.item_code ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, item_code: e.target.value })} style={{ width: 80 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input value={editBoqForm.description ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, description: e.target.value })} /></td>
                              <td style={{ padding: '5px 6px' }}><Input value={editBoqForm.unit ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, unit: e.target.value })} style={{ width: 60 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input type="number" value={editBoqForm.boq_qty ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, boq_qty: e.target.value })} style={{ width: 80 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input type="number" value={editBoqForm.client_rate ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, client_rate: e.target.value })} style={{ width: 90 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Select value={editBoqForm.discipline ?? ''} onChange={e => setEditBoqForm({ ...editBoqForm, discipline: e.target.value })}><option value="">—</option>{disciplineOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}</Select></td>
                              <td style={{ padding: '5px 6px' }}><div style={{ display: 'flex', gap: 4 }}>
                                <Button onClick={async () => { await run('Update BOQ', () => updateBoqItem.mutateAsync({ id: b.id, data: { item_code: editBoqForm.item_code, description: editBoqForm.description, unit: editBoqForm.unit, boq_qty: parseFloat(editBoqForm.boq_qty)||0, client_rate: parseFloat(editBoqForm.client_rate)||0, discipline: editBoqForm.discipline||null, structure_id: editBoqForm.structure_id||null, work_type: editBoqForm.work_type||null } as any })); setEditingBoqId(null) }} disabled={updateBoqItem.isPending}>Save</Button>
                                <Button tone="secondary" onClick={() => setEditingBoqId(null)}>Cancel</Button>
                              </div></td>
                            </> : <>
                              <td style={{ padding: '7px 10px' }}>{s ? <span title={structurePath((s as StructureNode).id)} style={{background: (NODE_COLORS[(s as StructureNode).type] ?? '#888') + '22', color: NODE_COLORS[(s as StructureNode).type] ?? '#888', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700}}>{(s as StructureNode).code}</span> : '—'}</td>
                              <td style={{ padding: '7px 10px' }}>{(b as any).work_type ?? '—'}</td>
                              <td style={{ padding: '7px 10px', fontWeight: 700 }}>{b.item_code}</td>
                              <td style={{ padding: '7px 10px' }}>{b.description}</td>
                              <td style={{ padding: '7px 10px' }}>{b.unit}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{b.boq_qty}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{money(b.client_rate ?? b.rate ?? null)}</td>
                              <td style={{ padding: '7px 10px' }}>{b.discipline ?? '—'}</td>
                              <td style={{ padding: '7px 10px' }}><div style={{ display: 'flex', gap: 4 }}>
                                <Button tone="secondary" onClick={() => { setEditingBoqId(b.id); setEditBoqForm({ item_code: b.item_code, description: b.description, unit: b.unit, boq_qty: String(b.boq_qty), client_rate: String(b.client_rate ?? b.rate ?? 0), discipline: b.discipline ?? '', structure_id: b.structure_id ?? '', work_type: (b as any).work_type ?? '' }) }}>Edit</Button>
                                <Button tone="danger" onClick={() => { if (confirm('Delete?')) run('Delete', () => deleteBoqItem.mutateAsync({ id: b.id, projectId: projectId! })) }}>✕</Button>
                              </div></td>
                            </>}
                          </tr>
                        )

                              })}
                            </Fragment>
                          })}
                        </Fragment>
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {activeView === 'subcontractors' && (
            <>
              <Card title="Add Subcontractor">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Code"><Input value={subForm.subcontractor_code} onChange={e => setSubForm({ ...subForm, subcontractor_code: e.target.value })} placeholder="e.g. SC-001" /></Field>
                    <Field label="Name"><Input value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} placeholder="Company name" /></Field>
                    <Field label="Work Type / نوع العمل"><Select value={subForm.trade_scope} onChange={e => setSubForm({ ...subForm, trade_scope: e.target.value })}><option value="">Select trade</option>{SUBCONTRACTOR_TRADES.map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
                    <Field label="Contact Person"><Input value={subForm.contact_person} onChange={e => setSubForm({ ...subForm, contact_person: e.target.value })} /></Field>
                    <Field label="Phone"><Input value={subForm.phone} onChange={e => setSubForm({ ...subForm, phone: e.target.value })} /></Field>
                    <Field label="Email"><Input value={subForm.email} onChange={e => setSubForm({ ...subForm, email: e.target.value })} /></Field>
                  </FormGrid>
                  <Toolbar><Button onClick={addSubcontractor} disabled={!subForm.subcontractor_code || !subForm.name}>Add Subcontractor to Current Project</Button></Toolbar>
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef0ea' }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Link Existing Global Subcontractor to This Project</div>
                    <Toolbar>
                      <div style={{ minWidth: 320 }}>
                        <Select value={linkExistingSubId} onChange={e => setLinkExistingSubId(e.target.value)}>
                          <option value="">Select existing subcontractor</option>
                          {availableSubcontractorsForLink.map((s: any) => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                        </Select>
                      </div>
                      <Button tone="secondary" onClick={linkExistingSubcontractor} disabled={!linkExistingSubId}>Link to Project</Button>
                    </Toolbar>
                  </div>
                </>}
              </Card>
              <Card title="Project Subcontractors">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['Code','Name','Work Type','Contact','Phone','Retention %','Advance Amt','Recovery %','Status','Actions'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {subcontractors.length === 0 && <tr><td colSpan={10} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No subcontractors yet.</td></tr>}
                      {subcontractors.map(s => {
                        const isEditing = editingSubId === s.id
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: isEditing ? '#f0f7f4' : 'white' }}>
                            {isEditing ? <>
                              <td style={{ padding: '5px 6px' }}><Input value={editSubForm.subcontractor_code ?? ''} onChange={e => setEditSubForm({ ...editSubForm, subcontractor_code: e.target.value })} style={{ width: 80 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input value={editSubForm.name ?? ''} onChange={e => setEditSubForm({ ...editSubForm, name: e.target.value })} /></td>
                              <td style={{ padding: '5px 6px' }}><Select value={editSubForm.trade_scope ?? ''} onChange={e => setEditSubForm({ ...editSubForm, trade_scope: e.target.value })}><option value="">Select</option>{SUBCONTRACTOR_TRADES.map(t => <option key={t} value={t}>{t}</option>)}</Select></td>
                              <td style={{ padding: '5px 6px' }}><Input value={editSubForm.contact_person ?? ''} onChange={e => setEditSubForm({ ...editSubForm, contact_person: e.target.value })} /></td>
                              <td style={{ padding: '5px 6px' }}><Input value={editSubForm.phone ?? ''} onChange={e => setEditSubForm({ ...editSubForm, phone: e.target.value })} style={{ width: 110 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input type="number" value={editSubForm.default_retention_pct ?? ''} onChange={e => setEditSubForm({ ...editSubForm, default_retention_pct: e.target.value })} style={{ width: 60 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input type="number" value={editSubForm.advance_amount ?? ''} onChange={e => setEditSubForm({ ...editSubForm, advance_amount: e.target.value })} style={{ width: 100 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Input type="number" value={editSubForm.advance_recovery_pct ?? ''} onChange={e => setEditSubForm({ ...editSubForm, advance_recovery_pct: e.target.value })} style={{ width: 60 }} /></td>
                              <td style={{ padding: '5px 6px' }}><Select value={editSubForm.status ?? ''} onChange={e => setEditSubForm({ ...editSubForm, status: e.target.value })}>{['Active','Inactive','Suspended'].map(st => <option key={st} value={st}>{st}</option>)}</Select></td>
                              <td style={{ padding: '5px 6px' }}><div style={{ display: 'flex', gap: 4 }}>
                                <Button onClick={async () => { await run('Update', () => updateSubcontractor.mutateAsync({ id: s.id, data: { subcontractor_code: editSubForm.subcontractor_code, name: editSubForm.name, trade_scope: editSubForm.trade_scope||null, contact_person: editSubForm.contact_person||null, phone: editSubForm.phone||null, default_retention_pct: parseFloat(editSubForm.default_retention_pct)||5, advance_amount: parseFloat(editSubForm.advance_amount)||null, advance_recovery_pct: parseFloat(editSubForm.advance_recovery_pct)||null, status: editSubForm.status } })); setEditingSubId(null) }} disabled={updateSubcontractor.isPending}>Save</Button>
                                <Button tone="secondary" onClick={() => setEditingSubId(null)}>Cancel</Button>
                              </div></td>
                            </> : <>
                              <td style={{ padding: '7px 10px', fontWeight: 700 }}>{s.subcontractor_code}</td>
                              <td style={{ padding: '7px 10px' }}>{s.name}</td>
                              <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: '#eef6ff', color: '#1565c0' }}>{(s as any).trade_scope ?? '—'}</span></td>
                              <td style={{ padding: '7px 10px', color: '#666' }}>{s.contact_person ?? '—'}</td>
                              <td style={{ padding: '7px 10px', color: '#666' }}>{s.phone ?? '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{s.default_retention_pct}%</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{s.advance_amount ? money(s.advance_amount) : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{s.advance_recovery_pct ? s.advance_recovery_pct + '%' : '—'}</td>
                              <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.status === 'Active' ? '#e8f5e9' : '#fff3e0', color: s.status === 'Active' ? '#2e7d32' : '#e65100' }}>{s.status}</span></td>
                              <td style={{ padding: '7px 10px' }}><div style={{ display: 'flex', gap: 4 }}>
                                <Button tone="secondary" onClick={() => { setEditingSubId(s.id); setEditSubForm({ subcontractor_code: s.subcontractor_code, name: s.name, trade_scope: (s as any).trade_scope ?? '', contact_person: s.contact_person ?? '', phone: s.phone ?? '', default_retention_pct: String(s.default_retention_pct), advance_amount: String(s.advance_amount ?? ''), advance_recovery_pct: String(s.advance_recovery_pct ?? ''), status: s.status }) }}>Edit</Button>
                                <Button tone="danger" onClick={() => { if (confirm('Remove this subcontractor from the current project only? The global subcontractor master record will stay.')) run('Remove from project', () => deleteSubcontractor.mutateAsync({ id: s.id, projectId: projectId! })) }}>✕</Button>
                              </div></td>
                            </>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {activeView === 'breakdown' && (() => {
            if (!projectId) return <Card title="Subcontractor Contracts"><div>Select a project first.</div></Card>

            const contractTabs = ([
              ['overview', 'Contract Overview'],
              ['terms', 'Contract Terms'],
              ['financial', 'Financial Terms'],
              ['items', 'Contract Items'],
              ['invoices', 'Linked Invoices'],
              ['breakdown', 'Smart Breakdown'],
            ] as const)
            const renderContractTabs = () => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14, background: '#f4f6f2', borderRadius: 8, padding: 4, width: 'fit-content' }}>
                {contractTabs.map(([id, label]) => (<button key={id} onClick={() => setContractTab(id)} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, border: contractTab === id ? '1px solid #d9e3de' : '1px solid transparent', background: contractTab === id ? '#fff' : 'transparent', color: contractTab === id ? '#1f2933' : '#667085', fontWeight: contractTab === id ? 800 : 600, cursor: 'pointer' }}>{label}</button>))}
              </div>
            )
            const selectedLocalContract = selectedContract ?? (localContracts[0] as any | undefined)
            const sampleSub = selectedLocalContract?.subcontractor_id ? subcontractors.find((s: any) => String(s.id) === String(selectedLocalContract.subcontractor_id)) : (subcontractors[0] as any)
            const sampleBreakdown = breakdowns[0] as any
            const fallbackContractValue = breakdowns.reduce((sum: number, b: any) => sum + Number(b.contract_value || 0), 0)
            const contractNo = sampleSub?.subcontractor_code ? `SC-${sampleSub.subcontractor_code}` : 'SC-001'
            const contractStatus = selectedLocalContract?.status ?? sampleSub?.status ?? 'Active'
            const contractScope = sampleSub?.trade_scope ?? sampleBreakdown?.discipline ?? 'Structural works / subcontract scope'
            const contractSubName = sampleSub?.name ?? sampleBreakdown?.subcontractors?.name ?? 'Select subcontractor'
            const contractRetention = Number(sampleSub?.default_retention_pct ?? 10)
            const contractAdvance = Number(sampleSub?.advance_amount ?? 0)
            const contractAdvanceRecovery = Number(sampleSub?.advance_recovery_pct ?? 20)
            const hasSelectedContract = Boolean(selectedLocalContract?.id && !String(selectedLocalContract.id).startsWith('local-contract-'))
            const displayContractNo = selectedLocalContract?.contract_no || contractNo
            const displaySubName = selectedLocalContract?.subcontractor_name || sampleSub?.name || contractSubName
            const displayScope = selectedLocalContract?.scope_of_work || contractTerms?.scope_of_work || contractScope
            const displayContractValue = selectedLocalContract?.contract_value ? Number(selectedLocalContract.contract_value) : fallbackContractValue
            const displayRetention = contractTerms?.retention_percent !== undefined && contractTerms?.retention_percent !== null ? Number(contractTerms.retention_percent) : contractRetention
            const displayAdvanceRecovery = contractTerms?.advance_recovery_percent !== undefined && contractTerms?.advance_recovery_percent !== null ? Number(contractTerms.advance_recovery_percent) : contractAdvanceRecovery
            const displayAdvanceAmount = contractTerms?.advance_payment_value !== undefined && contractTerms?.advance_payment_value !== null ? Number(contractTerms.advance_payment_value) : contractAdvance
            const linkedContractInvoices = hasSelectedContract ? certificates.filter((c: any) => String(c.contract_id ?? '') === String(selectedLocalContract.id) || (!!c.contract_no && String(c.contract_no) === String(displayContractNo))) : []
            const linkedInvoiceValue = linkedContractInvoices.reduce((sum: number, c: any) => sum + Number(c.net_payable ?? c.net_amount ?? c.gross_amount ?? 0), 0)
            const openInvoiceFromContract = () => { void createInvoiceFromSelectedContract() }
            const createLocalContract = saveContractToSupabase
            const updateContractDraft = (key: string, value: string) => setContractDraft((prev) => ({ ...prev, [key]: value }))
            const newContractModal = showNewContractModal ? (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                <div style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 18, border: '1px solid #d9e3de', boxShadow: '0 22px 60px rgba(15,23,42,.24)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #e5e7de', background: '#f7f8f6' }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#1f2933' }}>{editingContractId ? 'Edit Subcontractor Contract' : '+ New Subcontractor Contract'}</div>
                      <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>Save contract identity and terms directly into Supabase before generating invoices.</div>
                    </div>
                    <Button tone="secondary" onClick={() => setShowNewContractModal(false)}>Close</Button>
                  </div>
                  <div style={{ padding: 18 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                      <Field label="Contract No"><Input value={contractDraft.contract_no} placeholder="Auto: SC-001" onChange={(e) => updateContractDraft('contract_no', e.target.value)} /></Field>
                      <Field label="Subcontractor"><Select value={contractDraft.subcontractor_id} onChange={(e) => updateContractDraft('subcontractor_id', e.target.value)}><option value="">Select subcontractor</option>{subcontractors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                      <Field label="Contract Date"><Input type="date" value={contractDraft.contract_date} onChange={(e) => updateContractDraft('contract_date', e.target.value)} /></Field>
                      <Field label="Start Date"><Input type="date" value={contractDraft.start_date} onChange={(e) => updateContractDraft('start_date', e.target.value)} /></Field>
                      <Field label="Completion Date"><Input type="date" value={contractDraft.end_date} onChange={(e) => updateContractDraft('end_date', e.target.value)} /></Field>
                      <Field label="Contract Value"><Input type="number" value={contractDraft.contract_value} placeholder="0.00" onChange={(e) => updateContractDraft('contract_value', e.target.value)} /></Field>
                      <Field label="Contract Type">
                        <Select value={contractDraft.pricing_basis} onChange={(e) => {
                          const value = e.target.value
                          updateContractDraft('pricing_basis', value)
                          updateContractDraft('contract_type', value === 'lump_sum' ? 'Lump Sum / مقطوعية' : value === 'dayworks' ? 'Dayworks / يوميات' : value === 'supply_apply' ? 'Supply & Apply / توريد وتركيب' : value === 'labor_only' ? 'Labor Only / مصنعية فقط' : 'BOQ Unit Rate')
                        }}>
                          <option value="boq_unit_rate">BOQ Unit Rate</option>
                          <option value="lump_sum">Lump Sum / مقطوعية</option>
                          <option value="labor_only">Labor Only / مصنعية فقط</option>
                          <option value="supply_apply">Supply & Apply / توريد وتركيب</option>
                          <option value="dayworks">Dayworks / يوميات</option>
                        </Select>
                      </Field>
                      {contractDraft.pricing_basis === 'lump_sum' && <Field label="Lump Sum Amount"><Input type="number" value={contractDraft.lump_sum_amount} placeholder="0.00" onChange={(e) => updateContractDraft('lump_sum_amount', e.target.value)} /></Field>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                      <Field label="Advance Payment Type"><Select value={contractDraft.advance_payment_type} onChange={(e) => updateContractDraft('advance_payment_type', e.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option><option value="none">No Advance</option></Select></Field>
                      <Field label="Advance Payment Value"><Input value={contractDraft.advance_payment_value} placeholder="e.g. 10 or 250000" onChange={(e) => updateContractDraft('advance_payment_value', e.target.value)} /></Field>
                      <Field label="Advance Recovery %"><Input value={contractDraft.advance_recovery_pct} onChange={(e) => updateContractDraft('advance_recovery_pct', e.target.value)} /></Field>
                      <Field label="Retention %"><Input value={contractDraft.retention_pct} onChange={(e) => updateContractDraft('retention_pct', e.target.value)} /></Field>
                      <Field label="Delay Penalty"><Input value={contractDraft.delay_penalty_rate} onChange={(e) => updateContractDraft('delay_penalty_rate', e.target.value)} /></Field>
                      <Field label="Payment Terms"><Input value={contractDraft.payment_terms} onChange={(e) => updateContractDraft('payment_terms', e.target.value)} /></Field>
                    </div>
                    <Field label="Scope of Work"><TextArea value={contractDraft.scope_of_work} placeholder="Describe subcontract scope, BOQ packages, project structure, and exclusions..." onChange={(e) => updateContractDraft('scope_of_work', e.target.value)} /></Field>
                    <div style={{ height: 10 }} />
                    <Field label="Special Conditions / Contract Terms Notes"><TextArea value={contractDraft.special_conditions} placeholder="Insurance, bond, warranty/DLP, supplied materials, back charges, variations, claims, required documents..." onChange={(e) => updateContractDraft('special_conditions', e.target.value)} /></Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                      <Button tone="secondary" onClick={() => setShowNewContractModal(false)}>Cancel</Button>
                      <Button onClick={() => void createLocalContract()}>{editingContractId ? 'Save Contract Changes' : 'Save Contract'}</Button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: '#667085' }}>Saved data writes to subcontractor_contracts, subcontractor_contract_terms and subcontractor_contract_items after V140_04.</div>
                  </div>
                </div>
              </div>
            ) : null
            const contractShellStyle = { background: '#f7f8f6', border: '1px solid #e7e9e2', borderRadius: 18, padding: 16 } as const
            const contractSectionStyle = { background: '#fff', border: '1px solid #e5e7de', borderRadius: 14, marginBottom: 10, overflow: 'hidden' } as const
            const contractTitleStyle = { fontSize: 11, fontWeight: 800, color: '#667085', padding: '10px 14px', borderBottom: '1px solid #e5e7de', background: '#f4f6f2', textTransform: 'uppercase' as const, letterSpacing: '.05em' } as const
            const contractGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' } as const
            const contractField = (label: string, value: any, extra?: any) => (<div style={{ padding: '10px 14px', borderRight: '1px solid #e5e7de', borderBottom: '1px solid #e5e7de', ...extra }}><div style={{ fontSize: 10, color: '#667085', marginBottom: 4, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 12, color: '#1f2933', fontWeight: 800 }}>{value ?? '—'}</div></div>)
            if (contractTab !== 'breakdown') return (
              <div style={contractShellStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}><div><div style={{ fontSize: 18, fontWeight: 800, color: '#1f2933' }}>Subcontractor Contracts</div><div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{projectName} · contract identity, terms, items and linked invoices</div>{hasSelectedContract && <div style={{ fontSize: 11, color: '#0f6e56', marginTop: 6, fontWeight: 800 }}>Selected contract: {displayContractNo} — {displaySubName}</div>}</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Button onClick={openNewContractModal}>+ New Contract</Button><Button tone="secondary" disabled={!hasSelectedContract} onClick={() => void openEditContractModal()}>Edit Contract</Button><Button tone="secondary" onClick={() => setContractTab('breakdown')}>Smart Breakdown</Button><Button disabled={!hasSelectedContract} title={!hasSelectedContract ? 'Create or select a contract first' : 'Create invoice from selected contract'} onClick={openInvoiceFromContract}>Create Invoice from Contract</Button></div></div>
                {newContractModal}
                {contractsLoading && <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid #d9e3de', background: '#fff', borderRadius: 10, fontSize: 12, color: '#667085' }}>Loading saved contracts from Supabase...</div>}
                {contracts.length > 0 && <div style={{ marginBottom: 12 }}><Field label="Select Saved Contract"><Select value={selectedContractId} onChange={(e) => setSelectedContractId(e.target.value)}>{contracts.map((c: any) => <option key={c.id} value={c.id}>{c.contract_no ?? 'Contract'} — {c.subcontractor_name ?? 'No subcontractor'} — {money(c.contract_value ?? 0)}</option>)}</Select></Field></div>}
                {!hasSelectedContract && <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid #faeeda', background: '#fff8e8', color: '#633806', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>Create or select a saved subcontractor contract first. Invoices can only be generated from an existing selected contract.</div>}
                {renderContractTabs()}
                {contractTab === 'overview' && (<><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}><Metric label="Subcontractors" value={subcontractors.length} /><Metric label="Contract Items" value={contractItems.length || breakdowns.length} /><Metric label="Contract Value" value={money(displayContractValue)} /><Metric label="Linked Invoices" value={linkedContractInvoices.length} /></div><div style={contractSectionStyle}><div style={contractTitleStyle}>Contract Identity</div><div style={contractGridStyle}>{contractField('Contract No', displayContractNo)}{contractField('Subcontractor', displaySubName)}{contractField('Status', <span style={{ padding: '2px 9px', borderRadius: 20, background: '#e1f5ee', color: '#0f6e56' }}>{contractStatus}</span>)}{contractField('Contract Type', selectedLocalContract?.contract_type ?? 'BOQ Unit Rate')}{contractField('Project', projectName)}{contractField('Project Structure Location', sampleBreakdown?.structure_nodes?.code ?? sampleBreakdown?.structure_label ?? 'Project level / linked structure')}{contractField('Scope of Work', displayScope)}{contractField('Contract Date', 'Prepared from current breakdown data')}{contractField('Start / End Date', 'To be completed in Contract Terms')}{contractField('Contract Value', money(displayContractValue))}{contractField('Linked BOQ / Breakdown', `${breakdowns.length} breakdown line(s) linked`)}</div></div></>)}
                {contractTab === 'terms' && (<div style={contractSectionStyle}><div style={contractTitleStyle}>Contract Terms</div><div style={contractGridStyle}>{[
                  ['Scope of Work', displayScope], ['Contract Duration', 'From start date until completion date'], ['Start Date', contractTerms?.start_date || selectedLocalContract?.start_date || 'To be confirmed'], ['Completion Date', contractTerms?.completion_date || selectedLocalContract?.end_date || 'To be confirmed'], ['Payment Terms', contractTerms?.payment_terms || 'Net 30 days after approved certificate / CEO release'], ['Advance Payment Type', contractTerms?.advance_payment_type || (displayAdvanceAmount > 0 ? 'Fixed Amount' : 'Percentage or Fixed Amount')], ['Advance Payment Value', displayAdvanceAmount > 0 ? money(displayAdvanceAmount) : '0% / EGP 0'], ['Advance Recovery Method', contractTerms?.advance_recovery_method || `${displayAdvanceRecovery || 20}% recovery from each invoice`], ['Retention Percentage', `${displayRetention}%`], ['Retention Cap', contractTerms?.retention_cap || 'Up to agreed contract cap'], ['Retention Release Rules', contractTerms?.retention_release_rules || 'Release at practical completion / DLP as per contract'], ['VAT / Tax', contractTerms?.tax_rules || 'As per local tax law / invoice settings'], ['Insurance Requirements', contractTerms?.insurance_requirements || 'Third party, workmen compensation, all-risk where required'], ['Performance Bond / Guarantee', contractTerms?.performance_bond_rules || 'Required if stated in contract documents'], ['Delay Penalty Rate', contractTerms?.delay_penalty_rate !== undefined && contractTerms?.delay_penalty_rate !== null ? `${contractTerms.delay_penalty_rate}%` : '0.5% per week, configurable'], ['Maximum Delay Penalty Cap', contractTerms?.delay_penalty_cap || '10% of contract value unless overridden'], ['Defects Liability / Warranty Period', contractTerms?.defects_liability_period || '12 months unless project contract says otherwise'], ['Materials Supplied by Main Contractor', contractTerms?.materials_supplied_rules || 'Deduct / back charge supplied materials from invoices'], ['Back Charges / Deductions Rules', contractTerms?.back_charges_rules || 'Safety, quality, damages, materials, penalties and manual deductions'], ['Variation / Extra Work Approval Rules', contractTerms?.variation_approval_rules || 'Only approved variations are payable'], ['Claims Rules', contractTerms?.claims_rules || 'Claims require supporting documents and approval workflow'], ['Termination / Cancellation Terms', contractTerms?.termination_rules || 'As per signed subcontract agreement'], ['Required Documents / Attachments', contractTerms?.required_documents || 'Signed contract, insurance, tax card, commercial register, bank details'], ['Special Conditions', contractTerms?.special_conditions || selectedLocalContract?.notes || 'Project-specific conditions and scope exclusions'], ['Notes', contractTerms?.notes || 'Saved in subcontractor_contract_terms']
                ].map(([label, value]) => contractField(label, value))}</div></div>)}
                {contractTab === 'financial' && (<div style={contractSectionStyle}><div style={contractTitleStyle}>Financial Terms</div><div style={contractGridStyle}>{[
                  ['Contract Value', money(displayContractValue)], ['Advance Payment', displayAdvanceAmount > 0 ? money(displayAdvanceAmount) : 'Not set'], ['Advance Recovery %', `${displayAdvanceRecovery || 20}% per invoice`], ['Retention %', `${displayRetention}%`], ['Delay Penalty', contractTerms?.delay_penalty_rate !== undefined && contractTerms?.delay_penalty_rate !== null ? `${contractTerms.delay_penalty_rate}%` : '0.5% per week · max 10%'], ['VAT / Tax', '5% VAT / configurable'], ['Insurance', 'Required documents before release'], ['Payment Terms', contractTerms?.payment_terms || 'Net 30 after CEO approval'], ['Deductions', 'Retention, advance recovery, penalties, supplied materials'], ['Additions', 'Approved variations, claims, extra works'], ['Back Charges', 'Manual back charges with reason and audit trail']
                ].map(([label, value]) => contractField(label, value))}</div></div>)}
                {contractTab === 'items' && (<div style={contractSectionStyle}><div style={contractTitleStyle}>Contract Items (saved in subcontractor_contract_items)</div><div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><div style={{ fontSize: 12, color: '#667085', fontWeight: 700 }}>Items are loaded from Supabase and can be synced from the Smart Breakdown.</div><Button disabled={!hasSelectedContract} onClick={() => void syncContractItemsFromBreakdowns()}>Sync Items from Breakdown</Button></div><Table heads={['Code', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Notes', 'Actions']} rows={(contractItems.length ? contractItems : []).slice(0, 150).map((item: any) => editingContractItemId === item.id ? [<Input value={editContractItemForm.item_code} onChange={(e) => setEditContractItemForm(prev => ({ ...prev, item_code: e.target.value }))} />, <Input value={editContractItemForm.description} onChange={(e) => setEditContractItemForm(prev => ({ ...prev, description: e.target.value }))} />, <Input value={editContractItemForm.unit} onChange={(e) => setEditContractItemForm(prev => ({ ...prev, unit: e.target.value }))} />, <Input type="number" value={editContractItemForm.quantity} onChange={(e) => setEditContractItemForm(prev => ({ ...prev, quantity: e.target.value }))} />, <Input type="number" value={editContractItemForm.rate} onChange={(e) => setEditContractItemForm(prev => ({ ...prev, rate: e.target.value }))} />, money(Number(editContractItemForm.quantity || 0) * Number(editContractItemForm.rate || 0)), <Input value={editContractItemForm.notes} onChange={(e) => setEditContractItemForm(prev => ({ ...prev, notes: e.target.value }))} />, <div style={{ display: 'flex', gap: 6 }}><Button onClick={() => void saveContractItemEdit(item.id)}>Save</Button><Button tone="secondary" onClick={() => setEditingContractItemId(null)}>Cancel</Button></div>] : [item.item_code ?? '—', item.description ?? '—', item.unit ?? '—', Number(item.quantity ?? 0), money(item.rate ?? 0), money(item.amount ?? (Number(item.quantity ?? 0) * Number(item.rate ?? 0))), item.notes ?? '—', <Button tone="secondary" onClick={() => startEditContractItem(item)}>Edit</Button>])} />{hasSelectedContract && contractItems.length === 0 && <div style={{ padding: 14, fontSize: 12, color: '#667085' }}>No saved contract items yet. Click Sync Items from Breakdown to save rows into subcontractor_contract_items.</div>}</div>)}
                {contractTab === 'invoices' && (<div style={contractSectionStyle}><div style={contractTitleStyle}>Linked Subcontractor Invoices</div><div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}><Metric label="Linked Invoice Value" value={money(linkedInvoiceValue)} /><Metric label="Remaining Balance" value={money(Math.max(0, displayContractValue - linkedInvoiceValue))} /></div><Table heads={['Invoice No', 'Period', 'Subcontractor', 'Gross', 'Net', 'Status']} rows={linkedContractInvoices.slice(0, 100).map((c: any) => [c.invoice_no ?? c.cert_no ?? '—', c.period ?? c.period_label ?? c.period_end ?? '—', c.subcontractors?.name ?? displaySubName ?? '—', money(c.gross_amount ?? 0), money(c.net_payable ?? c.net_amount ?? 0), c.status ?? '—'])} /><div style={{ padding: 14 }}><Button disabled={!hasSelectedContract} title={!hasSelectedContract ? 'Create or select a contract first' : 'Create invoice from selected contract'} onClick={openInvoiceFromContract}>+ Create Invoice from this Contract</Button></div></div>)}
              </div>
            )

            // ── helpers ──────────────────────────────────────────────
            const normalizeCode = (value: any) => String(value ?? '').trim().toUpperCase()
const round3 = (value: number) => Math.round((Number(value) || 0) * 1000) / 1000


type WorkflowEntity = 'procurement' | 'grn' | 'issue' | 'finance'
type WorkflowTask = { entity: WorkflowEntity; table: string; id: string; ref: string; title: string; amount?: number; qty?: number; date?: string; status: string; owner?: string; row: any }
type WorkflowAction = 'Submit'|'Review'|'Approve'|'Return'|'Order'|'Post'|'Confirm'|'Reject'|'Cancel'
const WORKFLOW_DRAFT = ['draft', 'pr raised', 'pending']
const WORKFLOW_SUBMITTED = ['submitted']
const WORKFLOW_REVIEWED = ['reviewed']
const WORKFLOW_APPROVED = ['approved']
const WORKFLOW_POSTED = ['posted', 'confirmed', 'delivered']
const wfText = (value: any) => String(value ?? '').trim()
const wfLower = (value: any) => wfText(value).toLowerCase()
const wfEffectiveStatus = (row: any) => wfText(row?.workflow_status || row?.status || 'Draft')
const wfTone = (status: any): 'default' | 'success' | 'warn' | 'danger' => {
  const s = wfLower(status)
  if (['approved','posted','confirmed','delivered'].includes(s)) return 'success'
  if (['rejected','cancelled','canceled','returned','missing configuration'].includes(s)) return 'danger'
  if (['submitted','reviewed','pending','pending review','pending approval','pr raised','po issued','rfq issued','partially delivered'].includes(s)) return 'warn'
  return 'default'
}
            const isVillaUnitNode = (n: StructureNode) => ['villa', 'unit'].includes(String(n.type ?? '').toLowerCase())
            const childrenOf = (parentId: string) => structureNodes.filter((n: StructureNode) => n.parent_id === parentId)
            const getDescendants = (parentId: string): StructureNode[] => {
              const direct = childrenOf(parentId)
              return direct.flatMap((child: StructureNode) => [child, ...getDescendants(child.id)])
            }
            const getPhaseForNode = (node: StructureNode | null | undefined): StructureNode | null => {
              let current: StructureNode | undefined | null = node
              const guard = new Set<string>()
              while (current && !guard.has(current.id)) {
                guard.add(current.id)
                if (String(current.type ?? '').toLowerCase() === 'phase') return current
                current = structureNodes.find((p: StructureNode) => p.id === current?.parent_id)
              }
              return null
            }

            const getSameTypeNodes = (nodeId: string) => {
              const node = structureNodes.find((n: StructureNode) => n.id === nodeId)
              if (!node) return []
              const code = normalizeCode(node.code)
              return structureNodes.filter((n: StructureNode) => normalizeCode(n.code) === code)
            }

            const getDisciplinesForNode = (nodeId: string) => {
              const sameCodeNodeIds = getSameTypeNodes(nodeId).map((n: StructureNode) => n.id)
              return uniqueSortedDisciplines(boqItems.filter((b: any) => sameCodeNodeIds.includes(b.structure_id)).map((b: any) => b.discipline))
            }

            const getBoqForNodeAndTrade = (nodeId: string, trade: string) => {
              const selectedDiscipline = cleanDiscipline(trade)
              const sameCodeNodeIds = getSameTypeNodes(nodeId).map((n: StructureNode) => n.id)

              return boqItems.filter((b: any) =>
                sameCodeNodeIds.includes(b.structure_id) &&
                (!selectedDiscipline || cleanDiscipline(b.discipline) === selectedDiscipline)
              )
            }

            // Get ALL villa/unit descendants for the selected villa model code across ALL phases.
            // Recursive, so it works with Phase > Section > Cluster > Villa, not only 1-2 levels.
            const getAllVillasOfType = (nodeId: string) => {
              const sameCodeNodes = getSameTypeNodes(nodeId)
              const sameCodeIds = new Set(sameCodeNodes.map((n: StructureNode) => n.id))
              const byId = new Map<string, StructureNode>()

              sameCodeNodes.forEach((modelNode: StructureNode) => {
                getDescendants(modelNode.id).forEach((child: StructureNode) => {
                  if (isVillaUnitNode(child) && !sameCodeIds.has(child.id)) byId.set(child.id, child)
                })
              })

              return Array.from(byId.values()).sort((a: StructureNode, b: StructureNode) => {
                const aPhase = getPhaseForNode(a)
                const bPhase = getPhaseForNode(b)
                const phaseCompare = (aPhase?.code ?? '').localeCompare(bPhase?.code ?? '', undefined, { numeric: true })
                if (phaseCompare !== 0) return phaseCompare
                return a.code.localeCompare(b.code, undefined, { numeric: true })
              })
            }



            const getBoqRateKey = (item: any) => normalizeCode(item?.item_code || item?.id)
            const getExistingRateForSubBoqCode = (subcontractorId: string, item: any) => {
              if (!subcontractorId) return 0
              const code = getBoqRateKey(item)
              if (!code) return 0
              const matched = [...(breakdowns as any[])]
                .reverse()
                .find((row: any) =>
                  String(row.subcontractor_id ?? '') === String(subcontractorId) &&
                  normalizeCode(row.boq_items?.item_code ?? row.item_code ?? '') === code &&
                  Number(row.rate ?? 0) > 0
                )
              return Number(matched?.rate ?? 0)
            }
            const getEffectiveBoqRate = (item: any) => {
              const key = getBoqRateKey(item)
              const typed = parseFloat(bdRates[key] ?? '')
              if (Number.isFinite(typed) && typed > 0) return typed
              const savedRate = getExistingRateForSubBoqCode(bdSub, item)
              if (savedRate > 0) return savedRate
              return Number(item?.client_rate ?? item?.rate ?? 0)
            }
            const setRateForBoqCode = (item: any, value: string) => {
              const key = getBoqRateKey(item)
              setBdRates(prev => ({ ...prev, [key]: value }))
            }
            const syncSameBoqCodeRateForSubcontractor = async (item: any, rate: number) => {
              if (!projectId || !bdSub || !rate || rate <= 0) return
              const code = getBoqRateKey(item)
              const sameBoqIds = new Set((boqItems as any[]).filter((x: any) => normalizeCode(x.item_code) === code).map((x: any) => String(x.id)))
              const rowsToUpdate = (breakdowns as any[]).filter((row: any) =>
                String(row.project_id ?? '') === String(projectId) &&
                String(row.subcontractor_id ?? '') === String(bdSub) &&
                sameBoqIds.has(String(row.boq_item_id ?? '')) &&
                Number(row.rate ?? 0) !== Number(rate)
              )
              for (const row of rowsToUpdate) {
                await updateBreakdown.mutateAsync({
                  id: row.id,
                  data: {
                    rate,
                    contract_type: bdContractType,
                    pricing_basis: bdPricingBasis,
                    rate_source: 'auto_same_subcontractor_boq_code',
                    lump_sum_amount: bdPricingBasis === 'lump_sum' ? Number(bdLumpSumAmount || 0) : null,
                  } as any,
                })
              }
            }

            const nodeTradeOptions = bdNode ? getDisciplinesForNode(bdNode) : []
            const visibleTradeOptions = nodeTradeOptions.length ? nodeTradeOptions : contractTradeOptions
            const previewItems = bdNode ? getBoqForNodeAndTrade(bdNode, bdTrade) : []
            const node = structureNodes.find((n: StructureNode) => n.id === bdNode)

            return <>
              <Card title="Subcontractor Contracts — Smart Breakdown" action={<Badge text="Legacy logic preserved" tone="success" />}>
                {renderContractTabs()}
                <div style={{ color: '#64748b', fontSize: 13, marginBottom: 14 }}>The original smart breakdown logic is preserved below without deleting existing data entry behavior.</div>
              </Card>
              <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                {([['smart','⚡ Smart Add (by Node + Trade)'], ['list','📋 Breakdown List']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setBdTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: bdTab === id ? '#1a6b4a' : '#f0f0f0', color: bdTab === id ? '#fff' : '#333' }}>{label}</button>
                ))}
              </div>

              {bdTab === 'smart' && (
                <Card title="Smart Breakdown — Select Node + Trade + Subcontractor">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <Field label="Structure Node (select Villa Type, not individual villa)">
                      <Select value={bdNode} onChange={e => { const nextNode = e.target.value; setBdNode(nextNode); const nextDiscipline = nextNode ? getDisciplinesForNode(nextNode)[0] : contractTradeOptions[0]; if (nextDiscipline) setBdTrade(nextDiscipline); setBdRates({}); setBdSelectedVillas(new Set()) }}>
                        <option value="">— Select Node —</option>
                        {structureNodes
                          .filter((n: StructureNode) => {
                            // Show unique villa types — deduplicated by code
                            // Only show one node per villa type code (prefer the one with direct BOQ)
                            const sameCode = structureNodes.filter((s: StructureNode) => normalizeCode(s.code) === normalizeCode(n.code))
                            const firstWithBoq = sameCode.find((s: StructureNode) => boqItems.some((b: any) => b.structure_id === s.id))
                            // Show this node only if it's the canonical one (has BOQ or is first of its code)
                            const isCanonical = firstWithBoq ? firstWithBoq.id === n.id : sameCode[0]?.id === n.id
                            const hasAnyBoq = sameCode.some((s: StructureNode) => boqItems.some((b: any) => b.structure_id === s.id))
                            return isCanonical && hasAnyBoq
                          })
                          .map((n: StructureNode) => {
                            const allSameType = structureNodes.filter((s: StructureNode) => normalizeCode(s.code) === normalizeCode(n.code))
                            const sameTypeIds = new Set(allSameType.map((s: StructureNode) => s.id))
                            const totalBoq = boqItems.filter((b: any) => allSameType.some((s: StructureNode) => s.id === b.structure_id)).length
                            // Count villa/unit descendants recursively for all phases
                            const totalVillas = allSameType.reduce((sum: number, modelNode: StructureNode) => {
                              return sum + getDescendants(modelNode.id).filter((v: StructureNode) => isVillaUnitNode(v) && !sameTypeIds.has(v.id)).length
                            }, 0)
                            return <option key={n.id} value={n.id}>{n.code} — {n.name} ({totalBoq} BOQ items · {totalVillas} villas across all phases)</option>
                          })
                        }
                      </Select>
                    </Field>
                    <Field label="Trade / BOQ Discipline">
                      <Select value={bdTrade} onChange={e => { setBdTrade(e.target.value); setBdRates({}) }}>
                        {visibleTradeOptions.map((t: string) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </Field>
                    <Field label="Subcontractor">
                      <Select value={bdSub} onChange={e => setBdSub(e.target.value)}>
                        <option value="">— Select —</option>
                        {subcontractors.map(s => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Contract Type">
                      <Select value={bdPricingBasis} onChange={e => {
                        const value = e.target.value
                        setBdPricingBasis(value)
                        setBdContractType(value === 'lump_sum' ? 'Lump Sum / مقطوعية' : value === 'dayworks' ? 'Dayworks / يوميات' : value === 'supply_apply' ? 'Supply & Apply / توريد وتركيب' : value === 'labor_only' ? 'Labor Only / مصنعية فقط' : 'BOQ Unit Rate')
                      }}>
                        <option value="boq_unit_rate">BOQ Unit Rate</option>
                        <option value="lump_sum">Lump Sum / مقطوعية</option>
                        <option value="labor_only">Labor Only / مصنعية فقط</option>
                        <option value="supply_apply">Supply & Apply / توريد وتركيب</option>
                        <option value="dayworks">Dayworks / يوميات</option>
                      </Select>
                    </Field>
                    {bdPricingBasis === 'lump_sum' && (
                      <Field label="Lump Sum Amount / قيمة مقطوعية">
                        <Input type="number" value={bdLumpSumAmount} onChange={e => setBdLumpSumAmount(e.target.value)} placeholder="e.g. 250000" />
                      </Field>
                    )}
                  </div>

                  {/* Villa selector — shown when node has child villa nodes */}
                  {bdNode && (() => {
                    const childVillas = getAllVillasOfType(bdNode)
                    if (childVillas.length === 0) return null
                    return (
                      <div style={{ marginBottom: 16, padding: '14px 18px', background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#1a6b4a' }}>
                            Select Villas — {bdSelectedVillas.size} of {childVillas.length} selected
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setBdSelectedVillas(new Set(childVillas.map((v: StructureNode) => v.id)))}
                              style={{ padding: '4px 12px', background: '#e8f5e9', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>
                              Select All
                            </button>
                            <button onClick={() => setBdSelectedVillas(new Set())}
                              style={{ padding: '4px 12px', background: '#ffebee', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#c62828' }}>
                              Clear
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                          {/* Group by phase */}
                          {(() => {
                            const byPhase = new Map<string, StructureNode[]>()
                            childVillas.forEach((v: StructureNode) => {
                              const phase = getPhaseForNode(v)
                              const key = phase?.code ?? 'Other'
                              if (!byPhase.has(key)) byPhase.set(key, [])
                              byPhase.get(key)!.push(v)
                            })
                            return Array.from(byPhase.entries()).map(([phaseCode, villas]) => (
                              <div key={phaseCode} style={{ width: '100%', marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#1565c0', marginBottom: 4 }}>
                                  {phaseCode} — {villas.length} villas
                                  <button onClick={() => {
                                    const next = new Set(bdSelectedVillas)
                                    villas.forEach((v: StructureNode) => next.add(v.id))
                                    setBdSelectedVillas(next)
                                  }} style={{ marginLeft: 8, padding: '1px 8px', background: '#e3f2fd', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10, color: '#1565c0' }}>All</button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {villas.map((v: StructureNode) => {
                                    const selected = bdSelectedVillas.has(v.id)
                                    return (
                                      <button key={v.id} onClick={() => {
                                        const next = new Set(bdSelectedVillas)
                                        if (next.has(v.id)) next.delete(v.id); else next.add(v.id)
                                        setBdSelectedVillas(next)
                                      }} style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        border: `2px solid ${selected ? '#1a6b4a' : '#ddd'}`,
                                        background: selected ? '#1a6b4a' : '#fff',
                                        color: selected ? '#fff' : '#555',
                                      }}>{v.code}</button>
                                    )
                                  })}
                                </div>
                              </div>
                            ))
                          })()}
                        </div>
                        {bdSelectedVillas.size > 0 && (
                          <div style={{ marginTop: 10, fontSize: 13, color: '#555' }}>
                            Total quantity = BOQ qty × <strong>{bdSelectedVillas.size} villas</strong>
                            {previewItems.length > 0 && (
                              <span style={{ marginLeft: 12, color: '#1a6b4a', fontWeight: 700 }}>
                                (e.g. first item: {((previewItems[0] as any)?.boq_qty ?? 0) * bdSelectedVillas.size} {(previewItems[0] as any)?.unit})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {bdNode && previewItems.length === 0 && (
                    <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '12px 16px', color: '#e65100', fontSize: 13 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ No BOQ items found for {node?.code} with BOQ discipline: {bdTrade}.</div>
                      <div>Total BOQ items linked to {node?.code}: {boqItems.filter((b: any) => b.structure_id === bdNode).length}</div>
                      <div style={{ marginTop: 6 }}>
                        Disciplines available on this node/type: {(nodeTradeOptions.length ? nodeTradeOptions : getDisciplinesForNode(bdNode)).join(', ') || 'None'}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                        Tip: Select the Villa Type node (e.g. V1, V2) not individual villa units (A8, A10...)
                      </div>
                    </div>
                  )}

                  {previewItems.length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1a6b4a', marginBottom: 12 }}>
                        {previewItems.length} BOQ items found for {node?.code} — {node?.name} · BOQ Discipline: {bdTrade}
                        — Enter rates below:
                      </div>
                      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                              {['Code','Description','Unit', bdPricingBasis === 'lump_sum' ? 'LS Qty' : 'BOQ Qty','Client Rate', bdPricingBasis === 'lump_sum' ? 'Lump Sum Amount' : 'Your Rate (EGP)','Contract Value'].map(h => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewItems.map((b: any) => {
                              const rateKey = getBoqRateKey(b)
                              const savedRate = getExistingRateForSubBoqCode(bdSub, b)
                              const lumpSumLineAmount = Number(bdLumpSumAmount || 0)
                              const qty = bdPricingBasis === 'lump_sum' ? 1 : Number(b.boq_qty ?? 0)
                              const rate = bdPricingBasis === 'lump_sum' ? lumpSumLineAmount : getEffectiveBoqRate(b)
                              const contractValue = qty * rate
                              return (
                                <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '7px 10px', fontWeight: 700 }}>{b.item_code}</td>
                                  <td style={{ padding: '7px 10px', maxWidth: 280 }}>{b.description}</td>
                                  <td style={{ padding: '7px 10px' }}>{b.unit}</td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>{bdPricingBasis === 'lump_sum' ? '1' : b.boq_qty}</td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#888' }}>{money(b.client_rate ?? b.rate ?? 0)}</td>
                                  <td style={{ padding: '7px 10px', minWidth: 120 }}>
                                    <Input
                                      type="number"
                                      value={bdPricingBasis === 'lump_sum' ? bdLumpSumAmount : (bdRates[rateKey] ?? '')}
                                      onChange={e => setRateForBoqCode(b, e.target.value)}
                                      placeholder={bdPricingBasis === 'lump_sum' ? 'Lump Sum Amount' : (savedRate > 0 ? `Saved: ${savedRate}` : String(b.client_rate ?? b.rate ?? 0))}
                                      style={{ width: 110 }}
                                      disabled={bdPricingBasis === 'lump_sum'}
                                    />
                                    {savedRate > 0 && bdPricingBasis !== 'lump_sum' && <div style={{ fontSize: 10, color: '#0f6e56', marginTop: 3 }}>auto from same subcontractor + BOQ code</div>}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: rate > 0 ? '#1a6b4a' : '#aaa' }}>
                                    {rate > 0 ? money(contractValue) : '—'}
                                    {bdPricingBasis === 'lump_sum' && <div style={{ fontSize: 10, color: '#667085', marginTop: 3 }}>Qty 1 × Lump Sum</div>}
                                  </td>
                                </tr>
                              )
                            })}
                            {/* Totals */}
                            <tr style={{ background: '#f0f7f4', fontWeight: 800 }}>
                              <td colSpan={5} style={{ padding: '10px 10px' }}>TOTAL</td>
                              <td style={{ padding: '10px 10px', textAlign: 'right', color: '#1a6b4a' }}>
                                {bdPricingBasis === 'lump_sum' ? money(previewItems.length * Number(bdLumpSumAmount || 0)) : money(previewItems.reduce((s: number, b: any) => s + (b.boq_qty ?? 0) * getEffectiveBoqRate(b), 0))}
                              </td>
                              <td style={{ padding: '10px 10px', textAlign: 'right', color: '#1a6b4a', fontSize: 15 }}>
                                {bdPricingBasis === 'lump_sum' ? money(previewItems.length * Number(bdLumpSumAmount || 0)) : money(previewItems.reduce((s: number, b: any) => s + (b.boq_qty ?? 0) * getEffectiveBoqRate(b), 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {(() => {
                        const childVillas = getAllVillasOfType(bdNode)
                        const villaCount = childVillas.length > 0 && bdSelectedVillas.size > 0
                          ? bdSelectedVillas.size
                          : parseInt(bdVillaCount) || 1
                        const selectedVillaNodes = childVillas.filter((v: StructureNode) => bdSelectedVillas.has(v.id))
                        return (
                          <>
                            {childVillas.length > 0 && bdSelectedVillas.size === 0 && (
                              <div style={{ marginBottom: 12, padding: '8px 14px', background: '#fff3e0', borderRadius: 7, fontSize: 13, color: '#e65100' }}>
                                ⚠️ No villas selected. Please select at least one villa above, or enter a count.
                              </div>
                            )}
                            {childVillas.length === 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>Number of villas:</span>
                                <Input type="number" value={bdVillaCount} onChange={e => setBdVillaCount(e.target.value)} style={{ width: 80 }} min="1" />
                                <span style={{ fontSize: 13, color: '#666' }}>{bdPricingBasis === 'lump_sum' ? 'Lump Sum: each generated line is Qty 1 × Lump Sum Amount' : '× BOQ qty = total subcontract qty'}</span>
                              </div>
                            )}
                            <Button
                              onClick={() => run('Save breakdown', async () => {
                                if (!bdSub) throw new Error('Select a subcontractor first')
                                if (childVillas.length > 0 && bdSelectedVillas.size === 0) throw new Error('Select at least one villa')
                                let saved = 0
                                const villasToProcess = selectedVillaNodes.length > 0 ? selectedVillaNodes : [null]
                                const lumpSumLineAmount = Number(bdLumpSumAmount || 0)
                                if (bdPricingBasis === 'lump_sum' && (!Number.isFinite(lumpSumLineAmount) || lumpSumLineAmount <= 0)) throw new Error('Enter a valid lump sum amount')
                                const syncedCodes = new Set<string>()
                                for (const villa of villasToProcess) {
                                  for (const b of previewItems) {
                                    const rateKey = getBoqRateKey(b)
                                    const rate = bdPricingBasis === 'lump_sum' ? lumpSumLineAmount : getEffectiveBoqRate(b)
                                    const qty = bdPricingBasis === 'lump_sum' ? 1 : (b.boq_qty ?? 0)
                                    if (bdPricingBasis !== 'lump_sum' && !syncedCodes.has(rateKey)) {
                                      await syncSameBoqCodeRateForSubcontractor(b, rate)
                                      syncedCodes.add(rateKey)
                                    }
                                    await createBreakdown.mutateAsync({
                                      project_id: projectId!,
                                      subcontractor_id: bdSub,
                                      boq_item_id: b.id,
                                      structure_id: villa?.id ?? bdNode,
                                      assignment_key: villa ? `${b.item_code}-${villa.code}` : `${b.item_code}-${node?.code ?? 'NA'}`,
                                      project_model: villa?.name ?? node?.name ?? null,
                                      subcontract_qty: qty,
                                      rate,
                                      contract_type: bdContractType,
                                      pricing_basis: bdPricingBasis,
                                      rate_source: bdPricingBasis === 'lump_sum' ? 'manual_lump_sum_qty_1' : 'manual_same_subcontractor_boq_code',
                                      lump_sum_amount: bdPricingBasis === 'lump_sum' ? lumpSumLineAmount : null,
                                      notes: `Contract Type: ${bdContractType} — BOQ Discipline: ${bdTrade} — ${villa?.code ?? node?.code}`,
                                      is_active: true,
                                    } as any)
                                    saved++
                                  }
                                }
                                setBdRates({})
                                setBdNode('')
                                setBdSub('')
                                setBdSelectedVillas(new Set())
                                setBdTab('list')
                              })}
                              disabled={createBreakdown.isPending || !bdSub || (childVillas.length > 0 && bdSelectedVillas.size === 0)}
                            >
                              💾 Save for {selectedVillaNodes.length > 0 ? selectedVillaNodes.length + ' villas' : villaCount + ' villa(s)'} × {previewItems.length} BOQ items = {(selectedVillaNodes.length > 0 ? selectedVillaNodes.length : villaCount) * previewItems.length} lines{bdPricingBasis === 'lump_sum' ? ' (Qty 1 each)' : ''}
                            </Button>
                          </>
                        )
                      })()}
                    </>
                  )}
                </Card>
              )}

              {bdTab === 'list' && (
                <Card title="Breakdown List — grouped and rate-controlled">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
                    <Field label="Group breakdown by">
                      <Select value={bdListGroupBy} onChange={e => setBdListGroupBy(e.target.value as any)}>
                        <option value="villa">Villa / Node</option>
                        <option value="boq">BOQ Item</option>
                        <option value="subcontractor">Subcontractor</option>
                        <option value="flat">No grouping</option>
                      </Select>
                    </Field>
                    <div style={{ fontSize: 12, color: '#667085', paddingBottom: 9 }}>
                      Rate edits here are saved to all rows with the same BOQ item code for the same subcontractor, across villas.
                    </div>
                  </div>
                  {(() => {
                    const groupLabel = (row: any) => {
                      const node2 = structureNodes.find((n: StructureNode) => n.id === row.structure_id)
                      if (bdListGroupBy === 'boq') return `${row.boq_items?.item_code ?? 'No BOQ'} — ${row.boq_items?.description ?? ''}`
                      if (bdListGroupBy === 'subcontractor') return row.subcontractors?.name ?? 'Unassigned subcontractor'
                      if (bdListGroupBy === 'flat') return 'All breakdown rows'
                      return `${node2?.code ?? row.project_model ?? 'No node'}${node2?.name ? ` — ${node2.name}` : ''}`
                    }
                    const grouped = new Map<string, any[]>()
                    ;[...(breakdowns as any[])].sort((a: any, b: any) => {
                      const aNode = structureNodes.find((n: StructureNode) => n.id === a.structure_id)
                      const bNode = structureNodes.find((n: StructureNode) => n.id === b.structure_id)
                      return `${groupLabel(a)}-${aNode?.code ?? ''}-${a.assignment_key ?? ''}`.localeCompare(`${groupLabel(b)}-${bNode?.code ?? ''}-${b.assignment_key ?? ''}`, undefined, { numeric: true })
                    }).forEach((row: any) => {
                      const key = groupLabel(row)
                      if (!grouped.has(key)) grouped.set(key, [])
                      grouped.get(key)!.push(row)
                    })
                    const saveRateForSameSubAndBoqCode = async (sourceRow: any) => {
                      const newRate = Number(bdInlineRateEdits[sourceRow.id] ?? sourceRow.rate ?? 0)
                      const isLumpSumRow = String(sourceRow.pricing_basis ?? '') === 'lump_sum'
                      if (!Number.isFinite(newRate) || newRate < 0) { setMessage('Enter a valid rate first.'); return }
                      const code = normalizeCode(sourceRow.boq_items?.item_code ?? sourceRow.item_code ?? '')
                      if (!code || !sourceRow.subcontractor_id) { setMessage('Missing BOQ code or subcontractor.'); return }
                      await run('Update BOQ rate for subcontractor', async () => {
                        const sameRows = (breakdowns as any[]).filter((row: any) =>
                          String(row.subcontractor_id ?? '') === String(sourceRow.subcontractor_id ?? '') &&
                          normalizeCode(row.boq_items?.item_code ?? row.item_code ?? '') === code
                        )
                        for (const row of sameRows) {
                          await updateBreakdown.mutateAsync({
                            id: row.id,
                            data: {
                              rate: newRate,
                              ...(String(row.pricing_basis ?? '') === 'lump_sum' || isLumpSumRow ? { subcontract_qty: 1, lump_sum_amount: newRate } : {}),
                              contract_type: row.contract_type ?? 'BOQ Unit Rate',
                              pricing_basis: row.pricing_basis ?? 'boq_unit_rate',
                              rate_source: String(row.pricing_basis ?? '') === 'lump_sum' || isLumpSumRow ? 'manual_update_same_subcontractor_boq_code_lump_sum_qty_1' : 'manual_update_same_subcontractor_boq_code',
                            } as any,
                          })
                        }
                        setBdInlineRateEdits(prev => {
                          const next = { ...prev }
                          sameRows.forEach((row: any) => delete next[row.id])
                          return next
                        })
                        setMessage(`Rate ${money(newRate)} applied to ${sameRows.length} row(s) for BOQ ${code} and this subcontractor.`)
                      })
                    }
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                            {['Assignment','Subcontractor','BOQ Item','Node / Villa','Qty','Rate','Contract Type','Contract Value','Actions'].map(h => (
                              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {breakdowns.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No breakdown rows yet.</td></tr>}
                          {Array.from(grouped.entries()).map(([groupName, rows]) => {
                            const groupTotal = rows.reduce((sum: number, row: any) => {
                              const rowQty = String(row.pricing_basis ?? '') === 'lump_sum' ? 1 : Number(row.subcontract_qty ?? 0)
                              return sum + rowQty * Number(row.rate ?? 0)
                            }, 0)
                            const groupQty = rows.reduce((sum: number, row: any) => sum + (String(row.pricing_basis ?? '') === 'lump_sum' ? 1 : Number(row.subcontract_qty ?? 0)), 0)
                            return (
                              <Fragment key={groupName}>
                                <tr style={{ background: '#eefaf5' }}>
                                  <td colSpan={9} style={{ padding: '10px 12px', fontWeight: 900, color: '#0f6e56', borderTop: '1px solid #cdeadd' }}>
                                    {bdListGroupBy === 'villa' ? 'Villa / Node: ' : bdListGroupBy === 'boq' ? 'BOQ Item: ' : bdListGroupBy === 'subcontractor' ? 'Subcontractor: ' : ''}{groupName}
                                    <span style={{ marginLeft: 12, color: '#64748b', fontWeight: 700 }}>
                                      {rows.length} line(s) · Qty {round3(groupQty)} · Total {money(groupTotal)}
                                    </span>
                                  </td>
                                </tr>
                                {rows.map((b: any) => {
                                  const node2 = structureNodes.find((n: StructureNode) => n.id === b.structure_id)
                                  const currentRate = bdInlineRateEdits[b.id] ?? String(b.rate ?? '')
                                  const isLumpSumLine = String(b.pricing_basis ?? '') === 'lump_sum'
                                  const displayQty = isLumpSumLine ? 1 : Number(b.subcontract_qty ?? 0)
                                  const displayValue = displayQty * Number(currentRate || 0)
                                  const isEditing = editingBreakdownId === String(b.id)
                                  const editStructureId = breakdownEditForm.structure_id || null
                                  const editBoqOptions = getBoqItemsForStructure(editStructureId, true)
                                  const currentEditBoqStillVisible = editBoqOptions.some((item: any) => String(item.id) === String(breakdownEditForm.boq_item_id))
                                  const safeEditBoqOptions = currentEditBoqStillVisible || !breakdownEditForm.boq_item_id ? editBoqOptions : [
                                    (boqItems as any[]).find((item: any) => String(item.id) === String(breakdownEditForm.boq_item_id)),
                                    ...editBoqOptions,
                                  ].filter(Boolean)
                                  if (isEditing) {
                                    const editQty = Number(breakdownEditForm.subcontract_qty || 0)
                                    const editRate = Number(breakdownEditForm.rate || 0)
                                    return (
                                      <Fragment key={b.id}>
                                        <tr style={{ borderBottom: '1px solid #dbeafe', background: '#f8fbff' }}>
                                          <td style={{ padding: '8px 12px', minWidth: 150 }}><Input value={breakdownEditForm.assignment_key} onChange={e => setBreakdownEditForm(prev => ({ ...prev, assignment_key: e.target.value }))} /></td>
                                          <td style={{ padding: '8px 12px', minWidth: 180 }}>
                                            <Select value={breakdownEditForm.subcontractor_id} onChange={e => setBreakdownEditForm(prev => ({ ...prev, subcontractor_id: e.target.value }))}>
                                              <option value="">Select subcontractor</option>
                                              {(subcontractors as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                                            </Select>
                                          </td>
                                          <td style={{ padding: '8px 12px', minWidth: 260 }}>
                                            <Select value={breakdownEditForm.boq_item_id} onChange={e => setBreakdownEditForm(prev => ({ ...prev, boq_item_id: e.target.value }))}>
                                              <option value="">Select BOQ item</option>
                                              {safeEditBoqOptions.map((item: any) => <option key={item.id} value={item.id}>{structureBoqOptionLabel(item)}</option>)}
                                            </Select>
                                          </td>
                                          <td style={{ padding: '8px 12px', minWidth: 180 }}>
                                            <Select value={breakdownEditForm.structure_id} onChange={e => {
                                              const structureId = e.target.value
                                              const scopedBoq = getBoqItemsForStructure(structureId, true)
                                              const currentStillValid = breakdownEditForm.boq_item_id && scopedBoq.some((item: any) => String(item.id) === String(breakdownEditForm.boq_item_id))
                                              setBreakdownEditForm(prev => ({ ...prev, structure_id: structureId, boq_item_id: currentStillValid ? prev.boq_item_id : '' }))
                                            }}>
                                              <option value="">Project level</option>
                                              {(structureNodes as any[]).map((n: any) => <option key={n.id} value={n.id}>{structurePath(n.id)} ({n.type})</option>)}
                                            </Select>
                                          </td>
                                          <td style={{ padding: '8px 12px', minWidth: 100 }}>
                                            <Input type="number" value={breakdownEditForm.pricing_basis === 'lump_sum' ? '1' : breakdownEditForm.subcontract_qty} disabled={breakdownEditForm.pricing_basis === 'lump_sum'} onChange={e => setBreakdownEditForm(prev => ({ ...prev, subcontract_qty: e.target.value }))} />
                                            {breakdownEditForm.pricing_basis === 'lump_sum' && <div style={{ fontSize: 10, color: '#667085', marginTop: 3 }}>Lump Sum qty fixed to 1</div>}
                                          </td>
                                          <td style={{ padding: '8px 12px', minWidth: 110 }}><Input type="number" value={breakdownEditForm.rate} onChange={e => setBreakdownEditForm(prev => ({ ...prev, rate: e.target.value, lump_sum_amount: prev.pricing_basis === 'lump_sum' ? e.target.value : prev.lump_sum_amount }))} /></td>
                                          <td style={{ padding: '8px 12px', minWidth: 190 }}>
                                            <Select value={breakdownEditForm.pricing_basis} onChange={e => {
                                              const value = e.target.value
                                              setBreakdownEditForm(prev => ({
                                                ...prev,
                                                pricing_basis: value,
                                                contract_type: pricingBasisToContractType(value),
                                                subcontract_qty: value === 'lump_sum' ? '1' : prev.subcontract_qty,
                                                lump_sum_amount: value === 'lump_sum' ? (prev.lump_sum_amount || prev.rate) : prev.lump_sum_amount,
                                                rate: value === 'lump_sum' ? (prev.lump_sum_amount || prev.rate) : prev.rate,
                                              }))
                                            }}>
                                              <option value="boq_unit_rate">BOQ Unit Rate</option>
                                              <option value="lump_sum">Lump Sum / مقطوعية</option>
                                              <option value="labor_only">Labor Only / مصنعية فقط</option>
                                              <option value="supply_apply">Supply & Apply / توريد وتركيب</option>
                                              <option value="dayworks">Dayworks / يوميات</option>
                                            </Select>
                                          </td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#1a6b4a' }}>{money((breakdownEditForm.pricing_basis === 'lump_sum' ? 1 : editQty) * editRate)}</td>
                                          <td style={{ padding: '8px 12px', minWidth: 145 }}>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                              <Button onClick={() => void saveBreakdownLineEdit(b)}>Save</Button>
                                              <Button tone="secondary" onClick={cancelEditBreakdownLine}>Cancel</Button>
                                            </div>
                                          </td>
                                        </tr>
                                        <tr style={{ background: '#f8fbff', borderBottom: '1px solid #dbeafe' }}>
                                          <td colSpan={9} style={{ padding: '8px 12px' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.6fr) minmax(260px, 1fr) minmax(210px, 0.8fr)', gap: 10, alignItems: 'end' }}>
                                              {breakdownEditForm.pricing_basis === 'lump_sum' && (
                                                <Field label="Lump Sum Amount / قيمة مقطوعية">
                                                  <Input type="number" value={breakdownEditForm.lump_sum_amount} onChange={e => setBreakdownEditForm(prev => ({ ...prev, lump_sum_amount: e.target.value, rate: e.target.value, subcontract_qty: '1' }))} />
                                                </Field>
                                              )}
                                              <Field label="Notes">
                                                <Input value={breakdownEditForm.notes} onChange={e => setBreakdownEditForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notes / scope clarification" />
                                              </Field>
                                              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 700, color: '#0f6e56', paddingBottom: 9 }}>
                                                <input type="checkbox" checked={breakdownEditForm.apply_rate_to_same_code} onChange={e => setBreakdownEditForm(prev => ({ ...prev, apply_rate_to_same_code: e.target.checked }))} />
                                                Apply rate/type to same BOQ code + same subcontractor
                                              </label>
                                            </div>
                                          </td>
                                        </tr>
                                      </Fragment>
                                    )
                                  }
                                  return (
                                    <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{b.assignment_key}</td>
                                      <td style={{ padding: '8px 12px' }}>{(b as any).subcontractors?.name ?? '—'}</td>
                                      <td style={{ padding: '8px 12px' }}>{(b as any).boq_items?.item_code ?? '—'} — {(b as any).boq_items?.description?.slice(0, 55) ?? '—'}</td>
                                      <td style={{ padding: '8px 12px' }}>{node2 ? <span style={{ background: (NODE_COLORS[node2.type] ?? '#888') + '22', color: NODE_COLORS[node2.type] ?? '#888', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{node2.code}</span> : '—'}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{displayQty}{isLumpSumLine && <div style={{ fontSize: 10, color: '#667085' }}>Lump Sum</div>}</td>
                                      <td style={{ padding: '8px 12px', minWidth: 180 }}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                          <Input type="number" value={currentRate} onChange={e => setBdInlineRateEdits(prev => ({ ...prev, [b.id]: e.target.value }))} style={{ width: 95 }} />
                                          <Button tone="secondary" onClick={() => void saveRateForSameSubAndBoqCode(b)}>Save rate</Button>
                                        </div>
                                        <div style={{ fontSize: 10, color: '#667085', marginTop: 3 }}>{isLumpSumLine ? 'Qty fixed to 1; value = lump sum' : 'same BOQ code + same subcontractor'}</div>
                                      </td>
                                      <td style={{ padding: '8px 12px' }}>{b.contract_type ?? 'BOQ Unit Rate'}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1a6b4a' }}>{money(displayValue)}</td>
                                      <td style={{ padding: '8px 12px' }}>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <Button tone="secondary" onClick={() => startEditBreakdownLine(b)}>Edit</Button>
                                          <Button tone="danger" onClick={() => { if (confirm('Delete?')) run('Delete', () => deleteBreakdown.mutateAsync({ id: b.id, projectId: projectId! })) }}>✕</Button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  })()}
                </Card>
              )}

            </>
          })()}

          {(activeView === 'bbs-qs' || activeView === 'qs' || activeView === 'bbs') && (
            <>
              <Card
                title="BBS & QS — Quantity Control"
                action={<Badge text="Combined QS + BBS" tone="success" />}
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {([
                    ['summary', 'Comparison / Summary'],
                    ['qs', 'QS / Quantity Survey'],
                    ['bbs', 'BBS / Bar Bending Schedule'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setBbsQsTab(id)}
                      style={{
                        padding: '9px 16px',
                        borderRadius: 999,
                        border: currentBbsQsTab === id ? '1px solid #0f6e56' : '1px solid #e2e8f0',
                        background: currentBbsQsTab === id ? '#0f6e56' : '#fff',
                        color: currentBbsQsTab === id ? '#fff' : '#334155',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {currentBbsQsTab === 'summary' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
                      <Metric label="BOQ Items" value={boqItems.length} />
                      <Metric label="QS Records" value={qtoLines.length} />
                      <Metric label="BBS Entries" value={bbsFilteredLines.length} />
                      <Metric label="Steel Quantity" value={`${round3(bbsTotalTon)} ton`} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, background: '#f8fafc' }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>QS / Quantity Survey</div>
                        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>Measured quantities, effective quantities, and BOQ takeoff records are preserved in the QS tab.</div>
                        <Button tone="secondary" onClick={() => setBbsQsTab('qs')}>Open QS Tab</Button>
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, background: '#f8fafc' }}>
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>BBS / Bar Bending Schedule</div>
                        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>Steel entries, effective QS quantities, and steel ratio calculations are preserved in the BBS tab.</div>
                        <Button tone="secondary" onClick={() => setBbsQsTab('bbs')}>Open BBS Tab</Button>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </>
          )}

          {((activeView === 'qs') || (activeView === 'bbs-qs' && currentBbsQsTab === 'qs')) && (() => {
            if (!projectId) return <Card title="QS Input"><div>Select a project first.</div></Card>

            // ── helpers ──────────────────────────────────────────────
            // For each boq_item + structure combo, find the QS entry
            const qsForItem = (boqId: string, structureId?: string) =>
              qtoLines.filter((l: any) => l.boq_item_id === boqId && (!structureId || l.structure_id === structureId))

            const effectiveQty = (boqId: string) => {
              const lines = qsForItem(boqId)
              const total = lines.reduce((s: number, l: any) => s + (l.qty ?? 0), 0)
              const boq = boqItems.find(b => b.id === boqId)
              return total > 0 ? total : (boq?.boq_qty ?? 0)
            }

            const measuredCount = boqItems.filter(b => qsForItem(b.id).length > 0).length
            const boqOnlyCount = boqItems.length - measuredCount

            return <>
              {/* Stats strip */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: '10px 18px', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#2e7d32' }}>📐 {measuredCount}</span> <span style={{ color: '#555' }}>items with QS entry</span>
                </div>
                <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '10px 18px', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#e65100' }}>📋 {boqOnlyCount}</span> <span style={{ color: '#555' }}>items using BOQ qty</span>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                {([['takeoff','➕ Add / Update Entry'], ['summary','📊 Summary'], ['edit','✏️ Edit']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setQsTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: qsTab === id ? '#1a6b4a' : '#f0f0f0', color: qsTab === id ? '#fff' : '#333' }}>{label}</button>
                ))}
              </div>

              {/* ── TAB 1: ADD / UPDATE ── */}
              {qsTab === 'takeoff' && (
                <Card title="Add QS Entry">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <Field label="Structure (filters BOQ items)">
                      <Select value={selectedStructureForQto} onChange={e => {
                        const structureId = e.target.value
                        const scopedBoq = getBoqItemsForStructure(structureId, true)
                        const currentStillValid = selectedBoqForQto && scopedBoq.some((b: any) => String(b.id) === String(selectedBoqForQto))
                        setSelectedStructureForQto(structureId)
                        if (!currentStillValid) setSelectedBoqForQto('')
                      }}>
                        <option value="">— All Structures with BOQ —</option>
                        {structureNodes
                          .filter((n: StructureNode) => structureHasBoq(n.id))
                          .map((n: StructureNode) => <option key={n.id} value={n.id}>{n.code} — {n.name} ({n.type}) · {getBoqItemsForStructure(n.id, true).length} BOQ items</option>)}
                      </Select>
                    </Field>
                    <Field label="BOQ Item">
                      <Select value={selectedBoqForQto} onChange={e => setSelectedBoqForQto(e.target.value)}>
                        <option value="">— Select BOQ Item —</option>
                        {getBoqItemsForStructure(selectedStructureForQto, true).map((b: any) => {
                          const has = qsForItem(b.id).length > 0
                          return <option key={b.id} value={b.id}>{has ? '✓ ' : ''}{structureBoqOptionLabel(b)}</option>
                        })}
                      </Select>
                    </Field>
                  </div>

                  {selectedBoqForQto && (() => {
                    const baseBoq = boqItems.find(b => b.id === selectedBoqForQto) as any
                    const struct = selectedStructureForQto ? structureNodes.find((s: StructureNode) => s.id === selectedStructureForQto) : null
                    const selectedStructureScopeIds = selectedStructureForQto ? getStructureBoqScopeIds(selectedStructureForQto) : new Set<string>()
                    const boq = selectedStructureForQto
                      ? (boqItems.find((b: any) =>
                          normalizeCode(b.item_code) === normalizeCode(baseBoq?.item_code) &&
                          normalizeCode(b.description) === normalizeCode(baseBoq?.description) &&
                          normalizeCode(b.unit) === normalizeCode(baseBoq?.unit) &&
                          selectedStructureScopeIds.has(String(b.structure_id ?? ''))
                        ) || baseBoq)
                      : baseBoq
                    const effectiveBoqId = boq?.id || selectedBoqForQto
                    const existing = qsForItem(effectiveBoqId, selectedStructureForQto || undefined)
                    const existingEntry = existing[0]
                    const boqQty = boq?.boq_qty ?? 0

                    return (
                      <div style={{ background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10, padding: 20 }}>
                        {/* Item info */}
                        <div style={{ background: '#1a6b4a', color: '#fff', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{boq?.item_code} — {boq?.description}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>Unit: {boq?.unit} · BOQ Qty: {boqQty} {boq?.unit}{struct ? ` · ${struct.type} ${struct.code}` : ''}</div>
                          </div>
                          {existingEntry && (
                            <div style={{ textAlign: 'right', fontSize: 13 }}>
                              <div style={{ opacity: 0.8 }}>Current QS Entry</div>
                              <div style={{ fontWeight: 800, fontSize: 18 }}>{existingEntry.qty} {boq?.unit}</div>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <Field label={existingEntry ? 'Update Measured Qty' : 'Measured Qty'}>
                            <Input
                              type="number"
                              value={qtoLineForm.length}
                              onChange={e => setQtoLineForm({ ...qtoLineForm, length: e.target.value })}
                              placeholder={`BOQ: ${boqQty} ${boq?.unit}`}
                            />
                          </Field>
                          <Field label="Notes (optional)">
                            <Input value={qtoLineForm.notes} onChange={e => setQtoLineForm({ ...qtoLineForm, notes: e.target.value })} placeholder="e.g. as-built measurement" />
                          </Field>
                        </div>

                        {qtoLineForm.length && (
                          <div style={{ marginTop: 10, fontSize: 13, color: '#555' }}>
                            {(() => {
                              const measured = parseFloat(qtoLineForm.length)
                              const diff = measured - boqQty
                              return <span>Entered: <strong style={{ color: '#1a6b4a', fontSize: 15 }}>{measured} {boq?.unit}</strong> &nbsp;·&nbsp; vs BOQ: <strong style={{ color: diff > 0 ? '#e65100' : diff < 0 ? '#1565c0' : '#2e7d32' }}>{diff > 0 ? '+' : ''}{diff.toFixed(3)}</strong></span>
                            })()}
                          </div>
                        )}

                        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                          <Button
                            onClick={async () => {
                              if (!qtoLineForm.length) return
                              const qty = parseFloat(qtoLineForm.length)
                              if (existingEntry) {
                                await run('Update QS', () => updateQtoLine.mutateAsync({
                                  id: existingEntry.id,
                                  data: { qty, notes: qtoLineForm.notes || null }
                                }))
                              } else {
                                await run('Add QS', () => createQtoLine.mutateAsync({
                                  project_id: projectId!,
                                  boq_item_id: effectiveBoqId,
                                  structure_id: selectedStructureForQto || null,
                                  description: `QS Entry${struct ? ` — ${struct.code}` : ''}`,
                                  times: 1,
                                  length: qty,
                                  width: null,
                                  height: null,
                                  qty,
                                  notes: qtoLineForm.notes || null,
                                }))
                              }
                              setQtoLineForm({ description: '', times: '1', length: '', width: '', height: '', notes: '' })
                            }}
                            disabled={createQtoLine.isPending || updateQtoLine.isPending || !qtoLineForm.length}
                          >
                            {existingEntry ? '✓ Update Entry' : '+ Add Entry'}
                          </Button>
                          {existingEntry && (
                            <Button tone="danger" onClick={async () => {
                              await run('Delete QS', () => deleteQtoLine.mutateAsync({ id: existingEntry.id, projectId: projectId! }))
                              setQtoLineForm({ description: '', times: '1', length: '', width: '', height: '', notes: '' })
                            }}>Remove Entry (use BOQ qty)</Button>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </Card>
              )}

              {/* ── TAB 2: SUMMARY ── */}
              {qsTab === 'summary' && (
                <Card title="QS Summary — Effective Quantities for Payment">
                  <div style={{ marginBottom: 14, padding: '10px 16px', background: '#e3f2fd', borderRadius: 8, fontSize: 13, color: '#1565c0' }}>
                    ℹ️ Items with a QS entry use the measured quantity. Items without use the BOQ quantity automatically.
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                        {['Code', 'Description', 'Unit', 'BOQ Qty', 'QS Measured Qty', 'Effective Qty', 'Structure', 'Source'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {boqItems.map((b, idx) => {
                        const entries = qsForItem(b.id)
                        const measured = entries.reduce((s: number, l: any) => s + (l.qty ?? 0), 0)
                        const usingBOQ = entries.length === 0
                        const effective = usingBOQ ? b.boq_qty : measured
                        const structIds = [...new Set(entries.map((l: any) => l.structure_id).filter(Boolean))]
                        const structLabels = structIds.map(id => structureNodes.find((s: StructureNode) => s.id === id)?.code ?? id).join(', ')
                        return (
                          <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700 }}>{b.item_code}</td>
                            <td style={{ padding: '8px 12px' }}>{b.description}</td>
                            <td style={{ padding: '8px 12px', color: '#666' }}>{b.unit}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{b.boq_qty}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: usingBOQ ? '#aaa' : '#1a6b4a', fontWeight: usingBOQ ? 400 : 700 }}>{usingBOQ ? '—' : measured}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{effective}</td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: '#888' }}>{structLabels || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: usingBOQ ? '#fff3e0' : '#e8f5e9', color: usingBOQ ? '#e65100' : '#2e7d32' }}>
                                {usingBOQ ? '📋 BOQ Qty' : '📐 QS Entry'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Card>
              )}

              {/* ── TAB 3: EDIT ── */}
              {qsTab === 'edit' && (
                <Card title="Edit QS Entries">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                        {['BOQ Item', 'Structure', 'QS Qty', 'BOQ Qty', 'Diff', 'Notes', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {qtoLines.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No QS entries yet.</td></tr>
                      )}
                      {qtoLines.map((line: any) => {
                        const boq = boqItems.find(b => b.id === line.boq_item_id) as any
                        const struct = structureNodes.find((s: StructureNode) => s.id === line.structure_id)
                        const diff = (line.qty ?? 0) - (boq?.boq_qty ?? 0)
                        const isEditing = editingQtoLine === line.id
                        return (
                          <tr key={line.id} style={{ borderBottom: '1px solid #f0f0f0', background: isEditing ? '#f0f7f4' : 'white' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{boq?.item_code} — {boq?.description}</td>
                            <td style={{ padding: '8px 12px', color: '#888' }}>{struct ? `${struct.type} ${struct.code}` : 'General'}</td>
                            {isEditing ? (
                              <>
                                <td style={{ padding: '6px 8px' }}>
                                  <Input type="number" value={editQtoForm.length} onChange={e => setEditQtoForm({ ...editQtoForm, length: e.target.value })} style={{ width: 100 }} />
                                </td>
                                <td style={{ padding: '8px 12px', color: '#666' }}>{boq?.boq_qty} {boq?.unit}</td>
                                <td style={{ padding: '8px 12px' }}>—</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <Input value={editQtoForm.notes} onChange={e => setEditQtoForm({ ...editQtoForm, notes: e.target.value })} />
                                </td>
                                <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                                  <Button onClick={async () => {
                                    await run('Update', () => updateQtoLine.mutateAsync({
                                      id: line.id,
                                      data: { qty: parseFloat(editQtoForm.length) || 0, notes: editQtoForm.notes || null }
                                    }))
                                    setEditingQtoLine(null)
                                  }} disabled={updateQtoLine.isPending}>Save</Button>
                                  <Button tone="secondary" onClick={() => setEditingQtoLine(null)}>Cancel</Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1a6b4a' }}>{line.qty} {boq?.unit}</td>
                                <td style={{ padding: '8px 12px', color: '#666' }}>{boq?.boq_qty} {boq?.unit}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: diff > 0 ? '#e65100' : diff < 0 ? '#1565c0' : '#2e7d32' }}>{diff > 0 ? '+' : ''}{diff.toFixed(3)}</td>
                                <td style={{ padding: '8px 12px', color: '#888' }}>{line.notes ?? '—'}</td>
                                <td style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
                                  <Button tone="secondary" onClick={() => { setEditingQtoLine(line.id); setEditQtoForm({ description: line.description, times: '1', length: String(line.qty ?? ''), width: '', height: '', notes: line.notes ?? '' }) }}>Edit</Button>
                                  <Button tone="danger" onClick={() => run('Delete', () => deleteQtoLine.mutateAsync({ id: line.id, projectId: projectId! }))}>✕</Button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
          })()}

          {activeView === 'approvals' && (
            <Card title="QS approvals">
              <Table
                heads={['Assignment', 'BOQ Item', 'Pay Qty', 'Status', 'Approve / Reject']}
                rows={pending.length ? pending.map((p) => [
                  p.assignment_key,
                  boqItems.find((b) => b.id === p.breakdown_id) ? `${boqItems.find((b) => b.id === p.breakdown_id)!.item_code} — ${boqItems.find((b) => b.id === p.breakdown_id)!.description}` : p.assignment_key,
                  p.effective_pay_qty,
                  p.status,
                  <div key={p.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button disabled={reviewQs.isPending} onClick={() => run('Approval', () => reviewQs.mutateAsync({ qsEntryId: p.id, projectId: p.project_id, decision: 'Approved', approvedQty: p.effective_pay_qty ?? undefined }))}>Approve</Button>
                    <Button tone="danger" disabled={reviewQs.isPending} onClick={() => run('Approval', () => reviewQs.mutateAsync({ qsEntryId: p.id, projectId: p.project_id, decision: 'Rejected', comments: 'Rejected from dashboard' }))}>Reject</Button>
                  </div>,
                ]) : qsEntries.filter((q) => q.status === 'Submitted').map((q) => [
                  q.assignment_key,
                  boqItems.find((b) => b.id === q.boq_item_id) ? `${boqItems.find((b) => b.id === q.boq_item_id)!.item_code} — ${boqItems.find((b) => b.id === q.boq_item_id)!.description}` : q.assignment_key,
                  q.actual_survey_qty ?? q.boq_qty,
                  q.status,
                  <div key={q.id} style={{ display: 'flex', gap: 6 }}>
                    <Button disabled={reviewQs.isPending} onClick={() => run('Approval', () => reviewQs.mutateAsync({ qsEntryId: q.id, projectId: q.project_id, decision: 'Approved', approvedQty: q.actual_survey_qty ?? q.boq_qty }))}>Approve</Button>
                    <Button tone="danger" disabled={reviewQs.isPending} onClick={() => run('Approval', () => reviewQs.mutateAsync({ qsEntryId: q.id, projectId: q.project_id, decision: 'Rejected', comments: 'Rejected from dashboard' }))}>Reject</Button>
                  </div>,
                ])}
              />
            </Card>
          )}

          {activeView === 'certificates' && (() => {
            if (!projectId) return <Card title="Subcontractor Invoices"><div>Select a project first.</div></Card>

            // ── Invoice breakdown helpers ─────────────────────────
            const selectedInvoice = certificates.find((c: any) => c.id === selectedInvoiceId)
            const selectedSubId = selectedInvoice?.subcontractor_id ?? null
            const selectedInvoiceEditable = canEditSubcontractorInvoice(selectedInvoice)

            // Get breakdown items for selected subcontractor
            const subBreakdown = breakdowns.filter((b: any) => b.subcontractor_id === selectedSubId)

            // prevQtyCache lives at component top level (useRef) — see declaration near useState
            const prevQtyCacheKey = `${selectedInvoiceId}:${selectedSubId}`

            const getPrevQty = (breakdownId: string, boqItemId?: string | null, structureId?: string | null): number => {
              const cacheKey = `${prevQtyCacheKey}:${breakdownId}`
              if (prevQtyCache.current[cacheKey] !== undefined) return prevQtyCache.current[cacheKey]
              const boqKey = `${prevQtyCacheKey}:boq:${boqItemId ?? ''}:${structureId ?? ''}`
              if (prevQtyCache.current[boqKey] !== undefined) return prevQtyCache.current[boqKey]

              // Sync fallback: use invoice_no order, previous invoices only, latest first.
              const currentNo = invoiceSortNumber(selectedInvoice?.invoice_no)
              const prevInvoices = certificates
                .filter((c: any) =>
                  c.subcontractor_id === selectedSubId &&
                  c.id !== selectedInvoiceId &&
                  String(c.status ?? '').toLowerCase() !== 'cancelled' &&
                  invoiceSortNumber(c.invoice_no) < currentNo
                )
                .sort((a: any, b: any) => invoiceSortNumber(b.invoice_no) - invoiceSortNumber(a.invoice_no))

              for (const inv of prevInvoices) {
                const line = invoiceLinesAll.find((l: V103InvoiceLine) =>
                  l.invoice_id === inv.id && (
                    l.breakdown_id === breakdownId ||
                    (!!boqItemId && String(l.boq_item_id ?? '') === String(boqItemId) && String((l as any).structure_id ?? '') === String(structureId ?? ''))
                  )
                )
                if (line) return Number((line as any).new_cumulative_qty ?? line.approved_qty ?? line.current_qty ?? 0) || 0
              }
              return 0
            }
            // Invoice quantities follow the QS Summary rule:
            // QS measured qty if available, otherwise BOQ/subcontract qty.
            const getStructureModelCodes = (structureId?: string | null): Set<string> => {
              const codes = new Set<string>()
              let current = structureId ? structureNodes.find((n: StructureNode) => n.id === structureId) : null
              let guard = 0
              while (current && guard < 20) {
                const raw = `${(current as any).code ?? ''} ${(current as any).name ?? ''}`
                const normalizedFull = normalizeCode((current as any).code)
                if (normalizedFull) codes.add(normalizedFull)
                ;(raw.match(/[A-Za-z]+\d+/g) ?? []).forEach((m: string) => codes.add(normalizeCode(m)))
                current = current.parent_id ? structureNodes.find((n: StructureNode) => n.id === current!.parent_id) : null
                guard++
              }
              return codes
            }

            const codeSetsIntersect = (a: Set<string>, b: Set<string>) => {
              for (const x of a) if (b.has(x)) return true
              return false
            }

            const isLumpSumBreakdownLine = (b: any): boolean =>
              String(b.pricing_basis ?? '').toLowerCase() === 'lump_sum' ||
              String(b.contract_type ?? '').toLowerCase().includes('lump') ||
              String(b.rate_source ?? '').toLowerCase().includes('lump_sum')

            const getEffectiveQty = (b: any): number => {
              // Lump Sum subcontract items are measured as one complete package.
              // They must never inherit QS/BOQ effective quantities in invoices.
              if (isLumpSumBreakdownLine(b)) return 1

              const fallbackQty = Number(b.subcontract_qty ?? b.boq_items?.boq_qty ?? 0)
              const boqItem = (b.boq_items as any) ?? boqItems.find((bi: any) => bi.id === b.boq_item_id)

              const exactEntries = qtoLines.filter((l: any) => l.boq_item_id === b.boq_item_id)
              if (exactEntries.length > 0) return exactEntries.reduce((sum: number, l: any) => sum + Number(l.qty ?? 0), 0)

              if (!boqItem) return fallbackQty

              const lineModelCodes = getStructureModelCodes(b.structure_id)
              const matchingBoqIds = new Set(
                boqItems
                  .filter((bi: any) =>
                    normalizeCode(bi.item_code) === normalizeCode(boqItem.item_code) &&
                    normalizeCode(bi.description) === normalizeCode(boqItem.description) &&
                    normalizeCode(bi.unit) === normalizeCode(boqItem.unit)
                  )
                  .filter((bi: any) => {
                    if (lineModelCodes.size === 0) return true
                    const biCodes = getStructureModelCodes(bi.structure_id)
                    return biCodes.size === 0 || codeSetsIntersect(lineModelCodes, biCodes)
                  })
                  .map((bi: any) => bi.id)
              )

              const matchedEntries = qtoLines.filter((l: any) => {
                if (!matchingBoqIds.has(l.boq_item_id)) return false
                if (lineModelCodes.size === 0 || !l.structure_id) return true
                return codeSetsIntersect(lineModelCodes, getStructureModelCodes(l.structure_id))
              })
              if (matchedEntries.length > 0) return matchedEntries.reduce((sum: number, l: any) => sum + Number(l.qty ?? 0), 0)

              return fallbackQty
            }

            const getEdit = (id: string): InvoiceLineEdit => {
              const edit = invoiceLineEdits[id]
              if (edit && typeof edit === 'object') return edit
              return { current_qty: '', current_work_pct: '' }
            }

            // Calculate invoice totals from line edits
            const calcLineTotals = () => {
              let gross = 0
              subBreakdown.forEach((b: any) => {
                const edit = getEdit(b.id)
                const currentQty = parseFloat(edit.current_qty) || 0
                gross += currentQty * (b.rate ?? 0)
              })
              return gross
            }

            return <>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                {([['list','📋 Invoices'], ['breakdown','📊 Invoice Breakdown']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setInvoiceTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: invoiceTab === id ? '#1a6b4a' : '#f0f0f0', color: invoiceTab === id ? '#fff' : '#333' }}>{label}</button>
                ))}
              </div>

              {/* ── TAB 1: INVOICE LIST ── */}
              {invoiceTab === 'list' && <>
                <Card title="Create Subcontractor Invoice">
                  <FormGrid>
                    <Field label="Subcontractor"><Select value={certForm.subcontractor_id} onChange={(e) => setCertForm({ ...certForm, subcontractor_id: e.target.value })}><option value="">Select</option>{subcontractors.map((s) => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}</Select></Field>
                    <Field label="Invoice No"><Input value={certForm.invoice_no} onChange={(e) => setCertForm({ ...certForm, invoice_no: e.target.value })} placeholder={`Auto: INV-${(subcontractors.find(s => s.id === certForm.subcontractor_id)?.name ?? 'XXX').split(' ').map((w: string) => w[0]?.toUpperCase() ?? '').join('').slice(0,3)}-${String(nextCertNo).padStart(3,'0')}`} /></Field>
                    <Field label="Invoice Date"><Input type="date" value={certForm.invoice_date} onChange={(e) => setCertForm({ ...certForm, invoice_date: e.target.value })} /></Field>
                    <Field label="Period End"><Input type="date" value={certForm.period_end} onChange={(e) => setCertForm({ ...certForm, period_end: e.target.value })} /></Field>
                    <Field label="Retention Deduction %"><Input type="number" value={certForm.retention_pct} onChange={(e) => setCertForm({ ...certForm, retention_pct: e.target.value })} /></Field>
                    <Field label="Available Retention"><Input disabled value={certForm.subcontractor_id ? money(retentionBalanceForSub(certForm.subcontractor_id).balance) : ''} /></Field>
                    <Field label="Retention Release Amount"><Input type="number" value={certForm.retention_release_amount} onChange={(e) => setCertForm({ ...certForm, retention_release_amount: e.target.value })} placeholder="0" /></Field>
                    <Field label="Retention Release Remarks"><Input value={certForm.retention_release_remarks} onChange={(e) => setCertForm({ ...certForm, retention_release_remarks: e.target.value })} placeholder="e.g. release for completed excavation works" /></Field>
                    <Field label="Remarks"><Input value={certForm.remarks} onChange={(e) => setCertForm({ ...certForm, remarks: e.target.value })} /></Field>
                  </FormGrid>
                  <div style={{ marginTop: 10, padding: '10px 14px', background: '#eef8f3', border: '1px solid #c8e6c9', borderRadius: 8, fontSize: 13, color: '#1a6b4a' }}>
                    Retention is now unified inside this invoice: Gross − Retention Deduction + Retention Release = Net Payable. Use remarks to explain what the released retention is for.
                  </div>
                  <Toolbar><Button onClick={addCertificate} disabled={createCertificate.isPending || !certForm.subcontractor_id || !certForm.period_end}>Create Invoice</Button></Toolbar>
                </Card>

                <Card title="Subcontractor Invoices">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                        {['Subcontractor','Invoice No','Period End','Gross Amount','Retention Deducted','Retention Released','Net Certificate Amount','Released Amount','Remaining Balance','Status','Actions'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {certificates.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No invoices yet.</td></tr>}
                      {certificates.map((c: any) => {
                        const statusColor: Record<string, string> = { Draft: '#888', Released: '#1565c0', 'Pending Approval': '#f57c00', 'Pending Review': '#f57c00', 'Pending Finance Review': '#f57c00', 'Pending Technical Office Approval': '#7c3aed', 'Pending CEO Approval': '#0f766e', Approved: '#2e7d32', 'Partially Released': '#0369a1', 'Payment Held': '#b45309', Paid: '#1a6b4a', 'Returned to Originator': '#6d4c41', Rejected: '#c62828', Cancelled: '#c62828', 'Missing Configuration': '#b45309' }
                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.subcontractors ? `${c.subcontractors.subcontractor_code} — ${c.subcontractors.name}` : '—'}</td>
                            <td style={{ padding: '8px 12px' }}>{c.invoice_no}</td>
                            <td style={{ padding: '8px 12px', color: '#666' }}>{c.period_end}</td>
                            <td style={{ padding: '8px 12px' }}>{money(c.gross_amount)}</td>
                            <td style={{ padding: '8px 12px', color: '#e65100' }}>{money(c.retention_amount)}</td>
                            <td style={{ padding: '8px 12px', color: '#1565c0' }}>{money((c as any).retention_release_amount ?? 0)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1a6b4a' }}>{money(c.net_payable ?? c.net_amount)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0369a1' }}>{money(c.released_payment_amount ?? c.ceo_released_amount ?? 0)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#b45309' }}>{money(c.remaining_unpaid_balance ?? c.remaining_unreleased_amount ?? Math.max(Number(c.net_payable ?? c.net_amount ?? 0) - Number(c.released_payment_amount ?? c.ceo_released_amount ?? 0), 0))}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ background: (statusColor[c.status] ?? '#888') + '22', color: statusColor[c.status] ?? '#888', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{c.status}</span>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <Button tone="secondary" onClick={async () => {
                                  if ((c.invoice_type ?? 'progress') === 'retention_release') return
                                  setSelectedInvoiceId(c.id)
                                  setInvoiceTab('breakdown')
                                  // Always fetch directly from DB — never rely on stale local state
                                  const { createClient: cc } = await import('@/lib/supabase/client')
                                  const sb = cc()
                                  const { data: freshLines } = await sb
                                    .from('subcontractor_invoice_lines')
                                    .select('breakdown_id,current_qty,approved_qty,boq_qty,new_cumulative_qty,current_work_pct')
                                    .eq('invoice_id', c.id)
                                  const edits: InvoiceLineEditState = {}
                                  breakdowns.filter((b: any) => b.subcontractor_id === c.subcontractor_id).forEach((b: any) => {
                                    const saved = (freshLines ?? []).find((l: any) => l.breakdown_id === b.id)
                                    if (saved) {
                                      const savedQty = Number(saved.approved_qty ?? saved.current_qty ?? 0)
                                      // Use boq_qty from the saved line (what was actually used at save time)
                                      // This avoids mismatch with getEffectiveQty which may use QS measured qty
                                      const savedBoqQty = Number(saved.boq_qty ?? b.subcontract_qty ?? 0)
                                      // Prefer stored current_work_pct, fall back to computing from qty
                                      const savedPct = saved.current_work_pct
                                        ? Number(saved.current_work_pct).toFixed(2)
                                        : (savedBoqQty > 0 ? ((savedQty / savedBoqQty) * 100).toFixed(2) : '')
                                      edits[b.id] = {
                                        current_qty: String(savedQty),
                                        current_work_pct: savedPct,
                                      }
                                    } else {
                                      // New line — no saved data yet, start empty
                                      edits[b.id] = { current_qty: '', current_work_pct: '' }
                                    }
                                  })
                                  setInvoiceLineEdits(edits)
                                  // Refresh invoiceLinesAll so getPrevQty works for next invoice
                                  await fetchCommercialScreens()
                                }}>Open Breakdown</Button>
                                {canReleaseSubcontractorInvoice(c) && <Button tone="secondary" onClick={() => releaseSubcontractorInvoiceForApproval(c)}>Release</Button>}
                                {c.status === 'Approved' && <Button tone="secondary" disabled={approveCertificate.isPending} onClick={() => run('Pay', () => approveCertificate.mutateAsync({ id: c.id, status: 'Paid', paymentDate: today() }))}>Mark Paid</Button>}
                                {normalizedStatus(c.status) === 'draft' && !c.approval_locked
                                  ? <Button tone="danger" disabled={deleteCertificate.isPending} onClick={() => run('Delete', () => deleteCertificate.mutateAsync({ id: c.id, projectId: projectId! }))}>Delete</Button>
                                  : <span style={{ color: '#94a3b8', fontSize: 12, alignSelf: 'center' }}>Locked after release</span>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Card>
              </>}

              {/* ── TAB 2: INVOICE BREAKDOWN ── */}
              {invoiceTab === 'breakdown' && (() => {
                if (!selectedInvoice) return (
                  <Card title="Invoice Breakdown">
                    <div style={{ color: '#888', padding: 20 }}>Select an invoice from the list and click "Open Breakdown".</div>
                  </Card>
                )

                const sub = subcontractors.find(s => s.id === selectedInvoice.subcontractor_id)

                // Get all nodes that have breakdown lines for this subcontractor
                const availableNodes = [...new Set(subBreakdown.map((b: any) => b.structure_id).filter(Boolean))]
                  .map(id => structureNodes.find((n: StructureNode) => n.id === id))
                  .filter(Boolean) as StructureNode[]

                // Filter lines by selected nodes (if any selected)
                const lines = invoiceNodeFilter.size > 0
                  ? subBreakdown.filter((b: any) => !b.structure_id || invoiceNodeFilter.has(b.structure_id))
                  : subBreakdown

                // v112: certificate totals like a professional subcontractor payment sheet
                let currentGrossTotal = 0
                let cumulativeGrossTotal = 0
                lines.forEach((b: any) => {
                  const edit = getEdit(b.id)
                  const pct = parseFloat(edit.current_work_pct ?? '') || 0
                  const effectiveQty = getEffectiveQty(b)
                  const currentQty = pct > 0 ? effectiveQty * pct / 100 : parseFloat(edit.current_qty) || 0
                  const previousQty = getPrevQty(b.id, b.boq_item_id, b.structure_id ?? null)
                  const rate = Number(b.rate ?? 0)
                  currentGrossTotal += currentQty * rate
                  cumulativeGrossTotal += (previousQty + currentQty) * rate
                })
                const grossTotal = currentGrossTotal
                const retPctSummary = n(certForm.retention_pct) || Number(selectedInvoice.retention_pct ?? 0) || 5
                const retentionAmt = cumulativeGrossTotal * retPctSummary / 100
                const retentionReleaseAmt = Number((selectedInvoice as any).retention_release_amount ?? 0)
                const previousPaidAmt = financePreviousPaidForSub(selectedInvoice.subcontractor_id, selectedInvoice)
                const financeDeductionAmt = financeTotalDeductionsForCertificate(selectedInvoice.subcontractor_id, selectedInvoice)
                const netCertificateValue = cumulativeGrossTotal - retentionAmt + retentionReleaseAmt - financeDeductionAmt
                const finalPayable = Math.max(netCertificateValue - previousPaidAmt, 0)
                const netAmt = finalPayable

                return <>
                  {/* Node / Villa selector */}
                  {availableNodes.length > 0 && (
                    <div style={{ background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a6b4a' }}>
                          📍 Filter by Node / Villa — {invoiceNodeFilter.size === 0 ? 'All nodes (' + availableNodes.length + ')' : invoiceNodeFilter.size + ' of ' + availableNodes.length + ' selected'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => setInvoiceNodeFilter(new Set(availableNodes.map(n => n.id)))}
                            style={{ padding: '4px 12px', background: '#e8f5e9', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>
                            Select All
                          </button>
                          <button onClick={() => setInvoiceNodeFilter(new Set())}
                            style={{ padding: '4px 12px', background: '#fff3e0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#e65100' }}>
                            Show All
                          </button>
                          <button onClick={() => setInvoiceCollapsedNodes(new Set(availableNodes.map(n => n.id)))}
                            style={{ padding: '4px 12px', background: '#ede7f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#5e35b1' }}>
                            Collapse All Buildings
                          </button>
                          <button onClick={() => setInvoiceCollapsedNodes(new Set())}
                            style={{ padding: '4px 12px', background: '#e3f2fd', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1565c0' }}>
                            Expand All Buildings
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {availableNodes.map((node: StructureNode) => {
                          const selected = invoiceNodeFilter.has(node.id)
                          const nodeLines = subBreakdown.filter((b: any) => b.structure_id === node.id)
                          const color = NODE_COLORS[node.type] ?? '#888'
                          return (
                            <button key={node.id} onClick={() => {
                              const next = new Set(invoiceNodeFilter)
                              if (next.has(node.id)) next.delete(node.id); else next.add(node.id)
                              setInvoiceNodeFilter(next)
                            }} style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              border: `2px solid ${selected ? color : '#ddd'}`,
                              background: selected ? color + '22' : '#fff',
                              color: selected ? color : '#555',
                            }}>
                              {node.code} — {node.name}
                              <span style={{ marginLeft: 6, opacity: 0.7 }}>({nodeLines.length} items)</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Invoice header */}
                  <div style={{ background: '#1a1a2e', color: '#fff', borderRadius: 12, padding: '20px 28px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Subcontractor Payment Invoice</div>
                        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{sub?.name ?? '—'}</div>
                        <div style={{ fontSize: 13, color: '#aaa' }}>Invoice No: {selectedInvoice.invoice_no} · Period End: {selectedInvoice.period_end}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Net Payable</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#66bb6a' }}>{money(finalPayable || selectedInvoice.net_payable || selectedInvoice.net_amount)}</div>
                        <span style={{ fontSize: 12, padding: '3px 10px', background: '#ffffff22', borderRadius: 20 }}>{selectedInvoice.status}</span>
                        {!selectedInvoiceEditable && <span style={{ fontSize: 12, padding: '3px 10px', background: '#fee2e2', color: '#991b1b', borderRadius: 20 }}>Read Only after Release</span>}
                      </div>
                    </div>
                  </div>

                  <Card title="Subcontractor Invoice Summary">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        <tr><td style={{ padding: '8px 10px' }}>الأعمال السابقة / Previous Gross</td><td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(Math.max(cumulativeGrossTotal - currentGrossTotal, 0))}</td></tr>
                        <tr><td style={{ padding: '8px 10px' }}>الأعمال الحالية / Current Gross</td><td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(currentGrossTotal)}</td></tr>
                        <tr><td style={{ padding: '8px 10px', fontWeight: 700 }}>إجمالي الأعمال حتى تاريخه / Cumulative Gross Works</td><td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(cumulativeGrossTotal)}</td></tr>
                        <tr><td style={{ padding: '8px 10px' }}>خصم تأمين / Retention Deduction</td><td style={{ padding: '8px 10px', textAlign: 'right', color: '#e65100' }}>- {money(retentionAmt)}</td></tr>
                        <tr><td style={{ padding: '8px 10px' }}>رد تأمين / Retention Release</td><td style={{ padding: '8px 10px', textAlign: 'right', color: '#1565c0' }}>+ {money(retentionReleaseAmt)}</td></tr>
                        <tr><td style={{ padding: '8px 10px' }}>خصومات وغرامات من الحسابات / Finance Penalties & Deductions</td><td style={{ padding: '8px 10px', textAlign: 'right', color: '#c62828' }}>- {money(financeDeductionAmt)}</td></tr>
                        <tr><td style={{ padding: '8px 10px', fontWeight: 700 }}>القيمة بعد الخصومات / Net Certificate Value</td><td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(netCertificateValue)}</td></tr>
                        <tr><td style={{ padding: '8px 10px' }}>ما تم صرفه سابقاً / Previously Paid</td><td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(previousPaidAmt)}</td></tr>
                        <tr style={{ background: '#eef8f3' }}><td style={{ padding: '10px', fontWeight: 800 }}>صافي المستحق للصرف / Final Payable</td><td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#1a6b4a' }}>{money(finalPayable)}</td></tr>
                      </tbody>
                    </table>
                    {Boolean((selectedInvoice as any).retention_release_remarks) && <div style={{ marginTop: 10, color: '#555', fontSize: 13 }}>Retention Release Remarks: {(selectedInvoice as any).retention_release_remarks}</div>}
                  </Card>

                  {/* Breakdown table */}
                  <Card title={`Breakdown — ${lines.length} BOQ Items`}>
                    <div style={{ marginBottom: 12, padding: '10px 14px', background: '#e3f2fd', borderRadius: 8, fontSize: 13, color: '#1565c0' }}>
                      📐 Invoice breakdown uses Effective Qty automatically: QS measured qty if available, otherwise BOQ qty.
                    </div>
                    <div style={{ overflowX: 'auto' }}>

                      {(() => {
                        const nodeGroups = new Map<string, any[]>()
                        lines.forEach((b: any) => {
                          const key = b.structure_id ?? '__no_node__'
                          if (!nodeGroups.has(key)) nodeGroups.set(key, [])
                          nodeGroups.get(key)!.push(b)
                        })
                        return Array.from(nodeGroups.entries()).map(([nodeId, nodeLines]) => {
                          const nodeObj = structureNodes.find((n: StructureNode) => n.id === nodeId)
                          const nodeColor = nodeObj ? (NODE_COLORS[nodeObj.type] ?? '#1a6b4a') : '#1a6b4a'
                          const nodePctKey = `__pct__${nodeId}`
                          const nodeCollapsed = invoiceCollapsedNodes.has(nodeId)
                          return (
                            <div key={nodeId} style={{ marginBottom: 24, border: `1px solid ${nodeColor}33`, borderRadius: 10, overflow: 'hidden' }}>
                              {/* Node header with bulk % + collapse/expand */}
                              <div style={{ background: nodeColor, color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <button onClick={() => {
                                  const next = new Set(invoiceCollapsedNodes)
                                  if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId)
                                  setInvoiceCollapsedNodes(next)
                                }} style={{ background: '#ffffff22', color: '#fff', border: '1px solid #ffffff55', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontWeight: 800 }}>
                                  {nodeCollapsed ? '▶ Show BOQ Items' : '▼ Hide BOQ Items'}
                                </button>
                                <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>
                                  📍 {nodeObj ? `${nodeObj.code} — ${nodeObj.name}` : 'General'} &nbsp;·&nbsp; {nodeLines.length} items
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 12, opacity: 0.85 }}>Apply % to all:</span>
                                  <input type="number" min="0" max="100" step="5"
                                    value={typeof invoiceLineEdits[nodePctKey] === 'string' ? invoiceLineEdits[nodePctKey] : ''}
                                    onChange={e => {
                                      const pct = Math.min(parseFloat(e.target.value) || 0, 100)
                                      const next: InvoiceLineEditState = { ...invoiceLineEdits, [nodePctKey]: e.target.value }
                                      nodeLines.forEach((b: any) => {
                                        const contractQty = getEffectiveQty(b)
                                        const prevQty = getPrevQty(b.id, b.boq_item_id, b.structure_id ?? null)
                                        const remainingQty = Math.max(0, contractQty - prevQty)
                                        // Cap: cannot apply more than what's remaining
                                        const rawQty = contractQty * pct / 100
                                        const safeQty = Math.min(rawQty, remainingQty)
                                        const safePct = contractQty > 0 ? (safeQty / contractQty) * 100 : 0
                                        next[b.id] = { current_qty: safeQty.toFixed(3), current_work_pct: safePct.toFixed(2) }
                                      })
                                      setInvoiceLineEdits(next)
                                    }}
                                    placeholder="%" style={{ width: 60, padding: '3px 8px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 700, textAlign: 'center' }}
                                  />
                                </div>
                              </div>
                              {nodeCollapsed ? (
                                <div style={{ padding: '14px 16px', background: '#fafafa', color: '#666', fontSize: 13 }}>
                                  BOQ items are hidden for this building. Click “Show BOQ Items” to edit/view its items.
                                </div>
                              ) : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead><tr style={{ background: '#f5f5f5' }}>
                                  {['#','Code','Description','Unit','Effective Qty','Prev.','%','Current Qty','Cum. Qty','Rate','Current Value','Cum. Value'].map(h => (
                                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr></thead>
                                <tbody>
                                  {nodeLines.map((b: any, idx: number) => {
                                    const edit = getEdit(b.id)
                                    const contractQty = getEffectiveQty(b)
                                    const prevQty = getPrevQty(b.id, b.boq_item_id, b.structure_id ?? null)
                                    const remainingQty = Math.max(0, contractQty - prevQty)
                                    const pct = parseFloat(edit.current_work_pct ?? '') || 0
                                    // currentQty = pct% of CONTRACT qty, but capped at remaining
                                    const rawCurrentQty = pct > 0 ? contractQty * pct / 100 : parseFloat(edit.current_qty) || 0
                                    const currentQty = Math.min(rawCurrentQty, remainingQty)
                                    // cumQty can NEVER exceed contractQty
                                    const cumQty = Math.min(prevQty + currentQty, contractQty)
                                    const rate = b.rate ?? 0
                                    const currentValue = currentQty * rate
                                    const cumValue = cumQty * rate
                                    const cumPct = contractQty > 0 ? Math.min((cumQty / contractQty) * 100, 100) : 0
                                    const remainingPct = contractQty > 0 ? (remainingQty / contractQty) * 100 : 0
                                    const boqItem = b.boq_items as any
                                    return (
                                      <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ padding: '6px 10px', color: '#aaa', fontSize: 11 }}>{idx+1}</td>
                                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>{boqItem?.item_code ?? b.assignment_key}</td>
                                        <td style={{ padding: '6px 10px', maxWidth: 200 }}>{boqItem?.description ?? '—'}</td>
                                        <td style={{ padding: '6px 10px' }}>{boqItem?.unit ?? '—'}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{contractQty}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#888' }}>{prevQty.toFixed(2)}</td>
                                        <td style={{ padding: '6px 10px', minWidth: 90 }}>
                                          {remainingQty <= 0 ? (
                                            <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>✓ 100%</span>
                                          ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                              <input type="number" min="0" max={remainingPct.toFixed(1)} step="5"
                                                value={edit.current_work_pct ?? ''}
                                                onChange={e => {
                                                  const p = Math.min(parseFloat(e.target.value) || 0, 100)
                                                  const qty = Math.min(contractQty * p / 100, remainingQty)
                                                  setInvoiceLineEdits({ ...invoiceLineEdits, [b.id]: { current_qty: qty.toFixed(3), current_work_pct: String(p) } })
                                                }}
                                                placeholder="0"
                                                style={{ width: 50, padding: '3px 5px', borderRadius: 5, border: '1px solid #ddd', fontSize: 12, textAlign: 'center' }}
                                              />
                                              <span style={{ fontSize: 11, color: '#888' }}>%</span>
                                            </div>
                                          )}
                                          {remainingQty > 0 && remainingQty < contractQty && (
                                            <div style={{ fontSize: 10, color: '#e65100', marginTop: 2 }}>rem: {remainingQty.toFixed(2)}</div>
                                          )}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1a6b4a' }}>{currentQty.toFixed(2)}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                          <div style={{ fontWeight: 700, color: cumQty > contractQty ? '#c62828' : '#111' }}>{cumQty.toFixed(2)}</div>
                                          <div style={{ height: 3, background: '#e8e8e8', borderRadius: 999, marginTop: 2 }}>
                                            <div style={{ width: `${cumPct}%`, height: '100%', background: cumPct >= 100 ? '#2e7d32' : '#1565c0', borderRadius: 999 }} />
                                          </div>
                                          <div style={{ fontSize: 10, color: '#888' }}>{cumPct.toFixed(0)}%</div>
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{money(rate)}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1a6b4a' }}>{money(currentValue)}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{money(cumValue)}</td>
                                      </tr>
                                    )
                                  })}
                                  <tr style={{ background: nodeColor + '15', fontWeight: 700 }}>
                                    <td colSpan={10} style={{ padding: '8px 10px', color: nodeColor }}>Subtotal {nodeObj?.code}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: nodeColor, fontSize: 13 }}>
                                      {money(nodeLines.reduce((s: number, b: any) => {
                                        const e2 = getEdit(b.id); const p2 = parseFloat(e2.current_work_pct ?? '') || 0
                                        const q2 = p2 > 0 ? getEffectiveQty(b)*p2/100 : parseFloat(e2.current_qty)||0
                                        return s + q2*(b.rate??0)
                                      }, 0))}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: nodeColor }}>
                                      {money(nodeLines.reduce((s: number, b: any) => {
                                        const e2 = getEdit(b.id); const p2 = parseFloat(e2.current_work_pct ?? '') || 0
                                        const q2 = p2 > 0 ? getEffectiveQty(b)*p2/100 : parseFloat(e2.current_qty)||0
                                        return s + (getPrevQty(b.id, b.boq_item_id, b.structure_id ?? null)+q2)*(b.rate??0)
                                      }, 0))}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>}
                            </div>
                          )
                        })
                      })()}
                    </div>

                    {/* ── Penalties ── */}
                    <div style={{ marginTop: 24, borderTop: '2px solid #ffebee', paddingTop: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#c62828', marginBottom: 12 }}>⚠️ Penalties</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 1fr auto', gap: 8, marginBottom: 10 }}>
                        <Field label="Type">
                          <Select value={penaltyForm.penalty_type} onChange={e => setPenaltyForm({ ...penaltyForm, penalty_type: e.target.value as PenaltyType })}>
                            {PENALTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </Field>
                        <Field label="Reference (NCR No / Activity)">
                          <Input value={penaltyForm.reference} onChange={e => setPenaltyForm({ ...penaltyForm, reference: e.target.value })} placeholder="e.g. NCR-001" />
                        </Field>
                        <Field label="Description">
                          <Input value={penaltyForm.description} onChange={e => setPenaltyForm({ ...penaltyForm, description: e.target.value })} placeholder="e.g. Defective concrete pour" />
                        </Field>
                        <Field label="Amount (EGP)">
                          <Input type="number" value={penaltyForm.amount} onChange={e => setPenaltyForm({ ...penaltyForm, amount: e.target.value })} />
                        </Field>
                        <div style={{ paddingTop: 22 }}>
                          <Button onClick={async () => {
                            if (!penaltyForm.description || !penaltyForm.amount || !selectedInvoiceId) return
                            await run('Add penalty', () => createInvoicePenalty.mutateAsync({
                              invoice_id: selectedInvoiceId,
                              project_id: projectId!,
                              subcontractor_id: selectedInvoice.subcontractor_id,
                              penalty_type: penaltyForm.penalty_type,
                              reference: penaltyForm.reference || null,
                              description: penaltyForm.description,
                              amount: n(penaltyForm.amount),
                            }))
                            setPenaltyForm({ penalty_type: 'NCR', reference: '', description: '', amount: '' })
                          }} disabled={createInvoicePenalty.isPending}>+ Add</Button>
                        </div>
                      </div>
                      {invoicePenalties.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: '#ffebee' }}>{['Type','Reference','Description','Amount',''].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {invoicePenalties.map((p: any) => (
                              <tr key={p.id} style={{ borderBottom: '1px solid #ffeaea' }}>
                                <td style={{ padding: '6px 10px' }}><span style={{ background: '#ffebee', color: '#c62828', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{p.penalty_type}</span></td>
                                <td style={{ padding: '6px 10px', color: '#888' }}>{p.reference ?? '—'}</td>
                                <td style={{ padding: '6px 10px' }}>{p.description}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#c62828' }}>{money(p.amount)}</td>
                                <td style={{ padding: '6px 10px' }}><button onClick={() => run('Delete', () => deleteInvoicePenalty.mutateAsync({ id: p.id, invoiceId: selectedInvoiceId! }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>✕</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* ── Additions ── */}
                    <div style={{ marginTop: 20, borderTop: '2px solid #e8f5e9', paddingTop: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#2e7d32', marginBottom: 12 }}>✅ Additions / Extras</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginBottom: 10 }}>
                        <Field label="Description"><Input value={additionForm.description} onChange={e => setAdditionForm({ ...additionForm, description: e.target.value })} placeholder="e.g. Mobilization cost" /></Field>
                        <Field label="Amount (EGP)"><Input type="number" value={additionForm.amount} onChange={e => setAdditionForm({ ...additionForm, amount: e.target.value })} /></Field>
                        <div style={{ paddingTop: 22 }}>
                          <Button onClick={async () => {
                            if (!additionForm.description || !additionForm.amount || !selectedInvoiceId) return
                            await run('Add addition', () => createInvoiceAddition.mutateAsync({
                              invoice_id: selectedInvoiceId,
                              project_id: projectId!,
                              subcontractor_id: selectedInvoice.subcontractor_id,
                              description: additionForm.description,
                              amount: n(additionForm.amount),
                            }))
                            setAdditionForm({ description: '', amount: '' })
                          }} disabled={createInvoiceAddition.isPending}>+ Add</Button>
                        </div>
                      </div>
                      {invoiceAdditions.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: '#e8f5e9' }}>{['Description','Amount',''].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {invoiceAdditions.map((a: any) => (
                              <tr key={a.id} style={{ borderBottom: '1px solid #f0fff0' }}>
                                <td style={{ padding: '6px 10px' }}>{a.description}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#2e7d32' }}>{money(a.amount)}</td>
                                <td style={{ padding: '6px 10px' }}><button onClick={() => run('Delete', () => deleteInvoiceAddition.mutateAsync({ id: a.id, invoiceId: selectedInvoiceId! }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>✕</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* ── Financial Summary + Payment Register ── */}
                    {(() => {
                      // v120.1: Keep this dark summary in sync with the Subcontractor Invoice Summary above.
                      // Previous paid comes from Finance payments for the same subcontractor before this certificate.
                      // Current paid is only payments linked to this certificate/invoice.
                      const retPct = selectedInvoice.retention_pct ?? 5
                      const retAmt = retentionAmt
                      const currentInvoicePaid = financePaidForInvoice(selectedInvoice)
                      const totalPaid = previousPaidAmt + currentInvoicePaid
                      const outstanding = Math.max(finalPayable - currentInvoicePaid, 0)
                      const finalNet = finalPayable

                      return (
                        <>
                          {/* ── Financial Summary ── */}
                          <div style={{ marginTop: 24, background: '#1a1a2e', borderRadius: 12, padding: 20, color: '#fff' }}>
                            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>📊 Invoice Financial Summary</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {[
                                ['Cumulative Gross Works / إجمالي الأعمال حتى تاريخه', money(cumulativeGrossTotal), '+', '#66bb6a'],
                                [`Retention (${retPct}%)`, money(retAmt), '-', '#ef9a9a'],
                                ['Retention Release / رد تأمين', money(retentionReleaseAmt), '+', '#66bb6a'],
                                ['Finance Penalties & Deductions / خصومات وغرامات الحسابات', money(financeDeductionAmt), '-', '#ef9a9a'],
                                ['Previously Paid / ما تم صرفه سابقاً', money(previousPaidAmt), '-', '#64b5f6'],
                                ['Current Invoice Paid / مدفوع على هذا المستخلص', money(currentInvoicePaid), '-', '#64b5f6'],
                              ].map(([label, val, sign, color]) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                  <span style={{ fontSize: 13, color: '#aaa' }}>{sign} {label}</span>
                                  <span style={{ fontWeight: 700, color }}>{val}</span>
                                </div>
                              ))}
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid rgba(255,255,255,0.3)', marginTop: 4 }}>
                                <span style={{ fontWeight: 800, fontSize: 16 }}>= NET PAYABLE / صافي المستحق</span>
                                <span style={{ fontWeight: 800, fontSize: 20, color: '#66bb6a' }}>{money(finalNet)}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 4 }}>
                                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px' }}>
                                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Final Payable</div>
                                  <div style={{ fontWeight: 800, fontSize: 16, color: '#66bb6a' }}>{money(finalNet)}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px' }}>
                                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Total Paid / المدفوع</div>
                                  <div style={{ fontWeight: 800, fontSize: 16, color: '#64b5f6' }}>{money(totalPaid)}</div>
                                </div>
                                <div style={{ background: outstanding > 0 ? 'rgba(239,83,80,0.15)' : 'rgba(102,187,106,0.15)', borderRadius: 8, padding: '10px 14px', border: `1px solid ${outstanding > 0 ? '#ef5350' : '#66bb6a'}` }}>
                                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Outstanding / المتبقي</div>
                                  <div style={{ fontWeight: 800, fontSize: 16, color: outstanding > 0 ? '#ef9a9a' : '#66bb6a' }}>{money(outstanding)}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ── Payment Register ── */}
                          <div style={{ marginTop: 20, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ background: '#0d47a1', color: '#fff', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 800, fontSize: 14 }}>💳 Payment Register / سجل المدفوعات</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                {financeRecords.filter((r:any)=>isConfirmedFinancePayment(r)&&financePaymentBelongsToInvoice(r, selectedInvoice)).length} payments · Current Invoice Paid: <strong>{money(currentInvoicePaid)}</strong>
                              </div>
                            </div>

                            {/* Add Payment Form */}
                            <div style={{ padding: '16px 18px', background: '#f8faff', borderBottom: '1px solid #e3eaf7' }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#0d47a1', marginBottom: 12 }}>+ Record New Payment</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                                <Field label="Paid Amount (EGP)">
                                  <Input type="number" value={paymentForm.paid_amount}
                                    onChange={e => setPaymentForm({ ...paymentForm, paid_amount: e.target.value })}
                                    placeholder={money(outstanding)} />
                                </Field>
                                <Field label="Payment Date">
                                  <Input type="date" value={paymentForm.payment_date}
                                    onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
                                </Field>
                                <Field label="Method">
                                  <Select value={paymentForm.payment_method}
                                    onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
                                    <option>Transfer</option>
                                    <option>Cheque</option>
                                    <option>Cash</option>
                                    <option>Bank Draft</option>
                                  </Select>
                                </Field>
                                <Field label="Reference / Cheque No.">
                                  <Input value={paymentForm.reference}
                                    onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                                    placeholder="e.g. CHQ-1234" />
                                </Field>
                                <Field label="Notes">
                                  <Input value={paymentForm.notes}
                                    onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    placeholder="Optional notes" />
                                </Field>
                              </div>
                              <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                                <Button
                                  disabled={addPaymentRecord.isPending || !paymentForm.paid_amount || !paymentForm.payment_date}
                                  onClick={async () => {
                                    if (!selectedInvoiceId || !projectId || !paymentForm.paid_amount) return
                                    await run('Payment', () => addFinanceRecord.mutateAsync({
                                      project_id: projectId,
                                      invoice_id: selectedInvoiceId,
                                      subcontractor_id: selectedInvoice.subcontractor_id ?? null,
                                      record_type: 'Payment',
                                      amount: parseFloat(paymentForm.paid_amount) || 0,
                                      payment_date: paymentForm.payment_date,
                                      reference: paymentForm.reference || null,
                                      payment_method: paymentForm.payment_method,
                                      notes: paymentForm.notes || null,
                                      invoice_no: selectedInvoice.invoice_no ?? null,
                                      final_payable: finalNet,
                                      description: `Payment for invoice ${selectedInvoice.invoice_no}`,
                                    }))
                                    setPaymentForm({ paid_amount: '', payment_date: new Date().toISOString().split('T')[0], reference: '', payment_method: 'Transfer', notes: '' })
                                  }}>
                                  {addPaymentRecord.isPending ? 'Saving...' : '💾 Record Payment'}
                                </Button>
                                {outstanding <= 0 && (
                                  <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>✓ Fully Paid</span>
                                )}
                              </div>
                            </div>

                            {/* Payment History Table */}
                            {invoicePayments.length > 0 ? (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ background: '#e3eaf7' }}>
                                      {['#', 'Date', 'Amount', 'Method', 'Reference / Cheque', 'Notes', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#0d47a1', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invoicePayments.map((p: any, idx: number) => (
                                      <tr key={p.id} style={{ borderBottom: '1px solid #f0f4ff', background: idx % 2 === 0 ? '#fff' : '#fafbff' }}>
                                        <td style={{ padding: '10px 12px', color: '#888', fontSize: 11 }}>{idx + 1}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.payment_date}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0d47a1', fontFamily: 'monospace', fontSize: 14 }}>{money(p.amount)}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                          <span style={{ background: p.payment_method === 'Cheque' ? '#fff3e0' : p.payment_method === 'Cash' ? '#e8f5e9' : '#e3f2fd', color: p.payment_method === 'Cheque' ? '#e65100' : p.payment_method === 'Cash' ? '#2e7d32' : '#1565c0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{p.payment_method}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#555' }}>{p.reference || '—'}</td>
                                        <td style={{ padding: '10px 12px', color: '#888' }}>{p.notes || '—'}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                          <Button tone="danger" onClick={() => { if (confirm('Delete this payment record?')) run('Delete payment', () => deleteFinanceRecord.mutateAsync({ id: p.id, projectId: projectId!, invoiceId: selectedInvoiceId })) }}>✕</Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: '#0d47a1', color: '#fff' }}>
                                      <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 800 }}>TOTAL PAID</td>
                                      <td style={{ padding: '10px 12px', fontWeight: 900, fontSize: 15, fontFamily: 'monospace' }}>{money(totalPaid)}</td>
                                      <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700 }}>
                                        Outstanding: <span style={{ color: outstanding > 0 ? '#ffcdd2' : '#c8e6c9' }}>{money(outstanding)}</span>
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            ) : (
                              <div style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: 13 }}>
                                No payments recorded yet. Add the first payment above.
                              </div>
                            )}
                          </div>
                        </>
                      )
                    })()}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                      <Button onClick={async () => {
                        if (!selectedInvoiceId) return
                        // Helper to round to 3dp — prevents floating point errors hitting DB triggers
                        const r3 = (v: number) => Math.round(v * 1000) / 1000
                        // Compute each line's currentQty using same logic as grossTotal (pct takes priority)
                        const linesToSave = lines.map((b: any) => {
                          const edit = getEdit(b.id)
                          const contractQty = r3(getEffectiveQty(b))
                          const pct = parseFloat(edit.current_work_pct ?? '') || 0
                          const currentQty = r3(pct > 0 ? contractQty * pct / 100 : parseFloat(edit.current_qty) || 0)
                          const prevQty = r3(getPrevQty(b.id, b.boq_item_id, b.structure_id ?? null))
                          const cumQty = r3(prevQty + currentQty)
                          // Cap at BOQ qty to never exceed (handles 100% case)
                          const safeCumQty = Math.min(cumQty, contractQty)
                          const safeCurrentQty = r3(safeCumQty - prevQty)
                          const rate = b.rate ?? 0
                          return {
                            invoice_id: selectedInvoiceId,
                            project_id: projectId!,
                            subcontractor_id: selectedInvoice.subcontractor_id,
                            breakdown_id: b.id,
                            boq_item_id: b.boq_item_id,
                            structure_id: b.structure_id ?? null,
                            boq_qty: contractQty,
                            previous_cumulative_qty: prevQty,
                            current_qty: safeCurrentQty,
                            new_cumulative_qty: safeCumQty,
                            rate,
                            current_value: r3(safeCurrentQty * rate),
                            cumulative_value: r3(safeCumQty * rate),
                            // Save the CURRENT PERIOD % (what the user typed), not cumulative %
                            // This is what gets loaded back into the % input field on Open Breakdown
                            current_work_pct: contractQty > 0 ? r3((safeCurrentQty / contractQty) * 100) : 0,
                            qs_status: 'Approved',
                            approved_qty: safeCurrentQty,
                          }
                        })
                        // grossTotal is already computed above in the closure (same pct/qty logic)
                        await run('Save breakdown', async () => {
                          if (!selectedInvoiceEditable) throw new Error('Only Draft / Returned / Rejected subcontractor invoices can be edited. Released or approved invoices are locked.')
                          const savedLines2 = await bulkUpsertInvoiceLines.mutateAsync({ invoiceId: selectedInvoiceId, lines: linesToSave })
                          // Recompute correct retention/net and update the invoice record
                          const sub2Save = subcontractors.find(s => s.id === selectedInvoice.subcontractor_id) as any
                          const retPctSave = n(certForm.retention_pct) || Number(selectedInvoice.retention_pct ?? 0) || 5
                          const retAmtSave = grossTotal * retPctSave / 100
                          const dpRecPctSave = sub2Save?.advance_recovery_pct ?? 0
                          const dpRecSave = grossTotal * dpRecPctSave / 100
                          const totalPenSave = invoicePenalties.reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
                          const totalAddSave = invoiceAdditions.reduce((s: number, a: any) => s + (a.amount ?? 0), 0)
                          const retentionReleaseSave = Number((selectedInvoice as any).retention_release_amount ?? 0)
                          const cumulativeGrossSave = linesToSave.reduce((s: number, line: any) => s + Number(line.cumulative_value ?? 0), 0)
                          const currentGrossSave = linesToSave.reduce((s: number, line: any) => s + Number(line.current_value ?? 0), 0)
                          const previousPaidSave = financePreviousPaidForSub(selectedInvoice.subcontractor_id, selectedInvoice)
                          const retAmtSave2 = cumulativeGrossSave * retPctSave / 100
                          const dpRecSave2 = currentGrossSave * dpRecPctSave / 100
                          const netCertificateSave = cumulativeGrossSave - retAmtSave2 - dpRecSave2 - totalPenSave + totalAddSave + retentionReleaseSave
                          const finalPayableSave = Math.max(netCertificateSave - previousPaidSave, 0)
                          await updateCertAmounts.mutateAsync({
                            id: selectedInvoiceId,
                            gross_amount: cumulativeGrossSave,
                            retention_amount: retAmtSave2,
                            net_amount: finalPayableSave,
                            net_payable: finalPayableSave,
                            retention_pct: retPctSave,
                            retention_release_amount: retentionReleaseSave,
                            previous_paid_amount: previousPaidSave,
                          } as any)
                          // CRITICAL: Re-fetch so invoiceLinesAll is fresh for subsequent Open Breakdown calls
                          // invoiceLinesAll is local state (not React Query), so it must be manually refreshed
                          await fetchCommercialScreens()
                          // Re-populate the edit state from the freshly saved lines so the breakdown
                          // displays the saved values immediately (no need to close and re-open)
                          const freshEdits: Record<string, { current_qty: string; current_work_pct: string }> = {}
                          const subBd2 = (Array.isArray(savedLines2) ? savedLines2 : linesToSave) as any[]
                          linesToSave.forEach((saved: any) => {
                            const contractQty = Number(saved.boq_qty ?? 0)
                            const savedQty = Number(saved.current_qty ?? 0)
                            const savedPct = contractQty > 0 ? ((savedQty / contractQty) * 100).toFixed(2) : ''
                            freshEdits[saved.breakdown_id] = { current_qty: String(savedQty), current_work_pct: savedPct }
                          })
                          setInvoiceLineEdits(freshEdits)
                          setMessage('✅ Breakdown saved successfully')
                        })
                      }} disabled={bulkUpsertInvoiceLines.isPending || !selectedInvoiceEditable}>💾 Save Breakdown</Button>

                      <Button tone="secondary" onClick={() => {
                        // ── PDF Export — Blob URL approach (no popup blocker, no blank page) ──
                        const sub2 = subcontractors.find(s => s.id === selectedInvoice.subcontractor_id) as any
                        const retPct3 = selectedInvoice.retention_pct ?? 5
                        let retAmt3 = 0
                        const dpRecPct3 = (sub2 as any)?.advance_recovery_pct ?? 0
                        let dpRec3 = 0
                        const totalPen3 = invoicePenalties.reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
                        const totalAdd3 = invoiceAdditions.reduce((s: number, a: any) => s + (a.amount ?? 0), 0)
                        const retentionReleasePdf = Number((selectedInvoice as any).retention_release_amount ?? 0)
                        const previouslyPaidPdf = financePreviousPaidForSub(selectedInvoice.subcontractor_id, selectedInvoice)
                        const currentInvoicePaidPdf = financePaidForInvoice(selectedInvoice)
                        const financeDeductionPdf = financeTotalDeductionsForCertificate(selectedInvoice.subcontractor_id, selectedInvoice)
                        let finalNet3 = 0
                        let netBeforePaidPdf = 0
                        let totalDeductions = 0
                        const projectName = activeProject?.project_name ?? '—'
                        const contractorName = sub2?.name ?? '—'
                        const certNo = selectedInvoice.invoice_no ?? '—'
                        const periodEnd = selectedInvoice.period_end ?? '—'

                        // Group lines by node
                        const grouped = new Map<string, any[]>()
                        lines.forEach((b: any) => {
                          const key = b.structure_id ?? '__general__'
                          if (!grouped.has(key)) grouped.set(key, [])
                          grouped.get(key)!.push(b)
                        })

                        // Build detail rows
                        let detailRowsHtml = ''
                        let grandPrev = 0, grandCurrent = 0, grandCumulative = 0
                        Array.from(grouped.entries()).forEach(([nodeId, nodeLines]) => {
                          const nodeObj2 = structureNodes.find((n: StructureNode) => n.id === nodeId)
                          const nodeTitle = nodeObj2 ? `${nodeObj2.code} — ${nodeObj2.name}` : 'البنود العامة'
                          let nodePrevTotal = 0, nodeCurrentTotal = 0, nodeCumTotal = 0
                          const rowsHtml2 = (nodeLines as any[]).map((b: any, idx: number) => {
                            const edit = getEdit(b.id)
                            const contractQty = getEffectiveQty(b)
                            const pct2 = parseFloat(edit.current_work_pct ?? '') || 0
                            const prevQty = getPrevQty(b.id, b.boq_item_id, b.structure_id ?? null)
                            const remainingQty = Math.max(0, contractQty - prevQty)
                            const rawQty = pct2 > 0 ? contractQty * pct2 / 100 : parseFloat(edit.current_qty) || 0
                            const currentQty = Math.min(rawQty, remainingQty)
                            const cumQty = Math.min(prevQty + currentQty, contractQty)
                            const rate2 = b.rate ?? 0
                            const prevVal = prevQty * rate2
                            const currentVal = currentQty * rate2
                            const cumVal = cumQty * rate2
                            const workPct = contractQty > 0 ? Math.min((cumQty / contractQty) * 100, 100) : 0
                            const boqItem2 = b.boq_items as any
                            nodePrevTotal += prevVal; nodeCurrentTotal += currentVal; nodeCumTotal += cumVal
                            return `<tr>
                              <td style="text-align:center">${idx + 1}</td>
                              <td style="text-align:right;direction:rtl;max-width:200px">${boqItem2?.description ?? b.assignment_key ?? '—'}</td>
                              <td style="text-align:center">${boqItem2?.unit ?? '—'}</td>
                              <td style="text-align:center">${contractQty}</td>
                              <td style="text-align:center">${workPct.toFixed(0)}%</td>
                              <td style="text-align:center;background:#fffde7">${prevQty.toFixed(2)}</td>
                              <td style="text-align:center;background:#e8f5e9;font-weight:700;color:#0d5c35">${currentQty.toFixed(2)}</td>
                              <td style="text-align:center;background:#e3f2fd">${cumQty.toFixed(2)}</td>
                              <td style="text-align:center">${money(rate2)}</td>
                              <td style="text-align:center;background:#fffde7">${money(prevVal)}</td>
                              <td style="text-align:center;background:#e8f5e9;font-weight:700;color:#0d5c35">${money(currentVal)}</td>
                              <td style="text-align:center;background:#e3f2fd">${money(cumVal)}</td>
                            </tr>`
                          }).join('')
                          grandPrev += nodePrevTotal; grandCurrent += nodeCurrentTotal; grandCumulative += nodeCumTotal
                          detailRowsHtml += `
                            <tr style="background:#c8e6c9">
                              <td colspan="12" style="font-weight:800;text-align:right;direction:rtl;padding:5px 10px;color:#1b5e20;font-size:10px">
                                ▸ ${nodeTitle}
                              </td>
                            </tr>
                            ${rowsHtml2}
                            <tr style="background:#a5d6a7;font-weight:700;font-size:9px">
                              <td colspan="9" style="text-align:right;direction:rtl;padding:4px 10px">إجمالي ${nodeObj2?.code ?? ''}</td>
                              <td style="text-align:center">${money(nodePrevTotal)}</td>
                              <td style="text-align:center;color:#1b5e20">${money(nodeCurrentTotal)}</td>
                              <td style="text-align:center">${money(nodeCumTotal)}</td>
                            </tr>`
                        })

                        // V121: PDF uses the same calculation base as the on-screen certificate summary.
                        // Previous paid/current paid are pulled live from Finance, not from stale DB fields.
                        retAmt3 = grandCumulative * retPct3 / 100
                        dpRec3 = grandCurrent * dpRecPct3 / 100
                        totalDeductions = retAmt3 + dpRec3 + totalPen3 + financeDeductionPdf
                        netBeforePaidPdf = grandCumulative + totalAdd3 + retentionReleasePdf - totalDeductions
                        finalNet3 = Math.max(netBeforePaidPdf - previouslyPaidPdf - currentInvoicePaidPdf, 0)

                        const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>مستخلص ${certNo}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; font-size:9px; color:#111; background:#fff; direction:rtl; }
  @media print { @page { margin:8mm; size:A4 landscape; } .noprint { display:none; } }

  /* ── Header ── */
  .hdr { background:#1a1a2e; color:#fff; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; }
  .hdr-left h1 { font-size:16px; font-weight:900; margin-bottom:3px; }
  .hdr-left p  { font-size:9px; opacity:0.75; }
  .hdr-right   { text-align:left; }
  .hdr-right .lbl { font-size:8px; opacity:0.65; margin-bottom:2px; }
  .hdr-right .net { font-size:22px; font-weight:900; color:#69f0ae; }

  /* ── Meta strip ── */
  .meta { display:grid; grid-template-columns:repeat(4,1fr); background:#f0f7f4; border-bottom:2px solid #1a6b4a; }
  .meta-cell { text-align:center; padding:6px 8px; border-left:1px solid #c8e6c9; }
  .meta-cell .ml { font-size:7px; color:#666; text-transform:uppercase; letter-spacing:.05em; }
  .meta-cell .mv { font-size:10px; font-weight:700; color:#1a6b4a; margin-top:2px; }

  /* ── Section title ── */
  .sec { background:#2e5b3a; color:#fff; padding:5px 12px; font-size:10px; font-weight:700; direction:rtl; margin-top:10px; }

  /* ── Tables ── */
  table  { width:100%; border-collapse:collapse; font-size:8.5px; }
  th     { background:#2e5b3a; color:#fff; padding:5px 4px; text-align:center; border:1px solid #1a6b4a; font-weight:700; direction:rtl; white-space:nowrap; }
  td     { padding:3px 4px; border:1px solid #ddd; vertical-align:middle; }
  tr:nth-child(even) td { background:#fafafa; }
  .grand { background:#1a6b4a !important; color:#fff !important; font-weight:800 !important; font-size:9px; }

  /* ── Summary ── */
  .sum-lbl { text-align:right; direction:rtl; padding:5px 10px; border:1px solid #ccc; background:#f8f8f8; font-weight:600; }
  .sum-val  { text-align:center; padding:5px 10px; border:1px solid #ccc; min-width:100px; }
  .sum-curr { background:#e8f5e9; font-weight:700; color:#0d5c35; }
  .sum-total-row td { background:#fff8e1 !important; font-weight:700; }
  .net-row td { background:#1a6b4a !important; color:#fff !important; font-size:11px; font-weight:900; }

  /* ── Signatures ── */
  .sigs { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:16px; padding-top:10px; border-top:2px solid #1a6b4a; }
  .sig  { text-align:center; }
  .sig .title { font-size:8px; font-weight:700; color:#555; direction:rtl; margin-bottom:24px; }
  .sig .line  { border-top:1px solid #555; padding-top:3px; font-size:8px; direction:rtl; }

  .th-group { background:#3a7a50 !important; }
  .page { padding:14px 16px; }
  .print-btn { display:block; text-align:center; margin:12px auto; padding:10px 32px; background:#1a6b4a; color:#fff; border:none; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer; }
  .print-btn:hover { background:#145c3b; }
</style>
</head>
<body>
<div class="page">

  <div class="hdr">
    <div class="hdr-left">
      <p>مستخلص دفعات المقاول من الباطن</p>
      <h1>${contractorName}</h1>
      <p style="margin-top:4px">${projectName}</p>
    </div>
    <div class="hdr-right">
      <div class="lbl">صافي المستحق</div>
      <div class="net">${money(finalNet3)}</div>
      <div style="font-size:8px;opacity:0.7;margin-top:3px">إجمالي الأعمال: ${money(grossTotal)}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-cell"><div class="ml">رقم المستخلص</div><div class="mv">${certNo}</div></div>
    <div class="meta-cell"><div class="ml">نهاية الفترة</div><div class="mv">${periodEnd}</div></div>
    <div class="meta-cell"><div class="ml">الحالة</div><div class="mv">${selectedInvoice.status}</div></div>
    <div class="meta-cell"><div class="ml">تاريخ الإصدار</div><div class="mv">${new Date().toLocaleDateString('ar-EG')}</div></div>
  </div>

  <div class="sec">تفاصيل الأعمال المنفذة</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2">#</th>
        <th rowspan="2" style="min-width:150px">البيـان</th>
        <th rowspan="2">وحدة</th>
        <th rowspan="2">إجمالى كمية</th>
        <th rowspan="2">نسبة</th>
        <th colspan="3" class="th-group">الكميـات</th>
        <th rowspan="2">الفئة</th>
        <th colspan="3" class="th-group">الإجمالـي</th>
      </tr>
      <tr>
        <th style="background:#f9a825;color:#000;font-size:8px">السابق</th>
        <th style="background:#388e3c;font-size:8px">الحالى</th>
        <th style="background:#1565c0;font-size:8px">الإجمالى</th>
        <th style="background:#f9a825;color:#000;font-size:8px">السابق</th>
        <th style="background:#388e3c;font-size:8px">الحالى</th>
        <th style="background:#1565c0;font-size:8px">الإجمالى</th>
      </tr>
    </thead>
    <tbody>
      ${detailRowsHtml || '<tr><td colspan="12" style="text-align:center;padding:16px;color:#888">لا توجد بنود</td></tr>'}
      <tr class="grand">
        <td colspan="9" style="text-align:right;direction:rtl;padding:6px 12px">إجمالـي الأعمال</td>
        <td style="text-align:center">${money(grandPrev)}</td>
        <td style="text-align:center">${money(grandCurrent)}</td>
        <td style="text-align:center">${money(grandCumulative)}</td>
      </tr>
    </tbody>
  </table>

  ${invoicePenalties.length > 0 || invoiceAdditions.length > 0 ? `
  <div class="sec">الخصومات والإضافات</div>
  <table>
    <thead><tr><th>#</th><th colspan="10" style="text-align:right;direction:rtl">البيـان</th><th>المبلغ</th></tr></thead>
    <tbody>
      ${invoicePenalties.map((p: any, i: number) => `<tr><td style="text-align:center">${i+1}</td><td colspan="10" style="text-align:right;direction:rtl">${p.description}</td><td style="text-align:center;color:#c62828;font-weight:700">${money(p.amount)}</td></tr>`).join('')}
      ${invoicePenalties.length > 0 ? `<tr style="background:#ffebee;font-weight:700"><td colspan="11" style="text-align:right;direction:rtl;padding:4px 10px">إجمالي الخصومات</td><td style="text-align:center;color:#c62828">${money(totalPen3)}</td></tr>` : ''}
      ${invoiceAdditions.map((a: any, i: number) => `<tr><td style="text-align:center">${i+1}</td><td colspan="10" style="text-align:right;direction:rtl">${a.description}</td><td style="text-align:center;color:#2e7d32;font-weight:700">${money(a.amount)}</td></tr>`).join('')}
      ${invoiceAdditions.length > 0 ? `<tr style="background:#e8f5e9;font-weight:700"><td colspan="11" style="text-align:right;direction:rtl;padding:4px 10px">إجمالي الإضافات</td><td style="text-align:center;color:#2e7d32">${money(totalAdd3)}</td></tr>` : ''}
    </tbody>
  </table>` : ''}

  <div class="sec">ملخص المستخلص</div>
  <table>
    <colgroup><col style="width:45%"><col style="width:18.3%"><col style="width:18.3%"><col style="width:18.3%"></colgroup>
    <thead>
      <tr>
        <th style="text-align:right;direction:rtl">البيـان</th>
        <th style="background:#f9a825;color:#000">السابق</th>
        <th style="background:#388e3c">الحالى</th>
        <th style="background:#1565c0">الإجمالى</th>
      </tr>
    </thead>
    <tbody>
      <tr><td class="sum-lbl">إجمالـي الأعمال بالمقايسة</td><td class="sum-val">${money(grandPrev)}</td><td class="sum-val sum-curr">${money(grandCurrent)}</td><td class="sum-val">${money(grandCumulative)}</td></tr>
      ${invoiceAdditions.length > 0 ? `<tr><td class="sum-lbl">إجمالي الأعمال الإضافية</td><td class="sum-val">—</td><td class="sum-val sum-curr">${money(totalAdd3)}</td><td class="sum-val">${money(totalAdd3)}</td></tr>` : ''}
      <tr class="sum-total-row"><td class="sum-lbl">إجمالـي الأعمال</td><td class="sum-val">${money(grandPrev)}</td><td class="sum-val sum-curr">${money(grossTotal)}</td><td class="sum-val">${money(grandCumulative + totalAdd3)}</td></tr>
      ${invoicePenalties.length > 0 ? `<tr><td class="sum-lbl">خصومات وغرامات المستخلص</td><td class="sum-val">—</td><td class="sum-val" style="color:#c62828;font-weight:700">${money(totalPen3)}</td><td class="sum-val" style="color:#c62828">${money(totalPen3)}</td></tr>` : ''}
      ${financeDeductionPdf > 0 ? `<tr><td class="sum-lbl">خصومات وغرامات من الحسابات</td><td class="sum-val">—</td><td class="sum-val" style="color:#c62828;font-weight:700">${money(financeDeductionPdf)}</td><td class="sum-val" style="color:#c62828">${money(financeDeductionPdf)}</td></tr>` : ''}
      <tr><td class="sum-lbl">خصم ${retPct3}% تأمين نهائى</td><td class="sum-val">—</td><td class="sum-val" style="color:#e65100;font-weight:700">${money(retAmt3)}</td><td class="sum-val" style="color:#e65100">${money(retAmt3)}</td></tr>
      ${dpRecPct3 > 0 ? `<tr><td class="sum-lbl">خصم ${dpRecPct3}% دفعة مقدمة</td><td class="sum-val">—</td><td class="sum-val" style="color:#e65100;font-weight:700">${money(dpRec3)}</td><td class="sum-val" style="color:#e65100">${money(dpRec3)}</td></tr>` : ''}
      <tr class="sum-total-row"><td class="sum-lbl">إجمالـي الخصومات</td><td class="sum-val">—</td><td class="sum-val" style="color:#e65100;font-weight:700">${money(totalDeductions)}</td><td class="sum-val" style="color:#e65100">${money(totalDeductions)}</td></tr>
      ${retentionReleasePdf > 0 ? `<tr><td class="sum-lbl">رد تأمين</td><td class="sum-val">—</td><td class="sum-val sum-curr">${money(retentionReleasePdf)}</td><td class="sum-val">${money(retentionReleasePdf)}</td></tr>` : ''}
      <tr><td class="sum-lbl">ما تم صرفه سابقاً من الحسابات</td><td class="sum-val">${money(previouslyPaidPdf)}</td><td class="sum-val">—</td><td class="sum-val" style="color:#0d47a1;font-weight:700">${money(previouslyPaidPdf)}</td></tr>
      ${currentInvoicePaidPdf > 0 ? `<tr><td class="sum-lbl">مدفوع على هذا المستخلص</td><td class="sum-val">—</td><td class="sum-val" style="color:#0d47a1;font-weight:700">${money(currentInvoicePaidPdf)}</td><td class="sum-val" style="color:#0d47a1;font-weight:700">${money(currentInvoicePaidPdf)}</td></tr>` : ''}
      <tr class="net-row"><td style="padding:8px 12px;direction:rtl;text-align:right">صافـي المستحق للصرف</td><td style="text-align:center">—</td><td style="text-align:center;font-size:13px">${money(finalNet3)}</td><td style="text-align:center">—</td></tr>
    </tbody>
  </table>

  <div class="sigs">
    <div class="sig"><div class="title">مدير المكتب الفنى</div><div class="line">م/ _______________</div></div>
    <div class="sig"><div class="title">مدير المشروع</div><div class="line">م/ _______________</div></div>
    <div class="sig"><div class="title">مدير عام المشاريع</div><div class="line">م/ _______________</div></div>
    <div class="sig"><div class="title">رئيس مجلس الإدارة</div><div class="line">م/ _______________</div></div>
  </div>

  <button class="print-btn noprint" onclick="window.print();this.style.display='none'">🖨️ طباعة / حفظ PDF</button>
</div>
</body></html>`

                        // Use Blob URL — works in all browsers, no popup blocker issues
                        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.target = '_blank'
                        a.rel = 'noopener'
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        setTimeout(() => URL.revokeObjectURL(url), 10000)
                      }}>📄 Export PDF</Button>

                      <Button tone="secondary" onClick={() => { setInvoiceTab('list'); setSelectedInvoiceId(null) }}>← Back to List</Button>
                    </div>
                  </Card>
                </>
              })()}
            </>
          })()}

          {activeView === 'client-invoices' && (
            <>
              <Card title={invoiceForm.id ? 'Edit client invoice' : 'Add client invoice'}>
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Invoice No"><Input value={invoiceForm.invoice_no} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_no: e.target.value })} /></Field>
                    <Field label="Invoice Date"><Input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })} /></Field>
                    <Field label="Client"><Input value={invoiceForm.client_name} onChange={(e) => setInvoiceForm({ ...invoiceForm, client_name: e.target.value })} /></Field>
                    <Field label="Amount"><Input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} /></Field>
                    <Field label="Status"><Select value={invoiceForm.status} onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value as ClientInvoice['status'] })}><option>Draft</option><option>Submitted</option><option>Certified</option><option>Paid</option></Select></Field>
                  </FormGrid>
                  <div style={{ marginTop: 10 }}><Field label="Description"><TextArea value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} /></Field></div>
                  <div style={{ marginTop: 10 }}><Field label="Notes"><TextArea value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} /></Field></div>
                  <Toolbar>
                    <Button onClick={saveInvoice} disabled={!invoiceForm.invoice_no || !invoiceForm.client_name}>Save Invoice</Button>
                    {invoiceForm.id && <Button tone="secondary" onClick={() => setInvoiceForm({ id: '', invoice_no: '', invoice_date: today(), client_name: activeProject?.client ?? '', description: '', amount: '0', status: 'Draft', notes: '' })}>Cancel Edit</Button>}
                  </Toolbar>
                </>}
              </Card>
              <Card title="Client invoices register">
                <Table heads={['Invoice No', 'Date', 'Client', 'Amount', 'Status', 'Actions']} rows={clientInvoices.map((i) => [
                  i.invoice_no,
                  i.invoice_date,
                  i.client_name,
                  money(i.amount),
                  i.status,
                  <div key={i.id} style={{ display: 'flex', gap: 8 }}>
                    <Button tone="secondary" onClick={() => editInvoice(i)}>Edit</Button>
                    <Button tone="danger" onClick={() => removeInvoice(i.id)}>Delete</Button>
                  </div>,
                ])} />
              </Card>
            </>
          )}

          {activeView === 'technical' && (
            <>
              <Card title="Add technical office record">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Subcontractor"><Select value={technicalForm.subcontractor_id} onChange={(e) => setTechnicalForm({ ...technicalForm, subcontractor_id: e.target.value })}><option value="">Optional</option>{subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                    <Field label="Record Type"><Input value={technicalForm.record_type} onChange={(e) => setTechnicalForm({ ...technicalForm, record_type: e.target.value })} /></Field>
                    <Field label="Reference No"><Input value={technicalForm.reference_no} onChange={(e) => setTechnicalForm({ ...technicalForm, reference_no: e.target.value })} /></Field>
                    <Field label="Subject"><Input value={technicalForm.subject} onChange={(e) => setTechnicalForm({ ...technicalForm, subject: e.target.value })} /></Field>
                    <Field label="Discipline"><Select value={technicalForm.discipline} onChange={(e) => setTechnicalForm({ ...technicalForm, discipline: e.target.value as Discipline })}>{disciplineOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}</Select></Field>
                    <Field label="Due Date"><Input type="date" value={technicalForm.due_date} onChange={(e) => setTechnicalForm({ ...technicalForm, due_date: e.target.value })} /></Field>
                    <Field label="Priority"><Select value={technicalForm.priority} onChange={(e) => setTechnicalForm({ ...technicalForm, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></Select></Field>
                  </FormGrid>
                  <div style={{ marginTop: 10 }}><Field label="Comments"><TextArea value={technicalForm.comments} onChange={(e) => setTechnicalForm({ ...technicalForm, comments: e.target.value })} /></Field></div>
                  <Toolbar><Button onClick={addTechnical} disabled={createTechnical.isPending || !technicalForm.reference_no || !technicalForm.subject}>Add Technical Record</Button></Toolbar>
                </>}
              </Card>
              <Card title="Technical records">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['Reference', 'Subject', 'Type', 'Discipline', 'Due Date', 'Priority', 'Status', 'Actions'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {technical.map((t) => {
                        const isEditing = editingTechnicalId === t.id
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0', background: isEditing ? '#f0f7f4' : 'white' }}>
                            {isEditing ? (
                              <>
                                <td style={{ padding: '6px 8px' }}><Input value={editTechnicalForm.reference_no ?? t.reference_no} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, reference_no: e.target.value })} style={{ width: 110 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Input value={editTechnicalForm.subject ?? t.subject} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, subject: e.target.value })} /></td>
                                <td style={{ padding: '6px 8px' }}><Input value={editTechnicalForm.record_type ?? t.record_type} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, record_type: e.target.value })} style={{ width: 120 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editTechnicalForm.discipline ?? t.discipline} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, discipline: e.target.value })}>{disciplineOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}</Select></td>
                                <td style={{ padding: '6px 8px' }}><Input type="date" value={editTechnicalForm.due_date ?? t.due_date ?? ''} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, due_date: e.target.value })} style={{ width: 130 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editTechnicalForm.priority ?? t.priority} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></Select></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editTechnicalForm.status ?? t.status} onChange={e => setEditTechnicalForm({ ...editTechnicalForm, status: e.target.value })}>{TECH_STATUSES.map(s => <option key={s}>{s}</option>)}</Select></td>
                                <td style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
                                  <Button onClick={async () => { await run('Update', () => updateTechnical.mutateAsync({ id: t.id, data: editTechnicalForm })); setEditingTechnicalId(null) }} disabled={updateTechnical.isPending}>Save</Button>
                                  <Button tone="secondary" onClick={() => setEditingTechnicalId(null)}>Cancel</Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.reference_no}</td>
                                <td style={{ padding: '8px 12px' }}>{t.subject}</td>
                                <td style={{ padding: '8px 12px' }}>{t.record_type}</td>
                                <td style={{ padding: '8px 12px', color: '#666' }}>{t.discipline}</td>
                                <td style={{ padding: '8px 12px' }}>{t.due_date ?? '—'}</td>
                                <td style={{ padding: '8px 12px' }}><span style={{ background: t.priority === 'Critical' ? '#ffebee' : t.priority === 'High' ? '#fff3e0' : '#f5f5f5', color: t.priority === 'Critical' ? '#c62828' : t.priority === 'High' ? '#e65100' : '#555', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{t.priority}</span></td>
                                <td style={{ padding: '8px 12px' }}>
                                  <Select value={t.status} onChange={(e) => run('Technical status', () => setTechnicalStatus.mutateAsync({ id: t.id, status: e.target.value as TechnicalStatus, responseDate: e.target.value === 'Closed' ? today() : undefined }))}>
                                    {TECH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </Select>
                                </td>
                                <td style={{ padding: '8px 12px', display: 'flex', gap: 4 }}>
                                  <Button tone="secondary" onClick={() => { setEditingTechnicalId(t.id); setEditTechnicalForm({ reference_no: t.reference_no, subject: t.subject, record_type: t.record_type, discipline: t.discipline, due_date: t.due_date ?? '', priority: t.priority, status: t.status }) }}>✏️ Edit</Button>
                                  <Button tone="danger" onClick={() => { if (confirm('Delete?')) run('Delete', () => deleteTechnical.mutateAsync({ id: t.id, projectId: projectId! })) }}>✕</Button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                      {!technical.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No technical records yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {activeView === 'procurement' && (
            <>
              <Card title="Smart Procurement Order — Select Node + BOQ Item + Material">
                {!projectId ? <div>Select a project first.</div> : <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <Field label="Structure Node (select Villa Type / Model)">
                      <Select value={procNode} onChange={(e) => applyProcurementNode(e.target.value)}>
                        <option value="">— Select Model / Node —</option>
                        {getProcurementNodeOptions().map(({ node, totalBoq, totalVillas }: any) => (
                          <option key={node.id} value={node.id}>{node.code} — {node.name} ({totalBoq} BOQ items · {totalVillas} villas)</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="BOQ Item">
                      <Select value={procForm.boq_item_id} onChange={(e) => applyProcurementBoq(e.target.value)} disabled={!procNode}>
                        <option value="">Select BOQ item</option>
                        {(procNode ? getProcurementBoqForNode(procNode) : procurementBoqOptions).map((b: any) => <option key={b.id} value={b.id}>{b.item_code} — {b.description}</option>)}
                      </Select>
                    </Field>
                    <Field label="Material from Tender Cost Sheet">
                      <Select value={procForm.resource_id || procForm.resource_code} onChange={(e) => applyProcurementResource(e.target.value)} disabled={!procForm.boq_item_id}>
                        <option value="">Select material resource</option>
                        {getProcurementMaterialOptions(procForm.boq_item_id).map((r: any) => <option key={r.value} value={r.value}>{r.code} — {r.description} ({r.tender_qty ? `Model qty ${r.tender_qty} ${r.unit}` : money(Number(r.unit_rate || 0)) + '/' + r.unit})</option>)}
                      </Select>
                    </Field>
                  </div>

                  {procNode && (() => {
                    const villas = getProcurementVillasForNode(procNode)
                    if (!villas.length) {
                      return (
                        <div style={{ marginBottom: 16, padding: '14px 18px', background: '#fffdf5', border: '1px solid #ffe0b2', borderRadius: 10 }}>
                          <div style={{ fontWeight: 700, color: '#e65100', marginBottom: 8 }}>No villa children found under this node.</div>
                          <Field label="Fallback: Order For Structures">
                            <Select multiple value={procForm.structure_ids} onChange={(e) => applyProcurementStructures(Array.from(e.target.selectedOptions).map(o => o.value))} style={{ minHeight: 110 }}>
                              {procurementTargetStructures.map((n: StructureNode) => <option key={n.id} value={n.id}>{structurePath(n.id)} ({n.type})</option>)}
                            </Select>
                          </Field>
                        </div>
                      )
                    }
                    const selectedIds = new Set(procForm.structure_ids ?? [])
                    const byPhase = new Map<string, StructureNode[]>()
                    villas.forEach((v: StructureNode) => {
                      const phase = getPhaseForProcurementNode(v)
                      const key = phase?.code ?? 'Other'
                      if (!byPhase.has(key)) byPhase.set(key, [])
                      byPhase.get(key)!.push(v)
                    })
                    const selectedBoq: any = procurementBoqById.get(procForm.boq_item_id)
                    const tenderLine: any = findTenderBudgetLine(procForm.resource_code, procForm.boq_item_id)
                    const modelQty = Number(tenderLine?.qty ?? selectedBoq?.boq_qty ?? 0)
                    return (
                      <div style={{ marginBottom: 16, padding: '14px 18px', background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#1a6b4a' }}>
                            Select Villas — {selectedIds.size} of {villas.length} selected
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => applyProcurementStructures(villas.map((v: StructureNode) => v.id))}
                              style={{ padding: '4px 12px', background: '#e8f5e9', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>
                              Select All
                            </button>
                            <button onClick={() => applyProcurementStructures([])}
                              style={{ padding: '4px 12px', background: '#ffebee', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#c62828' }}>
                              Clear
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                          {Array.from(byPhase.entries()).map(([phaseCode, phaseVillas]) => (
                            <div key={phaseCode} style={{ width: '100%', marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1565c0', marginBottom: 4 }}>
                                {phaseCode} — {phaseVillas.length} villas
                                <button onClick={() => {
                                  const next = new Set(procForm.structure_ids ?? [])
                                  phaseVillas.forEach((v: StructureNode) => next.add(v.id))
                                  applyProcurementStructures(Array.from(next))
                                }} style={{ marginLeft: 8, padding: '1px 8px', background: '#e3f2fd', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10, color: '#1565c0' }}>All</button>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {phaseVillas.map((v: StructureNode) => {
                                  const selected = selectedIds.has(v.id)
                                  return (
                                    <button key={v.id} onClick={() => {
                                      const next = new Set(procForm.structure_ids ?? [])
                                      if (next.has(v.id)) next.delete(v.id); else next.add(v.id)
                                      applyProcurementStructures(Array.from(next))
                                    }} style={{
                                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                      border: `2px solid ${selected ? '#1a6b4a' : '#ddd'}`,
                                      background: selected ? '#1a6b4a' : '#fff',
                                      color: selected ? '#fff' : '#555',
                                    }}>{v.code}</button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 13, color: '#555' }}>
                          Required Qty = model material qty <strong>{modelQty || 0}</strong> × selected villas <strong>{selectedIds.size || 0}</strong>
                          <span style={{ marginLeft: 12, color: '#1a6b4a', fontWeight: 700 }}>Auto Qty: {procForm.required_qty} {procForm.unit}</span>
                        </div>
                      </div>
                    )
                  })()}

                  <FormGrid>
                    <Field label="Material Description"><Input value={procForm.material} onChange={(e) => setProcForm({ ...procForm, material: e.target.value })} /></Field>
                    <Field label="Required Qty (auto = model qty × selected villas)"><Input type="number" value={procForm.required_qty} onChange={(e) => setProcForm({ ...procForm, required_qty: e.target.value, budget_amount: String(procurementBudgetAmount(e.target.value, procForm.budget_unit_rate)), actual_amount: String(procurementActualAmount(e.target.value, procForm.actual_unit_rate)) })} /></Field>
                    <Field label="Unit"><Input value={procForm.unit} onChange={(e) => setProcForm({ ...procForm, unit: e.target.value })} /></Field>
                    <Field label="Budget Unit Rate"><Input type="number" value={procForm.budget_unit_rate} onChange={(e) => setProcForm({ ...procForm, budget_unit_rate: e.target.value, budget_amount: String(procurementBudgetAmount(procForm.required_qty, e.target.value)) })} /></Field>
                    <Field label="Actual Unit Rate"><Input type="number" value={procForm.actual_unit_rate} onChange={(e) => setProcForm({ ...procForm, actual_unit_rate: e.target.value, actual_amount: String(procurementActualAmount(procForm.required_qty, e.target.value)) })} /></Field>
                    <Field label="Rate Difference"><Input value={money(procurementRateVariance(procForm.actual_unit_rate, procForm.budget_unit_rate))} readOnly /></Field>
                    <Field label="Budget Amount"><Input type="number" value={procForm.budget_amount} readOnly /></Field>
                    <Field label="Actual Amount"><Input type="number" value={procForm.actual_amount} readOnly /></Field>
                    <Field label="Amount Difference"><Input value={money(procurementAmountVariance(procForm.required_qty, procForm.actual_unit_rate, procForm.budget_unit_rate))} readOnly /></Field>
                    <Field label="Supplier"><Input value={procForm.supplier} onChange={(e) => setProcForm({ ...procForm, supplier: e.target.value })} /></Field>
                    <Field label="PR Date"><Input type="date" value={procForm.pr_date} onChange={(e) => setProcForm({ ...procForm, pr_date: e.target.value })} /></Field>
                    <Field label="Planned Delivery"><Input type="date" value={procForm.planned_delivery} onChange={(e) => setProcForm({ ...procForm, planned_delivery: e.target.value })} /></Field>
                    <Field label="Status"><Select value={procForm.status} onChange={(e) => setProcForm({ ...procForm, status: e.target.value as ProcurementStatus })}>{PROCUREMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
                  </FormGrid>
                  <div style={{ marginTop: 10 }}><Field label="Notes"><TextArea value={procForm.notes} onChange={(e) => setProcForm({ ...procForm, notes: e.target.value })} /></Field></div>
                  <Toolbar><Button onClick={addProcurement} disabled={createProcurement.isPending || !procForm.material || !procForm.boq_item_id}>Add Procurement Record</Button></Toolbar>
                </>}
              </Card>
              <Card title="Procurement list">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['PR No', 'Material', 'BOQ', 'Structure', 'Qty', 'Budget Rate', 'Actual Rate', 'Rate Diff', 'Budget Amount', 'Actual Amount', 'Supplier', 'Planned Delivery', 'Status', 'Actions'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {procurement.map((p: any) => {
                        const isEditing = editingProcurementId === p.id
                        const linkedBoq: any = procurementBoqById.get(p.boq_item_id)
                        const linkedStructureIds = Array.isArray(p.structure_ids) ? p.structure_ids : (p.structure_id ? [p.structure_id] : [])
                        const linkedStructure = linkedStructureIds.length ? linkedStructureIds.map((id: string) => structurePath(id)).join(', ') : '—'
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: isEditing ? '#f0f7f4' : 'white' }}>
                            {isEditing ? (
                              <>
                                <td style={{ padding: '6px 8px', color: '#888', fontSize: 12 }}>{p.pr_no}</td>
                                <td style={{ padding: '6px 8px' }}><Input value={editProcurementForm.material ?? p.material} onChange={e => setEditProcurementForm({ ...editProcurementForm, material: e.target.value })} /></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editProcurementForm.boq_item_id ?? (p.boq_item_id ?? '')} onChange={e => { const b: any = procurementBoqById.get(e.target.value); setEditProcurementForm({ ...editProcurementForm, boq_item_id: e.target.value || null, structure_id: b?.structure_id ?? p.structure_id, required_qty: b?.boq_qty ?? p.required_qty, budget_amount: procurementBudgetAmount(b?.boq_qty ?? p.required_qty, editProcurementForm.budget_unit_rate ?? p.budget_unit_rate) }) }}><option value="">—</option>{getBoqItemsForStructure(editProcurementForm.structure_id ?? p.structure_id, true).map((b: any) => <option key={b.id} value={b.id}>{structureBoqOptionLabel(b)}</option>)}</Select></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editProcurementForm.structure_id ?? (p.structure_id ?? '')} onChange={e => { const structureId = e.target.value || null; const scopedBoq = getBoqItemsForStructure(structureId, true); const currentBoqId = editProcurementForm.boq_item_id ?? p.boq_item_id ?? ''; const currentStillValid = currentBoqId && scopedBoq.some((b: any) => String(b.id) === String(currentBoqId)); setEditProcurementForm({ ...editProcurementForm, structure_id: structureId, boq_item_id: currentStillValid ? currentBoqId : null }) }}><option value="">—</option>{structureNodes.filter((n: StructureNode) => structureHasBoq(n.id)).map((n: StructureNode) => <option key={n.id} value={n.id}>{structurePath(n.id)}</option>)}</Select></td>
                                <td style={{ padding: '6px 8px' }}><Input type="number" value={editProcurementForm.required_qty ?? p.required_qty} onChange={e => setEditProcurementForm({ ...editProcurementForm, required_qty: parseFloat(e.target.value) || 0, budget_amount: procurementBudgetAmount(e.target.value, editProcurementForm.budget_unit_rate ?? p.budget_unit_rate), actual_amount: procurementActualAmount(e.target.value, editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p)), amount_variance: procurementAmountVariance(e.target.value, editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p), editProcurementForm.budget_unit_rate ?? p.budget_unit_rate) })} style={{ width: 90 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Input type="number" value={editProcurementForm.budget_unit_rate ?? (p.budget_unit_rate ?? 0)} onChange={e => setEditProcurementForm({ ...editProcurementForm, budget_unit_rate: parseFloat(e.target.value) || 0, budget_amount: procurementBudgetAmount(editProcurementForm.required_qty ?? p.required_qty, e.target.value), rate_variance: procurementRateVariance(editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p), e.target.value), amount_variance: procurementAmountVariance(editProcurementForm.required_qty ?? p.required_qty, editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p), e.target.value) })} style={{ width: 100 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Input type="number" value={editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p)} onChange={e => setEditProcurementForm({ ...editProcurementForm, actual_unit_rate: parseFloat(e.target.value) || 0, actual_amount: procurementActualAmount(editProcurementForm.required_qty ?? p.required_qty, e.target.value), rate_variance: procurementRateVariance(e.target.value, editProcurementForm.budget_unit_rate ?? p.budget_unit_rate), amount_variance: procurementAmountVariance(editProcurementForm.required_qty ?? p.required_qty, e.target.value, editProcurementForm.budget_unit_rate ?? p.budget_unit_rate) })} style={{ width: 100 }} /></td>
                                <td style={{ padding: '6px 8px', color: procurementRateVariance(editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p), editProcurementForm.budget_unit_rate ?? p.budget_unit_rate) > 0 ? '#c62828' : '#2e7d32', fontWeight: 700 }}>{money(procurementRateVariance(editProcurementForm.actual_unit_rate ?? procurementActualRateValue(p), editProcurementForm.budget_unit_rate ?? p.budget_unit_rate))}</td>
                                <td style={{ padding: '6px 8px' }}>{money(Number(editProcurementForm.budget_amount ?? p.budget_amount ?? 0))}</td>
                                <td style={{ padding: '6px 8px' }}>{money(Number(editProcurementForm.actual_amount ?? procurementActualAmountValue(p) ?? 0))}</td>
                                <td style={{ padding: '6px 8px' }}><Input value={editProcurementForm.supplier ?? (p.supplier ?? '')} onChange={e => setEditProcurementForm({ ...editProcurementForm, supplier: e.target.value })} /></td>
                                <td style={{ padding: '6px 8px' }}><Input type="date" value={editProcurementForm.planned_delivery ?? (p.planned_delivery ?? '')} onChange={e => setEditProcurementForm({ ...editProcurementForm, planned_delivery: e.target.value })} style={{ width: 130 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editProcurementForm.status ?? p.status} onChange={e => setEditProcurementForm({ ...editProcurementForm, status: e.target.value })}>{PROCUREMENT_STATUSES.map(s => <option key={s}>{s}</option>)}</Select></td>
                                <td style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
                                  <Button onClick={async () => { await run('Update', () => updateProcurement.mutateAsync({ id: p.id, data: editProcurementForm })); setEditingProcurementId(null) }} disabled={updateProcurement.isPending}>Save</Button>
                                  <Button tone="secondary" onClick={() => setEditingProcurementId(null)}>Cancel</Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12 }}>{p.pr_no}</td>
                                <td style={{ padding: '8px 12px' }}>{p.resource_code ? `${p.resource_code} — ` : ''}{p.material}</td>
                                <td style={{ padding: '8px 12px' }}>{linkedBoq?.item_code ?? '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{linkedStructure}</td>
                                <td style={{ padding: '8px 12px' }}>{p.required_qty ?? 0} {p.unit ?? ''}</td>
                                <td style={{ padding: '8px 12px' }}>{money(Number(p.budget_unit_rate ?? 0))}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{procurementActualRateValue(p) ? money(procurementActualRateValue(p)) : '—'}</td>
                                <td style={{ padding: '8px 12px', color: procurementRateVariance(procurementActualRateValue(p), p.budget_unit_rate) > 0 ? '#c62828' : procurementRateVariance(procurementActualRateValue(p), p.budget_unit_rate) < 0 ? '#2e7d32' : '#666', fontWeight: 700 }}>{procurementActualRateValue(p) ? money(procurementRateVariance(procurementActualRateValue(p), p.budget_unit_rate)) : '—'}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{money(Number(p.budget_amount ?? procurementBudgetAmount(p.required_qty, p.budget_unit_rate)))}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{procurementActualRateValue(p) ? money(procurementActualAmountValue(p)) : '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{p.supplier ?? '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{p.planned_delivery ?? '—'}</td>
                                <td style={{ padding: '8px 12px' }}><span style={{ background: p.status === 'Delayed' ? '#ffebee' : p.status === 'Delivered' ? '#e8f5e9' : '#e3f2fd', color: p.status === 'Delayed' ? '#c62828' : p.status === 'Delivered' ? '#2e7d32' : '#1565c0', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{p.status}</span></td>
                                <td style={{ padding: '8px 12px', display: 'flex', gap: 4 }}>
                                  <Button tone="secondary" onClick={() => { setEditingProcurementId(p.id); setEditProcurementForm({ material: p.material, boq_item_id: p.boq_item_id ?? '', structure_id: p.structure_id ?? '', structure_ids: Array.isArray(p.structure_ids) ? p.structure_ids : (p.structure_id ? [p.structure_id] : []), required_qty: p.required_qty, budget_unit_rate: p.budget_unit_rate ?? 0, budget_amount: p.budget_amount ?? procurementBudgetAmount(p.required_qty, p.budget_unit_rate), actual_unit_rate: procurementActualRateValue(p), actual_amount: procurementActualAmountValue(p), rate_variance: procurementRateVariance(procurementActualRateValue(p), p.budget_unit_rate), amount_variance: procurementAmountVariance(p.required_qty, procurementActualRateValue(p), p.budget_unit_rate), supplier: p.supplier ?? '', planned_delivery: p.planned_delivery ?? '', status: p.status }) }}>✏️ Edit</Button>
                                  <Button tone="danger" onClick={() => { if (confirm('Delete?')) run('Delete', () => deleteProcurement.mutateAsync({ id: p.id, projectId: projectId! })) }}>✕</Button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                      {!procurement.length && <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No procurement records yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {activeView === 'inventory' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                <BigMetric label="Stock Value" value={money(inventoryTotals.stockValue)} tone="#1a6b4a" />
                <BigMetric label="Received Value" value={money(inventoryTotals.receivedValue)} tone="#1565c0" />
                <BigMetric label="Issued Qty" value={inventoryTotals.issuedQty.toFixed(2)} tone="#6a1b9a" />
                <BigMetric label="Over Budget PRs" value={inventoryTotals.overBudget} tone="#c62828" />
              </div>

              <Card title="Inventory Filters & Professional Reports / تقارير وفلاتر المخازن">
                <FormGrid>
                  <Field label="Movement"><Select value={inventoryFilter.movement} onChange={(e)=>setInventoryFilter({...inventoryFilter,movement:e.target.value})}><option value="all">GRN + Issues</option><option value="grn">GRN only</option><option value="issue">Issues only</option></Select></Field>
                  <Field label="Material"><Select value={inventoryFilter.material} onChange={(e)=>setInventoryFilter({...inventoryFilter,material:e.target.value})}><option value="">All Materials</option>{inventoryMaterialOptions.map((m:string)=><option key={m} value={m}>{m}</option>)}</Select></Field>
                  <Field label="Store"><Select value={inventoryFilter.locationId} onChange={(e)=>setInventoryFilter({...inventoryFilter,locationId:e.target.value})}><option value="">All Stores</option>{(inventoryLocations as any[]).map((l:any)=><option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}</Select></Field>
                  <Field label="BOQ"><Select value={inventoryFilter.boqItemId} onChange={(e)=>setInventoryFilter({...inventoryFilter,boqItemId:e.target.value})}><option value="">All BOQ</option>{getBoqItemsForStructure(inventoryFilter.structureId, true).map((b:any)=><option key={b.id} value={b.id}>{structureBoqOptionLabel(b)}</option>)}</Select></Field>
                  <Field label="Structure / Villa"><Select value={inventoryFilter.structureId} onChange={(e)=>{ const structureId = e.target.value; const scopedBoq = getBoqItemsForStructure(structureId, true); const currentStillValid = inventoryFilter.boqItemId && scopedBoq.some((b:any)=>String(b.id)===String(inventoryFilter.boqItemId)); setInventoryFilter({...inventoryFilter,structureId,boqItemId: currentStillValid ? inventoryFilter.boqItemId : ''}) }}><option value="">All Structures</option>{procurementTargetStructures.filter((n:StructureNode)=>structureHasBoq(n.id)).map((n:StructureNode)=><option key={n.id} value={n.id}>{structurePath(n.id)}</option>)}</Select></Field>
                  <Field label="Stock Status"><Select value={inventoryFilter.stockStatus} onChange={(e)=>setInventoryFilter({...inventoryFilter,stockStatus:e.target.value})}><option value="">All Stock</option><option value="available">Available only</option><option value="zero">Zero only</option></Select></Field>
                  <Field label="From"><Input type="date" value={inventoryFilter.from} onChange={(e)=>setInventoryFilter({...inventoryFilter,from:e.target.value})}/></Field>
                  <Field label="To"><Input type="date" value={inventoryFilter.to} onChange={(e)=>setInventoryFilter({...inventoryFilter,to:e.target.value})}/></Field>
                  <Field label="Search"><Input value={inventoryFilter.search} onChange={(e)=>setInventoryFilter({...inventoryFilter,search:e.target.value})} placeholder="Material / GRN / Issue / supplier"/></Field>
                </FormGrid>
                <Toolbar>
                  <Button tone="secondary" onClick={()=>setInventoryFilter({ material:'', locationId:'', boqItemId:'', structureId:'', from:'', to:'', stockStatus:'', movement:'all', search:'' })}>Clear</Button>
                  <Button tone="secondary" onClick={()=>{
                    const heads=['Type','No','Date','Material','BOQ','Structure','Store','Qty','Unit','Rate','Amount','Party']
                    const rows=[...filteredInventoryGrns.map((g:any)=>['GRN',g.grn_no,g.received_date,g.material,g.boq_item_code??'',g.structure_name??'',g.location_code??'',g.received_qty,g.unit,g.unit_rate,g.amount,g.supplier]),...filteredInventoryIssues.map((i:any)=>['Issue',i.issue_no,i.issue_date,i.material,i.boq_item_code??'',i.structure_name??'',i.location_code??'',i.issued_qty,i.unit,i.unit_rate,i.amount,i.issue_to])]
                    downloadCsvFile('inventory-movement-report.csv',[heads,...rows])
                  }}>⬇ CSV</Button>
                  <Button tone="secondary" onClick={exportInventoryExcel}>⬇ Excel</Button>
                  <Button tone="secondary" onClick={downloadInventoryTemplateExcel}>Excel Template</Button>
                  <label style={{cursor:'pointer'}}>
                    <span style={{padding:'8px 14px',background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:8,fontSize:13,fontWeight:800,color:'#2e7d32',display:'inline-block'}}>⬆ Import Excel</span>
                    <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={async(e)=>{const file=e.target.files?.[0]; if(file) await importInventoryExcel(file); e.currentTarget.value=''}} />
                  </label>
                  <Button onClick={()=>{
                    const heads=['Type','No','Date','Material','BOQ','Structure','Store','Qty','Unit','Rate','Amount','Party']
                    const rows=[...filteredInventoryGrns.map((g:any)=>['GRN',g.grn_no||'—',g.received_date||'—',g.material,g.boq_item_code??'—',g.structure_name??'—',g.location_code??'—',Number(g.received_qty??0).toFixed(2),g.unit??'',money(Number(g.unit_rate??0)),money(Number(g.amount??0)),g.supplier??'—']),...filteredInventoryIssues.map((i:any)=>['Issue',i.issue_no||'—',i.issue_date||'—',i.material,i.boq_item_code??'—',i.structure_name??'—',i.location_code??'—',Number(i.issued_qty??0).toFixed(2),i.unit??'',money(Number(i.unit_rate??0)),money(Number(i.amount??0)),i.issue_to??'—'])]
                    printProfessionalTableReport('Inventory Movement Report',[`Project: ${activeProject?.project_name??'—'}`,`Period: ${inventoryFilter.from||'Start'} → ${inventoryFilter.to||'Today'}`,`Generated: ${new Date().toLocaleString()}`],[{label:'Received',value:money(filteredInventoryGrns.reduce((s:number,r:any)=>s+Number(r.amount??0),0))},{label:'Issued',value:money(filteredInventoryIssues.reduce((s:number,r:any)=>s+Number(r.amount??0),0))},{label:'Stock Rows',value:String(filteredInventoryStock.length)},{label:'Movements',value:String(filteredInventoryGrns.length+filteredInventoryIssues.length)}],heads,rows,['TOTAL','','','','','','','', '', '',money(filteredInventoryGrns.reduce((s:number,r:any)=>s+Number(r.amount??0),0)+filteredInventoryIssues.reduce((s:number,r:any)=>s+Number(r.amount??0),0)),''])
                  }}>📄 PDF / Print</Button>
                  <span style={{fontSize:12,color:'#777'}}>Stock rows: {filteredInventoryStock.length} · GRNs: {filteredInventoryGrns.length} · Issues: {filteredInventoryIssues.length}</span>
                </Toolbar>
              </Card>

              <Card title="Store locations">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Store Code"><Input value={storeForm.code} onChange={(e) => setStoreForm({ ...storeForm, code: e.target.value })} placeholder="MAIN" /></Field>
                    <Field label="Store Name"><Input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} placeholder="Main Store" /></Field>
                    <Field label="Type"><Input value={storeForm.location_type} onChange={(e) => setStoreForm({ ...storeForm, location_type: e.target.value })} /></Field>
                    <Field label="Notes"><Input value={storeForm.notes} onChange={(e) => setStoreForm({ ...storeForm, notes: e.target.value })} /></Field>
                  </FormGrid>
                  <Toolbar><Button onClick={addInventoryLocation} disabled={!storeForm.code || !storeForm.name || createInventoryLocation.isPending}>Add Store</Button></Toolbar>
                  <Table heads={['Code','Name','Type','Status']} rows={(inventoryLocations as any[]).map((l: any) => [l.code, l.name, l.location_type ?? 'Store', l.is_active ? <Badge key="active" text="Active" tone="success" /> : <Badge key="inactive" text="Inactive" tone="warn" />])} />
                </>}
              </Card>

              <Card title="GRN — Receive material from Procurement">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Procurement PR"><Select value={grnForm.procurement_id} onChange={(e) => applyInventoryProcurement(e.target.value)}><option value="">Manual / Not linked</option>{(procurement as any[]).map((p: any) => { const rec = inventoryReceivedByProcurement.get(p.id) ?? 0; const rem = Math.max(Number(p.required_qty ?? 0) - rec, 0); return <option key={p.id} value={p.id}>{p.pr_no} — {p.material} | Remaining {rem} {p.unit ?? ''}</option> })}</Select></Field>
                    <Field label="Store"><Select value={grnForm.location_id} onChange={(e) => setGrnForm({ ...grnForm, location_id: e.target.value })}><option value="">No store</option>{(inventoryLocations as any[]).map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}</Select></Field>
                    <Field label="GRN No"><Input value={grnForm.grn_no} onChange={(e) => setGrnForm({ ...grnForm, grn_no: e.target.value })} placeholder="Auto if empty" /></Field>
                    <Field label="Delivery Note"><Input value={grnForm.delivery_note_no} onChange={(e) => setGrnForm({ ...grnForm, delivery_note_no: e.target.value })} /></Field>
                    <Field label="Supplier"><Input value={grnForm.supplier} onChange={(e) => setGrnForm({ ...grnForm, supplier: e.target.value })} /></Field>
                    <Field label="Date"><Input type="date" value={grnForm.received_date} onChange={(e) => setGrnForm({ ...grnForm, received_date: e.target.value })} /></Field>
                    <Field label="Material"><Input value={grnForm.resource_code ? `${grnForm.resource_code} — ${grnForm.material}` : grnForm.material} onChange={(e) => setGrnForm({ ...grnForm, material: e.target.value })} /></Field>
                    <Field label="BOQ"><Select value={grnForm.boq_item_id} onChange={(e) => setGrnForm({ ...grnForm, boq_item_id: e.target.value })}><option value="">—</option>{getBoqItemsForStructure(grnForm.structure_id, true).map((b: any) => <option key={b.id} value={b.id}>{structureBoqOptionLabel(b)}</option>)}</Select></Field>
                    <Field label={grnForm.structure_ids.length > 1 ? `Structures from PR (${grnForm.structure_ids.length} villas)` : 'Structure'}><Select value={grnForm.structure_id} onChange={(e) => { const structureId = e.target.value; const scopedBoq = getBoqItemsForStructure(structureId, true); const currentStillValid = grnForm.boq_item_id && scopedBoq.some((b: any) => String(b.id) === String(grnForm.boq_item_id)); setGrnForm({ ...grnForm, structure_id: structureId, structure_ids: structureId ? [structureId] : [], boq_item_id: currentStillValid ? grnForm.boq_item_id : '' }) }}><option value="">—</option>{(grnForm.structure_ids.length ? grnForm.structure_ids : procurementTargetStructures.filter((n: StructureNode) => structureHasBoq(n.id)).map((n: StructureNode) => n.id)).map((id: string) => <option key={id} value={id}>{structurePath(id)}</option>)}</Select></Field>
                    <Field label="Received Qty"><Input type="number" value={grnForm.received_qty} onChange={(e) => setGrnForm({ ...grnForm, received_qty: e.target.value })} /></Field>
                    <Field label="Unit"><Input value={grnForm.unit} onChange={(e) => setGrnForm({ ...grnForm, unit: e.target.value })} /></Field>
                    <Field label="Unit Rate"><Input type="number" value={grnForm.unit_rate} onChange={(e) => setGrnForm({ ...grnForm, unit_rate: e.target.value })} /></Field>
                  </FormGrid>
                  {grnForm.structure_ids.length > 1 && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#e8f5e9', color: '#1b5e20', fontSize: 12, fontWeight: 700 }}>This GRN will be posted to {grnForm.structure_ids.length} selected villas from the PR. Qty will be split automatically.</div>}
                  <div style={{ marginTop: 10 }}><Field label="Notes"><TextArea value={grnForm.notes} onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })} /></Field></div>
                  <Toolbar><Button onClick={addInventoryGrn} disabled={!grnForm.material || !grnForm.received_qty || createInventoryGrnLine.isPending}>Post GRN</Button></Toolbar>
                </>}
              </Card>

              <Card title="Issue material to site / villa / structure">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="Available Stock"><Select value={issueForm.stock_index} onChange={(e) => applyInventoryStock(e.target.value)}><option value="">Select stock row</option>{availableStockRows.map((s: any, i: number) => <option key={`${s.resource_code}-${s.boq_item_id}-${s.structure_id}-${s.location_id}-${i}`} value={String(i)}>{s.resource_code ? `${s.resource_code} — ` : ''}{s.material} | {s.boq_item_code ?? 'BOQ'} | {s.structure_code ? `${s.structure_code} — ` : ''}{s.structure_name ?? ''} | Stock {Number(s.stock_qty ?? 0).toFixed(2)} {s.unit ?? ''} | {s.location_code ?? 'No Store'}</option>)}</Select></Field>
                    <Field label="Store"><Select value={issueForm.location_id} onChange={(e) => setIssueForm({ ...issueForm, location_id: e.target.value })}><option value="">No store</option>{(inventoryLocations as any[]).map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}</Select></Field>
                    <Field label="Issue No"><Input value={issueForm.issue_no} onChange={(e) => setIssueForm({ ...issueForm, issue_no: e.target.value })} placeholder="Auto if empty" /></Field>
                    <Field label="Date"><Input type="date" value={issueForm.issue_date} onChange={(e) => setIssueForm({ ...issueForm, issue_date: e.target.value })} /></Field>
                    <Field label="Issue To"><Input value={issueForm.issue_to} onChange={(e) => setIssueForm({ ...issueForm, issue_to: e.target.value })} placeholder="Villa / Foreman / Subcontractor" /></Field>
                    <Field label="Material"><Input value={issueForm.resource_code ? `${issueForm.resource_code} — ${issueForm.material}` : issueForm.material} onChange={(e) => setIssueForm({ ...issueForm, material: e.target.value })} /></Field>
                    <Field label="BOQ purchased for selected material"><Select value={issueForm.boq_item_id} onChange={(e) => setIssueForm({ ...issueForm, boq_item_id: e.target.value, structure_id: '' })}><option value="">—</option>{issueBoqOptions.map((b: any) => <option key={b.boq_item_id} value={b.boq_item_id}>{b.boq_item_code ?? 'BOQ'} — {b.boq_description ?? ''}</option>)}</Select></Field>
                    <Field label="Villa / Structure purchased"><Select value={issueForm.structure_id} onChange={(e) => setIssueForm({ ...issueForm, structure_id: e.target.value })}><option value="">—</option>{issueStructureOptions.map((r: any) => <option key={r.structure_id} value={r.structure_id}>{r.structure_code ? `${r.structure_code} — ` : ''}{r.structure_name ?? structurePath(r.structure_id)}</option>)}</Select></Field>
                    <Field label="Issued Qty"><Input type="number" value={issueForm.issued_qty} onChange={(e) => setIssueForm({ ...issueForm, issued_qty: e.target.value, deduction_amount: issueForm.charge_to_subcontractor ? String(issueDeductionAmount(e.target.value, issueForm.unit_rate)) : issueForm.deduction_amount })} /></Field>
                    <Field label="Unit"><Input value={issueForm.unit} onChange={(e) => setIssueForm({ ...issueForm, unit: e.target.value })} /></Field>
                    <Field label="Avg Stock Rate"><Input type="number" value={issueForm.unit_rate} onChange={(e) => setIssueForm({ ...issueForm, unit_rate: e.target.value, deduction_amount: issueForm.charge_to_subcontractor ? String(issueDeductionAmount(issueForm.issued_qty, e.target.value)) : issueForm.deduction_amount })} /></Field>
                    <Field label="Charge to subcontractor?"><Select value={issueForm.charge_to_subcontractor ? 'Yes' : 'No'} onChange={(e) => setIssueForm({ ...issueForm, charge_to_subcontractor: e.target.value === 'Yes', deduction_amount: e.target.value === 'Yes' ? String(issueDeductionAmount(issueForm.issued_qty, issueForm.unit_rate)) : '0' })}><option>No</option><option>Yes</option></Select></Field>
                    {issueForm.charge_to_subcontractor && <Field label="Subcontractor to deduct"><Select value={issueForm.subcontractor_id} onChange={(e) => setIssueForm({ ...issueForm, subcontractor_id: e.target.value })}><option value="">— Select —</option>{subcontractors.map((s: any) => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}</Select></Field>}
                    {issueForm.charge_to_subcontractor && <Field label="Deduction Amount"><Input type="number" value={issueForm.deduction_amount} onChange={(e) => setIssueForm({ ...issueForm, deduction_amount: e.target.value })} /></Field>}
                  </FormGrid>
                  <div style={{ marginTop: 10 }}><Field label="Notes"><TextArea value={issueForm.notes} onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })} /></Field></div>
                  <Toolbar><Button onClick={addInventoryIssue} disabled={!issueForm.material || !issueForm.issued_qty || (issueForm.charge_to_subcontractor && !issueForm.subcontractor_id) || createInventoryIssueLine.isPending}>Post Issue</Button></Toolbar>
                </>}
              </Card>

              <Card title="Live Stock Balance">
                <Table heads={['Material','BOQ','Structure','Store','Received','Issued','Stock','Avg Rate','Stock Value']} rows={filteredInventoryStock.map((s: any) => [
                  `${s.resource_code ? `${s.resource_code} — ` : ''}${s.material ?? ''}`,
                  s.boq_item_code ?? '—',
                  s.structure_code ? `${s.structure_code} — ${s.structure_name ?? ''}` : '—',
                  s.location_code ? `${s.location_code} — ${s.location_name ?? ''}` : '—',
                  `${Number(s.received_qty ?? 0).toFixed(2)} ${s.unit ?? ''}`,
                  `${Number(s.issued_qty ?? 0).toFixed(2)} ${s.unit ?? ''}`,
                  <b key="stock">{Number(s.stock_qty ?? 0).toFixed(2)} {s.unit ?? ''}</b>,
                  money(Number(s.avg_unit_rate ?? 0)),
                  <b key="value">{money(Number(s.stock_value ?? 0))}</b>,
                ])} />
              </Card>

              <Card title="BOQ & Procurement Cost Control">
                <Table heads={['PR','Material','BOQ','Budget Qty','Budget Amount','Received Qty','Received Amount','Issued Qty','Variance']} rows={(inventoryCostControl as any[]).map((r: any) => {
                  const variance = Number(r.budget_variance_amount ?? 0)
                  return [
                    r.pr_no ?? '—',
                    `${r.resource_code ? `${r.resource_code} — ` : ''}${r.material ?? ''}`,
                    r.boq_item_code ?? '—',
                    `${Number(r.required_qty ?? 0).toFixed(2)} ${r.unit ?? ''}`,
                    money(Number(r.budget_amount ?? 0)),
                    `${Number(r.received_qty ?? 0).toFixed(2)} ${r.unit ?? ''}`,
                    money(Number(r.received_amount ?? 0)),
                    `${Number(r.issued_qty ?? 0).toFixed(2)} ${r.unit ?? ''}`,
                    <Badge key="variance" text={money(variance)} tone={variance > 0 ? 'danger' : variance < 0 ? 'success' : 'default'} />,
                  ]
                })} />
              </Card>

              <Card title="Recent GRNs and Issues">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>GRNs</div>
                    <Table heads={['GRN','Material','Qty','Amount','Date']} rows={filteredInventoryGrns.slice(0, 10).map((g: any) => [g.grn_no, g.material, `${Number(g.received_qty ?? 0).toFixed(2)} ${g.unit ?? ''}`, money(Number(g.amount ?? 0)), g.received_date ?? '—'])} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Issues</div>
                    <Table heads={['Issue','Material','Qty','Issued To','Date']} rows={filteredInventoryIssues.slice(0, 10).map((i: any) => [i.issue_no, i.material, `${Number(i.issued_qty ?? 0).toFixed(2)} ${i.unit ?? ''}`, i.issue_to ?? '—', i.issue_date ?? '—'])} />
                  </div>
                </div>
              </Card>
            </>
          )}

          {activeView === 'variations' && (
            <>
              <Card title="Add variation">
                {!projectId ? <div>Select a project first.</div> : <>
                  <FormGrid>
                    <Field label="VO No"><Input value={variationForm.vo_no} onChange={(e) => setVariationForm({ ...variationForm, vo_no: e.target.value })} /></Field>
                    <Field label="Subcontractor"><Select value={variationForm.subcontractor_id} onChange={(e) => setVariationForm({ ...variationForm, subcontractor_id: e.target.value })}><option value="">Optional</option>{subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                    <Field label="BOQ Item"><Select value={variationForm.boq_item_id} onChange={(e) => setVariationForm({ ...variationForm, boq_item_id: e.target.value })}><option value="">Optional</option>{boqItems.map((b) => <option key={b.id} value={b.id}>{b.item_code}</option>)}</Select></Field>
                    <Field label="Type"><Select value={variationForm.type} onChange={(e) => setVariationForm({ ...variationForm, type: e.target.value })}><option>Addition</option><option>Omission</option><option>Substitution</option><option>Acceleration</option><option>Provisional Sum</option></Select></Field>
                    <Field label="Qty Impact"><Input type="number" value={variationForm.qty_impact} onChange={(e) => setVariationForm({ ...variationForm, qty_impact: e.target.value })} /></Field>
                    <Field label="Unit"><Input value={variationForm.unit} onChange={(e) => setVariationForm({ ...variationForm, unit: e.target.value })} /></Field>
                    <Field label="Rate"><Input type="number" value={variationForm.rate} onChange={(e) => setVariationForm({ ...variationForm, rate: e.target.value })} /></Field>
                    <Field label="Time Impact Days"><Input type="number" value={variationForm.time_impact_days} onChange={(e) => setVariationForm({ ...variationForm, time_impact_days: e.target.value })} /></Field>
                  </FormGrid>
                  <div style={{ marginTop: 10 }}><Field label="Description"><TextArea value={variationForm.description} onChange={(e) => setVariationForm({ ...variationForm, description: e.target.value })} /></Field></div>
                  <div style={{ marginTop: 10 }}><Field label="Remarks"><TextArea value={variationForm.notes} onChange={(e) => setVariationForm({ ...variationForm, notes: e.target.value })} /></Field></div>
                  <Toolbar><Button onClick={addVariation} disabled={createVariation.isPending || !variationForm.vo_no || !variationForm.description}>Add Variation</Button></Toolbar>
                </>}
              </Card>
              <Card title="Variations list">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['VO No', 'Description', 'Type', 'Qty Impact', 'Rate', 'Status', 'Approved Value', 'Actions'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {variations.map((v) => {
                        const isEditing = editingVariationId === v.id
                        return (
                          <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0', background: isEditing ? '#f0f7f4' : 'white' }}>
                            {isEditing ? (
                              <>
                                <td style={{ padding: '6px 8px' }}><Input value={editVariationForm.vo_no ?? v.vo_no} onChange={e => setEditVariationForm({ ...editVariationForm, vo_no: e.target.value })} style={{ width: 90 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Input value={editVariationForm.description ?? v.description} onChange={e => setEditVariationForm({ ...editVariationForm, description: e.target.value })} /></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editVariationForm.type ?? v.type} onChange={e => setEditVariationForm({ ...editVariationForm, type: e.target.value })}><option>Addition</option><option>Omission</option><option>Substitution</option><option>Acceleration</option><option>Provisional Sum</option></Select></td>
                                <td style={{ padding: '6px 8px' }}><Input type="number" value={editVariationForm.qty_impact ?? v.qty_impact} onChange={e => setEditVariationForm({ ...editVariationForm, qty_impact: parseFloat(e.target.value) || 0 })} style={{ width: 80 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Input type="number" value={editVariationForm.rate ?? v.rate} onChange={e => setEditVariationForm({ ...editVariationForm, rate: parseFloat(e.target.value) || 0 })} style={{ width: 90 }} /></td>
                                <td style={{ padding: '6px 8px' }}><Select value={editVariationForm.status ?? v.status} onChange={e => setEditVariationForm({ ...editVariationForm, status: e.target.value })}>{VARIATION_STATUSES.map(s => <option key={s}>{s}</option>)}</Select></td>
                                <td style={{ padding: '6px 8px' }}><Input type="number" value={editVariationForm.approved_value ?? (v.approved_value ?? 0)} onChange={e => setEditVariationForm({ ...editVariationForm, approved_value: parseFloat(e.target.value) || 0 })} style={{ width: 100 }} /></td>
                                <td style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
                                  <Button onClick={async () => { await run('Update', () => updateVariation.mutateAsync({ id: v.id, data: editVariationForm })); setEditingVariationId(null) }} disabled={updateVariation.isPending}>Save</Button>
                                  <Button tone="secondary" onClick={() => setEditingVariationId(null)}>Cancel</Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{v.vo_no}</td>
                                <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.description}</td>
                                <td style={{ padding: '8px 12px' }}><span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{v.type}</span></td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{v.qty_impact ?? 0} {v.unit ?? ''}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money(v.rate ?? 0)}</td>
                                <td style={{ padding: '8px 12px' }}>
                                  <Select value={v.status} onChange={(e) => {
                                    const status = e.target.value as VariationStatus
                                    if (status === 'Approved' || status === 'Rejected' || status === 'Partially Approved') {
                                      run('Variation', () => approveVariation.mutateAsync({ id: v.id, status, approvedValue: status === 'Approved' ? (v.qty_impact ?? 0) * (v.rate ?? 0) : v.approved_value ?? 0 }))
                                    }
                                  }}>
                                    {VARIATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </Select>
                                </td>
                                <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1a6b4a' }}>{money(v.approved_value)}</td>
                                <td style={{ padding: '8px 12px', display: 'flex', gap: 4 }}>
                                  <Button tone="secondary" onClick={() => { setEditingVariationId(v.id); setEditVariationForm({ vo_no: v.vo_no, description: v.description, type: v.type, qty_impact: v.qty_impact, rate: v.rate, status: v.status, approved_value: v.approved_value ?? 0 }) }}>✏️ Edit</Button>
                                  <Button tone="danger" onClick={() => { if (confirm('Delete?')) run('Delete', () => deleteVariation.mutateAsync({ id: v.id, projectId: projectId! })) }}>✕</Button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                      {!variations.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No variations yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {activeView === 'tendering' && (
            <>
              {!projectId ? <Card title="Tendering & Cost Estimation"><div>Select a project first.</div></Card> : (() => {
                // ── helpers ──────────────────────────────────────────────
                const CAT_COLOR: Record<string, string> = { Material: '#1565c0', Labor: '#6a1b9a', Equipment: '#e65100', Subcontract: '#2e7d32', Overhead: '#4e342e' }
                const CAT_BG:    Record<string, string> = { Material: '#e3f2fd', Labor: '#f3e5f5', Equipment: '#fff3e0', Subcontract: '#e8f5e9', Overhead: '#efebe9' }


                const directCost = (items: any[]) => items.reduce((s: number, t: any) => s + (t.qty ?? 0) * liveTenderRate(t), 0)

                const unitRate = (bid: string, boqQty: number) => {
                  const items = getTenderItemsForBoq(bid)
                  const dc = directCost(items)
                  const oh = items.reduce((s: number, t: any) => {
                    const base = (t.qty ?? 0) * liveTenderRate(t)
                    return s + base * (t.overhead_pct ?? 0) / 100
                  }, 0)
                  const pr = items.reduce((s: number, t: any) => {
                    const base = (t.qty ?? 0) * liveTenderRate(t)
                    return s + base * (t.profit_pct ?? 0) / 100
                  }, 0)
                  const total = dc + oh + pr
                  return boqQty > 0 ? total / boqQty : 0
                }

                const roundQty = (n: any) => Math.round((Number(n) || 0) * 1000) / 1000
                const nodeById = new Map((structureNodes as any[]).map((n: any) => [n.id, n]))
                const nodePath = (sid: any) => {
                  const out: any[] = []
                  let cur = nodeById.get(sid)
                  let guard = 0
                  while (cur && guard < 20) { out.unshift(cur); cur = nodeById.get(cur.parent_id); guard++ }
                  return out
                }
                const sheetMeta = (b: any) => {
                  const node = nodeById.get(b.structure_id)
                  const path = nodePath(b.structure_id)
                  const phase = path.find((n: any) => String(n.type || '').toLowerCase().includes('phase'))
                  const villa = node
                  const code = String(node?.code || 'GENERAL')
                  const modelMatch = code.match(/\bV\d+\b/i) || String(node?.name || '').match(/\bVILLA\s*TYPE\s*(\d+)\b/i)
                  const model = modelMatch ? (modelMatch[0].toUpperCase().startsWith('V') ? modelMatch[0].toUpperCase() : `V${modelMatch[1]}`) : code
                  return {
                    villaId: node?.id || 'general',
                    villaCode: code,
                    villaName: node?.name || 'General',
                    villaLabel: node ? `${node.code} — ${node.name}` : 'General / No structure',
                    model,
                    phaseId: phase?.id || 'all',
                    phaseCode: phase?.code || 'No Phase',
                    phaseLabel: phase ? `${phase.code} — ${phase.name}` : 'No Phase'
                  }
                }
                const pricedBoqItems = boqItems.filter((b: any) => getTenderItemsForBoq(b.id).length > 0)
                const villaOptions = Array.from(new Map(pricedBoqItems.map((b: any) => { const m = sheetMeta(b); return [m.villaId, m] })).values())
                const modelOptions = Array.from(new Set(pricedBoqItems.map((b: any) => sheetMeta(b).model))).filter(Boolean).sort()
                const phaseOptions = Array.from(new Map(pricedBoqItems.map((b: any) => { const m = sheetMeta(b); return [m.phaseId, m] })).values())
                const filteredCostSheetItems = pricedBoqItems.filter((b: any) => {
                  const m = sheetMeta(b)
                  const q = costSheetFilters.search.trim().toLowerCase()
                  if (costSheetFilters.villa !== 'all' && m.villaId !== costSheetFilters.villa) return false
                  if (costSheetFilters.model !== 'all' && m.model !== costSheetFilters.model) return false
                  if (costSheetFilters.phase !== 'all' && m.phaseId !== costSheetFilters.phase) return false
                  if (q && !`${b.item_code} ${b.description} ${b.unit} ${m.villaLabel} ${m.model} ${m.phaseLabel}`.toLowerCase().includes(q)) return false
                  return true
                })
                const groupedCostSheets = Array.from(filteredCostSheetItems.reduce((map: Map<string, any>, b: any) => {
                  const m = sheetMeta(b)
                  const key = costSheetFilters.view === 'villa' ? m.villaId : b.id
                  const existing = map.get(key) || { key, meta: m, boqItems: [] as any[] }
                  existing.boqItems.push(b)
                  map.set(key, existing)
                  return map
                }, new Map()).values())

                // ── tabs ─────────────────────────────────────────────────
                return <>
                  {/* Tab bar */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    {([['input','📝 Price a BOQ Item'],['library','🧱 Cost Library'],['sheet','📊 Cost Sheets'],['summary','📈 Project Summary']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setTenderTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: tenderTab === id ? '#1a6b4a' : '#f0f0f0', color: tenderTab === id ? '#fff' : '#333' }}>{label}</button>
                    ))}
                    {tenderTab === 'library' && <button onClick={() => printTenderSection('tender-library-report', 'Cost Library Report')} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #bcd7c9', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>🧾 Cost Library Report</button>}
                    {tenderTab === 'sheet' && <button onClick={() => printTenderSection('tender-cost-sheet-report', 'Cost Sheet Report')} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #bcd7c9', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>🧾 Cost Sheets Report</button>}
                    {tenderTab === 'summary' && <button onClick={() => printTenderSection('tender-project-summary-report', 'Project Cost Summary Report')} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #bcd7c9', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>🧾 Project Summary Report</button>}
                  </div>

                  {/* ── TAB 1: Price a BOQ Item ── */}
                  {tenderTab === 'input' && (
                    <Card title="Price a BOQ Item">
                      <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
                        <Field label="Select BOQ Item to Price">
                          <Select value={selectedBoqForTender} onChange={(e) => {
                            const bid = e.target.value
                            setSelectedBoqForTender(bid)
                            setTenderForm({ ...tenderForm, boq_item_id: bid })
                            const b = boqItems.find((x: any) => x.id === bid)
                            setSelectedStructureForTender((b as any)?.structure_id ?? '')
                          }}>
                            <option value="">— Select BOQ Item —</option>
                            {getBoqItemsForStructure(selectedStructureForTender, false).map((b: any) => {
                              const priced = getTenderItemsForBoq(b.id).length > 0
                              const node = structureNodes.find((n: StructureNode) => n.id === (b as any).structure_id)
                              return <option key={b.id} value={b.id}>{priced ? '✓ ' : ''}{b.item_code} — {b.description} ({b.unit}) {node ? '• ' + node.code : ''}</option>
                            })}
                          </Select>
                        </Field>
                        <Field label="Villa / Structure to Price">
                          <Select value={selectedStructureForTender} onChange={(e) => {
                            const sid = e.target.value
                            setSelectedStructureForTender(sid)
                            const current = boqItems.find((x: any) => x.id === selectedBoqForTender)
                            const match = current ? boqItems.find((x: any) =>
                              (x as any).structure_id === sid &&
                              normalizeCode((x as any).item_code) === normalizeCode((current as any).item_code) &&
                              String((x as any).description ?? '').trim().toLowerCase() === String((current as any).description ?? '').trim().toLowerCase() &&
                              String((x as any).unit ?? '').trim().toLowerCase() === String((current as any).unit ?? '').trim().toLowerCase()
                            ) : null
                            if (match) { setSelectedBoqForTender((match as any).id); setTenderForm({ ...tenderForm, boq_item_id: (match as any).id }) }
                          }} disabled={!selectedBoqForTender}>
                            <option value="">— Select structure —</option>
                            {(() => {
                              const current = boqItems.find((x: any) => x.id === selectedBoqForTender)
                              const matches = current ? boqItems.filter((x: any) =>
                                x.structure_id &&
                                normalizeCode(x.item_code) === normalizeCode((current as any).item_code) &&
                                String(x.description ?? '').trim().toLowerCase() === String((current as any).description ?? '').trim().toLowerCase() &&
                                String(x.unit ?? '').trim().toLowerCase() === String((current as any).unit ?? '').trim().toLowerCase()
                              ) : []
                              return matches.map((x: any) => {
                                const node = structureNodes.find((n: StructureNode) => n.id === x.structure_id)
                                return <option key={x.structure_id} value={x.structure_id}>{node ? node.code + ' — ' + node.name + ' (' + node.type + ')' : x.structure_id} • BOQ Qty: {x.boq_qty} {x.unit}</option>
                              })
                            })()}
                          </Select>
                        </Field>
                      </div>

                      {selectedBoqForTender && (() => {
                        const boq = boqItems.find((b) => b.id === selectedBoqForTender) as BoqItemWithStructure | undefined
                        const items = getTenderItemsForBoq(selectedBoqForTender)
                        const dc = directCost(items)
                        const totalOh = items.reduce((s: number, t: any) => s + (t.qty??0)*liveTenderRate(t)*(t.overhead_pct??0)/100, 0)
                        const totalPr = items.reduce((s: number, t: any) => s + (t.qty??0)*liveTenderRate(t)*(t.profit_pct??0)/100, 0)
                        const totalCost = dc + totalOh + totalPr
                        const boqQty = boq?.boq_qty ?? 1
                        const calcUnitRate = boqQty > 0 ? totalCost / boqQty : 0
                        const clientRate = (boq as any)?.client_rate ?? (boq as any)?.rate ?? 0
                        const margin = clientRate > 0 ? ((clientRate - calcUnitRate) / clientRate) * 100 : 0

                        return <>
                          {/* KPI strip */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
                            {[
                              ['Direct Cost', money(dc), '#1565c0'],
                              ['Overhead', money(totalOh), '#e65100'],
                              ['Profit', money(totalPr), '#2e7d32'],
                              ['Total Cost', money(totalCost), '#1a6b4a'],
                              ['Calc. Unit Rate', money(calcUnitRate), margin >= 0 ? '#2e7d32' : '#c62828'],
                            ].map(([label, val, color]) => (
                              <div key={label} style={{ background: '#f8f8f8', borderRadius: 8, padding: '10px 14px', borderLeft: `4px solid ${color}` }}>
                                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {clientRate > 0 && (
                            <div style={{ marginBottom: 16, padding: '8px 14px', background: margin >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span>Client Rate: <b>{money(clientRate)}</b> &nbsp;|&nbsp; BOQ Qty: <b>{boqQty} {boq?.unit}</b> &nbsp;|&nbsp; Margin: <b style={{ color: margin >= 0 ? '#2e7d32' : '#c62828' }}>{margin.toFixed(1)}%</b></span>
                              <button
                                onClick={async () => {
                                  if (!boq || !calcUnitRate || calcUnitRate <= 0) return
                                  const m = sheetMeta(boq)
                                  const targets = (boqItems as any[]).filter((x: any) => {
                                    const xm = sheetMeta(x)
                                    return xm.model === m.model && String(x.item_code) === String(boq.item_code)
                                  })
                                  if (!targets.length) return
                                  if (!confirm(`Update BOQ selling rate for ${targets.length} item(s) in the same model (${m.model}) and BOQ code ${boq.item_code}?\n\nNew BOQ Rate: ${money(calcUnitRate)}\n\nThis is manual and will not happen automatically.`)) return
                                  for (const target of targets) {
                                    await updateBoqItem.mutateAsync({ id: target.id, data: { client_rate: round3(calcUnitRate) } as any })
                                  }
                                  await refreshTenderLiveData()
                                  setMessage(`BOQ rate updated manually for ${targets.length} item(s) in model ${m.model}.`)
                                }}
                                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #1a6b4a', background: '#fff', color: '#1a6b4a', fontWeight: 800, cursor: 'pointer' }}
                              >Update BOQ Rate from Cost Sheet</button>
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                            <Button tone="secondary" onClick={copyTenderBreakdown} disabled={items.length === 0}>Copy Breakdown</Button>
                            <Button tone="secondary" onClick={pasteTenderBreakdown} disabled={!selectedBoqForTender}>Paste Breakdown</Button>
                            <label style={{ fontSize: 12, color: '#555' }}>Paste mode:</label>
                            <Select value={pasteMode} onChange={(e) => setPasteMode(e.target.value as 'add'|'replace')} style={{ width: 150 }}>
                              <option value="add">Add to existing</option>
                              <option value="replace">Replace existing</option>
                            </Select>
                          </div>
                          {items.length > 0 && (
                            <div style={{ marginBottom: 14, padding: 12, border: '1px solid #c8e6c9', background: '#f7fffb', borderRadius: 10 }}>
                              <div style={{ fontWeight: 800, color: '#00664f', marginBottom: 10 }}>⚙️ Smart OH / Profit Input</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
                                <Field label="Overhead %"><Input type="number" value={bulkMarkup.overhead_pct} onChange={(e) => setBulkMarkup({ ...bulkMarkup, overhead_pct: e.target.value })} /></Field>
                                <Field label="Profit %"><Input type="number" value={bulkMarkup.profit_pct} onChange={(e) => setBulkMarkup({ ...bulkMarkup, profit_pct: e.target.value })} /></Field>
                                <Field label="Apply To">
                                  <Select value={bulkMarkup.target} onChange={(e) => setBulkMarkup({ ...bulkMarkup, target: e.target.value as any })}>
                                    <option value="all">All cost lines</option>
                                    {COST_CATEGORIES.map(c => <option key={c} value={c}>{c} only</option>)}
                                  </Select>
                                </Field>
                                <button onClick={() => applyBulkMarkupToTenderLines(items)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #1a6b4a', background: '#1a6b4a', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Apply + Update Cost Sheet</button>
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                <button onClick={() => quickApplyBulkMarkup(items, 5, 10, 'Material')} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d7eadf', background: '#fff', cursor: 'pointer' }}>Material 5% / 10%</button>
                                <button onClick={() => quickApplyBulkMarkup(items, 10, 15, 'Subcontract')} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d7eadf', background: '#fff', cursor: 'pointer' }}>Subcontract 10% / 15%</button>
                                <button onClick={() => quickApplyBulkMarkup(items, 10, 10, 'all')} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d7eadf', background: '#fff', cursor: 'pointer' }}>All 10% / 10%</button>
                                <button onClick={() => quickApplyBulkMarkup(items, 0, 0, 'all')} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ffcdd2', background: '#fff5f5', color: '#c62828', cursor: 'pointer' }}>Clear All %</button>
                              </div>
                              <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>Saved to Supabase, so the Cost Sheet tab updates from the same lines.</div>
                            </div>
                          )}

                          {/* Existing cost lines */}
                          {items.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr style={{ background: '#f5f5f5' }}>
                                    {['Category','Description','Unit','Base Qty','Waste %','Steel Ratio','Effective Qty','Unit Rate','Direct Cost','OH%','Profit%','Total','Actions'].map(h => (
                                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((t: any) => {
                                    const rowBaseQty = tenderBaseQtyFromNotes(t)
                                    const rowWastePct = tenderWasteFromNotes(t)
                                    const rowEffectiveQty = t.qty ?? tenderEffectiveQty(rowBaseQty, rowWastePct, t.category, tenderSteelRatioFromNotes(t))
                                    const base = (rowEffectiveQty??0)*liveTenderRate(t)
                                    const oh = base*(t.overhead_pct??0)/100
                                    const pr = base*(t.profit_pct??0)/100
                                    return (
                                      <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '7px 10px' }}>
                                          <span style={{ background: CAT_BG[t.category]??'#eee', color: CAT_COLOR[t.category]??'#333', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{t.category}</span>
                                        </td>
                                        <td style={{ padding: '7px 10px' }}>{liveTenderDescription(t)}</td>
                                        <td style={{ padding: '7px 10px' }}>{liveTenderUnit(t)}</td>
                                        <td style={{ padding: '7px 10px' }}>{rowBaseQty}</td>
                                        <td style={{ padding: '7px 10px' }}>{t.category === 'Material' ? rowWastePct + '%' : '—'}</td>
                                        <td style={{ padding: '7px 10px' }}>{tenderSteelRatioFromNotes(t) ? tenderSteelRatioFromNotes(t) + ' ton/m³' : '—'}</td>
                                        <td style={{ padding: '7px 10px', fontWeight: 700 }}>{round3(rowEffectiveQty)}</td>
                                        <td style={{ padding: '7px 10px' }}>{money(liveTenderRate(t))}</td>
                                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{money(base)}</td>
                                        <td style={{ padding: '7px 10px', color: '#e65100' }}>{t.overhead_pct??0}%</td>
                                        <td style={{ padding: '7px 10px', color: '#2e7d32' }}>{t.profit_pct??0}%</td>
                                        <td style={{ padding: '7px 10px', fontWeight: 700 }}>{money(base+oh+pr)}</td>
                                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                          <button onClick={() => startEditTenderLine(t)} style={{ background: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: 6, cursor: 'pointer', color: '#1565c0', fontSize: 12, padding: '4px 8px', marginRight: 6 }}>Edit</button>
                                          <button onClick={() => run('Delete', () => deleteTenderItem.mutateAsync(t.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 16 }}>✕</button>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                  <tr style={{ background: '#f0f7f4', fontWeight: 700 }}>
                                    <td colSpan={7} style={{ padding: '8px 10px' }}>TOTAL</td>
                                    <td style={{ padding: '8px 10px' }}>{money(dc)}</td>
                                    <td style={{ padding: '8px 10px', color: '#e65100' }}>{money(totalOh)}</td>
                                    <td style={{ padding: '8px 10px', color: '#2e7d32' }}>{money(totalPr)}</td>
                                    <td style={{ padding: '8px 10px', color: '#1a6b4a' }}>{money(totalCost)}</td>
                                    <td></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Add cost line form */}
                          <div style={{ background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10, padding: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#1a6b4a' }}>+ Add Cost Line (select from Cost Library)</div>
                            <div style={{ padding: 10, marginBottom: 12, background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, fontSize: 12 }}>
                              Cost Library is managed only from the Cost Library tab. This screen only uses existing coded resources for pricing.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                              <Field label="Cost Category">
                                <Select value={tenderForm.category} onChange={(e) => { setTenderForm({ ...tenderForm, category: e.target.value as CostCategory, resource_id: '', resource_code: '', description: '', unit: '', unit_rate: '0', waste_pct: '0', steel_ratio: '' }); setResourceSearch('') }}>
                                  {COST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </Select>
                              </Field>
                              <Field label="Search Library">
                                <Input value={resourceSearch} onChange={(e) => setResourceSearch(e.target.value)} placeholder="Search code, description, unit, rate..." />
                              </Field>
                              <Field label="Code / Description">
                                <Select value={tenderForm.resource_id} onChange={(e) => selectTenderResource(e.target.value)}>
                                  <option value="">— Select coded resource —</option>
                                  {filteredCategoryResources.map(r => <option key={r.id} value={r.id}>{r.code} — {r.description} ({r.unit}) • {money(r.unit_rate)}</option>)}
                                </Select>
                              </Field>
                              <Field label="Selected Code"><Input value={tenderForm.resource_code} onChange={(e) => setTenderForm({ ...tenderForm, resource_code: normalizeCode(e.target.value) })} placeholder="Code" /></Field>
                              <Field label="Description Override"><Input value={tenderForm.description} onChange={(e) => setTenderForm({ ...tenderForm, description: e.target.value })} placeholder="Resource description" /></Field>
                              <Field label="Unit Override"><Input value={tenderForm.unit} onChange={(e) => setTenderForm({ ...tenderForm, unit: e.target.value })} placeholder="ton, m3…" /></Field>
                              <Field label="Base Qty"><Input type="number" value={tenderForm.qty} onChange={(e) => setTenderForm({ ...tenderForm, qty: e.target.value })} /></Field>
                              <Field label="Waste %"><Input type="number" value={tenderForm.waste_pct} onChange={(e) => setTenderForm({ ...tenderForm, waste_pct: e.target.value })} disabled={tenderForm.category !== 'Material'} /></Field>
                              <Field label="Steel Ratio ton/m³ (Claims)"><Input type="number" value={tenderForm.steel_ratio} onChange={(e) => setTenderForm({ ...tenderForm, steel_ratio: e.target.value })} placeholder="e.g. 0.085" disabled={tenderForm.category !== 'Material'} /></Field>
                              <Field label="Unit Rate Override (EGP)"><Input type="number" value={tenderForm.unit_rate} onChange={(e) => setTenderForm({ ...tenderForm, unit_rate: e.target.value })} /></Field>
                              <Field label="Overhead %"><Input type="number" value={tenderForm.overhead_pct} onChange={(e) => setTenderForm({ ...tenderForm, overhead_pct: e.target.value })} /></Field>
                              <Field label="Profit %"><Input type="number" value={tenderForm.profit_pct} onChange={(e) => setTenderForm({ ...tenderForm, profit_pct: e.target.value })} /></Field>
                              <Field label="Notes"><Input value={tenderForm.notes} onChange={(e) => setTenderForm({ ...tenderForm, notes: e.target.value })} /></Field>
                            </div>
                            {tenderForm.resource_code && (
                              <div style={{ marginTop: 10, padding: '10px 12px', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, fontSize: 13 }}>
                                Selected Resource: <b>{tenderForm.resource_code}</b> — {tenderForm.description || 'No description'} · Unit: <b>{tenderForm.unit || '—'}</b> · Rate: <b>{money(n(tenderForm.unit_rate))}</b>
                                <span style={{ color: '#666' }}> &nbsp;|&nbsp; Editable override is allowed before adding the line.</span>
                              </div>
                            )}
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
                              <Button onClick={async () => {
                                if (!tenderForm.boq_item_id || !tenderForm.description) return
                                const codedDescription = tenderForm.resource_code ? (tenderForm.resource_code + ' — ' + tenderForm.description) : tenderForm.description
                                const baseQty = n(tenderForm.qty)
                                const wastePct = tenderForm.category === 'Material' ? n(tenderForm.waste_pct) : 0
                                const steelRatio = tenderForm.category === 'Material' ? n(tenderForm.steel_ratio) : 0
                                const effectiveQty = tenderEffectiveQty(baseQty, wastePct, tenderForm.category, steelRatio)
                                const wasteNote = tenderForm.category === 'Material' ? ('Base Qty: ' + baseQty + ' | Waste: ' + wastePct + '%' + (steelRatio > 0 ? ' | Steel Ratio: ' + steelRatio + ' ton/m3' : '')) : ''
                                const payload = {
                                  project_id: projectId!,
                                  boq_item_id: tenderForm.boq_item_id,
                                  category: tenderForm.category,
                                  description: codedDescription,
                                  unit: tenderForm.unit || null,
                                  qty: effectiveQty,
                                  unit_rate: n(tenderForm.unit_rate),
                                  overhead_pct: n(tenderForm.overhead_pct),
                                  profit_pct: n(tenderForm.profit_pct),
                                  notes: [tenderForm.notes, wasteNote].filter(Boolean).join(' | ') || null,
                                }
                                if (editingTenderLineId) {
                                  await run('Update cost line', () => updateTenderItem.mutateAsync({ id: editingTenderLineId, project_id: projectId!, patch: payload }))
                                  setEditingTenderLineId(null)
                                } else {
                                  await run('Cost line', () => createTenderItem.mutateAsync(payload))
                                }
                                setTenderForm({ ...tenderForm, resource_id: '', resource_code: '', description: '', unit: '', qty: '0', waste_pct: '0', steel_ratio: '', unit_rate: '0', overhead_pct: '0', profit_pct: '0', notes: '' })
                              }} disabled={createTenderItem.isPending || !tenderForm.description}>
                                {editingTenderLineId ? 'Update Cost Line' : 'Add Cost Line'}
                              </Button>
                              {editingTenderLineId && <Button tone="secondary" onClick={cancelEditTenderLine}>Cancel Edit</Button>}
                               {n(tenderForm.qty) > 0 && n(tenderForm.unit_rate) > 0 && (() => {
                                const pBaseQty = n(tenderForm.qty)
                                const pWaste = tenderForm.category === 'Material' ? n(tenderForm.waste_pct) : 0
                                const pSteelRatio = tenderForm.category === 'Material' ? n(tenderForm.steel_ratio) : 0
                                const pQtyAfterWaste = tenderForm.category === 'Material' ? round3(pBaseQty * (1 + pWaste / 100)) : pBaseQty
                                const pEffQty = tenderEffectiveQty(pBaseQty, pWaste, tenderForm.category, pSteelRatio)
                                const pBase = pEffQty * n(tenderForm.unit_rate)
                                return <span style={{ fontSize: 13, color: '#555' }}>
                                  Preview: Base Qty <b>{pBaseQty}</b>{tenderForm.category === 'Material' && <> + Waste <b>{pWaste}%</b> = Qty after waste <b>{pQtyAfterWaste.toFixed(3)}</b></>} {pSteelRatio > 0 && <> · Steel Ratio <b>{pSteelRatio} ton/m³</b> · Steel Qty <b>{pEffQty.toFixed(3)} ton</b></>} {pSteelRatio <= 0 && <> · Effective Qty <b>{pEffQty.toFixed(3)}</b></>} · Direct <b>{money(pBase)}</b>
                                  {n(tenderForm.overhead_pct)>0 && <> + OH <b>{money(pBase*n(tenderForm.overhead_pct)/100)}</b></>}
                                  {n(tenderForm.profit_pct)>0 && <> + Profit <b>{money(pBase*n(tenderForm.profit_pct)/100)}</b></>}
                                  {' = '}<b style={{color:'#1a6b4a'}}>{money(pBase*(1+n(tenderForm.overhead_pct)/100+n(tenderForm.profit_pct)/100))}</b>
                                </span>
                              })()}
                            </div>
                          </div>
                        </>
                      })()}
                    </Card>
                  )}

                  {/* ── TAB 2: Cost Library Manager ── */}
                  {tenderTab === 'library' && (
                    <div id="tender-library-report"><Card title="Cost Library Manager">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10, marginBottom: 14 }}>
                        <Field label="Search resources"><Input value={libraryManagerSearch} onChange={(e) => setLibraryManagerSearch(e.target.value)} placeholder="Search code, description, unit, rate..." /></Field>
                        <Field label="Category"><Select value={libraryManagerCategory} onChange={(e) => setLibraryManagerCategory(e.target.value)}><option value="all">All Categories</option>{COST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</Select></Field>
                      </div>

                      <div style={{ background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: '#1a6b4a', marginBottom: 10 }}>{editingResourceId ? 'Edit Library Resource' : '+ Add Library Resource'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                          <Field label="Category"><Select value={resourceForm.category} onChange={(e) => setResourceForm({ ...resourceForm, category: e.target.value as CostCategory })}>{COST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</Select></Field>
                          <Field label="Code"><Input value={resourceForm.code} onChange={(e) => setResourceForm({ ...resourceForm, code: normalizeCode(e.target.value) })} placeholder="MAT-STL-001" /></Field>
                          <Field label="Description"><Input value={resourceForm.description} onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })} placeholder="Steel bars" /></Field>
                          <Field label="Unit"><Input value={resourceForm.unit} onChange={(e) => setResourceForm({ ...resourceForm, unit: e.target.value })} placeholder="ton, m3..." /></Field>
                          <Field label="Default Rate"><Input type="number" value={resourceForm.unit_rate} onChange={(e) => setResourceForm({ ...resourceForm, unit_rate: e.target.value })} /></Field>
                          <Field label="Default Waste %"><Input type="number" value={resourceForm.default_waste_pct} onChange={(e) => setResourceForm({ ...resourceForm, default_waste_pct: e.target.value })} disabled={resourceForm.category !== 'Material'} /></Field>
                          <Field label="Notes"><Input value={resourceForm.notes} onChange={(e) => setResourceForm({ ...resourceForm, notes: e.target.value })} /></Field>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <Button onClick={saveTenderResource} disabled={!resourceForm.code || !resourceForm.description}>{editingResourceId ? 'Save Changes' : 'Save Resource'}</Button>
                          {editingResourceId && <Button tone="secondary" onClick={cancelTenderResourceEdit}>Cancel</Button>}
                        </div>
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>{['Code','Description','Unit','Rate','Waste %','Category','Notes','Actions'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {tenderResources
                              .filter(r => libraryManagerCategory === 'all' || r.category === libraryManagerCategory)
                              .filter(r => { const q = libraryManagerSearch.trim().toLowerCase(); return !q || [r.code, r.description, r.unit, String(r.unit_rate), r.category, r.notes].join(' ').toLowerCase().includes(q) })
                              .map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: 800 }}>{r.code}</td>
                                  <td style={{ padding: '8px 12px' }}>{r.description}</td>
                                  <td style={{ padding: '8px 12px' }}>{r.unit}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>{money(r.unit_rate)}</td>
                                  <td style={{ padding: '8px 12px' }}>{r.category === 'Material' ? (r.default_waste_pct ?? 0) + '%' : '—'}</td>
                                  <td style={{ padding: '8px 12px' }}><span style={{ background: CAT_BG[r.category]??'#eee', color: CAT_COLOR[r.category]??'#333', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{r.category}</span></td>
                                  <td style={{ padding: '8px 12px', color: '#666' }}>{r.notes ?? '—'}</td>
                                  <td style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
                                    <Button tone="secondary" onClick={() => editTenderResource(r)}>Edit</Button>
                                    <Button tone="danger" onClick={() => deleteTenderResource(r.id)}>Delete</Button>
                                  </td>
                                </tr>
                              ))}
                            {!tenderResources.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No library resources yet.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </Card></div>
                  )}

                  {/* ── TAB 3: Cost Sheets ── */}
                  {tenderTab === 'sheet' && (
                    <div id="tender-cost-sheet-report"><Card title="Cost Sheets PRO — By Villa / BOQ">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr auto', gap: 10, marginBottom: 14, alignItems: 'end' }}>
                        <Field label="View">
                          <Select value={costSheetFilters.view} onChange={(e) => setCostSheetFilters({ ...costSheetFilters, view: e.target.value as any })}>
                            <option value="villa">Group by Villa / Structure</option>
                            <option value="boq">Group by BOQ Item</option>
                          </Select>
                        </Field>
                        <Field label="Villa / Structure">
                          <Select value={costSheetFilters.villa} onChange={(e) => setCostSheetFilters({ ...costSheetFilters, villa: e.target.value })}>
                            <option value="all">All Villas / Structures</option>
                            {villaOptions.map((m: any) => <option key={m.villaId} value={m.villaId}>{m.villaLabel}</option>)}
                          </Select>
                        </Field>
                        <Field label="Model">
                          <Select value={costSheetFilters.model} onChange={(e) => setCostSheetFilters({ ...costSheetFilters, model: e.target.value })}>
                            <option value="all">All Models</option>
                            {modelOptions.map((m: any) => <option key={m} value={m}>{m}</option>)}
                          </Select>
                        </Field>
                        <Field label="Search">
                          <Input placeholder="Search BOQ code, description, villa, model..." value={costSheetFilters.search} onChange={(e) => setCostSheetFilters({ ...costSheetFilters, search: e.target.value })} />
                        </Field>
                        <Button tone="secondary" onClick={() => setCostSheetFilters({ view: 'villa', villa: 'all', model: 'all', phase: 'all', search: '' })}>Reset</Button>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                        <span style={{ background: '#e8f5e9', color: '#1a6b4a', padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{filteredCostSheetItems.length} priced BOQ items</span>
                        <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{groupedCostSheets.length} groups</span>
                      </div>

                      {pricedBoqItems.length === 0 ? (
                        <div style={{ color: '#888', padding: 20 }}>No priced items yet. Go to "Price a BOQ Item" to start.</div>
                      ) : filteredCostSheetItems.length === 0 ? (
                        <div style={{ color: '#888', padding: 20 }}>No cost sheets match the selected filters.</div>
                      ) : groupedCostSheets.map((group: any) => {
                        const groupItems = group.boqItems
                        const groupDirect = groupItems.reduce((sum: number, b: any) => sum + directCost(getTenderItemsForBoq(b.id)), 0)
                        const groupOh = groupItems.reduce((sum: number, b: any) => sum + getTenderItemsForBoq(b.id).reduce((s2: number, t: any) => s2 + (t.qty??0)*liveTenderRate(t)*(t.overhead_pct??0)/100, 0), 0)
                        const groupPr = groupItems.reduce((sum: number, b: any) => sum + getTenderItemsForBoq(b.id).reduce((s2: number, t: any) => s2 + (t.qty??0)*liveTenderRate(t)*(t.profit_pct??0)/100, 0), 0)
                        const groupTotal = groupDirect + groupOh + groupPr
                        return (
                          <div key={group.key} style={{ marginBottom: 28, borderRadius: 12, border: '1px solid #d9e6df', overflow: 'hidden', background: '#fff' }}>
                            <div style={{ background: '#0f5f43', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 16 }}>{costSheetFilters.view === 'villa' ? group.meta.villaLabel : `${groupItems[0].item_code} — ${groupItems[0].description}`}</div>
                                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>{group.meta.phaseLabel} • Model: {group.meta.model} • {groupItems.length} BOQ item(s)</div>
                              </div>
                              <div style={{ textAlign: 'right', fontWeight: 800 }}>{money(groupTotal)}</div>
                            </div>

                            {groupItems.map((b: any) => {
                              const items = getTenderItemsForBoq(b.id)
                              const dc = directCost(items)
                              const totalOh = items.reduce((s: number, t: any) => s + (t.qty??0)*liveTenderRate(t)*(t.overhead_pct??0)/100, 0)
                              const totalPr = items.reduce((s: number, t: any) => s + (t.qty??0)*liveTenderRate(t)*(t.profit_pct??0)/100, 0)
                              const totalCost = dc + totalOh + totalPr
                              const clientRate = (b as any)?.client_rate ?? (b as any)?.rate ?? 0
                              const calcUR = b.boq_qty > 0 ? totalCost / b.boq_qty : 0
                              const margin = clientRate > 0 ? ((clientRate - calcUR) / clientRate) * 100 : null
                              const meta = sheetMeta(b)
                              return (
                                <div key={b.id} style={{ borderTop: '1px solid #e9e9e9' }}>
                                  <div style={{ background: '#1a6b4a', color: '#fff', padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700 }}>{b.item_code} — {b.description}</span>
                                    <span style={{ fontSize: 12, opacity: 0.9 }}>{meta.villaCode} | BOQ Qty: {roundQty(b.boq_qty)} {b.unit} | Client Rate: {money(clientRate)} | Calc. Rate: {money(calcUR)} {margin !== null && <span style={{ color: margin >= 0 ? '#a5d6a7' : '#ef9a9a' }}>({margin.toFixed(1)}%)</span>}</span>
                                  </div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: '#f5f5f5' }}>
                                        {['Category','Description','Unit','Base Qty','Waste %','Steel Ratio','Effective Qty','Unit Rate','Direct Cost','OH%','Profit%','Total'].map(h => (
                                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((t: any) => {
                                        const rowBaseQty = roundQty(tenderBaseQtyFromNotes(t))
                                        const rowWastePct = roundQty(tenderWasteFromNotes(t))
                                        const rowEffectiveQty = roundQty(t.qty ?? tenderEffectiveQty(rowBaseQty, rowWastePct, t.category, tenderSteelRatioFromNotes(t)))
                                        const base = rowEffectiveQty*liveTenderRate(t)
                                        const oh = base*(t.overhead_pct??0)/100
                                        const pr = base*(t.profit_pct??0)/100
                                        return (
                                          <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '6px 10px' }}><span style={{ background: CAT_BG[t.category]??'#eee', color: CAT_COLOR[t.category]??'#333', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{t.category}</span></td>
                                            <td style={{ padding: '6px 10px' }}>{liveTenderDescription(t)}</td>
                                            <td style={{ padding: '6px 10px' }}>{liveTenderUnit(t)}</td>
                                            <td style={{ padding: '6px 10px' }}>{rowBaseQty}</td>
                                            <td style={{ padding: '6px 10px' }}>{t.category === 'Material' ? rowWastePct + '%' : '—'}</td>
                                            <td style={{ padding: '6px 10px' }}>{tenderSteelRatioFromNotes(t) ? tenderSteelRatioFromNotes(t) + ' ton/m³' : '—'}</td>
                                            <td style={{ padding: '6px 10px', fontWeight: 700 }}>{rowEffectiveQty}</td>
                                            <td style={{ padding: '6px 10px' }}>{money(liveTenderRate(t))}</td>
                                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{money(base)}</td>
                                            <td style={{ padding: '6px 10px', color: '#e65100' }}>{t.overhead_pct??0}%</td>
                                            <td style={{ padding: '6px 10px', color: '#2e7d32' }}>{t.profit_pct??0}%</td>
                                            <td style={{ padding: '6px 10px', fontWeight: 700 }}>{money(base+oh+pr)}</td>
                                          </tr>
                                        )
                                      })}
                                      <tr style={{ background: '#f0f7f4', fontWeight: 700, fontSize: 13 }}>
                                        <td colSpan={9} style={{ padding: '8px 10px' }}>SUBTOTAL</td>
                                        <td style={{ padding: '8px 10px' }}>{money(dc)}</td>
                                        <td style={{ padding: '8px 10px', color: '#e65100' }}>{money(totalOh)}</td>
                                        <td style={{ padding: '8px 10px', color: '#2e7d32' }}>{money(totalPr)}</td>
                                        <td style={{ padding: '8px 10px', color: '#1a6b4a' }}>{money(totalCost)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </Card></div>
                  )}

                  {/* ── TAB 3: Project Summary ── */}
                  {tenderTab === 'summary' && (() => {
                    const allPriced = boqItems.filter((b) => getTenderItemsForBoq(b.id).length > 0)
                    const projectDC = allPriced.reduce((s, b) => s + directCost(getTenderItemsForBoq(b.id)), 0)
                    const projectOH = allPriced.reduce((s, b) => s + getTenderItemsForBoq(b.id).reduce((ss: number, t: any) => ss + (t.qty??0)*liveTenderRate(t)*(t.overhead_pct??0)/100, 0), 0)
                    const projectPR = allPriced.reduce((s, b) => s + getTenderItemsForBoq(b.id).reduce((ss: number, t: any) => ss + (t.qty??0)*liveTenderRate(t)*(t.profit_pct??0)/100, 0), 0)
                    const projectTotal = projectDC + projectOH + projectPR
                    const clientBudget = allPriced.reduce((s, b: any) => s + boqItemContractValue(b), 0)

                    // By category
                    const byCat = COST_CATEGORIES.map(cat => {
                      const items = tenderItems.filter((t: any) => t.category === cat)
                      const total = items.reduce((s: number, t: any) => s + (t.qty??0)*liveTenderRate(t), 0)
                      return { cat, total, pct: projectDC > 0 ? (total/projectDC)*100 : 0 }
                    })

                    // By resource description across all items
                    const byDesc = new Map<string, { cat: string; total: number; items: number }>()
                    tenderItems.forEach((t: any) => {
                      const base = (t.qty??0)*liveTenderRate(t)
                      const ex = byDesc.get(t.description) ?? { cat: t.category, total: 0, items: 0 }
                      byDesc.set(t.description, { cat: t.category, total: ex.total + base, items: ex.items + 1 })
                    })

                    return <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                          ['Total Direct Cost', money(projectDC), '#1565c0'],
                          ['Total Overhead', money(projectOH), '#e65100'],
                          ['Total Profit', money(projectPR), '#2e7d32'],
                          ['Project Tender Price', money(projectTotal), '#1a6b4a'],
                        ].map(([l,v,c]) => (
                          <div key={l} style={{ background: '#fff', border: `2px solid ${c}`, borderRadius: 10, padding: '14px 18px' }}>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>{l}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {clientBudget > 0 && (
                        <div style={{ marginBottom: 20, padding: '12px 18px', background: projectTotal <= clientBudget ? '#e8f5e9' : '#ffebee', borderRadius: 10, display: 'flex', gap: 40, fontSize: 14 }}>
                          <span>Client Budget: <b>{money(clientBudget)}</b></span>
                          <span>Our Price: <b>{money(projectTotal)}</b></span>
                          <span>Difference: <b style={{ color: projectTotal <= clientBudget ? '#2e7d32' : '#c62828' }}>{money(clientBudget - projectTotal)}</b></span>
                          <span>Margin: <b style={{ color: projectTotal <= clientBudget ? '#2e7d32' : '#c62828' }}>{clientBudget > 0 ? (((clientBudget - projectTotal) / clientBudget) * 100).toFixed(1) : 0}%</b></span>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Card title="Cost Breakdown by Category">
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ background: '#f5f5f5' }}>{['Category','Total','% of Direct Cost'].map(h=><th key={h} style={{ padding: '7px 10px', textAlign:'left', borderBottom:'2px solid #ddd' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {byCat.map(({ cat, total, pct }) => (
                                <tr key={cat} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '7px 10px' }}><span style={{ background: CAT_BG[cat], color: CAT_COLOR[cat], padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{cat}</span></td>
                                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{money(total)}</td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <div style={{ height: 8, width: `${Math.min(pct, 100)}%`, background: CAT_COLOR[cat], borderRadius: 4, minWidth: 4 }} />
                                      <span>{pct.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Card>
                        <Card title="Top Resources Across Project">
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ background: '#f5f5f5' }}>{['Resource','Category','Total Cost','BOQ Items'].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:'left', borderBottom:'2px solid #ddd' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {Array.from(byDesc.entries()).sort((a,b) => b[1].total - a[1].total).slice(0,15).map(([desc, val]) => (
                                <tr key={desc} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '7px 10px' }}>{desc}</td>
                                  <td style={{ padding: '7px 10px' }}><span style={{ background: CAT_BG[val.cat]??'#eee', color: CAT_COLOR[val.cat]??'#333', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{val.cat}</span></td>
                                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{money(val.total)}</td>
                                  <td style={{ padding: '7px 10px', color: '#888' }}>{val.items}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Card>
                      </div>
                    </>
                  })()}
                </>
              })()}
            </>
          )}


          {/* ══ FINANCE VIEW ══ */}
          {activeView === 'finance' && (() => {
            const RECORD_TYPES = ['Payment','Receipt','Retention Release','Advance Payment','Deduction','Penalty','Refund','Other']
            const METHODS = ['Transfer','Cheque','Cash','Bank Draft','Letter of Credit']
            const CC_TYPES = ['Subcontractor','Material','Equipment','Labor','Overhead','Variation','Retention','Other']
            const typeColor: Record<string,{bg:string;fg:string}> = {
              'Payment':{bg:'#e3f2fd',fg:'#1565c0'},'Receipt':{bg:'#e8f5e9',fg:'#2e7d32'},
              'Retention Release':{bg:'#f3e5f5',fg:'#7b1fa2'},'Advance Payment':{bg:'#fff3e0',fg:'#e65100'},
              'Deduction':{bg:'#ffebee',fg:'#c62828'},'Penalty':{bg:'#ffebee',fg:'#c62828'},
              'Refund':{bg:'#e8f5e9',fg:'#2e7d32'},'Other':{bg:'#f5f5f5',fg:'#555'},
            }
            const methodColor: Record<string,{bg:string;fg:string}> = {
              'Transfer':{bg:'#e3f2fd',fg:'#1565c0'},'Cheque':{bg:'#fff3e0',fg:'#e65100'},
              'Cash':{bg:'#e8f5e9',fg:'#2e7d32'},'Bank Draft':{bg:'#f3e5f5',fg:'#7b1fa2'},
              'Letter of Credit':{bg:'#fce4ec',fg:'#c2185b'},
            }
            const ccTypeColor: Record<string,string> = {
              'Subcontractor':'#1565c0','Material':'#e65100','Equipment':'#6a1b9a',
              'Labor':'#2e7d32','Overhead':'#555','Variation':'#c62828','Retention':'#7b1fa2','Other':'#888',
            }
            const subPaymentMap = new Map<string,number>()
            financeRecords.filter((r:any)=>r.record_type==='Payment'&&r.subcontractor_id).forEach((r:any)=>{
              subPaymentMap.set(r.subcontractor_id,(subPaymentMap.get(r.subcontractor_id)||0)+Number(r.amount||0))
            })
            const totalPayments = financeRecords.filter((r:any)=>r.record_type==='Payment').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
            const totalReceipts = financeRecords.filter((r:any)=>r.record_type==='Receipt').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
            const totalRetention = financeRecords.filter((r:any)=>r.record_type==='Retention Release').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
            const totalAdvances = financeRecords.filter((r:any)=>r.record_type==='Advance Payment').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
            const totalDeductionsFinance = financeRecords.filter((r:any)=>['Deduction','Penalty'].includes(r.record_type)).reduce((s:number,r:any)=>s+Number(r.amount||0),0)
            const isDeductionRecordType = (type: string) => ['Deduction','Penalty'].includes(type)
            const amountDirection = (type: string) => ['Receipt','Refund','Retention Release'].includes(type) ? 'debit' : 'credit'
            const financeDebit = (r:any) => amountDirection(r.record_type) === 'debit' ? Number(r.amount||0) : 0
            const financeCredit = (r:any) => amountDirection(r.record_type) === 'credit' ? Number(r.amount||0) : 0
            const filtered = financeRecords.filter((r:any)=>{
              if(financeFilter.type&&r.record_type!==financeFilter.type)return false
              if(financeFilter.subId&&r.subcontractor_id!==financeFilter.subId)return false
              if(financeFilter.invoiceId&&r.invoice_id!==financeFilter.invoiceId)return false
              if(financeFilter.from&&r.payment_date<financeFilter.from)return false
              if(financeFilter.to&&r.payment_date>financeFilter.to)return false
              if(financeFilter.costCenterId&&r.cost_center_id!==financeFilter.costCenterId)return false
              if(financeFilter.status&&r.status!==financeFilter.status)return false
              if(financeFilter.method&&r.payment_method!==financeFilter.method)return false
              if(financeFilter.direction&&amountDirection(r.record_type)!==financeFilter.direction)return false
              const q=String(financeFilter.search??'').toLowerCase()
              if(q&&![r.description,r.notes,r.reference,r.invoice_no,r.payment_voucher_no,r.receipt_voucher_no,r.cheque_no,r.payee_name,(r.subcontractors as any)?.name,(r.subcontractors as any)?.subcontractor_code].some((x:any)=>String(x??'').toLowerCase().includes(q)))return false
              return true
            })
            const KPICard=({label,value,color,icon,sub}:{label:string;value:string;color:string;icon:string;sub?:string})=>(
              <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:12,padding:'16px 20px',borderLeft:`4px solid ${color}`}}>
                <div style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>{icon} {label}</div>
                <div style={{fontSize:20,fontWeight:800,color:'#111'}}>{value}</div>
                {sub&&<div style={{fontSize:11,color:'#aaa',marginTop:3}}>{sub}</div>}
              </div>
            )
            return (
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:12}}>
                  <div>
                    <div style={{fontSize:22,fontWeight:800,color:'#111'}}>Finance</div>
                    <div style={{fontSize:13,color:'#888',marginTop:2}}>{activeProject?.project_name??'—'} · سجل المعاملات المالية</div>
                  </div>
                  <Button onClick={()=>setFinanceTab('add')}>+ Add Finance Record</Button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:22}}>
                  <KPICard label="Payments Out" value={money(totalPayments)} color="#1565c0" icon="💸" sub={`${financeRecords.filter((r:any)=>r.record_type==='Payment').length} records`}/>
                  <KPICard label="Receipts In" value={money(totalReceipts)} color="#2e7d32" icon="💰"/>
                  <KPICard label="Retention Released" value={money(totalRetention)} color="#7b1fa2" icon="🔓"/>
                  <KPICard label="Advances Paid" value={money(totalAdvances)} color="#e65100" icon="⬆️"/>
                  <KPICard label="Deductions / Penalties" value={money(totalDeductionsFinance)} color="#c62828" icon="⚠️"/>
                  <KPICard label="Cost Centers" value={String(costCenters.length)} color="#0d5c35" icon="🏷️" sub="active codes"/>
                </div>
                <div style={{display:'flex',gap:4,marginBottom:20,background:'#f5f5f0',borderRadius:10,padding:4,overflowX:'auto'}}>
                  {([['payments','💳 Payment Register'],['all','📋 All Records'],['reports','📊 Reports'],['subregister','👷 Subcontractor Register'],['costcenters','🏷️ Cost Centers'],['add','➕ Add Record']] as [string,string][]).map(([id,label])=>(
                    <button key={id} onClick={()=>setFinanceTab(id as any)} style={{padding:'8px 18px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:700,fontSize:13,whiteSpace:'nowrap',background:financeTab===id?'#0d47a1':'transparent',color:financeTab===id?'#fff':'#555'}}>{label}</button>
                  ))}
                </div>

                {/* PAYMENT REGISTER TAB */}
                {financeTab==='payments'&&(()=>{
                  const payments=financeRecords.filter((r:any)=>r.record_type==='Payment')
                  const totalPay=payments.reduce((s:number,r:any)=>s+Number(r.amount||0),0)
                  return (
                    <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,overflow:'hidden'}}>
                      <div style={{background:'#0d47a1',color:'#fff',padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{fontWeight:800,fontSize:14}}>💳 Payment Register / سجل المدفوعات</div>
                        <div style={{fontSize:12,opacity:0.85}}>{payments.length} payments · Total: <strong>{money(totalPay)}</strong></div>
                      </div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead><tr style={{background:'#e8edf7'}}>
                            {['#','Date','Subcontractor','Invoice','Final Payable','Paid Amount','Method','Reference','Bank','Cost Center','Notes','Status','⋮'].map(h=>(
                              <th key={h} style={{padding:'9px 10px',textAlign:'left',fontWeight:700,color:'#0d47a1',fontSize:10,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'2px solid #c5d2f0'}}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {payments.length===0?(
                              <tr><td colSpan={13} style={{padding:'32px',textAlign:'center',color:'#aaa'}}>No payments yet. Record payments from invoice breakdown or add one above.</td></tr>
                            ):payments.map((r:any,idx:number)=>{
                              const mc=methodColor[r.payment_method]??{bg:'#f5f5f5',fg:'#555'}
                              const cc=costCenters.find((c:any)=>c.id===r.cost_center_id) as any
                              return (
                                <tr key={r.id} style={{borderBottom:'1px solid #f0f4ff',background:idx%2===0?'#fff':'#fafbff'}}>
                                  <td style={{padding:'9px 10px',color:'#bbb',fontSize:11}}>{idx+1}</td>
                                  <td style={{padding:'9px 10px',fontWeight:600,whiteSpace:'nowrap'}}>{r.payment_date}</td>
                                  <td style={{padding:'9px 10px',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:600}}>{(r.subcontractors as any)?.name??'—'}</td>
                                  <td style={{padding:'9px 10px',fontFamily:'monospace',fontSize:11,color:'#555'}}>{r.invoice_no??'—'}</td>
                                  <td style={{padding:'9px 10px',fontFamily:'monospace',fontSize:11,color:'#888'}}>{r.final_payable?money(r.final_payable):'—'}</td>
                                  <td style={{padding:'9px 10px',fontWeight:900,fontFamily:'monospace',fontSize:13,color:'#0d47a1',whiteSpace:'nowrap'}}>{money(r.amount)}</td>
                                  <td style={{padding:'9px 10px'}}><span style={{background:mc.bg,color:mc.fg,padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{r.payment_method}</span></td>
                                  <td style={{padding:'9px 10px',fontFamily:'monospace',fontSize:11,color:'#555'}}>{r.reference||'—'}</td>
                                  <td style={{padding:'9px 10px',color:'#888',fontSize:11}}>{r.bank_name||'—'}</td>
                                  <td style={{padding:'9px 10px'}}>{cc?<span style={{background:'#e8f5e9',color:'#2e7d32',padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{cc.code}</span>:<span style={{color:'#ccc'}}>—</span>}</td>
                                  <td style={{padding:'9px 10px',color:'#888',fontSize:11,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                                  <td style={{padding:'9px 10px'}}><span style={{background:r.status==='Confirmed'?'#e8f5e9':r.status==='Pending'?'#fff3e0':'#ffebee',color:r.status==='Confirmed'?'#2e7d32':r.status==='Pending'?'#e65100':'#c62828',padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{r.status}</span></td>
                                  <td style={{padding:'9px 10px'}}><Button tone="danger" onClick={()=>{if(confirm('Delete?'))run('Delete',()=>deleteFinanceRecord.mutateAsync({id:r.id,projectId:projectId!,invoiceId:r.invoice_id}))}}>✕</Button></td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {payments.length>0&&<tfoot><tr style={{background:'#0d47a1',color:'#fff'}}>
                            <td colSpan={5} style={{padding:'10px 12px',fontWeight:800}}>TOTAL PAYMENTS ({payments.length})</td>
                            <td style={{padding:'10px 12px',fontWeight:900,fontSize:15,fontFamily:'monospace'}}>{money(totalPay)}</td>
                            <td colSpan={7}/>
                          </tr></tfoot>}
                        </table>
                      </div>
                    </div>
                  )
                })()}

                {/* SUBCONTRACTOR REGISTER TAB — invoice-level linking */}
                {(financeTab as string)==='subregister'&&(()=>{
                  // Match payments by invoice_id, then by invoice_no, then unlinked by sub
                  const invPaidMap = new Map<string, number>()
                  const invNoPaidMap = new Map<string, number>()
                  const subUnlinkedPaidMap = new Map<string, number>()
                  financeRecords.filter((r:any) => r.record_type === 'Payment').forEach((r:any) => {
                    if (r.invoice_id) {
                      invPaidMap.set(r.invoice_id, (invPaidMap.get(r.invoice_id)||0) + Number(r.amount||0))
                    } else if (r.invoice_no) {
                      invNoPaidMap.set(r.invoice_no, (invNoPaidMap.get(r.invoice_no)||0) + Number(r.amount||0))
                    } else if (r.subcontractor_id) {
                      subUnlinkedPaidMap.set(r.subcontractor_id, (subUnlinkedPaidMap.get(r.subcontractor_id)||0) + Number(r.amount||0))
                    }
                  })
                  const getInvPaid = (inv: any) =>
                    (invPaidMap.get(inv.id)||0) + (invNoPaidMap.get(inv.invoice_no)||0)
                  const grandTotalFP = certificates.reduce((s:number,c:any)=>s+Number(c.net_amount||0),0)
                  const grandTotalPaid = financeRecords.filter((r:any)=>r.record_type==='Payment').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
                  return (
                    <div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
                        {[
                          {label:'Total Final Payable',value:money(grandTotalFP),color:'#0d5c35'},
                          {label:'Total Paid / المدفوع',value:money(grandTotalPaid),color:'#0d47a1'},
                          {label:'Total Outstanding',value:money(grandTotalFP-grandTotalPaid),color:grandTotalFP-grandTotalPaid>0.01?'#c62828':'#2e7d32'},
                        ].map(x=>(
                          <div key={x.label} style={{background:'#fff',borderLeft:`4px solid ${x.color}`,border:`1px solid ${x.color}30`,borderRadius:12,padding:'14px 18px'}}>
                            <div style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>{x.label}</div>
                            <div style={{fontSize:20,fontWeight:900,color:x.color}}>{x.value}</div>
                          </div>
                        ))}
                      </div>
                      {subcontractors.map((s) => {
                        const subInvs = certificates.filter((c:any) => c.subcontractor_id === s.id)
                        const subFP = subInvs.reduce((sum:number,c:any)=>sum+Number(c.net_amount||0),0)
                        const subPaidLinked = subInvs.reduce((sum:number,c:any)=>sum+getInvPaid(c),0)
                        const subPaidUnlinked = subUnlinkedPaidMap.get(s.id)||0
                        const subTotalPaid = subPaidLinked + subPaidUnlinked
                        const subOutstanding = subFP - subTotalPaid
                        const isSubExpanded = expandedSubId === s.id
                        if (!subInvs.length && !subTotalPaid) return null
                        return (
                          <div key={s.id} style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,overflow:'hidden',marginBottom:16}}>
                            <div style={{background:'#1a6b4a',color:'#fff',padding:'12px 18px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}
                              onClick={()=>setExpandedSubId(isSubExpanded?null:s.id)}>
                              <div style={{display:'flex',alignItems:'center',gap:12}}>
                                <span style={{fontSize:16}}>{isSubExpanded?'▾':'▸'}</span>
                                <div>
                                  <div style={{fontWeight:800,fontSize:14}}>{s.name}</div>
                                  <div style={{fontSize:11,opacity:0.75}}>{s.subcontractor_code} · {subInvs.length} invoices</div>
                                </div>
                              </div>
                              <div style={{display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
                                <div style={{textAlign:'right'}}><div style={{fontSize:10,opacity:0.7}}>Final Payable</div><div style={{fontWeight:700,fontSize:14}}>{money(subFP)}</div></div>
                                <div style={{textAlign:'right'}}><div style={{fontSize:10,opacity:0.7}}>Paid</div><div style={{fontWeight:700,fontSize:14,color:'#90caf9'}}>{money(subTotalPaid)}</div></div>
                                <div style={{textAlign:'right',minWidth:120}}><div style={{fontSize:10,opacity:0.7}}>Outstanding</div><div style={{fontWeight:800,fontSize:15,color:subOutstanding>0.01?'#ef9a9a':'#a5d6a7'}}>{subOutstanding>0.01?money(subOutstanding):'✓ Cleared'}</div></div>
                                <button onClick={(e:any)=>{e.stopPropagation();setFinanceForm({...financeForm,subcontractor_id:s.id,record_type:'Payment',invoice_id:'',amount:String(Math.max(0,Math.round(subOutstanding*100)/100))});setFinanceTab('add')}}
                                  style={{background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.5)',color:'#fff',fontWeight:700,fontSize:12,padding:'5px 14px',borderRadius:8,cursor:'pointer',whiteSpace:'nowrap'}}>
                                  + Pay
                                </button>
                              </div>
                            </div>
                            {isSubExpanded && (
                              <div>
                                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                                  <thead><tr style={{background:'#f0f7f0'}}>
                                    {['Invoice No','Period End','Status','Gross','Final Payable','Paid (Finance)','Outstanding','Payments','Action'].map(h=>(
                                      <th key={h} style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:'#0d5c35',fontSize:10,textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap',borderBottom:'1px solid #c8e6c9'}}>{h}</th>
                                    ))}</tr>
                                  </thead>
                                  <tbody>
                                    {subInvs.map((inv:any,idx:number)=>{
                                      const invPaid = getInvPaid(inv)
                                      const invFP = Number(inv.net_amount||0)
                                      const invOutstanding = invFP - invPaid
                                      const invPayments = financeRecords.filter((r:any)=>
                                        r.record_type==='Payment'&&(
                                          (r.invoice_id&&r.invoice_id===inv.id)||
                                          (!r.invoice_id&&r.invoice_no&&r.invoice_no===inv.invoice_no)
                                        )
                                      )
                                      const isInvExpanded = expandedInvId === inv.id
                                      const sc = inv.status==='Paid'?{bg:'#e8f5e9',fg:'#2e7d32'}:inv.status==='Approved'?{bg:'#e3f2fd',fg:'#1565c0'}:{bg:'#f5f5f5',fg:'#666'}
                                      return (
                                        <>
                                          <tr key={inv.id} style={{borderBottom:'1px solid #f0f7f0',background:idx%2===0?'#fff':'#fafffe'}}>
                                            <td style={{padding:'10px 12px',fontWeight:700,fontFamily:'monospace',color:'#0d5c35'}}>{inv.invoice_no}</td>
                                            <td style={{padding:'10px 12px',color:'#666',whiteSpace:'nowrap'}}>{inv.period_end??'—'}</td>
                                            <td style={{padding:'10px 12px'}}><span style={{background:sc.bg,color:sc.fg,padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>{inv.status}</span></td>
                                            <td style={{padding:'10px 12px',fontFamily:'monospace',color:'#555'}}>{money(inv.gross_amount||0)}</td>
                                            <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:700,color:'#0d5c35'}}>{money(invFP)}</td>
                                            <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:800,color:invPaid>0?'#0d47a1':'#aaa'}}>{invPaid>0?money(invPaid):'—'}</td>
                                            <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:800,color:invOutstanding>0.01?'#c62828':'#2e7d32'}}>{invOutstanding>0.01?money(invOutstanding):'✓'}</td>
                                            <td style={{padding:'10px 12px',textAlign:'center'}}>
                                              {invPayments.length>0
                                                ? <button onClick={()=>setExpandedInvId(isInvExpanded?null:inv.id)} style={{background:'#e3f2fd',color:'#1565c0',border:'none',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>{invPayments.length} {isInvExpanded?'▴':'▾'}</button>
                                                : <span style={{color:'#ccc',fontSize:11}}>—</span>}
                                            </td>
                                            <td style={{padding:'10px 12px'}}>
                                              <button onClick={()=>{setFinanceForm({...financeForm,subcontractor_id:s.id,invoice_id:inv.id,record_type:'Payment',amount:String(Math.max(0,Math.round(invOutstanding*100)/100))} as any);setFinanceTab('add')}}
                                                style={{background:'#0d5c35',color:'#fff',border:'none',borderRadius:6,padding:'4px 12px',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                                                + Pay
                                              </button>
                                            </td>
                                          </tr>
                                          {isInvExpanded && invPayments.length>0&&(
                                            <tr key={'pay-'+inv.id}>
                                              <td colSpan={9} style={{padding:0,background:'#f0f7ff'}}>
                                                <div style={{padding:'10px 24px 14px'}}>
                                                  <div style={{fontSize:11,fontWeight:700,color:'#1565c0',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Payment history — {inv.invoice_no}</div>
                                                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                                                    <thead><tr style={{background:'#e3f2fd'}}>
                                                      {['Date','Amount','Method','Reference','Bank','Notes','Linked?','⋮'].map(h=>(
                                                        <th key={h} style={{padding:'5px 8px',textAlign:'left',fontWeight:700,color:'#1565c0',fontSize:10,textTransform:'uppercase'}}>{h}</th>
                                                      ))}</tr>
                                                    </thead>
                                                    <tbody>
                                                      {invPayments.map((p:any,pi:number)=>{
                                                        const mc=methodColor[p.payment_method]??{bg:'#f5f5f5',fg:'#555'}
                                                        const isLinked=!!p.invoice_id
                                                        return <tr key={p.id} style={{borderBottom:'1px solid #e3f2fd',background:pi%2===0?'#fff':'#f8fbff'}}>
                                                          <td style={{padding:'6px 8px',fontWeight:600,whiteSpace:'nowrap'}}>{p.payment_date}</td>
                                                          <td style={{padding:'6px 8px',fontWeight:800,fontFamily:'monospace',color:'#0d47a1'}}>{money(p.amount)}</td>
                                                          <td style={{padding:'6px 8px'}}><span style={{background:mc.bg,color:mc.fg,padding:'1px 6px',borderRadius:20,fontSize:10,fontWeight:700}}>{p.payment_method}</span></td>
                                                          <td style={{padding:'6px 8px',fontFamily:'monospace',color:'#555'}}>{p.reference||'—'}</td>
                                                          <td style={{padding:'6px 8px',color:'#888'}}>{p.bank_name||'—'}</td>
                                                          <td style={{padding:'6px 8px',color:'#888',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.notes||'—'}</td>
                                                          <td style={{padding:'6px 8px'}}>
                                                            {isLinked
                                                              ? <span style={{background:'#e8f5e9',color:'#2e7d32',padding:'1px 6px',borderRadius:20,fontSize:10,fontWeight:700}}>✓ Linked</span>
                                                              : <button onClick={async()=>{if(confirm(`Link this payment to ${inv.invoice_no}?`)){await run('Link',()=>updateFinanceRecord.mutateAsync({id:p.id,data:{invoice_id:inv.id,invoice_no:inv.invoice_no}}))}}}
                                                                  style={{background:'#fff3e0',color:'#e65100',border:'1px solid #ffcc80',borderRadius:20,padding:'1px 8px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
                                                                  ⚠ Unlinked — Link
                                                                </button>
                                                            }
                                                          </td>
                                                          <td style={{padding:'6px 8px'}}><Button tone="danger" onClick={()=>{if(confirm('Delete?'))run('Delete',()=>deleteFinanceRecord.mutateAsync({id:p.id,projectId:projectId!,invoiceId:inv.id}))}}>✕</Button></td>
                                                        </tr>
                                                      })}
                                                    </tbody>
                                                    <tfoot><tr style={{background:'#1565c0',color:'#fff'}}>
                                                      <td style={{padding:'6px 8px',fontWeight:700}}>Total Paid</td>
                                                      <td style={{padding:'6px 8px',fontWeight:900,fontFamily:'monospace'}}>{money(invPaid)}</td>
                                                      <td colSpan={6}/>
                                                    </tr></tfoot>
                                                  </table>
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </>
                                      )
                                    })}
                                  </tbody>
                                </table>
                                {subPaidUnlinked>0&&(
                                  <div style={{padding:'10px 16px',background:'#fff8e1',borderTop:'1px solid #ffe082',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                    <span style={{fontSize:12,color:'#e65100',fontWeight:600}}>⚠ Payments with no invoice linked — go to Finance → All Records to link them</span>
                                    <span style={{fontFamily:'monospace',fontWeight:800,color:'#e65100'}}>{money(subPaidUnlinked)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* COST CENTERS TAB */}
                {financeTab==='costcenters'&&(
                  <>
                    <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,padding:'20px 24px',marginBottom:20}}>
                      <div style={{fontWeight:700,fontSize:14,color:'#0d5c35',marginBottom:16}}>🏷️ Add Cost Center / Cost Code</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14}}>
                        <Field label="Code *"><Input value={ccForm.code} onChange={e=>setCcForm({...ccForm,code:e.target.value})} placeholder="SC-001, MAT-002" /></Field>
                        <Field label="Name EN *"><Input value={ccForm.name} onChange={e=>setCcForm({...ccForm,name:e.target.value})} placeholder="Structural Works" /></Field>
                        <Field label="Name AR"><Input value={ccForm.name_ar} onChange={e=>setCcForm({...ccForm,name_ar:e.target.value})} placeholder="أعمال الهيكل" /></Field>
                        <Field label="Type"><Select value={ccForm.type} onChange={e=>setCcForm({...ccForm,type:e.target.value})}>{CC_TYPES.map(t=><option key={t}>{t}</option>)}</Select></Field>
                        <Field label="Budget (EGP)"><Input type="number" value={ccForm.budget} onChange={e=>setCcForm({...ccForm,budget:e.target.value})} placeholder="0" /></Field>
                        <Field label="Notes"><Input value={ccForm.notes} onChange={e=>setCcForm({...ccForm,notes:e.target.value})} /></Field>
                      </div>
                      <div style={{marginTop:14}}>
                        <Button disabled={addCostCenter.isPending||!ccForm.code||!ccForm.name} onClick={async()=>{
                          if(!projectId||!ccForm.code||!ccForm.name)return
                          await run('Cost center',()=>addCostCenter.mutateAsync({project_id:projectId,code:ccForm.code,name:ccForm.name,name_ar:ccForm.name_ar||undefined,type:ccForm.type,budget:parseFloat(ccForm.budget)||0,notes:ccForm.notes||undefined}))
                          setCcForm({code:'',name:'',name_ar:'',type:'Subcontractor',budget:'',notes:''})
                        }}>{addCostCenter.isPending?'Saving...':'💾 Add Cost Center'}</Button>
                      </div>
                    </div>
                    <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,overflow:'hidden'}}>
                      <div style={{padding:'14px 20px',borderBottom:'1px solid #f0f0ea',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{fontWeight:700,fontSize:14}}>Cost Centers / Cost Codes</div>
                        <div style={{fontSize:12,color:'#888'}}>{costCenters.length} codes</div>
                      </div>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr style={{background:'#f8f8f4'}}>
                          {['Code','Name EN','Name AR','Type','Budget','Actual Spent','Remaining','Actions'].map(h=>(
                            <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:'#666',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #e8e8e0'}}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {costCenters.length===0?<tr><td colSpan={9} style={{padding:'32px',textAlign:'center',color:'#aaa'}}>No cost centers yet.</td></tr>:
                          costCenters.map((cc:any,idx:number)=>{
                            const actualSpent=financeRecords.filter((r:any)=>r.cost_center_id===cc.id).reduce((s:number,r:any)=>s+Number(r.amount||0),0)
                            const budget=Number(cc.budget||0)
                            const remaining=budget-actualSpent
                            const isEditing=editingCcId===cc.id
                            return <tr key={cc.id} style={{borderBottom:'1px solid #f4f4f0',background:idx%2===0?'#fff':'#fafaf8'}}>
                              {isEditing?(
                                <>
                                  <td style={{padding:'6px 8px'}}><Input value={editCcForm.code??cc.code} onChange={e=>setEditCcForm({...editCcForm,code:e.target.value})} style={{width:90}}/></td>
                                  <td style={{padding:'6px 8px'}}><Input value={editCcForm.name??cc.name} onChange={e=>setEditCcForm({...editCcForm,name:e.target.value})}/></td>
                                  <td style={{padding:'6px 8px'}}><Input value={editCcForm.name_ar??cc.name_ar??''} onChange={e=>setEditCcForm({...editCcForm,name_ar:e.target.value})}/></td>
                                  <td style={{padding:'6px 8px'}}><Select value={editCcForm.type??cc.type} onChange={e=>setEditCcForm({...editCcForm,type:e.target.value})}>{CC_TYPES.map(t=><option key={t}>{t}</option>)}</Select></td>
                                  <td style={{padding:'6px 8px'}}><Input type="number" value={editCcForm.budget??cc.budget??0} onChange={e=>setEditCcForm({...editCcForm,budget:e.target.value})} style={{width:100}}/></td>
                                  <td colSpan={2} style={{padding:'6px 8px',color:'#aaa',fontSize:11}}>—</td>
                                  <td style={{padding:'6px 8px',display:'flex',gap:4}}>
                                    <Button onClick={async()=>{await run('Update',()=>updateCostCenter.mutateAsync({id:cc.id,data:{...editCcForm,budget:parseFloat(editCcForm.budget)||0}}));setEditingCcId(null)}}>Save</Button>
                                    <Button tone="secondary" onClick={()=>setEditingCcId(null)}>Cancel</Button>
                                  </td>
                                </>
                              ):(
                                <>
                                  <td style={{padding:'9px 12px',fontWeight:800,fontFamily:'monospace',color:'#0d5c35'}}>{cc.code}</td>
                                  <td style={{padding:'9px 12px',fontWeight:600}}>{cc.name}</td>
                                  <td style={{padding:'9px 12px',direction:'rtl',color:'#555'}}>{cc.name_ar||'—'}</td>
                                  <td style={{padding:'9px 12px'}}><span style={{background:'#e8f5e9',color:ccTypeColor[cc.type]??'#555',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>{cc.type}</span></td>
                                  <td style={{padding:'9px 12px',fontFamily:'monospace',color:'#555'}}>{budget>0?money(budget):'—'}</td>
                                  <td style={{padding:'9px 12px',fontFamily:'monospace',fontWeight:700,color:'#0d47a1'}}>{money(actualSpent)}</td>
                                  <td style={{padding:'9px 12px',fontFamily:'monospace',fontWeight:700,color:budget>0?(remaining<0?'#c62828':'#2e7d32'):'#aaa'}}>{budget>0?money(remaining):'—'}</td>
                                  <td style={{padding:'9px 12px',display:'flex',gap:4}}>
                                    <Button tone="secondary" onClick={()=>{setEditingCcId(cc.id);setEditCcForm({code:cc.code,name:cc.name,name_ar:cc.name_ar??'',type:cc.type,budget:cc.budget??0})}}>✏️</Button>
                                    <Button tone="danger" onClick={()=>{if(confirm('Delete?'))run('Delete',()=>deleteCostCenter.mutateAsync({id:cc.id,projectId:projectId!}))}}>✕</Button>
                                  </td>
                                </>
                              )}
                            </tr>
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* ALL RECORDS TAB */}
                {financeTab==='all'&&(
                  <>
                    <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:12,padding:'14px 18px',marginBottom:16,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,alignItems:'center'}}>
                      <Select value={financeFilter.type} onChange={e=>setFinanceFilter({...financeFilter,type:e.target.value})}>
                        <option value="">All Types</option>{RECORD_TYPES.map(t=><option key={t}>{t}</option>)}
                      </Select>
                      <Select value={financeFilter.subId} onChange={e=>setFinanceFilter({...financeFilter,subId:e.target.value})}>
                        <option value="">All Subcontractors</option>{subcontractors.map(s=><option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                      </Select>
                      <Select value={financeFilter.invoiceId} onChange={e=>setFinanceFilter({...financeFilter,invoiceId:e.target.value})}>
                        <option value="">All Subcontractor Invoices</option>{certificates.filter(isFinanceEligibleInvoice).map((c:any)=><option key={c.id} value={c.id}>{c.invoice_no} — {(c.subcontractors as any)?.name??''}</option>)}
                      </Select>
                      <Select value={financeFilter.costCenterId} onChange={e=>setFinanceFilter({...financeFilter,costCenterId:e.target.value})}>
                        <option value="">All Cost Centers</option>{costCenters.map((c:any)=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                      </Select>
                      <Select value={financeFilter.status} onChange={e=>setFinanceFilter({...financeFilter,status:e.target.value})}><option value="">All Status</option><option>Draft</option><option>Pending</option><option>Reviewed</option><option>Confirmed</option><option>Posted</option><option>Cancelled</option></Select>
                      <Select value={financeFilter.method} onChange={e=>setFinanceFilter({...financeFilter,method:e.target.value})}><option value="">All Methods</option>{METHODS.map(m=><option key={m}>{m}</option>)}</Select>
                      <Select value={financeFilter.direction} onChange={e=>setFinanceFilter({...financeFilter,direction:e.target.value})}><option value="">Debit + Credit</option><option value="debit">Debit only</option><option value="credit">Credit only</option></Select>
                      <Input value={financeFilter.search} onChange={e=>setFinanceFilter({...financeFilter,search:e.target.value})} placeholder="Search reference / voucher / statement" />
                      <div style={{display:'flex',gap:8,alignItems:'center'}}><Input type="date" value={financeFilter.from} onChange={e=>setFinanceFilter({...financeFilter,from:e.target.value})}/><span style={{color:'#aaa',fontSize:12}}>→</span><Input type="date" value={financeFilter.to} onChange={e=>setFinanceFilter({...financeFilter,to:e.target.value})}/></div>
                      <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
                        <Button tone="secondary" onClick={()=>setFinanceFilter({type:'',subId:'',invoiceId:'',from:'',to:'',costCenterId:'',status:'',method:'',direction:'',search:''})}>Clear</Button>
                        <Button tone="secondary" onClick={()=>{
                          const heads=['Date','Type','Subcontractor','Certificate','Statement','Cost Center','Debit','Credit','Method','Reference','Status']
                          const rows=filtered.map((r:any)=>[r.payment_date,r.record_type,(r.subcontractors as any)?.name??'',r.invoice_no??'',r.description||r.notes||'',costCenters.find((c:any)=>c.id===r.cost_center_id)?.code??'',financeDebit(r),financeCredit(r),r.payment_method,r.reference,r.status])
                          downloadCsvFile('finance-report.csv',[heads,...rows])
                        }}>⬇ CSV</Button>
                        <Button tone="secondary" onClick={()=>exportFinanceExcel(filtered)}>⬇ Excel</Button>
                        <Button tone="secondary" onClick={downloadFinanceTemplateExcel}>Excel Template</Button>
                        <label style={{cursor:'pointer'}}>
                          <span style={{padding:'8px 14px',background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:8,fontSize:13,fontWeight:800,color:'#2e7d32',display:'inline-block'}}>⬆ Import Excel</span>
                          <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={async(e)=>{const file=e.target.files?.[0]; if(file) await importFinanceExcel(file); e.currentTarget.value=''}} />
                        </label>
                        <Button onClick={()=>{
                          const heads=['Date','Type','Subcontractor','Certificate','Statement','Cost Center','Debit','Credit','Method','Reference','Status']
                          const rows=filtered.map((r:any)=>[r.payment_date,r.record_type,(r.subcontractors as any)?.name??'—',r.invoice_no??'—',r.description||r.notes||'—',costCenters.find((c:any)=>c.id===r.cost_center_id)?.code??'—',financeDebit(r)?money(financeDebit(r)):'—',financeCredit(r)?money(financeCredit(r)):'—',r.payment_method,r.reference||'—',r.status])
                          printProfessionalTableReport('Finance Accounting Report',[`Project: ${activeProject?.project_name??'—'}`,`Period: ${financeFilter.from||'Start'} → ${financeFilter.to||'Today'}`,`Generated: ${new Date().toLocaleString()}`],[{label:'Debit',value:money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0))},{label:'Credit',value:money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0))},{label:'Net',value:money(filtered.reduce((s:number,r:any)=>s+financeDebit(r)-financeCredit(r),0))},{label:'Records',value:String(filtered.length)}],heads,rows,['TOTAL','','','','','',money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0)),money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0)),'','',''])
                        }}>📄 PDF / Print</Button>
                        <span style={{fontSize:12,color:'#888'}}>{filtered.length} records · {money(filtered.reduce((s:number,r:any)=>s+Number(r.amount||0),0))}</span>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginBottom:16}}>
                      <KPICard label="Total Debit / مدين" value={money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0))} color="#2e7d32" icon="↙️" sub="Receipts / refunds"/>
                      <KPICard label="Total Credit / دائن" value={money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0))} color="#c62828" icon="↗️" sub="Payments / deductions"/>
                      <KPICard label="Subcontractor Deductions" value={money(filtered.filter((r:any)=>isDeductionRecordType(r.record_type)&&r.subcontractor_id).reduce((s:number,r:any)=>s+Number(r.amount||0),0))} color="#e65100" icon="⚠️" sub="Auto affects certificates"/>
                      <KPICard label="Unlinked Deductions" value={String(filtered.filter((r:any)=>isDeductionRecordType(r.record_type)&&!r.subcontractor_id).length)} color="#777" icon="🔗" sub="Need contractor link"/>
                    </div>
                    <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,overflow:'hidden'}}>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1500}}>
                          <thead><tr style={{background:'#f8f8f4'}}>
                            {['#','Date','Receipt No','Payment No','Cheque','Type','Statement / بيان','Payee / المستفيد','Subcontractor Link','Certificate Link','Accounting Direction','Cost Center','Debit','Credit','Method','Reference','Status','⋮'].map(h=><th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'#666',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap',borderBottom:'1px solid #e8e8e0'}}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {filtered.length===0?<tr><td colSpan={18} style={{padding:'32px',textAlign:'center',color:'#aaa'}}>No records found.</td></tr>:
                            filtered.map((r:any,idx:number)=>{
                              const tc=typeColor[r.record_type]??{bg:'#f5f5f5',fg:'#555'}
                              const mc=methodColor[r.payment_method]??{bg:'#f5f5f5',fg:'#555'}
                              const cc=costCenters.find((c:any)=>c.id===r.cost_center_id) as any
                              const isDeduction = isDeductionRecordType(r.record_type)
                              const isLinkedToSub = !!r.subcontractor_id
                              const isLinkedToCert = !!r.invoice_id || !!r.invoice_no
                              const debit = financeDebit(r)
                              const credit = financeCredit(r)
                              return <tr key={r.id} style={{borderBottom:'1px solid #f4f4f0',background:idx%2===0?'#fff':'#fafaf8'}}>
                                <td style={{padding:'9px 12px',color:'#bbb',fontSize:11}}>{idx+1}</td>
                                <td style={{padding:'9px 12px',fontWeight:600,whiteSpace:'nowrap'}}>{r.payment_date}</td>
                                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11,color:'#555'}}>{r.receipt_voucher_no||'—'}</td>
                                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11,color:'#555'}}>{r.payment_voucher_no||'—'}</td>
                                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11,color:'#555'}}>{r.cheque_no||'—'}</td>
                                <td style={{padding:'9px 12px'}}><span style={{background:tc.bg,color:tc.fg,padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{r.record_type}</span></td>
                                <td style={{padding:'9px 12px',maxWidth:230,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#333'}}>{r.description||r.notes||'—'}</td>
                                <td style={{padding:'9px 12px',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#555'}}>{r.payee_name||(r.subcontractors as any)?.name||'—'}</td>
                                <td style={{padding:'9px 12px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isLinkedToSub?<span style={{background:'#e8f5e9',color:'#2e7d32',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>{(r.subcontractors as any)?.subcontractor_code??'SC'} — {(r.subcontractors as any)?.name??'Linked'}</span>:isDeduction?<span style={{background:'#fff3e0',color:'#e65100',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700}}>⚠ Not linked</span>:<span style={{color:'#ccc'}}>—</span>}</td>
                                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11,color:isLinkedToCert?'#0d47a1':'#aaa'}}>{r.invoice_no??(isLinkedToCert?'Linked':'—')}</td>
                                <td style={{padding:'9px 12px',color:'#555'}}>{r.accounting_direction||'—'}</td>
                                <td style={{padding:'9px 12px'}}>{cc?<span style={{background:'#e8f5e9',color:'#2e7d32',padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{cc.code}</span>:<span style={{color:'#ccc'}}>—</span>}</td>
                                <td style={{padding:'9px 12px',fontWeight:800,fontFamily:'monospace',whiteSpace:'nowrap',color:'#2e7d32'}}>{debit?money(debit):'—'}</td>
                                <td style={{padding:'9px 12px',fontWeight:800,fontFamily:'monospace',whiteSpace:'nowrap',color:isDeduction?'#c62828':'#0d47a1'}}>{credit?money(credit):'—'}</td>
                                <td style={{padding:'9px 12px'}}><span style={{background:mc.bg,color:mc.fg,padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{r.payment_method}</span></td>
                                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11,color:'#555'}}>{r.reference||'—'}</td>
                                <td style={{padding:'9px 12px'}}><span style={{background:r.status==='Confirmed'?'#e8f5e9':r.status==='Pending'?'#fff3e0':'#ffebee',color:r.status==='Confirmed'?'#2e7d32':r.status==='Pending'?'#e65100':'#c62828',padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>{r.status}</span></td>
                                <td style={{padding:'9px 12px',display:'flex',gap:6}}>{isDeduction&&!isLinkedToSub&&<Button tone="secondary" onClick={()=>{setFinanceForm({...financeForm,record_type:r.record_type,amount:String(r.amount||''),payment_date:r.payment_date||new Date().toISOString().split('T')[0],payment_method:r.payment_method||'Transfer',reference:r.reference||'',bank_name:r.bank_name||'',description:r.description||'',notes:r.notes||'',cost_center_id:r.cost_center_id||'',receipt_voucher_no:r.receipt_voucher_no||'',payment_voucher_no:r.payment_voucher_no||'',cheque_no:r.cheque_no||'',payee_name:r.payee_name||'',accounting_direction:r.accounting_direction||'',analysis:r.analysis||'',disbursement_entity:r.disbursement_entity||''});setFinanceTab('add')}}>Link</Button>}<Button tone="danger" onClick={()=>{if(confirm('Delete?'))run('Delete',()=>deleteFinanceRecord.mutateAsync({id:r.id,projectId:projectId!,invoiceId:r.invoice_id}))}}>✕</Button></td>
                              </tr>
                            })}
                          </tbody>
                          {filtered.length>0&&<tfoot><tr style={{background:'#1a1a2e',color:'#fff'}}><td colSpan={12} style={{padding:'10px 12px',fontWeight:800}}>TOTAL ({filtered.length})</td><td style={{padding:'10px 12px',fontWeight:900,fontSize:14,fontFamily:'monospace'}}>{money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0))}</td><td style={{padding:'10px 12px',fontWeight:900,fontSize:14,fontFamily:'monospace'}}>{money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0))}</td><td colSpan={4}/></tr></tfoot>}
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* FINANCE REPORTS TAB */}
                {financeTab==='reports'&&(
                  <>
                    <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,padding:20,marginBottom:16}}>
                      <div style={{fontSize:16,fontWeight:900,color:'#0d47a1',marginBottom:8}}>Professional Accounting Reports / تقارير الحسابات</div>
                      <div style={{fontSize:12,color:'#777',marginBottom:14}}>Uses the same filters from All Records. Go to All Records to filter, then export a clean report here.</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:14}}>
                        <KPICard label="Filtered Debit" value={money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0))} color="#2e7d32" icon="↙️" />
                        <KPICard label="Filtered Credit" value={money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0))} color="#c62828" icon="↗️" />
                        <KPICard label="Net Movement" value={money(filtered.reduce((s:number,r:any)=>s+financeDebit(r)-financeCredit(r),0))} color="#0d47a1" icon="Σ" />
                        <KPICard label="Records" value={String(filtered.length)} color="#555" icon="📋" />
                      </div>
                      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                        <Button onClick={()=>setFinanceTab('all')}>Open Filters</Button>
                        <Button tone="secondary" onClick={()=>{
                          const heads=['Date','Type','Subcontractor','Certificate','Statement','Cost Center','Debit','Credit','Method','Reference','Status']
                          const rows=filtered.map((r:any)=>[r.payment_date,r.record_type,(r.subcontractors as any)?.name??'—',r.invoice_no??'—',r.description||r.notes||'—',costCenters.find((c:any)=>c.id===r.cost_center_id)?.code??'—',financeDebit(r)?money(financeDebit(r)):'—',financeCredit(r)?money(financeCredit(r)):'—',r.payment_method,r.reference||'—',r.status])
                          printProfessionalTableReport('Finance Accounting Report',[`Project: ${activeProject?.project_name??'—'}`,`Generated: ${new Date().toLocaleString()}`],[{label:'Debit',value:money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0))},{label:'Credit',value:money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0))},{label:'Net',value:money(filtered.reduce((s:number,r:any)=>s+financeDebit(r)-financeCredit(r),0))},{label:'Records',value:String(filtered.length)}],heads,rows,['TOTAL','','','','','',money(filtered.reduce((s:number,r:any)=>s+financeDebit(r),0)),money(filtered.reduce((s:number,r:any)=>s+financeCredit(r),0)),'','',''])
                        }}>📄 Print / Save PDF</Button>
                      </div>
                    </div>
                  </>
                )}

                {/* ADD RECORD TAB */}
                {financeTab==='add'&&(
                  <div style={{background:'#fff',border:'1px solid #e8e8e0',borderRadius:14,padding:'24px 28px'}}>
                    <div style={{fontSize:15,fontWeight:700,marginBottom:20,color:'#0d47a1'}}>New Finance Record</div>
                    <FormGrid>
                      <Field label="Record Type"><Select value={financeForm.record_type} onChange={e=>setFinanceForm({...financeForm,record_type:e.target.value})}>{RECORD_TYPES.map(t=><option key={t}>{t}</option>)}</Select></Field>
                      <Field label="Amount (EGP) *"><Input type="number" value={financeForm.amount} onChange={e=>setFinanceForm({...financeForm,amount:e.target.value})} placeholder="0.00"/></Field>
                      <Field label="Date *"><Input type="date" value={financeForm.payment_date} onChange={e=>setFinanceForm({...financeForm,payment_date:e.target.value})}/></Field>
                      <Field label="Payment Method"><Select value={financeForm.payment_method} onChange={e=>setFinanceForm({...financeForm,payment_method:e.target.value})}>{METHODS.map(m=><option key={m}>{m}</option>)}</Select></Field>
                      <Field label="Reference"><Input value={financeForm.reference} onChange={e=>setFinanceForm({...financeForm,reference:e.target.value})} placeholder="TRF-5678 / NCR-001"/></Field>
                      <Field label="Payment Voucher / إذن صرف"><Input value={financeForm.payment_voucher_no} onChange={e=>setFinanceForm({...financeForm,payment_voucher_no:e.target.value})} placeholder="22170"/></Field>
                      <Field label="Receipt Voucher / إذن استلام"><Input value={financeForm.receipt_voucher_no} onChange={e=>setFinanceForm({...financeForm,receipt_voucher_no:e.target.value})} placeholder="13901"/></Field>
                      <Field label="Cheque No."><Input value={financeForm.cheque_no} onChange={e=>setFinanceForm({...financeForm,cheque_no:e.target.value})} placeholder="Cheque no."/></Field>
                      <Field label="Bank Name"><Input value={financeForm.bank_name} onChange={e=>setFinanceForm({...financeForm,bank_name:e.target.value})} placeholder="CIB, NBE, HSBC..."/></Field>
                      <Field label="Cost Center / Cost Code">
                        <Select value={financeForm.cost_center_id} onChange={e=>setFinanceForm({...financeForm,cost_center_id:e.target.value})}>
                          <option value="">— Select Cost Center —</option>
                          {costCenters.map((c:any)=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                        </Select>
                      </Field>
                      <Field label={isDeductionRecordType(financeForm.record_type) ? "Subcontractor Link *" : "Subcontractor Link"}>
                        <Select value={financeForm.subcontractor_id} onChange={e=>setFinanceForm({...financeForm,subcontractor_id:e.target.value})}>
                          <option value="">— General / Not linked —</option>
                          {subcontractors.map(s=><option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Linked Invoice">
                        <Select value={financeForm.invoice_id} onChange={e=>{ const inv = certificates.find((c:any)=>c.id===e.target.value) as any; setFinanceForm({...financeForm,invoice_id:e.target.value,subcontractor_id:inv?.subcontractor_id||financeForm.subcontractor_id}) }}>
                          <option value="">— Not linked —</option>
                          {certificates.filter(isFinanceEligibleInvoice).map((c:any)=><option key={c.id} value={c.id}>{c.invoice_no} — {(c.subcontractors as any)?.name??''} · {money(c.net_amount)}</option>)}
                        </Select>
                      </Field>
                      <Field label="Status"><Select value={financeForm.status} onChange={e=>setFinanceForm({...financeForm,status:e.target.value})}><option>Draft</option><option>Pending</option><option>Reviewed</option><option>Confirmed</option><option>Posted</option><option>Cancelled</option></Select></Field>
                      <Field label="Payee / اسم المستفيد"><Input value={financeForm.payee_name} onChange={e=>setFinanceForm({...financeForm,payee_name:e.target.value})} placeholder="Beneficiary name"/></Field>
                      <Field label="Accounting Direction / التوجيه المحاسبي"><Input value={financeForm.accounting_direction} onChange={e=>setFinanceForm({...financeForm,accounting_direction:e.target.value})} placeholder="ح/ مقاولين / مصاريف"/></Field>
                      <Field label="Analysis / تحليل"><Input value={financeForm.analysis} onChange={e=>setFinanceForm({...financeForm,analysis:e.target.value})} placeholder="حفر / خرسانات / أدوات"/></Field>
                      <Field label="Disbursement Entity / جهة الصرف"><Input value={financeForm.disbursement_entity} onChange={e=>setFinanceForm({...financeForm,disbursement_entity:e.target.value})} placeholder="عهدة رقم 1 / خزنة / بنك"/></Field>
                    </FormGrid>
                    {isDeductionRecordType(financeForm.record_type)&&(
                      <div style={{marginTop:12,padding:'12px 14px',borderRadius:10,background:financeForm.subcontractor_id?'#e8f5e9':'#fff3e0',color:financeForm.subcontractor_id?'#2e7d32':'#e65100',fontSize:12,fontWeight:700}}>
                        {financeForm.subcontractor_id?'✓ This deduction/penalty is linked to the subcontractor and will be deducted automatically from the next certificate.':'⚠ Select the subcontractor so this deduction/penalty reflects automatically in the payment certificate.'}
                      </div>
                    )}
                    <div style={{marginTop:12}}><Field label="Statement / البيان"><Input value={financeForm.description} onChange={e=>setFinanceForm({...financeForm,description:e.target.value})} placeholder="Short description..."/></Field></div>
                    <div style={{marginTop:10}}><Field label="Notes"><TextArea value={financeForm.notes} onChange={e=>setFinanceForm({...financeForm,notes:e.target.value})}/></Field></div>
                    <Toolbar>
                      <Button disabled={addFinanceRecord.isPending||!financeForm.amount||!financeForm.payment_date||(isDeductionRecordType(financeForm.record_type)&&!financeForm.subcontractor_id)} onClick={async()=>{
                        if(!projectId||!financeForm.amount)return
                        const ccSel=costCenters.find((c:any)=>c.id===financeForm.cost_center_id) as any
                        const linkedInv = financeForm.invoice_id ? certificates.find((c:any)=>c.id===financeForm.invoice_id) as any : null
                        await run('Finance record',()=>addFinanceRecord.mutateAsync({
                          project_id:projectId, invoice_id:financeForm.invoice_id||null, subcontractor_id:financeForm.subcontractor_id||null,
                          record_type:financeForm.record_type, amount:parseFloat(financeForm.amount)||0, payment_date:financeForm.payment_date,
                          payment_method:financeForm.payment_method, reference:financeForm.reference||null, bank_name:financeForm.bank_name||null,
                          description:financeForm.description||null, notes:financeForm.notes||null, status:financeForm.status, workflow_status: financeForm.status,
                          cost_center_id:financeForm.cost_center_id||null, cost_center_code:ccSel?.code||null,
                          receipt_voucher_no:financeForm.receipt_voucher_no||null, payment_voucher_no:financeForm.payment_voucher_no||null,
                          cheque_no:financeForm.cheque_no||null, payee_name:financeForm.payee_name||null,
                          accounting_direction:financeForm.accounting_direction||null, analysis:financeForm.analysis||null,
                          disbursement_entity:financeForm.disbursement_entity||null,
                          invoice_no: linkedInv?.invoice_no || null,
                          final_payable: linkedInv ? Number(linkedInv.net_amount||0) : null,
                        } as any))
                        setFinanceForm({record_type:'Payment',amount:'',payment_date:new Date().toISOString().split('T')[0],payment_method:'Transfer',reference:'',bank_name:'',description:'',notes:'',subcontractor_id:'',invoice_id:'',invoice_no:'',status:'Pending',cost_center_id:'',receipt_voucher_no:'',payment_voucher_no:'',cheque_no:'',payee_name:'',accounting_direction:'',analysis:'',disbursement_entity:''})
                        setFinanceTab('all')
                      }}>{addFinanceRecord.isPending?'Saving...':'💾 Save Finance Record'}</Button>
                      <Button tone="secondary" onClick={()=>setFinanceTab('all')}>Cancel</Button>
                    </Toolbar>
                  </div>
                )}
              </>
            )
          })()}

          {activeView === 'commercial' && (() => {
            // ── derived values ──────────────────────────────────────────
            const grossMargin = costControlContract - costControlActual
            const grossMarginPct = costControlContract > 0 ? (grossMargin / costControlContract) * 100 : 0
            const budgetVariancePct = costControlTarget > 0 ? ((costControlTarget - costControlActual) / costControlTarget) * 100 : 0
            const costAtCompletion = costControlActual   // extend this later with EAC
            const claimsApproved = claimsData.reduce((s,x) => s + (Number(x.approved_amount) || 0), 0)
            const claimsPending = claimsData.filter(c => c.status === 'Pending' || c.status === 'Draft').reduce((s,x) => s + (Number(x.submitted_amount)||0),0)
            const overrunRows = costControlRows.filter(r => r.variance < 0)
            const totalOverrun = overrunRows.reduce((s,r) => s + Math.abs(r.variance),0)

            // tab pill style
            const tabBtn = (id: 'costcontrol'|'claims'|'budget'|'cashflow', label: string, icon: string) => (
              <button key={id} onClick={() => setCommercialTab(id)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                background: commercialTab === id ? '#0f4c35' : 'transparent',
                color: commercialTab === id ? '#fff' : '#555',
                transition: 'all 0.15s',
              }}><span>{icon}</span>{label}</button>
            )

            // reusable stat card
            const StatCard = ({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent?: string; icon?: string }) => (
              <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '18px 22px', borderLeft: `4px solid ${accent ?? '#1d9e75'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#111', letterSpacing: '-0.5px' }}>{value}</div>
                    {sub && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{sub}</div>}
                  </div>
                  {icon && <div style={{ fontSize: 24, opacity: 0.18 }}>{icon}</div>}
                </div>
              </div>
            )

            // progress bar
            const Bar = ({ pct, color, h = 8 }: { pct: number; color: string; h?: number }) => (
              <div style={{ height: h, background: '#f0f0ea', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.3s' }} />
              </div>
            )

            return (
              <>
                {/* ── PAGE HEADER ──────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: '-0.5px' }}>Commercial Dashboard</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{activeProject?.project_name ?? 'No project selected'} · Commercial Performance Overview</div>
                  </div>
                  <button onClick={fetchCommercialScreens} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'#fff', border:'1px solid #d8d8d0', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, color:'#444' }}>
                    ↺ Refresh
                  </button>
                </div>

                {/* ── TOP KPI STRIP ─────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
                  <StatCard label="Contract Value" value={money(costControlContract)} sub="Client BOQ" accent="#1565c0" icon="📄" />
                  <StatCard label="Target Cost" value={money(costControlTarget)} sub="Tender / Cost Sheet" accent="#0f4c35" icon="🎯" />
                  <StatCard label="Actual Cost" value={money(costControlActual)} sub={`${(costControlTarget > 0 ? (costControlActual/costControlTarget*100) : 0).toFixed(1)}% of budget`} accent={costControlActual > costControlTarget ? '#c62828' : '#1d9e75'} icon="💸" />
                  <StatCard label="Gross Margin" value={money(grossMargin)} sub={`${grossMarginPct.toFixed(1)}% margin`} accent={grossMargin >= 0 ? '#1d9e75' : '#c62828'} icon="📈" />
                  <StatCard label="Budget Variance" value={money(costControlTarget - costControlActual)} sub={`${budgetVariancePct > 0 ? '+' : ''}${budgetVariancePct.toFixed(1)}%`} accent={costControlTarget >= costControlActual ? '#1d9e75' : '#c62828'} icon="⚖️" />
                  <StatCard label="Claims Submitted" value={money(commercialTotals.submittedClaims)} sub={`${money(claimsApproved)} approved`} accent="#7b1fa2" icon="📋" />
                </div>

                {/* ── NAVIGATION TABS ───────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#f5f5f0', borderRadius: 10, padding: 4, overflowX: 'auto' }}>
                  {tabBtn('costcontrol', 'Cost Control', '📊')}
                  {tabBtn('budget', 'Budget vs Actual', '📉')}
                  {tabBtn('cashflow', 'Cashflow', '💰')}
                  {tabBtn('claims', 'Claims Register', '📋')}
                </div>

                {/* ══════════════════════════════════════════════════════
                    TAB 1 — COST CONTROL
                ═══════════════════════════════════════════════════════ */}
                {commercialTab === 'costcontrol' && (
                  <>
                    {/* Filters row */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Filter by:</div>
                      <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                        <Select value={ccFilterStructure} onChange={(e) => {
                          const structureId = e.target.value
                          const scopedBoq = getBoqItemsForStructure(structureId, true)
                          const currentStillValid = ccFilterBoq && scopedBoq.some((b: any) => String(b.id) === String(ccFilterBoq))
                          setCcFilterStructure(structureId)
                          if (!currentStillValid) setCcFilterBoq('')
                        }}>
                          <option value="">All Structures / Villas</option>
                          {structureNodes.filter((sn: StructureNode) => structureHasBoq(sn.id)).map((sn: StructureNode) => <option key={sn.id} value={sn.id}>{sn.code} · {sn.name}</option>)}
                        </Select>
                      </div>
                      <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                        <Select value={ccFilterBoq} onChange={(e) => setCcFilterBoq(e.target.value)}>
                          <option value="">All BOQ Items</option>
                          {getBoqItemsForStructure(ccFilterStructure, true).map((b: any) => <option key={b.id} value={b.id}>{structureBoqOptionLabel(b)}</option>)}
                        </Select>
                      </div>
                      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                        <Select value={ccFilterDiscipline} onChange={(e) => setCcFilterDiscipline(e.target.value)}>
                          <option value="">All Disciplines</option>
                          {disciplineOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}
                        </Select>
                      </div>
                      <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>{costControlRows.length} items</div>
                    </div>

                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>

                      {/* Contract vs Cost panel */}
                      <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '20px 22px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Contract vs Cost</div>
                        {[
                          { label: 'Contract Value', value: costControlContract, color: '#1565c0' },
                          { label: 'Target Cost',    value: costControlTarget,   color: '#0f4c35' },
                          { label: 'Actual Cost',    value: costControlActual,   color: costControlActual > costControlTarget ? '#c62828' : '#1d9e75' },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                              <span style={{ color: '#666', fontWeight: 600 }}>{label}</span>
                              <span style={{ fontWeight: 800, color }}>{money(value)}</span>
                            </div>
                            <Bar pct={(value / Math.max(1, costControlContract)) * 100} color={color} h={10} />
                          </div>
                        ))}
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f0ea', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#888' }}>Gross Margin</span>
                          <span style={{ fontWeight: 800, fontSize: 14, color: grossMargin >= 0 ? '#0f4c35' : '#c62828' }}>{money(grossMargin)} ({grossMarginPct.toFixed(1)}%)</span>
                        </div>
                      </div>

                      {/* Actual cost breakdown */}
                      <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '20px 22px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Actual Cost Sources</div>
                        {[
                          { label: 'Materials', value: costControlActualMaterial, color: '#ef6c00', icon: '🧱' },
                          { label: 'Subcontractors', value: costControlActualSub, color: '#6a1b9a', icon: '👷' },
                        ].map(({ label, value, color, icon }) => {
                          const pct = costControlActual > 0 ? (value / costControlActual) * 100 : 0
                          return (
                            <div key={label} style={{ marginBottom: 18 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{icon} {label}</span>
                                <span style={{ fontWeight: 800, color }}>{money(value)}</span>
                              </div>
                              <Bar pct={pct} color={color} h={12} />
                              <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{pct.toFixed(1)}% of actual</div>
                            </div>
                          )
                        })}
                        <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid #f0f0ea', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#888' }}>Total Actual</span>
                          <span style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>{money(costControlActual)}</span>
                        </div>
                      </div>

                      {/* Top overruns / risk */}
                      <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '20px 22px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top Overruns</div>
                          {overrunRows.length > 0 && <span style={{ background: '#ffebee', color: '#c62828', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{overrunRows.length} items · {money(totalOverrun)}</span>}
                        </div>
                        {costControlTopOverrun.length === 0 ? (
                          <div style={{ color: '#aaa', fontSize: 13, paddingTop: 8 }}>✓ No overruns detected</div>
                        ) : costControlTopOverrun.slice(0, 5).map((x) => (
                          <div key={x.boq.id} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ color: '#555', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.boq.code} — {x.boq.description}</span>
                              <span style={{ fontWeight: 800, color: x.variance < 0 ? '#c62828' : '#1d9e75', whiteSpace: 'nowrap' }}>{money(x.variance)}</span>
                            </div>
                            <Bar pct={x.target > 0 ? Math.min(100, (Math.abs(x.variance) / x.target) * 100) : 0} color={x.variance < 0 ? '#c62828' : '#1d9e75'} h={6} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Discipline breakdown */}
                    {budgetByDiscipline.length > 0 && (
                      <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>Budget by Discipline</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                          {budgetByDiscipline.map((x) => {
                            const actual = costControlRows.filter(r => String(r.boq.discipline ?? 'Structural') === x.discipline).reduce((s,r) => s+r.actual,0)
                            const pctBudget = maxBudgetDiscipline > 0 ? (x.amount / maxBudgetDiscipline) * 100 : 0
                            const overrun = actual > x.amount
                            return (
                              <div key={x.discipline}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                                  <span style={{ fontWeight: 700, color: '#444' }}>{x.discipline}</span>
                                  <span style={{ color: '#888' }}>{money(x.amount)}</span>
                                </div>
                                <div style={{ height: 8, background: '#f0f0ea', borderRadius: 999, overflow: 'hidden', marginBottom: 4 }}>
                                  <div style={{ width: `${pctBudget}%`, height: '100%', background: '#0f4c35', borderRadius: 999 }} />
                                </div>
                                {actual > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: overrun ? '#c62828' : '#888' }}>
                                    <span>Actual: {money(actual)}</span>
                                    <span style={{ fontWeight: 700 }}>{overrun ? '⚠ Overrun' : '✓ On track'}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Main cost control table */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0f0ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Cost Control Register</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{costControlRows.length} BOQ items</div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f8f8f4' }}>
                              {['', 'Structure', 'Code', 'Description', 'Discipline', 'Contract', 'Target', 'Mat. Actual', 'Sub. Actual', 'Total Actual', 'Variance', 'Margin', '% Used'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #e8e8e0' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {costControlRows.length === 0 ? (
                              <tr><td colSpan={13} style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No cost control data. Add tender/cost sheet items linked to BOQ.</td></tr>
                            ) : costControlRows.map((row, idx) => {
                              const pctUsed = row.target > 0 ? (row.actual / row.target) * 100 : 0
                              const isOver = row.variance < 0
                              const isExpanded = ccExpanded[row.boq.id]
                              return (
                                <>
                                  <tr key={row.boq.id} style={{ borderBottom: '1px solid #f4f4f0', background: idx % 2 === 0 ? '#fff' : '#fafaf8', cursor: 'pointer' }}
                                    onClick={() => setCcExpanded((p) => ({ ...p, [row.boq.id]: !p[row.boq.id] }))}>
                                    <td style={{ padding: '10px 12px', color: '#aaa', fontSize: 16 }}>{isExpanded ? '▾' : '▸'}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                      <span style={{ background: '#f0f0ea', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                        {ccFilterStructure ? ccStructureName(ccFilterStructure) : ccStructureName(row.structureId)}
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f4c35', fontFamily: 'monospace', fontSize: 12 }}>{row.boq.code ?? '—'}</td>
                                    <td style={{ padding: '10px 12px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>{row.boq.description ?? '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                      <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{row.boq.discipline ?? 'Structural'}</span>
                                    </td>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1565c0', whiteSpace: 'nowrap' }}>{money(row.contract)}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f4c35', whiteSpace: 'nowrap' }}>{money(row.target)}</td>
                                    <td style={{ padding: '10px 12px', color: '#ef6c00', whiteSpace: 'nowrap' }}>{money(row.actualMaterial)}</td>
                                    <td style={{ padding: '10px 12px', color: '#6a1b9a', whiteSpace: 'nowrap' }}>{money(row.actualSub)}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(row.actual)}</td>
                                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                      <span style={{ background: isOver ? '#ffebee' : '#e8f5e9', color: isOver ? '#c62828' : '#2e7d32', padding: '3px 10px', borderRadius: 20, fontWeight: 800, fontSize: 12 }}>
                                        {isOver ? '▼ ' : '▲ '}{money(Math.abs(row.variance))}
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', fontWeight: 700, color: row.margin < 0 ? '#c62828' : '#0f4c35', whiteSpace: 'nowrap' }}>{money(row.margin)}</td>
                                    <td style={{ padding: '10px 12px', minWidth: 100 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ flex: 1, height: 6, background: '#f0f0ea', borderRadius: 999 }}>
                                          <div style={{ width: `${Math.min(100, pctUsed)}%`, height: '100%', background: pctUsed > 100 ? '#c62828' : pctUsed > 80 ? '#ef6c00' : '#1d9e75', borderRadius: 999 }} />
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: pctUsed > 100 ? '#c62828' : '#555', whiteSpace: 'nowrap' }}>{pctUsed.toFixed(0)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {isExpanded && (() => {
                                    const details = ccBreakdownRows(row.boq.id, ccFilterStructure || null)
                                    return (
                                      <tr key={'detail'+row.boq.id}>
                                        <td colSpan={13} style={{ padding: 0, background: '#f8f8f4' }}>
                                          <div style={{ padding: '12px 24px 16px' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                              Resource Breakdown — {row.boq.code} {row.boq.description}
                                            </div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                              <thead><tr style={{ background: '#f0f0ea' }}>
                                                {['Resource', 'Description', 'Category', 'Target', 'Mat. Actual', 'Sub. Actual', 'Total', 'Variance'].map(h => (
                                                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                                ))}
                                              </tr></thead>
                                              <tbody>
                                                {details.length === 0 ? (
                                                  <tr><td colSpan={9} style={{ padding: '12px 10px', color: '#aaa', textAlign: 'center' }}>No resource breakdown data</td></tr>
                                                ) : details.map((d, i) => (
                                                  <tr key={i} style={{ borderBottom: '1px solid #e8e8e0', background: i%2===0?'#fff':'#fafaf8' }}>
                                                    <td style={{ padding: '7px 10px', fontWeight: 700, fontFamily: 'monospace', color: '#0f4c35' }}>{d.code || '—'}</td>
                                                    <td style={{ padding: '7px 10px', color: '#444' }}>{d.line.description ?? d.line.resource_description ?? '—'}</td>
                                                    <td style={{ padding: '7px 10px' }}><span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{d.line.category ?? '—'}</span></td>
                                                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{money(d.target)}</td>
                                                    <td style={{ padding: '7px 10px', color: '#ef6c00' }}>{money(d.actualMaterial)}</td>
                                                    <td style={{ padding: '7px 10px', color: '#6a1b9a' }}>{money(d.actualSub)}</td>
                                                    <td style={{ padding: '7px 10px', fontWeight: 700 }}>{money(d.actual)}</td>
                                                    <td style={{ padding: '7px 10px' }}>
                                                      <span style={{ color: d.variance < 0 ? '#c62828' : '#2e7d32', fontWeight: 800 }}>{d.variance < 0 ? '▼ ' : '▲ '}{money(Math.abs(d.variance))}</span>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })()}
                                </>
                              )
                            })}
                          </tbody>
                          {costControlRows.length > 0 && (
                            <tfoot>
                              <tr style={{ background: '#0f4c35', color: '#fff' }}>
                                <td colSpan={5} style={{ padding: '12px 16px', fontWeight: 800, fontSize: 13 }}>TOTALS</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(costControlContract)}</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(costControlTarget)}</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(costControlActualMaterial)}</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(costControlActualSub)}</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(costControlActual)}</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(costControlTarget - costControlActual)}</td>
                                <td style={{ padding: '12px 12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(grossMargin)}</td>
                                <td style={{ padding: '12px 12px' }} />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* ══════════════════════════════════════════════════════
                    TAB 2 — BUDGET vs ACTUAL
                ═══════════════════════════════════════════════════════ */}
                {commercialTab === 'budget' && (
                  <>
                    {/* Summary strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
                      <StatCard label="Auto Budget (Cost Sheet)" value={money(autoBudgetFromCostSheet)} accent="#0f4c35" icon="🎯" />
                      <StatCard label="Total Actual Cost" value={money(actualCostFromSubInvoices + actualCostFromMaterials)} sub={`Mat: ${money(actualCostFromMaterials)} · Sub: ${money(actualCostFromSubInvoices)}`} accent={actualCostFromSubInvoices+actualCostFromMaterials > autoBudgetFromCostSheet ? '#c62828' : '#1d9e75'} icon="💸" />
                      <StatCard label="Variance" value={money(autoBudgetFromCostSheet - actualCostFromSubInvoices - actualCostFromMaterials)} sub={autoBudgetFromCostSheet > 0 ? `${((autoBudgetFromCostSheet - actualCostFromSubInvoices - actualCostFromMaterials)/autoBudgetFromCostSheet*100).toFixed(1)}% remaining` : ''} accent={autoBudgetFromCostSheet >= actualCostFromSubInvoices+actualCostFromMaterials ? '#1d9e75' : '#c62828'} icon="⚖️" />
                    </div>

                    {/* Budget burn bar */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '22px 24px', marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 20 }}>Budget Burn Rate</div>
                      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#888' }}>Actual spend vs budget</span>
                        <span style={{ fontWeight: 700 }}>{autoBudgetFromCostSheet > 0 ? ((actualCostFromSubInvoices+actualCostFromMaterials)/autoBudgetFromCostSheet*100).toFixed(1) : '0'}%</span>
                      </div>
                      <div style={{ height: 20, background: '#f0f0ea', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, autoBudgetFromCostSheet > 0 ? (actualCostFromSubInvoices+actualCostFromMaterials)/autoBudgetFromCostSheet*100 : 0)}%`,
                          height: '100%',
                          background: actualCostFromSubInvoices+actualCostFromMaterials > autoBudgetFromCostSheet ? '#c62828' : '#1d9e75',
                          borderRadius: 999,
                          transition: 'width 0.4s',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#aaa' }}>
                        <span>EGP 0</span><span>Budget: {money(autoBudgetFromCostSheet)}</span>
                      </div>
                    </div>

                    {/* Budget by discipline — visual grid */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '22px 24px', marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 20 }}>Budget by Discipline</div>
                      {budgetByDiscipline.length === 0 ? (
                        <div style={{ color: '#aaa', fontSize: 13 }}>No discipline data yet</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 14 }}>
                          {budgetByDiscipline.map((x) => {
                            const actual = costControlRows.filter(r => String(r.boq.discipline ?? 'Structural') === x.discipline).reduce((s,r) => s+r.actual,0)
                            const pctBudget = x.amount > 0 ? Math.min(100,(x.amount / maxBudgetDiscipline)*100) : 0
                            const pctActual = x.amount > 0 ? Math.min(100,(actual / x.amount)*100) : 0
                            const overrun = actual > x.amount
                            return (
                              <div key={x.discipline}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{x.discipline}</span>
                                    {overrun && <span style={{ background: '#ffebee', color: '#c62828', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>OVERRUN</span>}
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{money(x.amount)}</div>
                                    {actual > 0 && <div style={{ fontSize: 11, color: overrun ? '#c62828' : '#888' }}>Actual: {money(actual)}</div>}
                                  </div>
                                </div>
                                {/* Budget bar */}
                                <div style={{ height: 8, background: '#f0f0ea', borderRadius: 999, overflow: 'hidden', marginBottom: 3 }}>
                                  <div style={{ width: `${pctBudget}%`, height: '100%', background: '#0f4c35', borderRadius: 999 }} />
                                </div>
                                {/* Actual overlay bar */}
                                {actual > 0 && (
                                  <div style={{ height: 5, background: '#f0f0ea', borderRadius: 999, overflow: 'hidden' }}>
                                    <div style={{ width: `${pctActual}%`, height: '100%', background: overrun ? '#c62828' : '#1d9e75', borderRadius: 999 }} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Summary table */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0f0ea' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Budget Summary</div>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: '#f8f8f4' }}>
                          {['Source', 'Amount', 'Note'].map(h => <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e8e8e0' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {[
                            ['Budget (Cost Sheet / Tender)', money(autoBudgetFromCostSheet), 'Auto-calculated from tender breakdown'],
                            ['Actual — Materials', money(actualCostFromMaterials), 'From materials actual records'],
                            ['Actual — Subcontractors', money(actualCostFromSubInvoices), 'From approved subcontractor invoices'],
                            ['Total Actual Cost', money(actualCostFromSubInvoices + actualCostFromMaterials), ''],
                            ['Variance', money(autoBudgetFromCostSheet - actualCostFromSubInvoices - actualCostFromMaterials), autoBudgetFromCostSheet >= actualCostFromSubInvoices+actualCostFromMaterials ? '✓ Within budget' : '⚠ Over budget'],
                          ].map(([src, amt, note], i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f4f4f0', background: i===4 ? '#f0f7f4' : i%2===0?'#fff':'#fafaf8' }}>
                              <td style={{ padding: '12px 20px', fontWeight: i===4?800:500, color: '#333' }}>{src}</td>
                              <td style={{ padding: '12px 20px', fontWeight: 800, color: i===4 ? (autoBudgetFromCostSheet >= actualCostFromSubInvoices+actualCostFromMaterials ? '#0f4c35' : '#c62828') : '#111', fontFamily:'monospace', fontSize:13 }}>{amt}</td>
                              <td style={{ padding: '12px 20px', color: '#888', fontSize: 12 }}>{note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* ══════════════════════════════════════════════════════
                    TAB 3 — CASHFLOW
                ═══════════════════════════════════════════════════════ */}
                {commercialTab === 'cashflow' && (
                  <>
                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
                      <StatCard label="Actual Revenue" value={money(actualRevenueFromClientInvoices)} sub="From paid/certified client invoices" accent="#1565c0" icon="💵" />
                      <StatCard label="Actual Cost" value={money(actualCostFromSubInvoices + actualCostFromMaterials)} sub={`Mat: ${money(actualCostFromMaterials)} + Sub: ${money(actualCostFromSubInvoices)}`} accent="#c62828" icon="💸" />
                      <StatCard label="Net Cash Position" value={money(actualRevenueFromClientInvoices - actualCostFromSubInvoices - actualCostFromMaterials)} accent={actualRevenueFromClientInvoices >= actualCostFromSubInvoices+actualCostFromMaterials ? '#1d9e75' : '#c62828'} icon="📊" />
                    </div>

                    {/* Add month form */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '22px 24px', marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 16 }}>Add / Update Month</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14 }}>
                        <Field label="Month"><Input type="month" value={cashflowForm.period_month} onChange={(e) => setCashflowForm({ ...cashflowForm, period_month: e.target.value })} /></Field>
                        <Field label="Planned Revenue (EGP)"><Input type="number" value={cashflowForm.planned_revenue} onChange={(e) => setCashflowForm({ ...cashflowForm, planned_revenue: e.target.value })} placeholder="0" /></Field>
                        <Field label="Planned Cost (EGP)"><Input type="number" value={cashflowForm.planned_cost} onChange={(e) => setCashflowForm({ ...cashflowForm, planned_cost: e.target.value })} placeholder="0" /></Field>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <Button onClick={addCashflow} style={{ width: '100%' }}>Save Month</Button>
                        </div>
                      </div>
                    </div>

                    {/* Cashflow table */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0f0ea' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Monthly Cashflow</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Planned values entered manually · Actuals pulled automatically from invoices</div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: '#f8f8f4' }}>
                            {['Month', 'Plan Revenue', 'Plan Cost', 'Actual Revenue', 'Actual Cost', 'Net Planned', 'Net Actual', 'Δ Variance'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e8e8e0', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {cashflowData.length === 0 ? (
                              <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No cashflow data. Add monthly planned values above.</td></tr>
                            ) : cashflowData.map((c, i) => {
                              const netPlan = (c.planned_revenue ?? 0) - (c.planned_cost ?? 0)
                              const netActual = (c.actual_revenue ?? 0) - (c.actual_cost ?? 0)
                              const delta = netActual - netPlan
                              return (
                                <tr key={c.id ?? i} style={{ borderBottom: '1px solid #f4f4f0', background: i%2===0?'#fff':'#fafaf8' }}>
                                  <td style={{ padding: '11px 14px', fontWeight: 700, color: '#333' }}>{c.period_month}</td>
                                  <td style={{ padding: '11px 14px', color: '#1565c0', fontFamily: 'monospace' }}>{money(c.planned_revenue ?? 0)}</td>
                                  <td style={{ padding: '11px 14px', color: '#c62828', fontFamily: 'monospace' }}>{money(c.planned_cost ?? 0)}</td>
                                  <td style={{ padding: '11px 14px', fontWeight: 700, color: '#1565c0', fontFamily: 'monospace' }}>{money(c.actual_revenue ?? 0)}</td>
                                  <td style={{ padding: '11px 14px', fontWeight: 700, color: '#c62828', fontFamily: 'monospace' }}>{money(c.actual_cost ?? 0)}</td>
                                  <td style={{ padding: '11px 14px', fontWeight: 600, color: netPlan >= 0 ? '#0f4c35' : '#c62828', fontFamily: 'monospace' }}>{money(netPlan)}</td>
                                  <td style={{ padding: '11px 14px', fontWeight: 700, color: netActual >= 0 ? '#0f4c35' : '#c62828', fontFamily: 'monospace' }}>{money(netActual)}</td>
                                  <td style={{ padding: '11px 14px' }}>
                                    <span style={{ background: delta >= 0 ? '#e8f5e9' : '#ffebee', color: delta >= 0 ? '#2e7d32' : '#c62828', padding: '3px 10px', borderRadius: 20, fontWeight: 800, fontSize: 11 }}>
                                      {delta >= 0 ? '+' : ''}{money(delta)}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {cashflowData.length > 0 && (
                            <tfoot>
                              <tr style={{ background: '#0f4c35', color: '#fff' }}>
                                <td style={{ padding: '12px 14px', fontWeight: 800 }}>TOTALS</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(cashflowData.reduce((s,c) => s+(c.planned_revenue??0),0))}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(cashflowData.reduce((s,c) => s+(c.planned_cost??0),0))}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(cashflowData.reduce((s,c) => s+(c.actual_revenue??0),0))}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(cashflowData.reduce((s,c) => s+(c.actual_cost??0),0))}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(cashflowData.reduce((s,c) => s+(c.planned_revenue??0)-(c.planned_cost??0),0))}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(cashflowData.reduce((s,c) => s+(c.actual_revenue??0)-(c.actual_cost??0),0))}</td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* ══════════════════════════════════════════════════════
                    TAB 4 — CLAIMS REGISTER
                ═══════════════════════════════════════════════════════ */}
                {commercialTab === 'claims' && (
                  <>
                    {/* Claims KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
                      <StatCard label="Total Claims" value={String(claimsData.length)} sub="All claim records" accent="#7b1fa2" icon="📋" />
                      <StatCard label="Submitted" value={money(commercialTotals.submittedClaims)} accent="#1565c0" icon="📤" />
                      <StatCard label="Approved" value={money(claimsApproved)} accent="#1d9e75" icon="✅" />
                      <StatCard label="Pending" value={money(claimsPending)} accent="#ef6c00" icon="⏳" />
                    </div>

                    {/* Add claim form */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, padding: '22px 24px', marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 16 }}>New Claim</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
                        <Field label="Claim No"><Input value={claimForm.claim_no} onChange={(e) => setClaimForm({ ...claimForm, claim_no: e.target.value })} placeholder="CL-001" /></Field>
                        <Field label="Title"><Input value={claimForm.title} onChange={(e) => setClaimForm({ ...claimForm, title: e.target.value })} placeholder="Design change claim" /></Field>
                        <Field label="Type">
                          <Select value={claimForm.claim_type} onChange={(e) => setClaimForm({ ...claimForm, claim_type: e.target.value })}>
                            <option>Variation</option><option>Delay</option><option>Acceleration</option><option>Material Escalation</option><option>Other</option>
                          </Select>
                        </Field>
                        <Field label="Submitted Amount (EGP)"><Input type="number" value={claimForm.submitted_amount} onChange={(e) => setClaimForm({ ...claimForm, submitted_amount: e.target.value })} placeholder="0" /></Field>
                      </div>
                      <div style={{ marginTop: 14 }}>
                        <Field label="Description"><TextArea value={claimForm.description} onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })} /></Field>
                      </div>
                      <div style={{ marginTop: 14 }}>
                        <Button onClick={addClaim}>Submit Claim</Button>
                      </div>
                    </div>

                    {/* Claims table */}
                    <div style={{ background: '#fff', border: '1px solid #e8e8e0', borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0f0ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>Claims Register</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{claimsData.length} claims</div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: '#f8f8f4' }}>
                            {['No', 'Title', 'Type', 'Status', 'Submitted', 'Approved', 'Recovery Rate'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e8e8e0', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {claimsData.length === 0 ? (
                              <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No claims yet. Add the first claim above.</td></tr>
                            ) : claimsData.map((c, i) => {
                              const submitted = Number(c.submitted_amount) || 0
                              const approved = Number(c.approved_amount) || 0
                              const recoveryPct = submitted > 0 ? (approved / submitted) * 100 : 0
                              const statusColors: Record<string, { bg: string; fg: string }> = {
                                'Approved': { bg: '#e8f5e9', fg: '#2e7d32' },
                                'Rejected': { bg: '#ffebee', fg: '#c62828' },
                                'Pending': { bg: '#fff3e0', fg: '#e65100' },
                                'Draft': { bg: '#f5f5f5', fg: '#666' },
                                'Partially Approved': { bg: '#e3f2fd', fg: '#1565c0' },
                              }
                              const sc = statusColors[c.status ?? 'Draft'] ?? { bg: '#f5f5f5', fg: '#666' }
                              return (
                                <tr key={c.id ?? i} style={{ borderBottom: '1px solid #f4f4f0', background: i%2===0?'#fff':'#fafaf8' }}>
                                  <td style={{ padding: '11px 14px', fontWeight: 700, color: '#0f4c35', fontFamily: 'monospace' }}>{c.claim_no ?? '—'}</td>
                                  <td style={{ padding: '11px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>{c.title}</td>
                                  <td style={{ padding: '11px 14px' }}>
                                    <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{c.claim_type ?? '—'}</span>
                                  </td>
                                  <td style={{ padding: '11px 14px' }}>
                                    <span style={{ background: sc.bg, color: sc.fg, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{c.status ?? 'Draft'}</span>
                                  </td>
                                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{money(submitted)}</td>
                                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, color: approved > 0 ? '#0f4c35' : '#aaa' }}>{money(approved)}</td>
                                  <td style={{ padding: '11px 14px', minWidth: 120 }}>
                                    {submitted > 0 ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ flex: 1, height: 6, background: '#f0f0ea', borderRadius: 999 }}>
                                          <div style={{ width: `${Math.min(100, recoveryPct)}%`, height: '100%', background: recoveryPct >= 80 ? '#1d9e75' : recoveryPct >= 50 ? '#ef6c00' : '#c62828', borderRadius: 999 }} />
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>{recoveryPct.toFixed(0)}%</span>
                                      </div>
                                    ) : <span style={{ color: '#ccc' }}>—</span>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {claimsData.length > 0 && (
                            <tfoot>
                              <tr style={{ background: '#0f4c35', color: '#fff' }}>
                                <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 800 }}>TOTALS</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(commercialTotals.submittedClaims)}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{money(claimsApproved)}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 11 }}>
                                  {commercialTotals.submittedClaims > 0 ? `${(claimsApproved/commercialTotals.submittedClaims*100).toFixed(1)}% recovery` : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            )
          })()}

          {((activeView === 'bbs') || (activeView === 'bbs-qs' && currentBbsQsTab === 'bbs')) && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}><Metric label="Filtered Steel Quantity" value={round3(bbsTotalTon) + ' ton'} /><Metric label="BBS Entries" value={bbsFilteredLines.length} /><Metric label="Avg Steel Ratio" value={bbsFilteredLines.length ? round3(bbsFilteredLines.reduce((s, x) => s + (Number(x.steel_ratio_ton_m3) || 0), 0) / bbsFilteredLines.length) + ' ton/m³' : '0 ton/m³'} /></div>
              <Card title="BBS Input — Steel Ratio from Effective QS">
                <FormGrid>
                  <Field label="Structure">
                    <Select value={bbsForm.structure_node_id} onChange={(e) => {
                      const structureId = e.target.value
                      const scopedBoq = getBoqItemsForStructure(structureId, true)
                      const currentStillValid = bbsForm.boq_item_id && scopedBoq.some((b: any) => String(b.id) === String(bbsForm.boq_item_id))
                      setBbsForm({ ...bbsForm, structure_node_id: structureId, boq_item_id: currentStillValid ? bbsForm.boq_item_id : '' })
                    }}>
                      <option value="">General / All structures</option>
                      {structureNodes
                        .filter((sn: StructureNode) => structureHasBoq(sn.id))
                        .map((sn: StructureNode) => <option key={sn.id} value={sn.id}>{sn.code} · {sn.name} ({getBoqItemsForStructure(sn.id, true).length} BOQ)</option>)}
                    </Select>
                  </Field>
                  <Field label="BOQ Item">
                    <Select value={bbsForm.boq_item_id} onChange={(e) => setBbsForm({ ...bbsForm, boq_item_id: e.target.value })}>
                      <option value="">Select BOQ item</option>
                      {getBoqItemsForStructure(bbsForm.structure_node_id, true).map((b: any) => <option key={b.id} value={b.id}>{structureBoqOptionLabel(b)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Steel Quantity (ton)"><Input type="number" step="0.001" value={bbsForm.steel_qty_ton} onChange={(e) => setBbsForm({ ...bbsForm, steel_qty_ton: e.target.value })} /></Field>
                  <Field label="Effective QS Qty"><Input value={String(effectiveQsQtyForBbs(bbsForm.boq_item_id, bbsForm.structure_node_id))} disabled /></Field>
                  <Field label="Calculated Steel Ratio ton/m³"><Input value={String(effectiveQsQtyForBbs(bbsForm.boq_item_id, bbsForm.structure_node_id) > 0 ? round3((Number(bbsForm.steel_qty_ton) || 0) / effectiveQsQtyForBbs(bbsForm.boq_item_id, bbsForm.structure_node_id)) : 0)} disabled /></Field>
                  <Field label="Notes"><Input value={bbsForm.notes} onChange={(e) => setBbsForm({ ...bbsForm, notes: e.target.value })} /></Field>
                </FormGrid>
                <div style={{ marginTop: -4, marginBottom: 10, fontSize: 12, color: '#667085' }}>
                  BOQ list is filtered by the selected structure/model.
                </div>
                <Toolbar><Button onClick={addBbsLine}>Add BBS Entry</Button><Button tone="secondary" onClick={fetchBbsLines}>Refresh</Button></Toolbar>
              </Card>
              <Card title="BBS Table">
                <Toolbar>
                  <div style={{ minWidth: 220 }}>
                    <Select value={bbsFilterStructure} onChange={(e) => {
                      const structureId = e.target.value
                      const scopedBoq = getBoqItemsForStructure(structureId, true)
                      const currentStillValid = bbsFilterBoq && scopedBoq.some((b: any) => String(b.id) === String(bbsFilterBoq))
                      setBbsFilterStructure(structureId)
                      if (!currentStillValid) setBbsFilterBoq('')
                    }}>
                      <option value="">All Structures</option>
                      {structureNodes.filter((sn: StructureNode) => structureHasBoq(sn.id)).map((sn: StructureNode) => <option key={sn.id} value={sn.id}>{sn.code} · {sn.name}</option>)}
                    </Select>
                  </div>
                  <div style={{ minWidth: 260 }}>
                    <Select value={bbsFilterBoq} onChange={(e) => setBbsFilterBoq(e.target.value)}>
                      <option value="">All BOQ</option>
                      {getBoqItemsForStructure(bbsFilterStructure, true).map((b: any) => <option key={b.id} value={b.id}>{structureBoqOptionLabel(b)}</option>)}
                    </Select>
                  </div>
                </Toolbar>
                <Table heads={['Structure', 'BOQ', 'Steel Qty ton', 'Effective QS Qty', 'Steel Ratio ton/m³', 'Notes', 'Actions']} rows={bbsFilteredLines.map((l) => [bbsNodeName(l.structure_node_id), bbsBoqName(l.boq_item_id), round3(l.steel_qty_ton ?? 0), round3(l.effective_qs_qty ?? 0), round3(l.steel_ratio_ton_m3 ?? 0), l.notes ?? '-', <Button key={l.id} tone="danger" onClick={() => deleteBbsLine(l.id)}>Delete</Button>])} />
              </Card>
            </>
          )}

          {activeView === 'subcontractor-dashboard' && (
            <SubcontractorProgressDashboard
              projectName={projectName}
              subcontractors={subcontractors as any[]}
              commercial={commercial as any[]}
              breakdowns={breakdowns as any[]}
              villaBreakdownLines={villaBreakdownLines as any[]}
              certificates={certificates as any[]}
              structureNodes={structureNodes as any[]}
              villaUnits={villaUnits as any[]}
              villaAssignments={villaAssignments as any[]}
              villaProgress={villaProgress as any[]}
              projectId={projectId}
              onOpenContracts={() => setActiveView('breakdown')}
              onOpenInvoices={() => setActiveView('certificates')}
            />
          )}

          {activeView === 'workfronts' && (
            <WorkfrontsView projectId={projectId} />
          )}

          {activeView === 'site-progress' && (
            <SiteProgressView projectId={projectId} userId={user?.id ?? null} isAdminOwner={isAdminOwner} />
          )}

          {activeView === 'company-branding' && <CompanyBrandingView />}

          {activeView === 'permissions' && <PermissionsView isAdminOwner={isAdminOwner} />}

          {['procurement-quotations', 'supplier-offers', 'quotation-comparison'].includes(activeView) && (
            <ProcurementQuotationsView
              procurement={procurement as any[]}
              projectId={projectId}
              userId={user?.id ?? null}
              userEmail={user?.email ?? null}
              initialMode={
                activeView === 'supplier-offers'
                  ? 'supplier-offers'
                  : activeView === 'quotation-comparison'
                    ? 'quotation-comparison'
                    : 'rfqs'
              }
              onBack={() => setActiveView('procurement')}
            />
          )}

          {activeView === 'schedule' && (() => {
            // ── helpers ──────────────────────────────────────────────────
            const total = scheduleActivities.length
            const notStarted = scheduleActivities.filter((a: any) => a.status === 'Not Started').length
            const inProgress = scheduleActivities.filter((a: any) => a.status === 'In Progress').length
            const completed = scheduleActivities.filter((a: any) => a.status === 'Completed').length
            const critical = scheduleActivities.filter((a: any) => (a.total_float ?? 999) === 0)
            const nearCritical = scheduleActivities.filter((a: any) => (a.total_float ?? 999) <= 5 && (a.total_float ?? 999) > 0)
            const overallPct = total > 0 ? scheduleActivities.reduce((s: number, a: any) => s + (a.schedule_pct ?? 0), 0) / total : 0

            // Project dates
            const allStarts = scheduleActivities.map((a: any) => a.planned_start).filter(Boolean).sort()
            const allFinishes = scheduleActivities.map((a: any) => a.planned_finish).filter(Boolean).sort()
            const projectStart = allStarts[0] ? new Date(allStarts[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
            const projectFinish = allFinishes[allFinishes.length - 1] ? new Date(allFinishes[allFinishes.length - 1]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

            // Activity type groups from ID prefix
            const typeGroups = new Map<string, number>()
            scheduleActivities.forEach((a: any) => {
              const prefix = a.activity_id?.match(/^[A-Za-z]+/)?.[0] ?? 'Other'
              typeGroups.set(prefix, (typeGroups.get(prefix) ?? 0) + 1)
            })

            // Filtered list
            const filtered = scheduleFilter
              ? scheduleActivities.filter((a: any) =>
                  a.activity_name?.toLowerCase().includes(scheduleFilter.toLowerCase()) ||
                  a.activity_id?.toLowerCase().includes(scheduleFilter.toLowerCase()) ||
                  a.wbs_code?.toLowerCase().includes(scheduleFilter.toLowerCase())
                )
              : scheduleActivities

            const BAR = (pct: number, color: string, h = 8) => (
              <div style={{ height: h, background: '#e8e8e8', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
              </div>
            )

            const statusColor: Record<string, string> = {
              'Not Started': '#888',
              'In Progress': '#1565c0',
              'Completed': '#2e7d32',
              'Suspended': '#e65100',
            }

            return <>
              {/* Upload bar */}
              <div style={{ background: '#f8fffe', border: '1px solid #c8e6c9', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1a6b4a' }}>📅 Primavera P6 Schedule Import</div>
                <label style={{ cursor: 'pointer' }}>
                  <span style={{ padding: '8px 18px', background: '#1a6b4a', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 700 }}>⬆ Upload P6 Excel Export</span>
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={async (e) => {
                    if (!projectId) return
                    const file = e.target.files?.[0]; if (!file) return
                    setScheduleUploadMsg('Parsing...')
                    try {
                      const XLSX = await import('xlsx')
                      const buf = await file.arrayBuffer()
                      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
                      // Find TASK sheet
                      const sheetName = wb.SheetNames.find((n: string) => n.toUpperCase() === 'TASK') ?? wb.SheetNames[0]
                      const ws = wb.Sheets[sheetName]
                      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
                      // P6 exports have 2 header rows:
                      // Row 0: internal codes (status_code, task_code, wbs_id...)
                      // Row 1: human labels (Activity Status, Activity ID, WBS Code...)
                      // We try row 1 first, then row 0 as fallback
                      let headerIdx = 1
                      // Check if row 1 has recognizable headers
                      if (raw.length > 1 && raw[1].some((c: any) => String(c).includes('Activity'))) {
                        headerIdx = 1
                      } else {
                        // fallback: find row with 'task_code' or 'Activity ID'
                        for (let i = 0; i < Math.min(raw.length, 5); i++) {
                          if (raw[i].some((c: any) => String(c).includes('Activity ID') || String(c) === 'task_code')) {
                            headerIdx = i; break
                          }
                        }
                      }
                      const headers: string[] = raw[headerIdx].map((c: any) => String(c))
                      // Also check row 0 for P6 internal codes as fallback mapping
                      const headers0: string[] = raw[0] ? raw[0].map((c: any) => String(c)) : []
                      const col = (name: string, fallback?: string) => {
                        let idx = headers.findIndex(h => h.includes(name))
                        if (idx === -1 && fallback) idx = headers0.findIndex(h => h === fallback)
                        return idx
                      }
                      const iStatus = col('Activity Status', 'status_code')
                      const iWbs = col('WBS Code', 'wbs_id')
                      const iId = col('Activity ID', 'task_code')
                      const iName = col('Activity Name', 'task_name')
                      const iOrigDur = col('Original Duration', 'target_drtn_hr_cnt')
                      const iRemDur = col('Remaining Duration', 'remain_drtn_hr_cnt')
                      const iPct = col('% Complete', 'sched_complete_pct')
                      const iStart = col('Start', 'start_date')
                      const iFinish = col('Finish', 'end_date')
                      const iActStart = col('Actual Start', 'act_start_date')
                      const iActFinish = col('Actual Finish', 'act_end_date')
                      const iFreeFloat = col('Free Float', 'free_float_hr_cnt')
                      const iTotalFloat = col('Total Float', 'total_float_hr_cnt')

                      const fmt = (v: any) => {
                        if (!v || v === '') return null
                        if (v instanceof Date) return v.toISOString().split('T')[0]
                        const d = new Date(v)
                        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
                      }

                      // Skip both header rows — start after the last header row
                      const dataStart = Math.max(headerIdx + 1, 2)
                      const activities = raw.slice(dataStart)
                        .filter((r: any[]) => r[iId] && String(r[iId]).trim() && !String(r[iId]).includes('Activity ID') && !String(r[iId]).includes('task_code'))
                        .map((r: any[]) => ({
                          activity_id: String(r[iId]).trim(),
                          activity_name: String(r[iName] ?? '').trim(),
                          wbs_code: iWbs >= 0 ? String(r[iWbs] ?? '').trim() || null : null,
                          status: (String(r[iStatus] ?? 'Not Started').trim() || 'Not Started') as ActivityStatus,
                          original_duration: iOrigDur >= 0 ? parseFloat(r[iOrigDur]) || null : null,
                          remaining_duration: iRemDur >= 0 ? parseFloat(r[iRemDur]) || null : null,
                          schedule_pct: iPct >= 0 ? parseFloat(r[iPct]) || 0 : 0,
                          planned_start: fmt(r[iStart]),
                          planned_finish: fmt(r[iFinish]),
                          actual_start: iActStart >= 0 ? fmt(r[iActStart]) : null,
                          actual_finish: iActFinish >= 0 ? fmt(r[iActFinish]) : null,
                          free_float: iFreeFloat >= 0 ? parseFloat(r[iFreeFloat]) || 0 : 0,
                          total_float: iTotalFloat >= 0 ? parseFloat(r[iTotalFloat]) || 0 : 0,
                        }))

                      if (!activities.length) { setScheduleUploadMsg('❌ No activities found'); return }
                      const result = await bulkUpsertSchedule.mutateAsync({ projectId, activities })
                      setScheduleUploadMsg(`✅ ${result.upserted} activities imported successfully`)
                      e.target.value = ''
                    } catch (err) {
                      setScheduleUploadMsg('❌ Error: ' + String(err))
                    }
                  }} />
                </label>
                {scheduleUploadMsg && <span style={{ fontSize: 13, color: scheduleUploadMsg.startsWith('✅') ? '#2e7d32' : scheduleUploadMsg === 'Parsing...' ? '#1565c0' : '#c62828', fontWeight: 600 }}>{scheduleUploadMsg}</span>}
                {total > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#666' }}>{total.toLocaleString()} activities loaded · {projectStart} → {projectFinish}</span>}
              </div>

              {total === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Schedule Data</div>
                  <div style={{ fontSize: 14 }}>Upload your P6 Excel export above to get started</div>
                </div>
              ) : <>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                  {([['overview', '📊 Overview'], ['list', '📋 Activity List'], ['critical', '🔴 Critical Path']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setScheduleTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: scheduleTab === id ? '#1a6b4a' : '#f0f0f0', color: scheduleTab === id ? '#fff' : '#333' }}>{label}</button>
                  ))}
                </div>

                {/* ── OVERVIEW TAB ── */}
                {scheduleTab === 'overview' && <>
                  {/* KPI strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
                    {[
                      ['Total Activities', total.toLocaleString(), '#1a1a1a'],
                      ['Not Started', notStarted.toLocaleString(), '#888'],
                      ['In Progress', inProgress.toLocaleString(), '#1565c0'],
                      ['Completed', completed.toLocaleString(), '#2e7d32'],
                      ['Critical Path', critical.length.toLocaleString(), '#c62828'],
                      ['Overall Progress', overallPct.toFixed(1) + '%', '#1a6b4a'],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: '#fff', border: '1px solid #e8e8e8', borderLeft: `4px solid ${c}`, borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{l}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700 }}>Overall Schedule Progress</span>
                      <span style={{ fontWeight: 800, color: '#1a6b4a', fontSize: 18 }}>{overallPct.toFixed(1)}%</span>
                    </div>
                    {BAR(overallPct, '#1a6b4a', 16)}
                    <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 13, color: '#666' }}>
                      <span>🟢 Completed: {completed}</span>
                      <span>🔵 In Progress: {inProgress}</span>
                      <span>⚪ Not Started: {notStarted}</span>
                      <span>🔴 Critical: {critical.length}</span>
                      {nearCritical.length > 0 && <span style={{ color: '#e65100' }}>⚠️ Near-Critical: {nearCritical.length}</span>}
                    </div>
                  </div>

                  {/* Activity types + Date milestones */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Activity Types</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: '#f5f5f5' }}>
                          {['Type Code', 'Count', 'Share'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #eee' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {Array.from(typeGroups.entries()).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <tr key={type} style={{ borderBottom: '1px solid #f5f5f5' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 700 }}>{type}</td>
                              <td style={{ padding: '7px 10px' }}>{count}</td>
                              <td style={{ padding: '7px 10px', minWidth: 120 }}>
                                {BAR(total > 0 ? (count / total) * 100 : 0, '#1565c0', 6)}
                                <span style={{ fontSize: 11, color: '#888' }}>{total > 0 ? ((count / total) * 100).toFixed(1) : 0}%</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Schedule Milestones</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {[
                          ['Project Start', projectStart, '#1565c0'],
                          ['Project Finish', projectFinish, '#c62828'],
                          ['Total Duration', allStarts[0] && allFinishes[allFinishes.length-1] ? (() => {
                            const s = new Date(allStarts[0]), f = new Date(allFinishes[allFinishes.length-1])
                            const days = Math.ceil((f.getTime() - s.getTime()) / (1000*60*60*24))
                            return `${days} days (${(days/30).toFixed(0)} months)`
                          })() : '—', '#1a6b4a'],
                          ['Critical Activities', `${critical.length} (${total > 0 ? ((critical.length/total)*100).toFixed(1) : 0}% of total)`, '#c62828'],
                          ['Float = 0 activities', `${critical.length} activities on critical path`, '#c62828'],
                        ].map(([l, v, c]) => (
                          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8f8f8', borderRadius: 8, borderLeft: `3px solid ${c}` }}>
                            <span style={{ fontSize: 13, color: '#666' }}>{l}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>}

                {/* ── ACTIVITY LIST TAB ── */}
                {scheduleTab === 'list' && <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                    <input
                      value={scheduleFilter}
                      onChange={e => setScheduleFilter(e.target.value)}
                      placeholder="🔍 Search by activity ID, name, or WBS..."
                      style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}
                    />
                    <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>{filtered.length.toLocaleString()} activities</span>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                          {['Activity ID', 'Activity Name', 'WBS', 'Status', 'Orig.Dur', 'Rem.Dur', '% Complete', 'Planned Start', 'Planned Finish', 'Total Float'].map(h => (
                            <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 200).map((a: any) => {
                          const isCritical = (a.total_float ?? 999) === 0
                          const isNearCrit = (a.total_float ?? 999) <= 5 && (a.total_float ?? 999) > 0
                          return (
                            <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0', background: isCritical ? '#fff5f5' : isNearCrit ? '#fffbf0' : 'white' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 700, color: isCritical ? '#c62828' : '#333', whiteSpace: 'nowrap' }}>{a.activity_id}</td>
                              <td style={{ padding: '7px 10px', maxWidth: 280 }}>{a.activity_name}</td>
                              <td style={{ padding: '7px 10px', color: '#888', fontSize: 11 }}>{a.wbs_code?.split('.').slice(-2).join('.') ?? '—'}</td>
                              <td style={{ padding: '7px 10px' }}>
                                <span style={{ background: (statusColor[a.status] ?? '#888') + '22', color: statusColor[a.status] ?? '#888', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.status}</span>
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{a.original_duration ?? '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{a.remaining_duration ?? '—'}</td>
                              <td style={{ padding: '7px 10px', minWidth: 100 }}>
                                {BAR(a.schedule_pct ?? 0, '#1a6b4a', 6)}
                                <span style={{ fontSize: 11, color: '#888' }}>{a.schedule_pct ?? 0}%</span>
                              </td>
                              <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#555' }}>{a.planned_start ? new Date(a.planned_start).toLocaleDateString('en-GB') : '—'}</td>
                              <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#555' }}>{a.planned_finish ? new Date(a.planned_finish).toLocaleDateString('en-GB') : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: isCritical ? '#c62828' : isNearCrit ? '#e65100' : '#2e7d32' }}>{a.total_float ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {filtered.length > 200 && (
                      <div style={{ padding: '12px 16px', background: '#f8f8f8', fontSize: 13, color: '#888', textAlign: 'center' }}>
                        Showing 200 of {filtered.length.toLocaleString()} activities. Use search to filter.
                      </div>
                    )}
                  </div>
                </>}

                {/* ── CRITICAL PATH TAB ── */}
                {scheduleTab === 'critical' && <>
                  <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 10, padding: '14px 20px', marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, color: '#c62828', marginBottom: 6 }}>🔴 Critical Path — {critical.length} Activities (Total Float = 0)</div>
                    <div style={{ fontSize: 13, color: '#666' }}>These activities have zero float. Any delay will directly delay the project completion date.</div>
                  </div>
                  {nearCritical.length > 0 && (
                    <div style={{ background: '#fff8e1', border: '1px solid #ffcc80', borderRadius: 10, padding: '14px 20px', marginBottom: 20 }}>
                      <div style={{ fontWeight: 700, color: '#e65100', marginBottom: 6 }}>⚠️ Near-Critical — {nearCritical.length} Activities (Float ≤ 5 days)</div>
                      <div style={{ fontSize: 13, color: '#666' }}>These activities are at risk of becoming critical. Monitor closely.</div>
                    </div>
                  )}
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#c62828', color: '#fff' }}>
                          {['Activity ID', 'Activity Name', 'Duration', 'Planned Start', 'Planned Finish', 'Float', 'Risk'].map(h => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...critical, ...nearCritical].sort((a: any, b: any) => (a.planned_start ?? '').localeCompare(b.planned_start ?? '')).map((a: any) => {
                          const isCrit = (a.total_float ?? 999) === 0
                          return (
                            <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0', background: isCrit ? '#fff5f5' : '#fffbf0' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 700, color: isCrit ? '#c62828' : '#e65100' }}>{a.activity_id}</td>
                              <td style={{ padding: '9px 12px' }}>{a.activity_name}</td>
                              <td style={{ padding: '9px 12px', textAlign: 'right' }}>{a.original_duration}d</td>
                              <td style={{ padding: '9px 12px' }}>{a.planned_start ? new Date(a.planned_start).toLocaleDateString('en-GB') : '—'}</td>
                              <td style={{ padding: '9px 12px' }}>{a.planned_finish ? new Date(a.planned_finish).toLocaleDateString('en-GB') : '—'}</td>
                              <td style={{ padding: '9px 12px', fontWeight: 800, color: isCrit ? '#c62828' : '#e65100', textAlign: 'center' }}>{a.total_float}</td>
                              <td style={{ padding: '9px 12px' }}>
                                <span style={{ background: isCrit ? '#ffebee' : '#fff8e1', color: isCrit ? '#c62828' : '#e65100', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{isCrit ? '🔴 Critical' : '⚠️ Near-Critical'}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>}
              </>}
            </>
          })()}

          {activeView === 'villas' && (() => {
            if (!projectId) return <Card title="Villa Tracker"><div>Select a project first.</div></Card>

            // ── helpers ──────────────────────────────────────────────
            const phases = structureNodes.filter((n: StructureNode) => n.type?.toLowerCase() === 'phase')
            const villaTypes = structureNodes.filter((n: StructureNode) => ['villa','building','tower','cluster','block'].includes(n.type))
            
            const progressFor = (unitId: string, trade: TradeType) =>
              villaProgress.find((p: any) => p.villa_unit_id === unitId && p.trade === trade)?.completion_pct ?? 0

            const overallPct = (unitId: string) => {
              const tradeScores = TRADES.map(t => progressFor(unitId, t))
              const active = tradeScores.filter(p => p > 0)
              if (!active.length) return 0
              return Math.round(tradeScores.reduce((a, b) => a + b, 0) / TRADES.length)
            }

            const villaTypeStats = (typeId: string) => {
              const units = villaUnits.filter((u: any) => u.villa_type_id === typeId)
              const completed = units.filter((u: any) => u.status === 'Completed').length
              const inProgress = units.filter((u: any) => u.status === 'In Progress').length
              const avgPct = units.length > 0 ? Math.round(units.reduce((s: number, u: any) => s + overallPct(u.id), 0) / units.length) : 0
              return { total: units.length, completed, inProgress, avgPct }
            }

            // Filtered units for tracker
            const filteredUnits = villaUnits.filter((u: any) => {
              if (villaFilterPhase && u.phase_id !== villaFilterPhase) return false
              if (villaFilterType && u.villa_type_id !== villaFilterType) return false
              if (villaFilterSub && u.subcontractor_id !== villaFilterSub) return false
              return true
            })

            const BAR = (pct: number, color: string, h = 6) => (
              <div style={{ height: h, background: '#e8e8e8', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
              </div>
            )

            const statusColor: Record<string, string> = {
              'Not Started': '#888', 'In Progress': '#1565c0', 'Completed': '#2e7d32', 'On Hold': '#e65100'
            }
            const tradeColor: Record<string, string> = {
              Structural: '#1565c0', MEP: '#6a1b9a', Finishing: '#e65100', 'External Works': '#2e7d32', Landscaping: '#1a6b4a', Other: '#888'
            }

            // BOQ stats per type
            const boqForType = (typeId: string) => boqItems.filter(b => b.structure_id === typeId)
            const boqValueForType = (typeId: string) => boqForType(typeId).reduce((s, b) => s + (b.boq_qty ?? 0) * ((b as any).client_rate ?? (b as any).rate ?? 0), 0)

            return <>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                {([['overview','🏘️ Overview'], ['generate','⚙️ Generate Villas'], ['tracker','📋 Villa Tracker'], ['progress','📊 Progress Update']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setVillaTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: villaTab === id ? '#1a6b4a' : '#f0f0f0', color: villaTab === id ? '#fff' : '#333' }}>{label}</button>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 13, color: '#666', alignSelf: 'center' }}>
                  {villaUnits.length} villas · {villaUnits.filter((u: any) => u.status === 'Completed').length} completed · {villaUnits.filter((u: any) => u.status === 'In Progress').length} in progress
                </div>
              </div>

              {/* ── OVERVIEW TAB ── */}
              {villaTab === 'overview' && <>
                {/* KPI strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
                  {([
                    ['Total Villas', villaUnits.length, '#1a1a1a'],
                    ['Not Started', villaUnits.filter((u: any) => u.status === 'Not Started').length, '#888'],
                    ['In Progress', villaUnits.filter((u: any) => u.status === 'In Progress').length, '#1565c0'],
                    ['Completed', villaUnits.filter((u: any) => u.status === 'Completed').length, '#2e7d32'],
                    ['On Hold', villaUnits.filter((u: any) => u.status === 'On Hold').length, '#e65100'],
                  ] as const).map(([l, v, c]) => (
                    <div key={l} style={{ background: '#fff', border: '1px solid #e8e8e8', borderLeft: `4px solid ${c}`, borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{l}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Per villa type summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
                  {villaTypes.map(vt => {
                    const stats = villaTypeStats(vt.id)
                    const boqVal = boqValueForType(vt.id)
                    const boqCount = boqForType(vt.id).length
                    if (stats.total === 0 && boqCount === 0) return null
                    return (
                      <div key={vt.id} style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ background: '#1a6b4a', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 15 }}>{vt.type} — {vt.code}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{vt.name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{stats.total} villas</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{boqCount} BOQ items</div>
                          </div>
                        </div>
                        <div style={{ padding: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                            <span>Overall Progress</span>
                            <span style={{ fontWeight: 700, color: '#1a6b4a' }}>{stats.avgPct}%</span>
                          </div>
                          {BAR(stats.avgPct, '#1a6b4a', 10)}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                            <div style={{ textAlign: 'center', background: '#f5f5f5', borderRadius: 6, padding: '6px 0' }}>
                              <div style={{ fontWeight: 700, color: '#2e7d32' }}>{stats.completed}</div>
                              <div style={{ fontSize: 11, color: '#888' }}>Done</div>
                            </div>
                            <div style={{ textAlign: 'center', background: '#f5f5f5', borderRadius: 6, padding: '6px 0' }}>
                              <div style={{ fontWeight: 700, color: '#1565c0' }}>{stats.inProgress}</div>
                              <div style={{ fontSize: 11, color: '#888' }}>Active</div>
                            </div>
                            <div style={{ textAlign: 'center', background: '#f5f5f5', borderRadius: 6, padding: '6px 0' }}>
                              <div style={{ fontWeight: 700 }}>{money(boqVal)}</div>
                              <div style={{ fontSize: 11, color: '#888' }}>BOQ Value</div>
                            </div>
                          </div>
                          {/* Per trade progress */}
                          <div style={{ marginTop: 12 }}>
                            {TRADES.map(trade => {
                              const units = villaUnits.filter((u: any) => u.villa_type_id === vt.id)
                              const avg = units.length > 0 ? Math.round(units.reduce((s: number, u: any) => s + progressFor(u.id, trade), 0) / units.length) : 0
                              if (avg === 0) return null
                              return (
                                <div key={trade} style={{ marginBottom: 6 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                                    <span style={{ color: tradeColor[trade] }}>{trade}</span>
                                    <span>{avg}%</span>
                                  </div>
                                  {BAR(avg, tradeColor[trade], 5)}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {villaTypes.length === 0 && <div style={{ color: '#888', padding: 20 }}>No villa types found. Add villa types in Project Structure first.</div>}
                </div>
              </>}

              {/* ── GENERATE VILLAS TAB ── */}
              {villaTab === 'generate' && (<>
                <Card title="Generate Villa Units">
                  <div style={{ marginBottom: 16, padding: '10px 16px', background: '#e3f2fd', borderRadius: 8, fontSize: 13, color: '#1565c0' }}>
                    ℹ️ Generate villa unit numbers in bulk. Each villa gets a unique number. You can assign a subcontractor now or later.
                  </div>
                  <FormGrid>
                    <Field label="Phase">
                      <Select value={villaGenForm.phase_id} onChange={e => setVillaGenForm({ ...villaGenForm, phase_id: e.target.value })}>
                        <option value="">Select Phase</option>
                        {phases.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Villa Type">
                      <Select value={villaGenForm.villa_type_id} onChange={e => {
                        const vt = villaTypes.find(v => v.id === e.target.value)
                        setVillaGenForm({ ...villaGenForm, villa_type_id: e.target.value, prefix: vt?.code ?? '' })
                      }}>
                        <option value="">Select Villa Type</option>
                        {villaTypes.map(v => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Number of Villas">
                      <Input type="number" value={villaGenForm.count} onChange={e => setVillaGenForm({ ...villaGenForm, count: e.target.value })} min="1" max="200" />
                    </Field>
                    <Field label="Villa Number Prefix (e.g. V1-, B2-)">
                      <Input value={villaGenForm.prefix} onChange={e => setVillaGenForm({ ...villaGenForm, prefix: e.target.value })} placeholder="e.g. V1-" />
                    </Field>
                    <Field label="Default Subcontractor (optional)">
                      <Select value={villaGenForm.subcontractor_id} onChange={e => setVillaGenForm({ ...villaGenForm, subcontractor_id: e.target.value })}>
                        <option value="">Assign later</option>
                        {subcontractors.map(s => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                      </Select>
                    </Field>
                  </FormGrid>
                  {villaGenForm.villa_type_id && villaGenForm.phase_id && parseInt(villaGenForm.count) > 0 && (
                    <div style={{ margin: '12px 0', padding: '10px 16px', background: '#f0f7f4', borderRadius: 8, fontSize: 13 }}>
                      Will generate: <strong>{villaGenForm.prefix || 'V'}-001</strong> to <strong>{villaGenForm.prefix || 'V'}-{String(parseInt(villaGenForm.count)).padStart(3,'0')}</strong>
                    </div>
                  )}
                  <Toolbar>
                    <Button
                      onClick={async () => {
                        if (!villaGenForm.phase_id || !villaGenForm.villa_type_id || !parseInt(villaGenForm.count)) return
                        const count = parseInt(villaGenForm.count)
                        // Find existing villas for this type to continue numbering
                        const existing = villaUnits.filter((u: any) => u.villa_type_id === villaGenForm.villa_type_id && u.phase_id === villaGenForm.phase_id).length
                        const units = Array.from({ length: count }, (_, i) => ({
                          phase_id: villaGenForm.phase_id,
                          villa_type_id: villaGenForm.villa_type_id,
                          villa_no: `${villaGenForm.prefix || 'V'}-${String(existing + i + 1).padStart(3, '0')}`,
                          subcontractor_id: villaGenForm.subcontractor_id || null,
                          status: 'Not Started' as const,
                        }))
                        await run('Generate villas', () => bulkCreateVillaUnits.mutateAsync({ projectId: projectId!, units }))
                        setVillaGenForm({ ...villaGenForm, count: '10' })
                      }}
                      disabled={bulkCreateVillaUnits.isPending || !villaGenForm.phase_id || !villaGenForm.villa_type_id}
                    >
                      {bulkCreateVillaUnits.isPending ? 'Generating...' : `Generate ${villaGenForm.count} Villas`}
                    </Button>
                  </Toolbar>
                </Card>

                {/* ── PHASE 2 BULK INSERT ── */}
                {(() => {
                  const ph2 = structureNodes.filter((n: StructureNode) => n.type?.toLowerCase() === 'phase')
                  const vtypes = structureNodes.filter((n: StructureNode) => ['villa','building','block','cluster','tower'].includes(n.type))
                  if (!ph2.length || !vtypes.length) return null
                  const selectedPh = ph2.find((n: StructureNode) => n.id === ph2Form.phase_id)
                  const selectedVT = vtypes.find((n: StructureNode) => n.id === ph2Form.villa_type_id)
                  const startN = parseInt(ph2Form.start_no) || 1
                  const countN = parseInt(ph2Form.count) || 0
                  return (
                    <Card title="⚡ Bulk Insert — Phase 2 Villas (SQL-style)">
                      <div style={{ marginBottom: 14, padding: '10px 16px', background: '#fff3e0', borderRadius: 8, fontSize: 13, color: '#e65100' }}>
                        ⚡ High-volume bulk insert for Phase 2. Generates villa units starting from a custom number with a specified prefix.
                      </div>
                      <FormGrid>
                        <Field label="Phase">
                          <Select value={ph2Form.phase_id} onChange={e => setPh2Form({ ...ph2Form, phase_id: e.target.value })}>
                            <option value="">Select Phase</option>
                            {ph2.map((p: StructureNode) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                          </Select>
                        </Field>
                        <Field label="Villa Type">
                          <Select value={ph2Form.villa_type_id} onChange={e => {
                            const vt = vtypes.find((v: StructureNode) => v.id === e.target.value)
                            setPh2Form({ ...ph2Form, villa_type_id: e.target.value, prefix: vt ? vt.code + '-' : ph2Form.prefix })
                          }}>
                            <option value="">Select Type</option>
                            {vtypes.map((v: StructureNode) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
                          </Select>
                        </Field>
                        <Field label="Prefix"><Input value={ph2Form.prefix} onChange={e => setPh2Form({ ...ph2Form, prefix: e.target.value })} placeholder="e.g. V2-" /></Field>
                        <Field label="Start Number"><Input type="number" value={ph2Form.start_no} onChange={e => setPh2Form({ ...ph2Form, start_no: e.target.value })} /></Field>
                        <Field label="Count"><Input type="number" value={ph2Form.count} onChange={e => setPh2Form({ ...ph2Form, count: e.target.value })} /></Field>
                        <Field label="Default Subcontractor">
                          <Select value={ph2Form.subcontractor_id} onChange={e => setPh2Form({ ...ph2Form, subcontractor_id: e.target.value })}>
                            <option value="">None</option>
                            {subcontractors.map(s => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                          </Select>
                        </Field>
                      </FormGrid>
                      {ph2Form.phase_id && ph2Form.villa_type_id && countN > 0 && (
                        <div style={{ margin: '12px 0', padding: '12px 16px', background: '#f0f7f4', borderRadius: 8, fontSize: 13 }}>
                          Phase: <strong>{selectedPh?.code}</strong> · Type: <strong>{selectedVT?.code}</strong> · Will insert <strong>{countN}</strong> units: <strong>{ph2Form.prefix}{String(startN).padStart(3,'0')}</strong> → <strong>{ph2Form.prefix}{String(startN + countN - 1).padStart(3,'0')}</strong>
                        </div>
                      )}
                      <Toolbar>
                        <Button
                          onClick={async () => {
                            if (!ph2Form.phase_id || !ph2Form.villa_type_id || countN <= 0) return
                            const units = Array.from({ length: countN }, (_, i) => ({
                              phase_id: ph2Form.phase_id,
                              villa_type_id: ph2Form.villa_type_id,
                              villa_no: `${ph2Form.prefix}${String(startN + i).padStart(3, '0')}`,
                              subcontractor_id: ph2Form.subcontractor_id || null,
                              status: 'Not Started' as const,
                            }))
                            const BATCH = 200
                            let total = 0
                            for (let i = 0; i < units.length; i += BATCH) {
                              await bulkCreateVillaUnits.mutateAsync({ projectId: projectId!, units: units.slice(i, i + BATCH) })
                              total += Math.min(BATCH, units.length - i)
                            }
                            setMessage(`✅ Successfully inserted ${total} Phase 2 villa units.`)
                            setPh2Form({ ...ph2Form, count: '100' })
                          }}
                          disabled={bulkCreateVillaUnits.isPending || !ph2Form.phase_id || !ph2Form.villa_type_id || countN <= 0}
                        >
                          {bulkCreateVillaUnits.isPending ? 'Inserting...' : `⚡ Bulk Insert ${countN} Villas`}
                        </Button>
                      </Toolbar>
                    </Card>
                  )
                })()}
              </>)}

              {/* ── TRACKER TAB ── */}
              {villaTab === 'tracker' && <>
                {/* Filters */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <Select value={villaFilterPhase} onChange={e => setVillaFilterPhase(e.target.value)} style={{ minWidth: 160 }}>
                    <option value="">All Phases</option>
                    {phases.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </Select>
                  <Select value={villaFilterType} onChange={e => setVillaFilterType(e.target.value)} style={{ minWidth: 160 }}>
                    <option value="">All Types</option>
                    {villaTypes.map(v => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
                  </Select>
                  <Select value={villaFilterSub} onChange={e => setVillaFilterSub(e.target.value)} style={{ minWidth: 180 }}>
                    <option value="">All Subcontractors</option>
                    {subcontractors.map(s => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                  </Select>
                  <span style={{ fontSize: 13, color: '#888', alignSelf: 'center' }}>{filteredUnits.length} villas</span>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1a6b4a', color: '#fff' }}>
                        {['Villa No', 'Phase', 'Type', 'Subcontractor', 'Status', 'Overall %', ...TRADES, 'Actions'].map(h => (
                          <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnits.length === 0 && (
                        <tr><td colSpan={10 + TRADES.length} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No villas found. Generate villas in the Generate tab.</td></tr>
                      )}
                      {filteredUnits.map((u: any) => {
                        const phase = structures.find(s => s.id === u.phase_id)
                        const vtype = structures.find(s => s.id === u.villa_type_id)
                        const sub = subcontractors.find(s => s.id === u.subcontractor_id)
                        const overall = overallPct(u.id)
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '7px 10px', fontWeight: 700 }}>{u.villa_no}</td>
                            <td style={{ padding: '7px 10px', color: '#666' }}>{phase?.code ?? '—'}</td>
                            <td style={{ padding: '7px 10px' }}>{vtype?.code ?? '—'}</td>
                            <td style={{ padding: '7px 10px', fontSize: 11 }}>{sub?.subcontractor_code ?? <span style={{ color: '#e65100' }}>Unassigned</span>}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <select value={u.status} onChange={async e => {
                                await run('Update status', () => updateVillaUnit.mutateAsync({ id: u.id, data: { status: e.target.value as any } }))
                              }} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid #ddd', color: statusColor[u.status] ?? '#333', fontWeight: 600, cursor: 'pointer' }}>
                                {['Not Started','In Progress','Completed','On Hold'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '7px 10px', minWidth: 80 }}>
                              {BAR(overall, overall >= 80 ? '#2e7d32' : overall >= 40 ? '#f9a825' : '#1565c0', 6)}
                              <span style={{ fontSize: 11, color: '#666' }}>{overall}%</span>
                            </td>
                            {TRADES.map(trade => {
                              const pct = progressFor(u.id, trade)
                              return (
                                <td key={trade} style={{ padding: '4px 6px', minWidth: 60 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <div style={{ flex: 1 }}>{BAR(pct, tradeColor[trade], 4)}</div>
                                    <span style={{ fontSize: 10, color: '#888', minWidth: 24 }}>{pct}%</span>
                                  </div>
                                </td>
                              )
                            })}
                            <td style={{ padding: '7px 10px' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => { setSelectedVillaUnit(u.id); setVillaTab('progress'); const init: Record<string, string> = {}; TRADES.forEach(t => { init[t] = String(progressFor(u.id, t)) }); setProgressForm(init) }} style={{ padding: '3px 8px', background: '#e3f2fd', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#1565c0', fontWeight: 600 }}>Update</button>
                                <button onClick={() => run('Delete', () => deleteVillaUnit.mutateAsync({ id: u.id, projectId: projectId! }))} style={{ padding: '3px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: 14 }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>}

              {/* ── PROGRESS UPDATE TAB ── */}
              {villaTab === 'progress' && (
                <Card title="Update Villa Progress by Trade">
                  <div style={{ marginBottom: 16 }}>
                    <Field label="Select Villa">
                      <Select value={selectedVillaUnit} onChange={e => {
                        setSelectedVillaUnit(e.target.value)
                        const init: Record<string, string> = {}
                        TRADES.forEach(t => { init[t] = String(progressFor(e.target.value, t)) })
                        setProgressForm(init)
                      }}>
                        <option value="">— Select Villa —</option>
                        {villaUnits.map((u: any) => {
                          const vtype = structures.find(s => s.id === u.villa_type_id)
                          const phase = structures.find(s => s.id === u.phase_id)
                          return <option key={u.id} value={u.id}>{u.villa_no} — {vtype?.code} — {phase?.code}</option>
                        })}
                      </Select>
                    </Field>
                  </div>

                  {selectedVillaUnit && (() => {
                    const unit = villaUnits.find((u: any) => u.id === selectedVillaUnit) as any
                    const vtype = structures.find(s => s.id === unit?.villa_type_id)
                    const boqItems4Type = boqForType(unit?.villa_type_id ?? '')
                    const boqByDiscipline = new Map<string, typeof boqItems4Type>()
                    boqItems4Type.forEach(b => {
                      const disc = b.discipline ?? 'Other'
                      boqByDiscipline.set(disc, [...(boqByDiscipline.get(disc) ?? []), b])
                    })

                    return (
                      <div>
                        <div style={{ background: '#1a6b4a', color: '#fff', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{unit?.villa_no}</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>Type: {vtype?.code} — {vtype?.name} · {boqItems4Type.length} BOQ items</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 800 }}>{overallPct(selectedVillaUnit)}%</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>Overall Progress</div>
                          </div>
                        </div>

                        {/* Trade progress sliders */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20, marginBottom: 20 }}>
                          {TRADES.map(trade => {
                            const val = parseInt(progressForm[trade] ?? '0') || 0
                            // Find relevant BOQ items for this trade
                            const relatedBoq = boqItems4Type.filter(b => {
                              const d = b.discipline ?? ''
                              if (trade === 'Structural') return ['Structural','Civil'].includes(d)
                              if (trade === 'MEP') return ['MEP','Electrical','Plumbing','HVAC'].includes(d)
                              if (trade === 'Finishing') return ['Architectural','Finishing','Fit-Out','Facade'].includes(d)
                              if (trade === 'External Works') return ['Infrastructure','External'].includes(d)
                              if (trade === 'Landscaping') return d === 'Landscaping'
                              return true
                            })
                            return (
                              <div key={trade} style={{ background: '#f8f8f8', borderRadius: 10, padding: 16, borderLeft: `4px solid ${tradeColor[trade]}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                  <span style={{ fontWeight: 700, color: tradeColor[trade] }}>{trade}</span>
                                  <span style={{ fontWeight: 800, fontSize: 18, color: tradeColor[trade] }}>{val}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0" max="100" step="5"
                                  value={val}
                                  onChange={e => setProgressForm({ ...progressForm, [trade]: e.target.value })}
                                  style={{ width: '100%', accentColor: tradeColor[trade], marginBottom: 8 }}
                                />
                                {BAR(val, tradeColor[trade], 8)}
                                {relatedBoq.length > 0 && (
                                  <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                                    Related BOQ: {relatedBoq.slice(0,3).map(b => b.item_code).join(', ')}{relatedBoq.length > 3 ? ` +${relatedBoq.length-3} more` : ''}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        <div style={{ background: '#f0f7f4', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', gap: 24, fontSize: 14 }}>
                          <span>New Overall Progress: <strong style={{ color: '#1a6b4a', fontSize: 18 }}>{Math.round(TRADES.reduce((s, t) => s + (parseInt(progressForm[t] ?? '0') || 0), 0) / TRADES.length)}%</strong></span>
                        </div>

                        <Button
                          onClick={async () => {
                            await run('Save progress', async () => {
                              for (const trade of TRADES) {
                                const pct = parseInt(progressForm[trade] ?? '0') || 0
                                if (pct > 0 || progressFor(selectedVillaUnit, trade as TradeType) > 0) {
                                  await upsertVillaProgress.mutateAsync({
                                    project_id: projectId!,
                                    villa_unit_id: selectedVillaUnit,
                                    trade: trade as TradeType,
                                    completion_pct: pct,
                                    notes: null,
                                    updated_by: user?.id ?? null,
                                    updated_at: new Date().toISOString(),
                                  })
                                }
                              }
                              // Auto-update villa status
                              const overall = Math.round(TRADES.reduce((s, t) => s + (parseInt(progressForm[t] ?? '0') || 0), 0) / TRADES.length)
                              const newStatus = overall === 100 ? 'Completed' : overall > 0 ? 'In Progress' : 'Not Started'
                              await updateVillaUnit.mutateAsync({ id: selectedVillaUnit, data: { status: newStatus as any } })
                            })
                          }}
                          disabled={upsertVillaProgress.isPending}
                        >
                          💾 Save Progress
                        </Button>
                      </div>
                    )
                  })()}
                </Card>
              )}
            </>
          })()}

          {activeView === 'villa-assignments' && (() => {
            if (!projectId) return <Card title="Villa Assignments"><div>Select a project first.</div></Card>

            // ── helpers ───────────────────────────────────────────
            const assignmentTradeOptions = contractTradeOptions

            // Get villa type node for a villa node
            const getVillaType = (villaNodeId: string) => {
              const villaNode = structureNodes.find((n: StructureNode) => n.id === villaNodeId)
              if (!villaNode?.parent_id) return null
              return structureNodes.find((n: StructureNode) => n.id === villaNode.parent_id)
            }

            // Get BOQ items for a villa type + trade
            const getBoqForTrade = (villaTypeNodeId: string, trade: string) => {
              const selectedDiscipline = cleanDiscipline(trade)
              return boqItems.filter((b: any) =>
                b.structure_id === villaTypeNodeId &&
                (!selectedDiscipline || cleanDiscipline(b.discipline) === selectedDiscipline)
              )
            }

            // Get all villa nodes (individual villas - lowest level nodes of type villa)
            const villaNodes = structureNodes.filter((n: StructureNode) =>
              n.type?.toLowerCase() === 'villa' && structureNodes.some((p: StructureNode) => p.id === n.parent_id && p.type?.toLowerCase() === 'villa')
              || (n.type?.toLowerCase() === 'villa' && !structureNodes.some((c: StructureNode) => c.parent_id === n.id))
            )

            // Assignments for selected villa
            const assignmentsForVilla = (villaNodeId: string) =>
              villaAssignments.filter((a: any) => a.villa_node_id === villaNodeId)

            // Summary stats
            const assignedVillas = new Set(villaAssignments.map((a: any) => a.villa_node_id)).size
            const totalVillas = structureNodes.filter((n: StructureNode) => n.type?.toLowerCase() === 'villa').length

            return <>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                {([['assign','🔑 Assign'], ['breakdown','📋 Breakdown Lines'], ['summary','📊 Summary']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setAssignTab(id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: assignTab === id ? '#1a6b4a' : '#f0f0f0', color: assignTab === id ? '#fff' : '#333' }}>{label}</button>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 13, color: '#666' }}>
                  {assignedVillas} / {totalVillas} villas assigned
                </div>
              </div>

              {/* ── TAB 1: ASSIGN ── */}
              {assignTab === 'assign' && <>
                <Card title="Assign Subcontractor to Villa">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, marginBottom: 16 }}>
                    <Field label="Villa Node">
                      <Select value={assignForm.villa_node_id} onChange={e => setAssignForm({ ...assignForm, villa_node_id: e.target.value })}>
                        <option value="">— Select Villa —</option>
                        {structureNodes.filter((n: StructureNode) => n.type?.toLowerCase() === 'villa').map((n: StructureNode) => {
                          const hasAssign = assignmentsForVilla(n.id).length > 0
                          return <option key={n.id} value={n.id}>{hasAssign ? '✓ ' : ''}{n.code} — {n.name}</option>
                        })}
                      </Select>
                    </Field>
                    <Field label="Trade">
                      <Select value={assignForm.trade} onChange={e => setAssignForm({ ...assignForm, trade: e.target.value })}>
                        {assignmentTradeOptions.map((t: string) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </Field>
                    <Field label="Subcontractor">
                      <Select value={assignForm.subcontractor_id} onChange={e => setAssignForm({ ...assignForm, subcontractor_id: e.target.value })}>
                        <option value="">— Select —</option>
                        {subcontractors.map(s => <option key={s.id} value={s.id}>{s.subcontractor_code} — {s.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Notes"><Input value={assignForm.rate_pct} onChange={e => setAssignForm({ ...assignForm, rate_pct: e.target.value })} placeholder="Notes..." /></Field>
                    <div style={{ paddingTop: 22 }}>
                      <Button onClick={async () => {
                        if (!assignForm.villa_node_id || !assignForm.subcontractor_id) return
                        const villaNode = structureNodes.find((n: StructureNode) => n.id === assignForm.villa_node_id)
                        const villaTypeNode = getVillaType(assignForm.villa_node_id)
                        if (!villaTypeNode) { alert('Villa must be nested under a Villa Type node'); return }
                        // Create assignment
                        const assignment = await run('Assign', () => createVillaAssignment.mutateAsync({
                          project_id: projectId!,
                          villa_node_id: assignForm.villa_node_id,
                          villa_type_node_id: villaTypeNode.id,
                          subcontractor_id: assignForm.subcontractor_id,
                          trade: assignForm.trade,
                          notes: assignForm.rate_pct || null,
                        }))
                        // Auto-create breakdown lines from BOQ
                        const boqForTrade = getBoqForTrade(villaTypeNode.id, assignForm.trade)
                        if (boqForTrade.length > 0) {
                          await bulkCreateVillaBreakdown.mutateAsync({
                            projectId: projectId!,
                            lines: boqForTrade.map((b: any) => ({
                              villa_assignment_id: (assignment as any)?.id ?? '',
                              villa_node_id: assignForm.villa_node_id,
                              villa_type_node_id: villaTypeNode.id,
                              subcontractor_id: assignForm.subcontractor_id,
                              trade: assignForm.trade,
                              boq_item_id: b.id,
                              subcontract_qty: b.boq_qty ?? 0,
                              rate: b.client_rate ?? b.rate ?? 0,
                              contract_value: (b.boq_qty ?? 0) * (b.client_rate ?? b.rate ?? 0),
                            }))
                          })
                        }
                        setAssignForm({ ...assignForm, villa_node_id: '', subcontractor_id: '' })
                      }} disabled={createVillaAssignment.isPending || !assignForm.villa_node_id || !assignForm.subcontractor_id}>
                        Assign + Auto-create BOQ Lines
                      </Button>
                    </div>
                  </div>

                  {/* Preview BOQ that will be assigned */}
                  {assignForm.villa_node_id && (() => {
                    const villaTypeNode = getVillaType(assignForm.villa_node_id)
                    if (!villaTypeNode) return <div style={{ color: '#e65100', fontSize: 13 }}>⚠️ This villa is not under a Villa Type node</div>
                    const boq = getBoqForTrade(villaTypeNode.id, assignForm.trade)
                    const totalValue = boq.reduce((s: number, b: any) => s + (b.boq_qty ?? 0) * (b.client_rate ?? b.rate ?? 0), 0)
                    return (
                      <div style={{ background: '#f0f7f4', borderRadius: 10, padding: 16, marginTop: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a6b4a', marginBottom: 10 }}>
                          📋 Auto-inherited BOQ from {villaTypeNode.code} — {villaTypeNode.name} ({assignForm.trade})
                          — {boq.length} items · Total: {money(totalValue)}
                        </div>
                        {boq.length === 0 ? (
                          <div style={{ color: '#e65100', fontSize: 13 }}>No BOQ items found for {villaTypeNode.code} with {assignForm.trade} discipline. Add BOQ items linked to this villa type node first.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead><tr style={{ background: '#e8f5e9' }}>{['Code','Description','Unit','Qty','Rate','Value'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {boq.slice(0, 8).map((b: any) => (
                                <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>{b.item_code}</td>
                                  <td style={{ padding: '5px 8px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.description}</td>
                                  <td style={{ padding: '5px 8px' }}>{b.unit}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{b.boq_qty}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{money(b.client_rate ?? b.rate ?? 0)}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#1a6b4a' }}>{money((b.boq_qty ?? 0) * (b.client_rate ?? b.rate ?? 0))}</td>
                                </tr>
                              ))}
                              {boq.length > 8 && <tr><td colSpan={6} style={{ padding: '5px 8px', color: '#888', fontStyle: 'italic' }}>+{boq.length - 8} more items...</td></tr>}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })()}
                </Card>

                {/* Assignments list */}
                <Card title="Current Assignments">
                  <div style={{ marginBottom: 12 }}>
                    <Select value={selectedVillaForAssign} onChange={e => setSelectedVillaForAssign(e.target.value)} style={{ minWidth: 200 }}>
                      <option value="">All Villas</option>
                      {structureNodes.filter((n: StructureNode) => n.type?.toLowerCase() === 'villa').map((n: StructureNode) => (
                        <option key={n.id} value={n.id}>{n.code} — {n.name}</option>
                      ))}
                    </Select>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['Villa','Villa Type','Trade','Subcontractor','BOQ Items','Notes',''].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(selectedVillaForAssign
                        ? villaAssignments.filter((a: any) => a.villa_node_id === selectedVillaForAssign)
                        : villaAssignments
                      ).map((a: any) => {
                        const villaNode = structureNodes.find((n: StructureNode) => n.id === a.villa_node_id)
                        const typeNode = structureNodes.find((n: StructureNode) => n.id === a.villa_type_node_id)
                        const lines = villaBreakdownLines.filter((l: any) => l.villa_assignment_id === a.id)
                        return (
                          <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700 }}>{villaNode?.code ?? '—'}</td>
                            <td style={{ padding: '8px 12px' }}>{typeNode?.code ?? '—'} — {typeNode?.name ?? '—'}</td>
                            <td style={{ padding: '8px 12px' }}><span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{a.trade}</span></td>
                            <td style={{ padding: '8px 12px' }}>{(a.subcontractors as any)?.subcontractor_code} — {(a.subcontractors as any)?.name}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>{lines.length}</td>
                            <td style={{ padding: '8px 12px', color: '#888', fontSize: 12 }}>{a.notes ?? '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <Button tone="danger" onClick={() => { if (confirm('Delete assignment?')) run('Delete', () => deleteVillaAssignment.mutateAsync({ id: a.id, projectId: projectId! })) }}>✕</Button>
                            </td>
                          </tr>
                        )
                      })}
                      {villaAssignments.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No assignments yet.</td></tr>}
                    </tbody>
                  </table>
                </Card>
              </>}

              {/* ── TAB 2: BREAKDOWN LINES ── */}
              {assignTab === 'breakdown' && (
                <Card title="Villa Breakdown Lines">
                  <div style={{ marginBottom: 14 }}>
                    <Select value={selectedVillaForAssign} onChange={e => setSelectedVillaForAssign(e.target.value)} style={{ minWidth: 200 }}>
                      <option value="">All Villas</option>
                      {structureNodes.filter((n: StructureNode) => n.type?.toLowerCase() === 'villa').map((n: StructureNode) => (
                        <option key={n.id} value={n.id}>{n.code} — {n.name}</option>
                      ))}
                    </Select>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                      {['Villa','Type','Trade','Subcontractor','Item Code','Description','Unit','Qty','Rate','Contract Value'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(selectedVillaForAssign
                        ? villaBreakdownLines.filter((l: any) => l.villa_node_id === selectedVillaForAssign)
                        : villaBreakdownLines
                      ).map((l: any) => {
                        const villaNode = structureNodes.find((n: StructureNode) => n.id === l.villa_node_id)
                        const typeNode = structureNodes.find((n: StructureNode) => n.id === l.villa_type_node_id)
                        return (
                          <tr key={l.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 700 }}>{villaNode?.code ?? '—'}</td>
                            <td style={{ padding: '6px 10px' }}>{typeNode?.code ?? '—'}</td>
                            <td style={{ padding: '6px 10px' }}><span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{l.trade}</span></td>
                            <td style={{ padding: '6px 10px' }}>{(l.subcontractors as any)?.subcontractor_code ?? '—'}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 700 }}>{(l.boq_items as any)?.item_code ?? '—'}</td>
                            <td style={{ padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(l.boq_items as any)?.description ?? '—'}</td>
                            <td style={{ padding: '6px 10px' }}>{(l.boq_items as any)?.unit ?? '—'}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>{l.subcontract_qty}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>{money(l.rate)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1a6b4a' }}>{money(l.contract_value)}</td>
                          </tr>
                        )
                      })}
                      {villaBreakdownLines.length === 0 && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No breakdown lines yet. Assign villas first.</td></tr>}
                    </tbody>
                  </table>
                </Card>
              )}

              {/* ── TAB 3: SUMMARY ── */}
              {assignTab === 'summary' && (
                <Card title="Assignment Summary by Subcontractor">
                  {(() => {
                    const bySubTrade = new Map<string, { name: string; trade: string; villas: number; items: number; value: number }>()
                    villaBreakdownLines.forEach((l: any) => {
                      const key = l.subcontractor_id + '|' + l.trade
                      const existing = bySubTrade.get(key) ?? { name: (l.subcontractors as any)?.name ?? '—', trade: l.trade, villas: 0, items: 0, value: 0 }
                      bySubTrade.set(key, { ...existing, items: existing.items + 1, value: existing.value + (l.contract_value ?? 0) })
                    })
                    // Count unique villas per sub+trade
                    villaAssignments.forEach((a: any) => {
                      const key = a.subcontractor_id + '|' + a.trade
                      const existing = bySubTrade.get(key)
                      if (existing) bySubTrade.set(key, { ...existing, villas: existing.villas + 1 })
                    })
                    const rows = Array.from(bySubTrade.values()).sort((a, b) => b.value - a.value)
                    const grandTotal = rows.reduce((s, r) => s + r.value, 0)
                    return <>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: '#1a6b4a', color: '#fff' }}>
                          {['Subcontractor','Trade','Villas','BOQ Items','Total Contract Value'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.name}</td>
                              <td style={{ padding: '8px 12px' }}><span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{r.trade}</span></td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.villas}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.items}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1a6b4a' }}>{money(r.value)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#f0f7f4', fontWeight: 800 }}>
                            <td colSpan={4} style={{ padding: '10px 12px' }}>GRAND TOTAL</td>
                            <td style={{ padding: '10px 12px', color: '#1a6b4a', fontSize: 16 }}>{money(grandTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  })()}
                </Card>
              )}
            </>
          })()}
        </div>
      </main>
    </div>
  )
}
