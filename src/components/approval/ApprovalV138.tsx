'use client'
// V140_01 — Approval Center update
// Changes vs V139:
//  1. Active list filtered to pending_review / pending_approval at current_step only, assigned to me
//  2. returned / rejected / approved / cancelled / missing_configuration hidden from active list
//  3. missing_configuration shown only in "Configuration Issues (Admin)" sub-tab
//  4. CEO payment decision panel on step 7 (subcontractor invoices)
//  5. Return / Reject reason enforced client-side before prompt
//  6. Admin override note appended to comments automatically
//  7. normaliseError handles PGRST203, 42883, 42703 distinctly

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Button, Card, Field, FormGrid, Input, Select, Table, Toolbar } from '@/app/dashboard/ui'
import { money } from '@/app/dashboard/lib'

type ProjectLite = { id: string; project_code?: string | null; project_name: string }
type ApprovalRule = any
type ApprovalStep = any
type ApprovalRequest = any
type ApprovalAssignment = any
type ApprovalAudit = any

type StepDraft = {
  step_order: string
  step_type: 'review' | 'approval'
  assignee_type: 'role' | 'user'
  role_name: string
  user_id: string
  decision_mode: 'any' | 'all'
  is_required: boolean
}

const MODULES = [
  'Procurement', 'GRN', 'Issue Material', 'Subcontractor',
  'Payment', 'BOQ', 'Variation', 'Client Invoice', 'Supplier Invoice',
]

const ACTIONS = [
  'PR', 'PO', 'Receive Material', 'Issue to Site',
  'Subcontractor Contract', 'Subcontractor Invoice',
  'Subcontractor Payment', 'Supplier Payment',
  'Client Certificate', 'Variation Approval',
]

// V140_01: expanded role list including new V140 roles
const ROLES = [
  'QS', 'QS Engineer', 'Quantity Surveyor',
  'Site Technical Office Manager',
  'Technical Office Manager',
  'Head Office QS',
  'Head Office Technical Office Manager',
  'Projects Manager',
  'Technical Engineer', 'Storekeeper', 'Site Engineer',
  'Procurement', 'Procurement Engineer', 'Procurement Manager',
  'Project Manager', 'Finance', 'Finance Manager',
  'Project Director', 'Director', 'CEO', 'Admin',
]

// Canonical DB action (internal) vs display label
const canonicalApprovalAction = (module: string, action: string) =>
  module === 'Subcontractor' && action === 'Subcontractor Invoice'
    ? 'Subcontractor Certificate'
    : action

const displayApprovalAction = (module: string, action: string) =>
  module === 'Subcontractor' && action === 'Subcontractor Certificate'
    ? 'Subcontractor Invoice'
    : action

const isSubcontractorInvoiceWorkflow = (module: string, action: string) =>
  module === 'Subcontractor' &&
  ['Subcontractor Invoice', 'Subcontractor Certificate'].includes(action)

const isCeoStep = (assignments: ApprovalAssignment[]) =>
  assignments.some((a) => String(a.assigned_role_name || '').toLowerCase().includes('ceo'))

const emptyStep = (order = 1): StepDraft => ({
  step_order: String(order),
  step_type: order === 1 ? 'review' : 'approval',
  assignee_type: 'role',
  role_name: 'QS',
  user_id: '',
  decision_mode: 'any',
  is_required: true,
})

// V140_01: status label map (added missing statuses)
const statusLabel: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review / في انتظار المراجعة',
  pending_approval: 'Pending Approval / في انتظار الاعتماد',
  approved: 'Approved / معتمد',
  rejected: 'Rejected / مرفوض',
  returned: 'Returned / مرتجع للتعديل',
  cancelled: 'Cancelled',
  missing_configuration: 'Missing Configuration',
  reviewed: 'Reviewed / تمت المراجعة',
  skipped: 'Skipped',
  pending: 'Pending / منتظر',
}

function approvalTone(status: string): 'default' | 'success' | 'warn' | 'danger' {
  const s = String(status || '').toLowerCase()
  if (['approved', 'reviewed'].includes(s)) return 'success'
  if (['pending_review', 'pending_approval', 'pending'].includes(s)) return 'warn'
  if (['rejected', 'returned', 'cancelled', 'missing_configuration'].includes(s)) return 'danger'
  return 'default'
}

