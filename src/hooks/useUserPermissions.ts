'use client'
// src/hooks/useUserPermissions.ts
// V140 — Permission-aware module visibility hook.
// Phase 1: visual hiding only. RLS enforcement comes in V140_04.
// Safe fallback: if user_module_permissions table missing, show all modules.
// Admin / Owner always see all modules regardless.

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ModulePermission {
  module_key: string
  project_id?: string | null
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  can_approve: boolean
  can_export?: boolean
}

interface UseUserPermissionsResult {
  isAdminOwner: boolean
  canView: (moduleKey: string) => boolean
  permissions: ModulePermission[]
  loading: boolean
}

export function useUserPermissions(
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  projectId: string | null | undefined,
): UseUserPermissionsResult {
  const [isAdminOwner, setIsAdminOwner] = useState(false)
  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [tableExists, setTableExists] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const normalizeModuleKey = useCallback((moduleKey: string): string => {
    const aliases: Record<string, string> = {
      'project-structure': 'structure',
      'subcontractor-contracts': 'breakdown',
      'subcontractor-invoices': 'certificates',
      'material-requests': 'procurement',
      'assigned-approvals': 'approval-center',
      'reports': 'dashboard',
    }
    return aliases[moduleKey] ?? moduleKey
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!userId && !userEmail) {
      setLoading(false)
      return
    }

    async function load() {
      try {
        const supabase = createClient()

        // 1. Check if user is Admin / Owner
        // Try v139_is_admin_owner RPC first; fall back to role check
        let admin = false
        try {
          const { data } = await supabase.rpc('v139_is_admin_owner', {
            p_user_id: userId ?? null,
            p_email: userEmail ?? null,
          })
          admin = Boolean(data)
        } catch {
          // RPC not available — check public.users.role directly
          if (userId) {
            const { data } = await supabase
              .from('users')
              .select('role')
              .eq('id', userId)
              .maybeSingle()
            admin = String(data?.role ?? '').toLowerCase() === 'admin'
          }
        }

        if (cancelled) return
        setIsAdminOwner(admin)

        // Admin always sees everything — no need to query permissions
        if (admin) {
          setTableExists(true)
          setPermissions([])
          setLoading(false)
          return
        }

        // 2. Try to load user_module_permissions (may not exist yet)
        const { data: perms, error } = await supabase
          .from('user_module_permissions')
          .select('project_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export')
          .eq('user_id', userId ?? '')
          .eq('is_active', true)
          .or(projectId ? `project_id.eq.${projectId},project_id.is.null` : 'project_id.is.null')

        if (cancelled) return

        if (error) {
          // Table doesn't exist yet — show all modules (safe fallback)
          setTableExists(false)
          setPermissions([])
        } else {
          setTableExists(true)
          const merged = new Map<string, ModulePermission>()
          for (const p of perms ?? []) {
            const key = normalizeModuleKey(String(p.module_key ?? ''))
            if (!key) continue
            const existing = merged.get(key)
            const isProjectSpecific = Boolean(p.project_id)
            if (existing?.project_id && !isProjectSpecific) continue
            merged.set(key, {
              project_id: p.project_id ?? null,
              module_key: key,
              can_view: Boolean(p.can_view),
              can_create: Boolean(p.can_create),
              can_edit: Boolean(p.can_edit),
              can_delete: Boolean(p.can_delete),
              can_approve: Boolean(p.can_approve),
              can_export: Boolean(p.can_export),
            })
          }
          setPermissions(Array.from(merged.values()))
        }
      } catch {
        if (!cancelled) {
          setTableExists(false)
          setPermissions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [userId, userEmail, projectId, normalizeModuleKey])

  const canView = useCallback(
    (moduleKey: string): boolean => {
      // Admin / Owner always can view
      if (isAdminOwner) return true
      // Table doesn't exist → show everything (V140_04 fallback)
      if (tableExists === false || tableExists === null) return true
      // Table exists but no rows → user has no explicit permissions → show all
      // (conservative: until admin configures permissions, show everything)
      if (permissions.length === 0) return true
      // Check specific permission
      const normalized = normalizeModuleKey(moduleKey)
      const perm = permissions.find((p) => p.module_key === normalized)
      if (!perm) return false
      return perm.can_view
    },
    [isAdminOwner, tableExists, permissions, normalizeModuleKey]
  )

  return { isAdminOwner, canView, permissions, loading }
}
