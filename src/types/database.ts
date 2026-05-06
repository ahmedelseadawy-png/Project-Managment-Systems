// src/types/database.ts
export type ProjectStatus = 'Planning'|'Active'|'On Hold'|'Completed'|'Cancelled'
export type SubcontractorStatus = 'Active'|'Inactive'|'Blacklisted'
export type ApprovalStatus = 'Draft'|'Submitted'|'Approved'|'Rejected'|'Cancelled'
export type CertificateStatus = 'Draft'|'Submitted'|'Released'|'Pending Review'|'Pending Approval'|'Pending Technical Office Approval'|'Pending Finance Review'|'Pending CEO Approval'|'Approved'|'Partially Released'|'Payment Held'|'Returned to Originator'|'Rejected'|'Missing Configuration'|'Paid'|'Cancelled'
export type TechnicalRecordType = 'RFI'|'MIR'|'Material Submittal'|'Shop Drawing'|'Method Statement'|'Technical Query'|'NCR'|'Inspection Request'
export type TechnicalStatus = 'Draft'|'Submitted'|'Under Review'|'Approved'|'Approved with Comments'|'Rejected'|'Closed'|'Overdue'
export type ProcurementStatus = 'PR Raised'|'RFQ Issued'|'PO Issued'|'Partially Delivered'|'Delivered'|'Cancelled'|'Delayed'
export type VariationType = 'Addition'|'Omission'|'Substitution'|'Acceleration'|'Provisional Sum'
export type VariationStatus = 'Draft'|'Submitted'|'Under Review'|'Approved'|'Rejected'|'Partially Approved'
export type PriorityLevel = 'Low'|'Medium'|'High'|'Critical'
export type Discipline = string
export type UserRole = 'Admin'|'Project Manager'|'QS Engineer'|'Technical Engineer'|'Site Engineer'|'Procurement Officer'|'Finance'|'Viewer'

export type ApprovalMatrixStepType = 'review' | 'approval'
export type ApprovalAssigneeType = 'role' | 'user'
export type ApprovalDecisionMode = 'any' | 'all'
export type ApprovalRequestStatus = 'draft' | 'pending_review' | 'pending_approval' | 'approved' | 'rejected' | 'returned' | 'cancelled' | 'missing_configuration'
export type ApprovalAssignmentStatus = 'pending' | 'reviewed' | 'approved' | 'rejected' | 'returned' | 'skipped' | 'cancelled'

export interface ApprovalMatrixRule { id:string; rule_name:string; module:string; action:string; project_id:string|null; min_amount:number|null; max_amount:number|null; priority:number; is_active:boolean; created_by:string|null; created_at:string; updated_at:string }
export interface ApprovalMatrixStep { id:string; rule_id:string; step_order:number; step_type:ApprovalMatrixStepType; assignee_type:ApprovalAssigneeType; role_id:string|null; role_name:string|null; user_id:string|null; user_name?:string|null; user_email?:string|null; decision_mode:ApprovalDecisionMode; is_required:boolean; created_at:string }
export interface ApprovalRequest { id:string; module:string; action:string; record_table:string; record_id:string; project_id:string|null; amount:number|null; rule_id:string|null; status:ApprovalRequestStatus; current_step_order:number|null; submitted_by:string|null; submitted_at:string|null; approved_at:string|null; rejected_at:string|null; returned_at:string|null; configuration_message:string|null; created_at:string; updated_at:string }
export interface ApprovalRequestAssignment { id:string; request_id:string; matrix_step_id:string|null; step_order:number; step_type:ApprovalMatrixStepType; assigned_role_id:string|null; assigned_role_name:string|null; assigned_user_id:string|null; assigned_user_name:string|null; assigned_user_email?:string|null; decision_mode:ApprovalDecisionMode; is_required:boolean; status:ApprovalAssignmentStatus; action_by:string|null; action_at:string|null; comments:string|null; created_at:string }
export interface ApprovalAuditLog { id:string; request_id:string; record_table:string; record_id:string; action:string; old_status:string|null; new_status:string|null; actor_user_id:string|null; actor_name:string|null; actor_email?:string|null; comments:string|null; created_at:string }