// V140_01 — corrected error codes:
//   PGRST203 = multiple candidate functions (overload ambiguity)
//   42883    = function does not exist / signature mismatch
//   42703    = undefined column (separate meaning)
function normaliseError(error: any): string {
  console.error('Approval Center error:', error)

  const code = String(error?.code || '')
  const msg = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    String(error || ''),
  ].filter(Boolean).join(' | ')

  // PGRST203 — overloaded function ambiguity
  if (
    code === 'PGRST203' ||
    msg.includes('PGRST203') ||
    msg.toLowerCase().includes('multiple candidate functions') ||
    msg.toLowerCase().includes('overloaded')
  ) {
    return (
      'Multiple versions of the approval function exist in the database. ' +
      'Run database/V140_01_APPROVAL_CLEANUP_AND_7_STEP_WORKFLOW.sql to resolve.'
    )
  }

  // 42883 — function signature missing or outdated
  if (
    code === '42883' ||
    (msg.includes('function') && msg.toLowerCase().includes('does not exist'))
  ) {
    return (
      'Approval function signature is missing or outdated. ' +
      'Run database/V140_01_APPROVAL_CLEANUP_AND_7_STEP_WORKFLOW.sql to resolve.'
    )
  }

  // 42703 — undefined column (V139 column migration not applied)
  if (code === '42703' || (msg.includes('column') && msg.includes('does not exist'))) {
    const colHint =
      msg.includes('user_email') || msg.includes('assigned_user_email') || msg.includes('actor_email')
        ? 'V139 users/emails migration is missing a database column. Run SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql then SQL_FIX_V139_RELEASE_SUBCONTRACTOR_INVOICE.sql.'
        : `Database column not found: ${msg}`
    return colHint
  }

  // Missing table / relation
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return (
      'Approval SQL migration is not installed yet. ' +
      'Run SUPABASE_V138_APPROVAL_MATRIX.sql then SUPABASE_V139_CERTIFICATE_RELEASE_USERS_EMAILS.sql.'
    )
  }

  // Maker-checker
  if (msg.toLowerCase().includes('maker-checker')) {
    return 'Maker-checker rule: the invoice originator cannot act on their own approval request.'
  }

  // Mandatory reason
  if (msg.toLowerCase().includes('reason is required')) {
    return 'A reason is required for Return / Reject actions.'
  }

  return msg || 'Unexpected approval error.'
}

function miniStat(label: string, value: string | number, sub?: string) {
  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '14px 18px',
      }}
    >
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#1e293b' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Step display helper ──────────────────────────────────────────────────────

function StepRow({ assignment }: { assignment: ApprovalAssignment }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 1fr 1fr 120px 120px',
        gap: 8,
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid #f1f5f9',
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, color: '#475569' }}>{assignment.step_order}</div>
      <div style={{ color: '#334155' }}>{assignment.step_type === 'review' ? 'Review / مراجعة' : 'Approval / اعتماد'}</div>
      <div style={{ color: '#475569' }}>{assignment.assigned_role_name || '—'}</div>
      <div style={{ color: '#1e3a8a', fontSize: 12 }}>
        {assignment.assigned_user_name || 'Unassigned'}
        {assignment.assigned_user_email ? ` — ${assignment.assigned_user_email}` : ''}
      </div>
      <div style={{ color: '#475569' }}>{assignment.decision_mode === 'all' ? 'All Required' : 'Any One'}</div>
      <Badge text={statusLabel[assignment.status] || assignment.status} tone={approvalTone(assignment.status)} />
    </div>
  )
}

// ── ApprovalStatusPanel (unchanged API, minor style refresh) ─────────────────

