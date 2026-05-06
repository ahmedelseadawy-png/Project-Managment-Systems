import type { BoqItem, CertificateStatus, Discipline, ProcurementStatus, TechnicalStatus, VariationStatus } from '@/types/database'

export interface ClientInvoice {
  id: string
  invoice_no: string
  invoice_date: string
  client_name: string
  description: string
  amount: number
  status: 'Draft' | 'Submitted' | 'Certified' | 'Paid'
  notes?: string
}

export interface ProjectStructure {
  id: string
  project_id: string
  name: string
  code: string
  type: 'Phase' | 'Building' | 'Villa'
  parent_id: string | null
}

export interface BoqItemWithStructure extends BoqItem {
  structure_id: string | null
  rate?: number | null
}

export function money(value?: number | null) {
  return value == null ? '—' : `EGP ${value.toLocaleString()}`
}

export function n(v: string) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export const DISCIPLINES: Discipline[] = ['Structural', 'Architectural', 'MEP', 'Civil', 'Landscaping', 'Fit-Out', 'Facade', 'Infrastructure', 'Other']
export const TECH_STATUSES: TechnicalStatus[] = ['Submitted', 'Under Review', 'Approved', 'Approved with Comments', 'Rejected', 'Closed', 'Overdue']
export const PROCUREMENT_STATUSES: ProcurementStatus[] = ['PR Raised', 'RFQ Issued', 'PO Issued', 'Partially Delivered', 'Delivered', 'Cancelled', 'Delayed']
export const VARIATION_STATUSES: VariationStatus[] = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Partially Approved']
export const CERT_STATUSES: CertificateStatus[] = ['Draft', 'Submitted', 'Approved', 'Paid', 'Cancelled']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): boolean => typeof value === 'string' && UUID_RE.test(value)
