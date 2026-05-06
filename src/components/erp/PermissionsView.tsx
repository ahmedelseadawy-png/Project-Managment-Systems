'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

type PermissionAction = 'View' | 'Create' | 'Edit' | 'Delete' | 'Approve' | 'Export'
type PermissionRow = Record<PermissionAction, boolean>
type PermissionsByModule = Record<string, PermissionRow>

type DbUser = {
  id: string
  name: string
  email?: string | null
  role?: string | null
  admin?: boolean
  projects?: string[]
}

type Props = { isAdminOwner?: boolean }

const actions: PermissionAction[] = ['View', 'Create', 'Edit', 'Delete', 'Approve', 'Export']
const actionColumns: Record<PermissionAction, string> = {
  View: 'can_view',
  Create: 'can_create',
  Edit: 'can_edit',
  Delete: 'can_delete',
  Approve: 'can_approve',
  Export: 'can_export',
}

const modules = [
  { key: 'project-structure', label: 'Project Structure', desc: 'Project hierarchy and areas' },
  { key: 'boq', label: 'BOQ', desc: 'Bill of Quantities' },
  { key: 'bbs-qs', label: 'BBS & QS', desc: 'Quantity control' },
  { key: 'subcontractor-dashboard', label: 'Subcontractor Dashboard', desc: 'Contractor progress comparison' },
  { key: 'workfronts', label: 'Workfronts', desc: 'Grouped schedule and site workfront tracking' },
  { key: 'site-progress', label: 'Site Progress', desc: 'Physical progress entry and approval' },
  { key: 'subcontractor-contracts', label: 'Subcontractor Contracts', desc: 'Contract terms and items' },
  { key: 'subcontractor-invoices', label: 'Subcontractor Invoices', desc: 'Certificates and payments' },
  { key: 'material-requests', label: 'Material Requests', desc: 'Site material requests' },
  { key: 'procurement', label: 'Procurement', desc: 'PR / RFQ / PO workflow' },
  { key: 'supplier-offers', label: 'Supplier Offers', desc: 'Supplier quotation offer list' },
  { key: 'quotation-comparison', label: 'Quotation Comparison', desc: 'RFQ offer comparison and award selection' },
  { key: 'finance', label: 'Finance', desc: 'Payments and accounts' },
  { key: 'assigned-approvals', label: 'Assigned Approvals', desc: 'Workflow actions' },
  { key: 'reports', label: 'Reports', desc: 'Dashboards and exports' },
  { key: 'company-branding', label: 'Company Branding', desc: 'Logo and profile' },
  { key: 'permissions', label: 'Settings / Permissions', desc: 'Access control' },
]

const fallbackUsers: DbUser[] = [
  { id: 'admin-owner', name: 'Admin / Owner', role: 'Full access override', admin: true, projects: ['All Project Areas', '200 FEDDAN'] },
  { id: 'project-manager', name: 'Project Manager', role: 'Project/module permissions', projects: ['200 FEDDAN'] },
  { id: 'qs-engineer', name: 'QS Engineer', role: 'Project/module permissions', projects: ['200 FEDDAN', 'Infrastructure'] },
  { id: 'finance', name: 'Finance', role: 'Project/module permissions', projects: ['All Project Areas'] },
  { id: 'ceo', name: 'CEO', role: 'Final approvals / reports', projects: ['All Project Areas'] },
]

const card: CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18 }
const buttonBase: CSSProperties = { border: '1px solid #d5ddd7', borderRadius: 10, padding: '8px 12px', background: '#fff', fontWeight: 800, cursor: 'pointer' }

function makeRow(value = false): PermissionRow {
  return actions.reduce((acc, action) => ({ ...acc, [action]: value }), {} as PermissionRow)
}

function defaultsForUser(user: DbUser): PermissionsByModule {
  const isAdmin = Boolean(user.admin) || String(user.role ?? '').toLowerCase().includes('admin') || String(user.role ?? '').toLowerCase().includes('owner')
  const base = Object.fromEntries(modules.map(m => [m.key, makeRow(isAdmin)])) as PermissionsByModule
  const role = String(user.role ?? '').toLowerCase()
  if (isAdmin) return base
  if (role.includes('finance')) {
    for (const key of ['finance','subcontractor-invoices','assigned-approvals','reports']) base[key] = { ...makeRow(false), View: true, Edit: true, Approve: true, Export: true }
    return base
  }
  if (role.includes('qs')) {
    for (const key of ['project-structure','boq','bbs-qs','subcontractor-contracts','subcontractor-invoices','material-requests','assigned-approvals','reports']) base[key] = { ...makeRow(false), View: true, Create: ['bbs-qs','subcontractor-invoices','material-requests'].includes(key), Edit: ['bbs-qs','subcontractor-invoices','material-requests'].includes(key), Export: ['boq','bbs-qs','reports'].includes(key), Approve: key === 'assigned-approvals' }
    return base
  }
  if (role.includes('ceo')) {
    for (const key of modules.map(m => m.key)) base[key] = { ...makeRow(false), View: true, Approve: ['assigned-approvals','finance','procurement','subcontractor-invoices'].includes(key), Export: true }
    return base
  }
  for (const key of modules.map(m => m.key)) base[key] = { ...makeRow(false), View: true }
  return base
}