export function ApprovalStatusPanel({
  recordTable,
  recordId,
  compact = false,
}: {
  recordTable: string
  recordId: string
  compact?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [request, setRequest] = useState<ApprovalRequest | null>(null)
  const [assignments, setAssignments] = useState<ApprovalAssignment[]>([])
  const [audit, setAudit] = useState<ApprovalAudit[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    let ignore = false
    async function load() {
      if (!recordTable || !recordId) return
      setMessage('')
      const req = await (supabase as any)
        .from('approval_requests')
        .select('*, approval_matrix_rules(rule_name)')
        .eq('record_table', recordTable)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ignore) return
      if (req.error) { setMessage(normaliseError(req.error)); return }
      const r = req.data as any
      setRequest(r ?? null)
      if (!r?.id) { setAssignments([]); setAudit([]); return }
      const [ass, log] = await Promise.all([
        (supabase as any).from('approval_request_assignments').select('*').eq('request_id', r.id).order('step_order'),
        (supabase as any).from('approval_audit_log').select('*').eq('request_id', r.id).order('created_at', { ascending: false }),
      ])
      if (ignore) return
      if (ass.error) setMessage(normaliseError(ass.error)); else setAssignments(ass.data ?? [])
      if (log.error) setMessage(normaliseError(log.error)); else setAudit(log.data ?? [])
    }
    load()
    return () => { ignore = true }
  }, [recordTable, recordId, supabase])

  if (message) return <Card title="Approval Flow"><div style={{ color: '#b45309', fontSize: 13 }}>{message}</div></Card>
  if (!request) return <Card title="Approval Flow"><div style={{ color: '#64748b', fontSize: 13 }}>No approval request submitted yet.</div></Card>

  const reviewers = assignments.filter((a) => a.step_type === 'review')
  const approvers = assignments.filter((a) => a.step_type === 'approval')
  const ruleName = (request.approval_matrix_rules as any)?.rule_name || request.rule_name || '—'

  return (
    <Card
      title="Approval Flow"
      action={<Badge text={statusLabel[request.status] || request.status} tone={approvalTone(request.status)} />}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit,minmax(200px,1fr))',
          gap: 12,
          marginBottom: 14,
          fontSize: 13,
        }}
      >
        <div><span style={{ color: '#64748b' }}>Rule: </span>{ruleName}</div>
        <div><span style={{ color: '#64748b' }}>Submitted: </span>{request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : '—'}</div>
        <div><span style={{ color: '#64748b' }}>Current step: </span>{request.current_step_order ?? '—'}</div>
        {request.approved_at && <div><span style={{ color: '#64748b' }}>Approved: </span>{new Date(request.approved_at).toLocaleDateString()}</div>}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Frozen Workflow Steps
      </div>
      <div style={{ marginBottom: 14 }}>
        {assignments.map((a) => <StepRow key={a.id} assignment={a} />)}
      </div>

      {audit.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Audit Trail
          </div>
          {audit.map((log) => (
            <div key={log.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
              <strong>{log.action}</strong>
              {' by '}{log.actor_name || log.actor_email || log.actor_user_id || 'System'}
              {' — '}{log.created_at ? new Date(log.created_at).toLocaleString() : ''}
              {log.comments ? <span style={{ color: '#64748b' }}> — {log.comments}</span> : null}
            </div>
          ))}
        </>
      )}
    </Card>
  )
}

// ── ApprovalMatrixSettings (unchanged except ROLES constant updated above) ───