export interface Project { id:string; project_code:string; project_name:string; client:string|null; location:string|null; contract_value:number|null; start_date:string|null; end_date:string|null; status:ProjectStatus; report_month:string|null; default_retention_pct:number; notes:string|null; created_by:string|null; created_at:string; updated_at:string }
export interface User { id:string; email:string; full_name:string; role:UserRole; is_active:boolean; avatar_url:string|null; created_at:string; updated_at:string }
export interface ProjectUser { id:string; project_id:string; user_id:string; role:UserRole; assigned_at:string }
export interface ProjectStructure { id:string; project_id:string; parent_id:string|null; structure_code:string; structure_name:string; structure_type:'Phase'|'Building'|'Villa'; level_no:number; sort_order:number; is_active:boolean; created_at:string; updated_at:string }

export type NodeType = 'project' | 'phase' | 'zone' | 'cluster' | 'building' | 'tower' | 'block' | 'villa' | 'mall' | 'section' | 'floor' | 'unit' | 'wing' | 'basement' | 'podium' | 'part' | 'custom'

export interface StructureNode {
  id: string
  project_id: string
  parent_id: string | null
  code: string
  name: string
  type: NodeType
  level: number
  sort_order: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export type StructureNodeInsert = Omit<StructureNode, 'id' | 'created_at' | 'updated_at'>
export type StructureNodeUpdate = Partial<StructureNodeInsert>
export interface Subcontractor { id:string; subcontractor_code:string; name:string; trade_scope:string|null; contact_person:string|null; phone:string|null; email:string|null; address:string|null; tax_registration_no:string|null; commercial_reg_no:string|null; default_retention_pct:number; advance_amount:number|null; advance_recovery_pct:number|null; status:SubcontractorStatus; notes:string|null; created_at:string; updated_at:string }
export interface BoqItem { id:string; project_id:string; structure_id:string|null; work_type?:string|null; item_code:string; code?:string|null; description:string; unit:string; boq_qty:number; client_rate:number|null; client_budget:number|null; chapter:string|null; discipline:Discipline|null; csi_ref:string|null; wbs_code:string|null; source_note:string|null; is_provisional:boolean; created_at:string; updated_at:string }
export interface SubcontractBreakdown { id:string; project_id:string; subcontractor_id:string; boq_item_id:string; structure_id:string|null; assignment_key:string; project_model:string|null; subcontract_qty:number; rate:number; contract_value:number|null; client_rate:number|null; contract_type?:string|null; pricing_basis?:string|null; rate_source?:string|null; lump_sum_amount?:number|null; notes:string|null; is_active:boolean; created_at:string; updated_at:string }
export interface QsEntry { id:string; project_id:string; breakdown_id:string|null; boq_item_id:string|null; assignment_key:string; cert_no:number; period_end:string; boq_qty:number; actual_survey_qty:number|null; effective_pay_qty:number|null; notes:string|null; submitted_by:string|null; submitted_at:string|null; status:ApprovalStatus; created_at:string; updated_at:string }
export interface QsApproval { id:string; project_id:string; qs_entry_id:string; status:ApprovalStatus; reviewed_by:string|null; review_date:string|null; approved_qty:number|null; comments:string|null; created_at:string; updated_at:string }
export interface Certificate { id:string; project_id:string; subcontractor_id:string; invoice_no:string; cert_no?:number|null; invoice_date:string|null; period_end:string; gross_amount:number; retention_pct:number; retention_amount:number; net_amount:number; net_payable?:number|null; previous_paid_amount?:number|null; retention_release_amount?:number|null; status:string; approval_status?:string|null; workflow_status?:string|null; approval_request_id?:string|null; approval_locked?:boolean|null; originator_user_id?:string|null; originator_name?:string|null; originator_email?:string|null; released_by?:string|null; released_by_name?:string|null; released_by_email?:string|null; released_at?:string|null; returned_reason?:string|null; rejected_reason?:string|null; approved_certificate_amount?:number|null; released_payment_amount?:number|null; total_released_payments?:number|null; remaining_unpaid_balance?:number|null; ceo_released_amount?:number|null; remaining_unreleased_amount?:number|null; payment_decision?:string|null; remarks:string|null; created_at:string; updated_at:string }
export interface CertificateLine { id:string; invoice_id:string; project_id:string; subcontractor_id:string; breakdown_id:string|null; contract_item_id?:string|null; breakdown_item_id?:string|null; contract_id?:string|null; boq_item_id:string|null; structure_id:string|null; villa_no?:string|null; building_no?:string|null; trade?:string|null; item_description?:string|null; contract_qty?:number|null; previous_qty?:number|null; total_qty?:number|null; previous_amount?:number|null; total_amount?:number|null; allow_over_certification?:boolean|null; over_certification_reason?:string|null; boq_qty:number|null; previous_cumulative_qty:number|null; current_work_pct:number|null; current_qty:number|null; new_cumulative_qty:number|null; rate:number|null; current_value:number|null; cumulative_value:number|null; qs_status:string|null; approved_qty:number|null; remarks:string|null; created_at:string }
export interface TechnicalRecord { id:string; project_id:string; subcontractor_id:string|null; record_type:TechnicalRecordType; reference_no:string; subject:string; discipline:Discipline|null; revision_no:string|null; submission_date:string|null; due_date:string|null; response_date:string|null; status:TechnicalStatus; priority:PriorityLevel; responsible_person:string|null; comments:string|null; attachment_url:string|null; rejection_reason:string|null; boq_item_id:string|null; created_by:string|null; created_at:string; updated_at:string }
export interface ProcurementRecord { id:string; project_id:string; pr_no:string; material:string; boq_item_id:string|null; structure_id:string|null; project_model:string|null; resource_id?:string|null; resource_code?:string|null; budget_unit_rate?:number|null; budget_amount?:number|null; actual_unit_rate?:number|null; actual_amount?:number|null; rate_variance?:number|null; amount_variance?:number|null; structure_ids?:string[]|null; structure_count?:number|null; model_boq_qty?:number|null; required_qty:number|null; unit:string|null; supplier:string|null; pr_date:string|null; rfq_date:string|null; po_date:string|null; po_number:string|null; po_value:number|null; planned_delivery:string|null; actual_delivery:string|null; notes:string|null; status:ProcurementStatus; workflow_status?:string|null; approval_status?:string|null; approval_request_id?:string|null; approval_locked?:boolean|null; created_by:string|null; created_at:string; updated_at:string }
export interface ProcurementRfq { id:string; project_id:string; rfq_no:string; title:string; description?:string|null; procurement_record_id:string|null; material:string|null; required_qty:number|null; unit:string|null; due_date:string|null; required_date?:string|null; status:string; notes:string|null; selected_offer_id?:string|null; awarded_at?:string|null; awarded_by?:string|null; created_by:string|null; created_at:string; updated_at:string }
export interface ProcurementQuotationOffer { id:string; rfq_id:string; project_id:string; supplier_id?:string|null; supplier_name:string; supplier_contact?:string|null; total_amount:number|null; offer_amount?:number|null; currency?:string|null; delivery_days:number|null; payment_terms:string|null; validity_date:string|null; notes:string|null; offer_notes?:string|null; attachment_url?:string|null; is_selected:boolean; selection_reason:string|null; selected_at:string|null; selected_by:string|null; po_conversion_status:string|null; purchase_order_id:string|null; created_by:string|null; created_at:string; updated_at:string }
export interface ProcurementQuotationOfferItem { id:string; offer_id:string; rfq_id:string; item_name?:string|null; description:string; qty:number|null; unit:string|null; unit_price:number|null; total_price:number|null; notes:string|null; created_at:string; updated_at:string }
export interface PaymentRequest { id:string; source_type:string; source_id:string; project_id:string|null; party_type:'subcontractor'|'supplier'; party_id:string|null; gross_amount:number; deductions:number; net_amount:number; paid_amount:number; remaining_amount:number; payment_status:string; due_date:string|null; approval_request_id:string|null; created_by:string|null; updated_by:string|null; created_at:string; updated_at:string }
export interface PurchaseOrder { id:string; project_id:string|null; rfq_id:string|null; selected_offer_id:string|null; po_no:string; supplier_id:string|null; supplier_name:string|null; po_date:string; currency:string; total_amount:number; status:string; notes:string|null; created_by:string|null; updated_by:string|null; created_at:string; updated_at:string }
export interface PurchaseOrderItem { id:string; purchase_order_id:string; item_name:string|null; description:string; unit:string|null; quantity:number; unit_price:number; total_price:number; created_at:string; updated_at:string }
export interface SupplierInvoice { id:string; project_id:string|null; purchase_order_id:string|null; supplier_id:string|null; supplier_name:string|null; invoice_no:string; invoice_date:string|null; gross_amount:number; deductions:number; net_amount:number; approval_status:string|null; payment_status:string|null; created_by:string|null; updated_by:string|null; created_at:string; updated_at:string }
export interface DocumentApprovalStep { id:string; document_type:string; document_id:string; approval_request_id:string|null; step_order:number; action_type:'review'|'approve'; assigned_user_id:string|null; assigned_user_name:string|null; assigned_user_email:string|null; status:'pending'|'approved'|'rejected'|'skipped'; comments:string|null; acted_at:string|null; created_at:string }
export interface FinancialAuditLog { id:string; table_name:string; record_id:string|null; action:'insert'|'update'|'delete'; old_data:any|null; new_data:any|null; changed_by:string|null; changed_at:string }
export interface Variation { id:string; project_id:string; subcontractor_id:string|null; boq_item_id:string|null; vo_no:string; description:string; structure_id:string|null; type:VariationType; qty_impact:number|null; unit:string|null; rate:number|null; financial_impact:number|null; time_impact_days:number|null; status:VariationStatus; approved_value:number|null; submitted_by:string|null; approved_by:string|null; approved_at:string|null; remarks:string|null; created_at:string; updated_at:string }

export interface VDashboardKpis { project_id:string; project_name:string; project_status:ProjectStatus; total_subcontract_value:number; total_certified_value:number; remaining_value:number; technical_open:number; technical_overdue:number; procurement_delayed:number; pending_approvals:number }
export interface VCommercialSummary { project_id:string; subcontractor_id:string; subcontractor_code:string; subcontractor_name:string; total_contract_value:number; total_certified_gross:number; total_net_paid:number; remaining_value:number; achievement_pct:number }
export interface VCertificateSummary { project_id:string; subcontractor_id:string; subcontractor_code:string; subcontractor_name:string; total_certificates:number; total_gross:number; total_retention:number; total_net_paid:number; latest_cert_no:number; latest_period:string }
export interface VTechnicalOverdue extends TechnicalRecord { days_overdue:number; project_name:string; subcontractor_name:string|null }
export interface VPendingApproval { id:string; project_id:string; project_name:string; subcontractor_id:string; subcontractor_name:string; assignment_key:string; breakdown_id:string; cert_no:number; period_end:string; boq_qty:number; actual_survey_qty:number|null; effective_pay_qty:number; status:ApprovalStatus; submitted_at:string|null }
export interface VSubcontractorWorkfront { id:string; project_id:string|null; subcontractor_id:string|null; contract_id:string|null; villa_id:string|null; building_id:string|null; villa_no:string|null; building_no:string|null; trade:string|null; planned_start_date:string|null; planned_finish_date:string|null; actual_start_date:string|null; actual_finish_date:string|null; actual_progress_percent:number|null; planned_progress_percent:number|null; delay_days:number|null; health_status:string|null; status:string|null; notes:string|null; site_progress_percent:number|null; certified_progress_percent:number|null; paid_progress_percent:number|null; contract_value:number|null; certified_value:number|null; paid_value:number|null; outstanding_value:number|null; has_p6_mapping?:boolean|null; has_planned_dates?:boolean|null; subcontractor_code?:string|null; subcontractor_name?:string|null; progress_warning?:string|null }

export type ProjectInsert = Omit<Project,'id'|'created_at'|'updated_at'>
export type ApprovalMatrixRuleInsert = Omit<ApprovalMatrixRule,'id'|'created_at'|'updated_at'>
export type ApprovalMatrixStepInsert = Omit<ApprovalMatrixStep,'id'|'created_at'>
export type ApprovalRequestInsert = Omit<ApprovalRequest,'id'|'created_at'|'updated_at'>
export type ApprovalRequestAssignmentInsert = Omit<ApprovalRequestAssignment,'id'|'created_at'>
export type ApprovalAuditLogInsert = Omit<ApprovalAuditLog,'id'|'created_at'>
export type SubcontractorInsert = Omit<Subcontractor,'id'|'created_at'|'updated_at'>
export type BoqItemInsert = Omit<BoqItem,'id'|'client_budget'|'created_at'|'updated_at'>
export type SubcontractBreakdownInsert = Omit<SubcontractBreakdown,'id'|'contract_value'|'created_at'|'updated_at'>
export type QsEntryInsert = Omit<QsEntry,'id'|'effective_pay_qty'|'created_at'|'updated_at'>
export type CostCategory = 'Material' | 'Labor' | 'Equipment' | 'Subcontract' | 'Overhead'
export interface TenderItem { id:string; project_id:string; boq_item_id:string; category:CostCategory; description:string; unit:string|null; qty:number|null; unit_rate:number|null; overhead_pct:number|null; profit_pct:number|null; notes:string|null; created_at:string; updated_at:string }
export type TenderItemInsert = Omit<TenderItem,'id'|'created_at'|'updated_at'>
export type CertificateInsert = Omit<Certificate,'id'|'created_at'|'updated_at'>
export type CertificateLineInsert = Omit<CertificateLine,'id'|'created_at'>
export type TechnicalRecordInsert = Omit<TechnicalRecord,'id'|'created_at'|'updated_at'>
export type ProcurementRecordInsert = Omit<ProcurementRecord,'id'|'created_at'|'updated_at'>
export type ProcurementRfqInsert = Omit<ProcurementRfq,'id'|'created_at'|'updated_at'>
export type ProcurementQuotationOfferInsert = Omit<ProcurementQuotationOffer,'id'|'created_at'|'updated_at'>
export type ProcurementQuotationOfferItemInsert = Omit<ProcurementQuotationOfferItem,'id'|'total_price'|'created_at'|'updated_at'>
export interface ScheduleActivityMapping { id:string; project_id:string; schedule_activity_id:string; contract_item_id:string; weight_percent:number|null; notes:string|null; created_by:string|null; created_at:string; updated_at:string }
export interface SiteProgressUpdate { id:string; project_id:string; contract_item_id:string; schedule_activity_id:string|null; subcontractor_id:string|null; contract_id:string|null; structure_node_id?:string|null; villa_node_id?:string|null; boq_item_id?:string|null; breakdown_id?:string|null; villa_no:string|null; building_no:string|null; trade:string|null; progress_percent:number; progress_qty:number|null; status:string; progress_date:string; notes:string|null; submitted_by?:string|null; submitted_at?:string|null; approved_by:string|null; approved_at:string|null; rejected_by?:string|null; rejected_at?:string|null; rejection_reason?:string|null; created_by:string|null; created_at:string; updated_at:string }
export type ScheduleActivityMappingInsert = Omit<ScheduleActivityMapping,'id'|'created_at'|'updated_at'>
export type SiteProgressUpdateInsert = Omit<SiteProgressUpdate,'id'|'created_at'|'updated_at'>
export type PaymentRequestInsert = Omit<PaymentRequest,'id'|'remaining_amount'|'created_at'|'updated_at'>
export type PurchaseOrderInsert = Omit<PurchaseOrder,'id'|'created_at'|'updated_at'>
export type PurchaseOrderItemInsert = Omit<PurchaseOrderItem,'id'|'total_price'|'created_at'|'updated_at'>
export type SupplierInvoiceInsert = Omit<SupplierInvoice,'id'|'created_at'|'updated_at'>
export type DocumentApprovalStepInsert = Omit<DocumentApprovalStep,'id'|'created_at'>
export type FinancialAuditLogInsert = Omit<FinancialAuditLog,'id'|'changed_at'>
export type VariationInsert = Omit<Variation,'id'|'financial_impact'|'created_at'|'updated_at'>

export interface Database {
  public: {
    Tables: {
      projects:              { Row:Project;              Insert:ProjectInsert;              Update:Partial<ProjectInsert> }
      users:                 { Row:User;                 Insert:Omit<User,'id'|'created_at'|'updated_at'>; Update:Partial<User> }
      subcontractors:        { Row:Subcontractor;        Insert:SubcontractorInsert;        Update:Partial<SubcontractorInsert> }
      boq_items:             { Row:BoqItem;              Insert:BoqItemInsert;              Update:Partial<BoqItemInsert> }
      subcontract_breakdown: { Row:SubcontractBreakdown; Insert:SubcontractBreakdownInsert; Update:Partial<SubcontractBreakdownInsert> }
      qs_entries:            { Row:QsEntry;              Insert:QsEntryInsert;              Update:Partial<QsEntryInsert> }
      qs_approvals:          { Row:QsApproval;           Insert:Omit<QsApproval,'id'|'created_at'|'updated_at'>; Update:Partial<QsApproval> }
      subcontractor_invoices:     { Row:Certificate;      Insert:CertificateInsert;      Update:Partial<CertificateInsert> }
      subcontractor_invoice_lines: { Row:CertificateLine; Insert:CertificateLineInsert; Update:Partial<CertificateLineInsert> }
      technical_records:     { Row:TechnicalRecord;      Insert:TechnicalRecordInsert;      Update:Partial<TechnicalRecordInsert> }
      procurement_records:   { Row:ProcurementRecord;    Insert:ProcurementRecordInsert;    Update:Partial<ProcurementRecordInsert> }
      procurement_rfqs:      { Row:ProcurementRfq;       Insert:ProcurementRfqInsert;       Update:Partial<ProcurementRfqInsert> }
      procurement_quotation_offers: { Row:ProcurementQuotationOffer; Insert:ProcurementQuotationOfferInsert; Update:Partial<ProcurementQuotationOfferInsert> }
      procurement_quotation_offer_items: { Row:ProcurementQuotationOfferItem; Insert:ProcurementQuotationOfferItemInsert; Update:Partial<ProcurementQuotationOfferItemInsert> }
      schedule_activity_mapping: { Row:ScheduleActivityMapping; Insert:ScheduleActivityMappingInsert; Update:Partial<ScheduleActivityMappingInsert> }
      site_progress_updates: { Row:SiteProgressUpdate; Insert:SiteProgressUpdateInsert; Update:Partial<SiteProgressUpdateInsert> }
      payment_requests:      { Row:PaymentRequest;       Insert:PaymentRequestInsert;       Update:Partial<PaymentRequestInsert> }
      purchase_orders:       { Row:PurchaseOrder;        Insert:PurchaseOrderInsert;        Update:Partial<PurchaseOrderInsert> }
      purchase_order_items:  { Row:PurchaseOrderItem;    Insert:PurchaseOrderItemInsert;    Update:Partial<PurchaseOrderItemInsert> }
      supplier_invoices:     { Row:SupplierInvoice;      Insert:SupplierInvoiceInsert;      Update:Partial<SupplierInvoiceInsert> }
      document_approval_steps:{ Row:DocumentApprovalStep; Insert:DocumentApprovalStepInsert; Update:Partial<DocumentApprovalStepInsert> }
      financial_audit_log:   { Row:FinancialAuditLog;    Insert:FinancialAuditLogInsert;    Update:Partial<FinancialAuditLogInsert> }
      variations:            { Row:Variation;            Insert:VariationInsert;            Update:Partial<VariationInsert> }
      approval_matrix_rules:        { Row:ApprovalMatrixRule; Insert:ApprovalMatrixRuleInsert; Update:Partial<ApprovalMatrixRuleInsert> }
      approval_matrix_steps:        { Row:ApprovalMatrixStep; Insert:ApprovalMatrixStepInsert; Update:Partial<ApprovalMatrixStepInsert> }
      approval_requests:            { Row:ApprovalRequest; Insert:ApprovalRequestInsert; Update:Partial<ApprovalRequestInsert> }
      approval_request_assignments: { Row:ApprovalRequestAssignment; Insert:ApprovalRequestAssignmentInsert; Update:Partial<ApprovalRequestAssignmentInsert> }
      approval_audit_log:           { Row:ApprovalAuditLog; Insert:ApprovalAuditLogInsert; Update:Partial<ApprovalAuditLogInsert> }
      project_users:         { Row:ProjectUser;          Insert:Omit<ProjectUser,'id'|'assigned_at'>; Update:Partial<ProjectUser> }
      project_structures:     { Row:ProjectStructure;     Insert:Omit<ProjectStructure,'id'|'created_at'|'updated_at'>; Update:Partial<ProjectStructure> }
      project_structure_nodes:{ Row:StructureNode;         Insert:StructureNodeInsert; Update:StructureNodeUpdate }
    }
    Views: {
      v_my_pending_approvals:          { Row:any }
      v_pending_approvals_by_project:{ Row:any }
      v_pending_approvals_by_module: { Row:any }
      v_approval_delay_report:       { Row:any }
      v_approval_history:            { Row:any }
      v_dashboard_kpis:      { Row:VDashboardKpis }
      v_commercial_summary:  { Row:VCommercialSummary }
      v_certificate_summary: { Row:VCertificateSummary }
      v_technical_overdue:   { Row:VTechnicalOverdue }
      v_pending_approvals:   { Row:VPendingApproval }
      v_contract_item_progress_summary: { Row:any }
      v_subcontractor_dashboard: { Row:any }
      v_subcontractor_workfronts: { Row:VSubcontractorWorkfront }
      v_progress_warning_report: { Row:any }
      v_invoice_line_link_warnings: { Row:any }
      v_schedule_site_certified_paid_report: { Row:any }
      v_uncertified_executed_work_report: { Row:any }
      v_certified_unpaid_report: { Row:any }
      v_invoice_lines_missing_contract_item_report: { Row:any }
    }
    Functions: { approval_submit_transaction:any; approval_act_on_current_step:any; approval_validate_matrix_rule:any; approval_reassign_assignment:any; approval_override_unlock:any; certificate_release_for_approval:any; release_subcontractor_invoice_for_approval:any; v139_get_or_create_public_user:any; v139_finalize_subcontractor_invoice_payment_decision:any; procurement_select_quotation_offer:any; select_procurement_quotation_offer:any }
    Enums: {}
  }
}

export type ActivityStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Suspended'
export interface ScheduleActivity {
  id: string
  project_id: string
  activity_id: string
  activity_name: string
  wbs_code: string | null
  status: ActivityStatus
  original_duration: number | null
  remaining_duration: number | null
  schedule_pct: number | null
  planned_start: string | null
  planned_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  free_float: number | null
  total_float: number | null
  created_at: string
  updated_at: string
}
export type ScheduleActivityInsert = Omit<ScheduleActivity, 'id' | 'created_at' | 'updated_at'>

export interface QtoLine {
  id: string
  project_id: string
  boq_item_id: string
  structure_id: string | null
  description: string
  times: number | null
  length: number | null
  width: number | null
  height: number | null
  qty: number
  notes: string | null
  created_at: string
  updated_at: string
}
export type QtoLineInsert = Omit<QtoLine, 'id' | 'created_at' | 'updated_at'>
export type QtoLineUpdate = Partial<QtoLineInsert>

export type VillaStatus = 'Not Started' | 'In Progress' | 'Completed' | 'On Hold'
export type TradeType = 'Structural' | 'MEP' | 'Finishing' | 'External Works' | 'Landscaping' | 'Other'

export interface VillaUnit {
  id: string
  project_id: string
  phase_id: string
  villa_type_id: string
  villa_no: string
  subcontractor_id: string | null
  status: VillaStatus
  created_at: string
  updated_at: string
}
export type VillaUnitInsert = Omit<VillaUnit, 'id' | 'created_at' | 'updated_at'>

export interface VillaProgress {
  id: string
  project_id: string
  villa_unit_id: string
  trade: TradeType
  completion_pct: number
  notes: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}
export type VillaProgressInsert = Omit<VillaProgress, 'id' | 'created_at'>
export type VillaProgressUpdate = Partial<VillaProgressInsert>

export type PenaltyType = 'NCR' | 'Schedule Delay' | 'Warehouse / Material' | 'Other'

export interface InvoicePenalty {
  id: string
  invoice_id: string
  project_id: string
  subcontractor_id: string
  penalty_type: PenaltyType
  reference: string | null
  description: string
  amount: number
  created_at: string
}
export type InvoicePenaltyInsert = Omit<InvoicePenalty, 'id' | 'created_at'>

export interface InvoiceAddition {
  id: string
  invoice_id: string
  project_id: string
  subcontractor_id: string
  description: string
  amount: number
  created_at: string
}
export type InvoiceAdditionInsert = Omit<InvoiceAddition, 'id' | 'created_at'>

export interface VillaAssignment {
  id: string
  project_id: string
  villa_node_id: string
  villa_type_node_id: string
  subcontractor_id: string
  trade: string
  notes: string | null
  created_at: string
  updated_at: string
}
export type VillaAssignmentInsert = Omit<VillaAssignment, 'id' | 'created_at' | 'updated_at'>

export interface VillaBreakdownLine {
  id: string
  project_id: string
  villa_assignment_id: string
  villa_node_id: string
  villa_type_node_id: string
  subcontractor_id: string
  trade: string
  boq_item_id: string
  subcontract_qty: number
  rate: number
  contract_value: number
  created_at: string
}
export type VillaBreakdownLineInsert = Omit<VillaBreakdownLine, 'id' | 'created_at'>