function fromDbRows(user: DbUser, rows: any[]): PermissionsByModule {
  const next = defaultsForUser(user)
  for (const row of rows ?? []) {
    if (!row?.module_key) continue
    next[row.module_key] = {
      View: Boolean(row.can_view),
      Create: Boolean(row.can_create),
      Edit: Boolean(row.can_edit),
      Delete: Boolean(row.can_delete),
      Approve: Boolean(row.can_approve),
      Export: Boolean(row.can_export),
    }
  }
  return next
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function PermissionsView({ isAdminOwner }: Props) {
  const [users, setUsers] = useState<DbUser[]>(fallbackUsers)
  const [selectedUserId, setSelectedUserId] = useState<string>(fallbackUsers[0].id)
  const [permissions, setPermissions] = useState<PermissionsByModule>(() => defaultsForUser(fallbackUsers[0]))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [dbReady, setDbReady] = useState(false)

  const selectedUser = users.find(u => u.id === selectedUserId) ?? users[0]
  const selectedIsAdmin = Boolean(selectedUser?.admin) || String(selectedUser?.role ?? '').toLowerCase().includes('admin') || String(selectedUser?.role ?? '').toLowerCase().includes('owner')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, is_active')
        .order('full_name', { ascending: true })
      if (error) throw error
      const mapped: DbUser[] = (data ?? [])
        .filter((u: any) => u.id)
        .map((u: any) => ({
          id: String(u.id),
          name: u.full_name || u.email || 'User',
          email: u.email,
          role: String(u.role ?? 'Viewer'),
          admin: String(u.role ?? '').toLowerCase() === 'admin',
          projects: ['Project access from Supabase'],
        }))
      if (mapped.length > 0) {
        setUsers(mapped)
        setSelectedUserId((old) => mapped.some((u: DbUser) => u.id === old) ? old : mapped[0].id)
      }
      setDbReady(true)
    } catch (e: any) {
      setUsers(fallbackUsers)
      setSelectedUserId(fallbackUsers[0].id)
      setDbReady(false)
      setMessage(`Using visual fallback. ${e?.message ?? ''}`.trim())
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPermissions = useCallback(async (user: DbUser) => {
    if (!user) return
    setLoading(true)
    try {
      if (!isUuidLike(user.id)) throw new Error('Selected user is a visual fallback user')
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_module_permissions')
        .select('*')
        .eq('user_id', user.id)
        .is('project_id', null)
        .eq('is_active', true)
      if (error) throw error
      setPermissions(fromDbRows(user, data ?? []))
      setDbReady(true)
    } catch (e: any) {
      setPermissions(defaultsForUser(user))
      setDbReady(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])
  useEffect(() => { void loadPermissions(selectedUser) }, [selectedUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  const enabledCount = useMemo(() => Object.values(permissions).reduce((total, row) => total + actions.filter(action => row?.[action]).length, 0), [permissions])

  const togglePermission = (moduleKey: string, action: PermissionAction) => {
    if (selectedIsAdmin) return
    setPermissions(prev => ({ ...prev, [moduleKey]: { ...(prev[moduleKey] ?? makeRow(false)), [action]: !(prev[moduleKey] ?? makeRow(false))[action] } }))
    setMessage('Unsaved changes')
  }

  const setAllForModule = (moduleKey: string, value: boolean) => {
    if (selectedIsAdmin) return
    setPermissions(prev => ({ ...prev, [moduleKey]: makeRow(value) }))
    setMessage('Unsaved changes')
  }

  const savePermissions = async () => {
    if (selectedIsAdmin) {
      setMessage('Admin / Owner has full access by override. No row-level permission save is required.')
      return
    }
    setSaving(true)
    try {
      if (!isUuidLike(selectedUser.id)) throw new Error('Select a real Supabase user before saving permissions.')
      const supabase = createClient()
      for (const mod of modules) {
        const row = permissions[mod.key] ?? makeRow(false)
        const payload: any = {
          user_id: selectedUser.id,
          project_id: null,
          module_key: mod.key,
          can_view: row.View,
          can_create: row.Create,
          can_edit: row.Edit,
          can_delete: row.Delete,
          can_approve: row.Approve,
          can_export: row.Export,
          is_active: true,
          updated_at: new Date().toISOString(),
        }
        const { data: existing, error: lookupError } = await supabase
          .from('user_module_permissions')
          .select('id')
          .eq('user_id', selectedUser.id)
          .eq('module_key', mod.key)
          .is('project_id', null)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        if (lookupError) throw lookupError
        if (existing?.id) {
          const { error } = await supabase.from('user_module_permissions').update(payload).eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('user_module_permissions').insert(payload)
          if (error) throw error
        }
      }
      setDbReady(true)
      setMessage('Permissions saved successfully to Supabase.')
      window.setTimeout(() => setMessage(''), 3500)
    } catch (e: any) {
      setMessage(`Could not save to Supabase. Visual changes remain on screen. ${e?.message ?? ''}`.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#0f6e56)', borderRadius: 18, padding: 24, color: '#fff' }}>
        <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Permissions</div>
        <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>User Project Access & Module Matrix</div>
        <div style={{ opacity: 0.86, marginTop: 6 }}>Saves to public.user_module_permissions after V140_04. Admin / Owner always has full access.</div>
      </div>

      {(message || loading) && <div style={{ padding: '10px 12px', borderRadius: 12, background: dbReady ? '#edf9f3' : '#fff7ed', color: dbReady ? '#0f6e56' : '#9a3412', border: `1px solid ${dbReady ? '#bfe7d8' : '#fed7aa'}`, fontSize: 12 }}>{loading ? 'Loading permissions…' : message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Users</div>
            {users.map((u) => {
              const active = u.id === selectedUserId
              return (
                <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setMessage('') }} style={{ width: '100%', textAlign: 'left', padding: 12, borderRadius: 12, background: active ? '#e1f5ee' : '#f8fafc', marginBottom: 8, border: active ? '1px solid #1D9E75' : '1px solid #e2e8f0', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div><div style={{ fontWeight: 900, color: '#0f172a' }}>{u.name}</div><div style={{ fontSize: 12, color: '#64748b' }}>{u.role}{u.email ? ` · ${u.email}` : ''}</div></div>
                    {(u.admin || String(u.role ?? '').toLowerCase().includes('admin') || String(u.role ?? '').toLowerCase().includes('owner')) && <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: '#dff8ee', color: '#0f6e56', fontWeight: 900 }}>Admin</span>}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Project Access</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{selectedUser.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(selectedUser.projects ?? ['Global permissions']).map(project => <span key={project} style={{ borderRadius: 999, background: '#e1f5ee', color: '#0f6e56', padding: '6px 10px', fontSize: 12, fontWeight: 800 }}>{project}</span>)}
              {!selectedIsAdmin && <button type="button" style={{ borderRadius: 999, border: '1px dashed #94a3b8', background: '#fff', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>+ Add project</button>}
            </div>
          </div>
        </div>

        <div style={{ ...card, padding: 18, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div><div style={{ fontWeight: 900, fontSize: 18 }}>Module Permission Matrix</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Selected: <strong>{selectedUser.name}</strong> · Enabled permissions: {selectedIsAdmin ? 'All' : enabledCount}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, background: selectedIsAdmin ? '#e1f5ee' : '#f8fafc', color: selectedIsAdmin ? '#0f6e56' : '#64748b', fontWeight: 900 }}>{selectedIsAdmin ? 'Admin / Owner: all access' : isAdminOwner ? 'Editable by Admin' : 'Visual / DB permissions'}</span>
              <button type="button" onClick={savePermissions} disabled={saving || loading} style={{ ...buttonBase, background: '#1D9E75', borderColor: '#1D9E75', color: '#fff' }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#137557', color: '#fff' }}><th style={th}>Module</th>{actions.map(action => <th key={action} style={{ ...th, color: '#fff', textAlign: 'center' }}>{action}</th>)}<th style={{ ...th, color: '#fff', textAlign: 'center' }}>Quick</th></tr></thead>
            <tbody>
              {modules.map((mod) => {
                const row = selectedIsAdmin ? makeRow(true) : (permissions[mod.key] ?? makeRow(false))
                return <tr key={mod.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={td}><div style={{ fontWeight: 900 }}>{mod.label}</div><div style={{ fontSize: 11, color: '#64748b' }}>{mod.desc}</div></td>
                  {actions.map((action) => <td key={action} style={{ ...td, textAlign: 'center' }}><button type="button" onClick={() => togglePermission(mod.key, action)} disabled={selectedIsAdmin} style={{ width: 30, height: 30, borderRadius: 8, border: row[action] ? '1px solid #1D9E75' : '1px solid #cbd5e1', background: row[action] ? '#1D9E75' : '#fff', color: row[action] ? '#fff' : '#64748b', cursor: selectedIsAdmin ? 'not-allowed' : 'pointer', fontWeight: 900 }}>{row[action] ? '✓' : '—'}</button></td>)}
                  <td style={{ ...td, textAlign: 'center' }}><div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}><button type="button" disabled={selectedIsAdmin} onClick={() => setAllForModule(mod.key, true)} style={smallBtn}>All</button><button type="button" disabled={selectedIsAdmin} onClick={() => setAllForModule(mod.key, false)} style={smallBtn}>None</button></div></td>
                </tr>
              })}
            </tbody>
          </table>
          <div style={{ padding: 12, background: '#fff7ed', color: '#92400e', fontSize: 13, marginTop: 14, borderRadius: 12, border: '1px solid #fed7aa' }}>Admin / Owner users bypass this matrix and always have full access to all modules and all projects.</div>
        </div>
      </div>
    </div>
  )
}

const th: CSSProperties = { padding: '10px 12px', textAlign: 'left', fontWeight: 900 }
const td: CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const smallBtn: CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 8px', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 800 }