export function ApprovalMatrixSettings({ projects }: { projects: ProjectLite[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [rules, setRules] = useState<ApprovalRule[]>([])
  const [steps, setSteps] = useState<ApprovalStep[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    rule_name: '',
    module: 'Subcontractor',
    action: 'Subcontractor Invoice',
    project_id: '',
    min_amount: '',
    max_amount: '',
    priority: '50',
    is_active: true,
  })
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([emptyStep(1)])
  const stepsByRule = useMemo(() => {
    const map = new Map<string, ApprovalStep[]>()
    steps.forEach((s) => map.set(s.rule_id, [...(map.get(s.rule_id) ?? []), s]))
    return map
  }, [steps])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [rRes, sRes, uRes] = await Promise.all([
      (supabase as any)
        .from('approval_matrix_rules')
        .select('*, projects(project_name)')
        .order('priority'),
      (supabase as any).from('approval_matrix_steps').select('*').order('rule_id,step_order'),
      (supabase as any).from('users').select('id,full_name,email,role').order('full_name'),
    ])
    if (rRes.error) setMessage(normaliseError(rRes.error))
    else setRules(rRes.data ?? [])
    if (sRes.error) setMessage(normaliseError(sRes.error))
    else setSteps(sRes.data ?? [])
    if (uRes.error) setMessage(normaliseError(uRes.error))
    else setUsers(uRes.data ?? [])
  }

  async function saveRule() {
    if (!form.rule_name.trim()) { setMessage('Rule name is required.'); return }
    setSaving(true); setMessage('')
    try {
      const action = canonicalApprovalAction(form.module, form.action)
      const { data: rule, error: rErr } = await (supabase as any)
        .from('approval_matrix_rules')
        .insert({
          rule_name: form.rule_name,
          module: form.module,
          action,
          project_id: form.project_id || null,
          min_amount: form.min_amount ? Number(form.min_amount) : null,
          max_amount: form.max_amount ? Number(form.max_amount) : null,
          priority: Number(form.priority),
          is_active: form.is_active,
        })
        .select()
        .single()
      if (rErr) throw rErr

      for (const s of stepDrafts) {
        const { error: sErr } = await (supabase as any)
          .from('approval_matrix_steps')
          .insert({
            rule_id: rule.id,
            step_order: Number(s.step_order),
            step_type: s.step_type,
            assignee_type: s.assignee_type,
            role_name: s.assignee_type === 'role' ? s.role_name : null,
            user_id: s.assignee_type === 'user' ? s.user_id || null : null,
            decision_mode: s.decision_mode,
            is_required: s.is_required,
          })
        if (sErr) throw sErr
      }

      setMessage('Rule saved successfully.')
      setForm({ rule_name: '', module: 'Subcontractor', action: 'Subcontractor Invoice', project_id: '', min_amount: '', max_amount: '', priority: '50', is_active: true })
      setStepDrafts([emptyStep(1)])
      await load()
    } catch (e) {
      setMessage(normaliseError(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleRule(rule: ApprovalRule) {
    await (supabase as any)
      .from('approval_matrix_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id)
    await load()
  }

  async function deleteRule(rule: ApprovalRule) {
    if (!confirm(`Delete rule "${rule.rule_name}"? This cannot be undone.`)) return
    await (supabase as any).from('approval_matrix_rules').delete().eq('id', rule.id)
    await load()
  }

  return (
    <>
      <Card title="Settings — Approval Matrix" action={<Badge text="V140_01 — 7-Step Workflow" tone="success" />}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, color: '#1e3a8a' }}>
          Review steps check data accuracy. Approval steps authorize the transaction to proceed.
          {' '}Workflow roles are resolved via <code>approval_user_roles</code> table (text-based, no enum change).
        </div>
        {message && (
          <pre style={{ whiteSpace: 'pre-wrap', color: message.includes('success') ? '#166534' : '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10, fontFamily: 'inherit', fontSize: 13 }}>
            {message}
          </pre>
        )}
        <FormGrid>
          <Field label="Rule Name">
            <Input value={form.rule_name} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, rule_name: e.target.value })} placeholder="e.g. Subcontractor Invoice V140 — 7-Step Workflow" />
          </Field>
          <Field label="Module">
            <Select value={form.module} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, module: e.target.value })}>
              {MODULES.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Action">
            <Select value={form.action} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, action: e.target.value })}>
              {ACTIONS.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Project (blank = global)">
            <Select value={form.project_id} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Global rule</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </Select>
          </Field>
          <Field label="Amount From">
            <Input type="number" value={form.min_amount} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, min_amount: e.target.value })} />
          </Field>
          <Field label="Amount To (blank = above)">
            <Input type="number" value={form.max_amount} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, max_amount: e.target.value })} />
          </Field>
          <Field label="Priority (lower = higher priority)">
            <Input type="number" value={form.priority} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, priority: e.target.value })} />
          </Field>
          <Field label="Active">
            <Select value={form.is_active ? 'yes' : 'no'} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, is_active: e.target.value === 'yes' })}>
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </Select>
          </Field>
        </FormGrid>
      </Card>

      <Card title="Approval Steps">
        <div style={{ display: 'grid', gap: 10 }}>
          {stepDrafts.map((s, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '70px 130px 140px 1fr 130px 110px 80px', gap: 8, alignItems: 'end' }}>
              <Field label="Order">
                <Input
                  type="number"
                  value={s.step_order}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, step_order: e.target.value } : x))}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={s.step_type}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, step_type: e.target.value as any } : x))}
                >
                  <option value="review">Review / مراجعة</option>
                  <option value="approval">Approval / اعتماد</option>
                </Select>
              </Field>
              <Field label="Assign By">
                <Select
                  value={s.assignee_type}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, assignee_type: e.target.value as any } : x))}
                >
                  <option value="role">Role</option>
                  <option value="user">Specific User</option>
                </Select>
              </Field>
              {s.assignee_type === 'role' ? (
                <Field label="Role">
                  <Select
                    value={s.role_name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, role_name: e.target.value } : x))}
                  >
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="User">
                  <Select
                    value={s.user_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, user_id: e.target.value } : x))}
                  >
                    <option value="">Select user</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} — {u.email} — {u.role}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Decision">
                <Select
                  value={s.decision_mode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, decision_mode: e.target.value as any } : x))}
                >
                  <option value="any">Any One</option>
                  <option value="all">All Required</option>
                </Select>
              </Field>
              <Field label="Required">
                <Select
                  value={s.is_required ? 'yes' : 'no'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setStepDrafts(stepDrafts.map((x, i) => i === idx ? { ...x, is_required: e.target.value === 'yes' } : x))}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
              <Button tone="danger" onClick={() => setStepDrafts(stepDrafts.filter((_, i) => i !== idx))}>Remove</Button>
            </div>
          ))}
        </div>
        <Toolbar>
          <Button tone="secondary" onClick={() => setStepDrafts([...stepDrafts, emptyStep(stepDrafts.length + 1)])}>
            + Add Step
          </Button>
          <Button disabled={saving} onClick={saveRule}>Save Rule</Button>
        </Toolbar>
      </Card>

      <Card title="Existing Approval Matrix Rules">
        <Table
          heads={['Rule', 'Module / Action', 'Project', 'Amount Range', 'Priority', 'Status', 'Steps', 'Actions']}
          rows={rules.map((r) => {
            const rSteps = stepsByRule.get(r.id) ?? []
            return [
              <b key="rule">{r.rule_name}</b>,
              <span key="ma">{r.module} / {displayApprovalAction(r.module, r.action)}</span>,
              <span key="p">{(r.projects as any)?.project_name || 'Global'}</span>,
              <span key="a">{r.min_amount ?? '0'} → {r.max_amount ?? 'Above'}</span>,
              <span key="prio">{r.priority}</span>,
              <Badge key="s" text={r.is_active ? 'Active' : 'Inactive'} tone={r.is_active ? 'success' : 'default'} />,
              <div key="steps" style={{ display: 'grid', gap: 4 }}>
                {rSteps.map((s) => (
                  <span key={s.id}>
                    {s.step_order}. {s.step_type} — {s.role_name || s.user_email || s.user_id} ({s.decision_mode})
                  </span>
                ))}
              </div>,
              <div key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button tone="secondary" onClick={() => toggleRule(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</Button>
                <Button tone="danger" onClick={() => deleteRule(r)}>Delete</Button>
              </div>,
            ]
          })}
        />
      </Card>
    </>
  )
}

// ── ApprovalCenter ───────────────────────────────────────────────────────────
// V140_01 key changes:
//   • Active list: only pending_review / pending_approval, current step, assigned to me
//   • returned / rejected / approved / cancelled hidden from active list
//   • missing_configuration only in "Configuration Issues (Admin)" sub-tab
//   • CEO payment panel on step 7 subcontractor invoices
//   • Return / Reject reason enforced before prompt
//   • Admin override note appended automatically

export function ApprovalCenter({ projectId }: { projectId?: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [assignments, setAssignments] = useState<ApprovalAssignment[]>([])
  const [pendingMine, setPendingMine] = useState<any[]>([])
  const [byProject, setByProject] = useState<any[]>([])
  const [byModule, setByModule] = useState<any[]>([])
  const [delayRows, setDelayRows] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [missingConfig, setMissingConfig] = useState<ApprovalRequest[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [isAdminOwner, setIsAdminOwner] = useState(false)
  // V140_01: separate tab state
  const [activeTab, setActiveTab] = useState<'active' | 'byProject' | 'delay' | 'history' | 'configIssues'>('active')

  // ── Admin check ────────────────────────────────────────────────────────────
  async function loadAdminOwner() {
    if (!user?.id && !user?.email) { setIsAdminOwner(false); return }
    try {
      const adminRes = await (supabase as any).rpc('v139_is_admin_owner', {
        p_user_id: user?.id ?? null,
        p_email: user?.email ?? null,
      })
      if (!adminRes.error) { setIsAdminOwner(Boolean(adminRes.data)); return }
      // Fallback: direct role check
      const userRes = user?.id
        ? await (supabase as any).from('users').select('role,is_active').eq('id', user.id).maybeSingle()
        : await (supabase as any).from('users').select('role,is_active').ilike('email', user?.email ?? '').maybeSingle()
      if (!userRes.error && userRes.data) {
        const role = String(userRes.data.role || '').toLowerCase()
        setIsAdminOwner(Boolean(userRes.data.is_active ?? true) && ['admin', 'owner'].includes(role))
      } else {
        setIsAdminOwner(false)
      }
    } catch {
      setIsAdminOwner(false)
    }
  }

  // ── Data load ──────────────────────────────────────────────────────────────
  async function load() {
    setMessage('')
    try {
      let reqQuery = (supabase as any)
        .from('approval_requests')
        .select('*, approval_matrix_rules(rule_name), projects(project_name)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (projectId) reqQuery = reqQuery.eq('project_id', projectId)

      const [reqRes, assRes, mineRes, projectRes, moduleRes, delayRes, historyRes] = await Promise.all([
        reqQuery,
        (supabase as any).from('approval_request_assignments').select('*').order('step_order'),
        (supabase as any).from('v_my_pending_approvals').select('*').order('submitted_at', { ascending: true }),
        (supabase as any).from('v_pending_approvals_by_project').select('*'),
        (supabase as any).from('v_pending_approvals_by_module').select('*'),
        (supabase as any).from('v_approval_delay_report').select('*').order('days_pending', { ascending: false }).limit(50),
        (supabase as any).from('v_approval_history').select('*').limit(100),
      ])

      const firstError = reqRes.error || assRes.error
      if (firstError) { setMessage(normaliseError(firstError)); return }

      const allRequests: ApprovalRequest[] = reqRes.data ?? []
      setRequests(allRequests)
      setAssignments(assRes.data ?? [])

      // V140_01: separate missing_configuration from normal pending
      setMissingConfig(allRequests.filter((r: any) => r.status === 'missing_configuration'))

      if (!mineRes.error) setPendingMine(mineRes.data ?? [])
      if (!projectRes.error) setByProject(projectRes.data ?? [])
      if (!moduleRes.error) setByModule(moduleRes.data ?? [])
      if (!delayRes.error) setDelayRows(delayRes.data ?? [])
      if (!historyRes.error) setHistory(historyRes.data ?? [])
    } catch (e) {
      setMessage(normaliseError(e))
    }
  }

  useEffect(() => {
    load()
    loadAdminOwner()
  }, [projectId, user?.id, user?.email])

  // ── Derived data ───────────────────────────────────────────────────────────
  const byReq = useMemo(() => {
    const map = new Map<string, ApprovalAssignment[]>()
    assignments.forEach((a) => map.set(a.request_id, [...(map.get(a.request_id) ?? []), a]))
    return map
  }, [assignments])

  // V140_01: active list — only pending_review / pending_approval,
  // only current step, only assigned to me (or admin sees all)
  const activeRequests = useMemo(() => {
    const myEmail = String(user?.email || '').toLowerCase()
    return requests.filter((r: any) => {
      // Status gate: only active statuses
      if (!['pending_review', 'pending_approval'].includes(r.status)) return false

      const rAssignments = byReq.get(r.id) ?? []
      const currentPending = rAssignments.filter(
        (a) => a.step_order === r.current_step_order && a.status === 'pending'
      )
      if (currentPending.length === 0) return false

      // Admin sees all active requests
      if (isAdminOwner) return true

      // Regular user: only if assigned by id or email at current step
      return currentPending.some(
        (a) =>
          String(a.assigned_user_id || '') === String(user?.id || '') ||
          (!!myEmail && String(a.assigned_user_email || '').toLowerCase() === myEmail)
      )
    })
  }, [requests, byReq, user, isAdminOwner])

  const stats = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7)
    return {
      myReviews: pendingMine.filter((x) => x.step_type === 'review').length,
      myApprovals: pendingMine.filter((x) => x.step_type === 'approval').length,
      delayed: delayRows.length,
      approvedMonth: history.filter((x) => x.status === 'approved' && String(x.updated_at || '').startsWith(thisMonth)).length,
      rejectedMonth: history.filter((x) => x.status === 'rejected' && String(x.updated_at || '').startsWith(thisMonth)).length,
      configIssues: missingConfig.length,
    }
  }, [pendingMine, delayRows, history, missingConfig])

  // ── Action handler ─────────────────────────────────────────────────────────
  // V140_01: reason enforced, admin override note, CEO payment panel,
  //          correct p_action mapping for 'return' → 'return'
  async function act(
    requestId: string,
    action: 'Review' | 'Approve' | 'Return' | 'Reject',
    request?: ApprovalRequest,
    currentAssignments: ApprovalAssignment[] = []
  ) {
    const isNegative = action === 'Return' || action === 'Reject'
    const isCeo = action === 'Approve'
      && request?.record_table === 'subcontractor_invoices'
      && isCeoStep(currentAssignments)

    let comments = ''
    let paymentDecision: string | undefined
    let releasedAmount: number | undefined

    // V140_01 Change 5: Reason enforced for Return / Reject before calling DB
    if (isNegative) {
      comments = typeof window !== 'undefined'
        ? (window.prompt('Reason is required / السبب إجباري') ?? '').trim()
        : ''
      if (!comments) {
        setMessage('A reason is required for Not Approved / Return / Reject actions.')
        return
      }
    } else {
      comments = typeof window !== 'undefined'
        ? (window.prompt(`${action} comments (optional) / تعليق اختياري`) ?? '').trim()
        : ''
    }

    // V140_01 Change 4: CEO payment decision panel
    if (isCeo) {
      const amount = Number(request?.amount || 0)
      const decisionRaw = typeof window !== 'undefined'
        ? (window.prompt('CEO Payment Decision:\nType:  full  /  partial  /  hold', 'full') ?? 'full').trim().toLowerCase()
        : 'full'

      if (decisionRaw.startsWith('hold')) {
        paymentDecision = 'hold'
        releasedAmount = 0
        if (!comments) comments = 'CEO Payment Decision: Hold Payment'
      } else if (decisionRaw.startsWith('partial')) {
        const amountRaw = typeof window !== 'undefined'
          ? window.prompt(`Released Payment Amount (max: ${money(amount)})`, String(amount))
          : null
        const parsed = Number(amountRaw)
        if (!amountRaw || isNaN(parsed) || parsed <= 0 || parsed > amount) {
          setMessage('Partial payment amount is required and must be between 0 and the net certificate amount.')
          return
        }
        paymentDecision = 'partial'
        releasedAmount = parsed
        if (!comments) comments = `CEO Payment Decision: Approve Partial Amount — ${money(releasedAmount)}`
      } else {
        paymentDecision = 'full'
        releasedAmount = amount
        if (!comments) comments = 'CEO Payment Decision: Approve Full Amount'
      }
    }

    // V140_01 Change 6: Admin override note
    const isAdminActingOutsideAssignment = isAdminOwner && currentAssignments.length > 0 &&
      !currentAssignments.some(
        (a) =>
          String(a.assigned_user_id || '') === String(user?.id || '') ||
          String(a.assigned_user_email || '').toLowerCase() === String(user?.email || '').toLowerCase()
      )
    if (isAdminActingOutsideAssignment) {
      comments = (comments + ' [Admin override — acted outside assigned role]').trim()
    }

    setBusy(true)
    setMessage('')
    try {
      // Map UI action to DB action
      const dbAction = action === 'Return' ? 'return'
        : action === 'Reject' ? 'reject'
        : action === 'Review' ? 'review'
        : 'approve'

      const payload: Record<string, any> = {
        p_request_id: requestId,
        p_action: dbAction,
        p_comments: comments || null,
        p_actor_user_id: user?.id ?? null,
        p_actor_name: user?.email ?? null,   // fallback name; DB resolves full_name
        p_actor_email: user?.email ?? null,
      }
      if (paymentDecision !== undefined) payload.p_payment_decision = paymentDecision
      if (releasedAmount !== undefined) payload.p_released_amount = releasedAmount

      const res = await (supabase as any).rpc('approval_act_on_current_step', payload)
      if (res.error) throw res.error

      setMessage(
        action === 'Return'
          ? 'Not Approved / Returned to originator successfully.'
          : action === 'Reject'
          ? 'Rejected successfully.'
          : isCeo
          ? `CEO Payment Decision saved: ${paymentDecision}.`
          : `${action} saved successfully.`
      )
      await load()
    } catch (error) {
      setMessage(normaliseError(error))
    } finally {
      setBusy(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {miniStat('My Pending Reviews', stats.myReviews)}
        {miniStat('My Pending Approvals', stats.myApprovals)}
        {miniStat('Delayed', stats.delayed, '> 2 days')}
        {miniStat('Approved This Month', stats.approvedMonth)}
        {miniStat('Rejected This Month', stats.rejectedMonth)}
        {isAdminOwner && miniStat('Config Issues', stats.configIssues, 'Admin only')}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { id: 'active', label: `My Pending Action (${activeRequests.length})` },
          { id: 'byProject', label: 'Pending by Project' },
          { id: 'delay', label: 'Delayed Approvals' },
          { id: 'history', label: 'History' },
          ...(isAdminOwner ? [{ id: 'configIssues', label: `Configuration Issues (${stats.configIssues})` }] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              border: '1px solid',
              borderColor: activeTab === tab.id ? '#1d9e75' : '#e2e8f0',
              background: activeTab === tab.id ? '#1d9e75' : '#fff',
              color: activeTab === tab.id ? '#fff' : '#475569',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && (
        <pre style={{ whiteSpace: 'pre-wrap', color: message.includes('success') || message.includes('saved') ? '#166534' : '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10, fontFamily: 'inherit', fontSize: 13, marginBottom: 12 }}>
          {message}
        </pre>
      )}

      {/* ── Tab: My Pending Action ── */}
      {activeTab === 'active' && (
        <Card
          title="Assigned Reviews / Approvals — Pending Action"
          action={<Badge text={isAdminOwner ? 'Admin / Owner — Full Override Access' : 'Assigned to me only'} tone={isAdminOwner ? 'warn' : 'success'} />}
        >
          {activeRequests.length === 0 && (
            <div style={{ color: '#64748b', padding: '16px 0', fontSize: 14 }}>
              No active approvals assigned to you at the current step.
            </div>
          )}
          <Table
            heads={['Module / Action', 'Record', 'Rule', 'Project', 'Amount', 'Current Step', 'Status', 'Frozen Assignees', 'Actions']}
            rows={activeRequests.map((r: any) => {
              const rAssignments = byReq.get(r.id) ?? []
              // V140_01: only show current pending assignments
              const currentPending = rAssignments.filter(
                (a) => a.step_order === r.current_step_order && a.status === 'pending'
              )
              const myEmail = String(user?.email || '').toLowerCase()
              const assignedToMe = currentPending.some(
                (a) =>
                  String(a.assigned_user_id || '') === String(user?.id || '') ||
                  (!!myEmail && String(a.assigned_user_email || '').toLowerCase() === myEmail)
              )
              const canAct = assignedToMe || isAdminOwner

              const canReview = r.status === 'pending_review' && canAct
              const canApprove = r.status === 'pending_approval' && canAct
              const ceoStep = isCeoStep(currentPending)

              return [
                <span key="m">{r.module} / {displayApprovalAction(r.module, r.action)}</span>,
                <span key="rec" style={{ fontSize: 11 }}>
                  {r.record_table}
                  <br />
                  <code style={{ color: '#6366f1' }}>{String(r.record_id || '').slice(0, 8)}…</code>
                </span>,
                <span key="rule" style={{ fontSize: 11 }}>{(r.approval_matrix_rules as any)?.rule_name || '—'}</span>,
                <span key="p" style={{ fontSize: 11 }}>{(r.projects as any)?.project_name || '—'}</span>,
                <span key="a">{money(Number(r.amount || 0))}</span>,
                <span key="step">
                  {r.current_step_order ? `Step ${r.current_step_order}` : '—'}
                </span>,
                <Badge key="s" text={statusLabel[r.status] || r.status} tone={approvalTone(r.status)} />,
                // V140_01: only current pending step assignees shown
                <div key="flow" style={{ display: 'grid', gap: 3, fontSize: 11 }}>
                  {currentPending.map((a) => (
                    <span key={a.id}>
                      <strong>{a.step_type}</strong>
                      {' — '}{a.assigned_role_name || '?'}
                      {a.assigned_user_name ? ` → ${a.assigned_user_name}` : ''}
                      {a.assigned_user_email ? ` (${a.assigned_user_email})` : ''}
                    </span>
                  ))}
                </div>,
                <div key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canReview && (
                    <Button disabled={busy} onClick={() => act(r.id, 'Review', r, currentPending)}>
                      Mark Reviewed
                    </Button>
                  )}
                  {canApprove && (
                    <Button disabled={busy} onClick={() => act(r.id, 'Approve', r, currentPending)}>
                      {ceoStep ? 'CEO Payment Approval' : 'Approve'}
                    </Button>
                  )}
                  {(canReview || canApprove) && (
                    <Button tone="secondary" disabled={busy} onClick={() => act(r.id, 'Return', r, currentPending)}>
                      Not Approved
                    </Button>
                  )}
                  {(canReview || canApprove) && (
                    <Button tone="danger" disabled={busy} onClick={() => act(r.id, 'Reject', r, currentPending)}>
                      Reject
                    </Button>
                  )}
                </div>,
              ]
            })}
          />
        </Card>
      )}

      {/* ── Tab: Pending by Project ── */}
      {activeTab === 'byProject' && (
        <Card title="Pending Approvals by Project">
          <Table
            heads={['Project', 'Pending Review', 'Pending Approval', 'Total', 'Total Amount']}
            rows={byProject.map((r) => [
              r.project_name,
              r.pending_review_count,
              r.pending_approval_count,
              r.total_pending,
              money(Number(r.total_amount || 0)),
            ])}
          />
        </Card>
      )}

      {/* ── Tab: Delayed ── */}
      {activeTab === 'delay' && (
        <Card title="Delayed Approvals (> 2 days pending)">
          <Table
            heads={['Module', 'Action', 'Project', 'Status', 'Days Pending', 'Note']}
            rows={delayRows.map((r) => [
              r.module,
              r.action,
              r.project_name || '—',
              <Badge key="s" text={statusLabel[r.status] || r.status} tone={approvalTone(r.status)} />,
              r.days_pending,
              r.configuration_message || '—',
            ])}
          />
        </Card>
      )}

      {/* ── Tab: History ── */}
      {activeTab === 'history' && (
        <Card title="Approval History — Completed Requests">
          <Table
            heads={['Module', 'Action', 'Project', 'Amount', 'Final Status', 'Submitted', 'Completed']}
            rows={history.map((r) => [
              r.module,
              displayApprovalAction(r.module, r.action),
              r.project_name || '—',
              money(Number(r.amount || 0)),
              <Badge key="s" text={statusLabel[r.status] || r.status} tone={approvalTone(r.status)} />,
              r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—',
              r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—',
            ])}
          />
        </Card>
      )}

      {/* ── Tab: Configuration Issues (Admin only) ── */}
      {activeTab === 'configIssues' && isAdminOwner && (
        <Card
          title="Configuration Issues — Missing Approval Assignment"
          action={<Badge text="Admin only" tone="warn" />}
        >
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: '#92400e' }}>
            These invoices were released but no user could be resolved for one or more required steps.
            Assign the correct roles in <strong>Settings → Approval Matrix</strong> and in the
            <strong> approval_user_roles</strong> table, then re-release the invoice.
          </div>
          <Table
            heads={['Module', 'Record', 'Project', 'Amount', 'Submitted', 'Last note']}
            rows={missingConfig.map((r: any) => {
              const rAssignments = byReq.get(r.id) ?? []
              const note = rAssignments.find((a) => a.comments)?.comments || '—'
              return [
                `${r.module} / ${displayApprovalAction(r.module, r.action)}`,
                <code key="rec" style={{ fontSize: 11 }}>{String(r.record_id || '').slice(0, 8)}…</code>,
                (r.projects as any)?.project_name || '—',
                money(Number(r.amount || 0)),
                r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—',
                <span key="note" style={{ fontSize: 11, color: '#b45309' }}>{note}</span>,
              ]
            })}
          />
        </Card>
      )}
    </>
  )
}
