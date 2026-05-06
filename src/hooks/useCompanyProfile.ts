"use client"
// V140_04 — company profile + logo upload hook connected to Supabase with safe local fallback.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface CompanyProfile {
  id?: string
  company_name: string
  company_name_ar?: string | null
  logo_url: string | null
  logo_storage_path?: string | null
  logo_fallback_url?: string | null
  address: string | null
  phone: string | null
  email: string | null
  tax_number: string | null
  commercial_register: string | null
  pdf_footer: string | null
  website: string | null
}

const STORAGE_KEY = 'v140_company_profile_fallback'
const FALLBACK: CompanyProfile = {
  id: 'default',
  company_name: 'BuildCore ERP',
  company_name_ar: '',
  logo_url: null,
  logo_storage_path: null,
  logo_fallback_url: '/assets/logo.png',
  address: '',
  phone: '',
  email: '',
  tax_number: '',
  commercial_register: '',
  pdf_footer: 'BuildCore ERP · All rights reserved · Confidential',
  website: '',
}

function readLocal(): CompanyProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...FALLBACK, ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

function writeLocal(profile: CompanyProfile) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)) } catch {}
}

function normalize(data: any): CompanyProfile {
  return {
    id: data?.id ?? 'default',
    company_name: data?.company_name_en ?? data?.company_name ?? FALLBACK.company_name,
    company_name_ar: data?.company_name_ar ?? data?.company_arabic_name ?? '',
    logo_url: data?.logo_url ?? null,
    logo_storage_path: data?.logo_storage_path ?? null,
    logo_fallback_url: data?.logo_fallback_url ?? '/assets/logo.png',
    address: data?.address ?? '',
    phone: data?.phone ?? '',
    email: data?.email ?? '',
    tax_number: data?.tax_vat_registration_no ?? data?.tax_number ?? data?.vat_number ?? '',
    commercial_register: data?.commercial_register_no ?? data?.commercial_register ?? '',
    pdf_footer: data?.pdf_footer_text ?? data?.pdf_footer ?? FALLBACK.pdf_footer,
    website: data?.website ?? '',
  }
}

function toDbPayload(profile: CompanyProfile) {
  return {
    p_company_name_en: profile.company_name || FALLBACK.company_name,
    p_company_name_ar: profile.company_name_ar || null,
    p_logo_url: profile.logo_url || null,
    p_logo_storage_path: profile.logo_storage_path || null,
    p_logo_fallback_url: profile.logo_fallback_url || '/assets/logo.png',
    p_phone: profile.phone || null,
    p_email: profile.email || null,
    p_address: profile.address || null,
    p_tax_vat_registration_no: profile.tax_number || null,
    p_commercial_register_no: profile.commercial_register || null,
    p_pdf_footer_text: profile.pdf_footer || FALLBACK.pdf_footer,
  }
}

export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile>(() => readLocal() ?? FALLBACK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => {
    try { return createClient() } catch { return null as any }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (!supabase) throw new Error('Supabase client unavailable')
      const { data, error } = await supabase
        .from('company_profile')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      const next = data ? normalize(data) : (readLocal() ?? FALLBACK)
      setProfile(next)
      writeLocal(next)
      setError(null)
    } catch (e: any) {
      const local = readLocal()
      setProfile(local ?? FALLBACK)
      setError(e?.message ?? null)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { void refresh() }, [refresh])

  const saveProfile = useCallback(async (patch: Partial<CompanyProfile>) => {
    setSaving(true)
    const next = { ...profile, ...patch, id: profile.id ?? 'default' }
    setProfile(next)
    writeLocal(next)
    try {
      if (!supabase) throw new Error('Supabase client unavailable')

      // Preferred V140_04 path: the RPC maintains the single active profile row safely.
      const { data, error } = await supabase.rpc('v140_save_company_profile', toDbPayload(next))
      if (error) throw error
      const saved = data ? normalize(data) : next
      setProfile(saved)
      writeLocal(saved)
      setError(null)
      return { ok: true, profile: saved, storedIn: 'supabase' as const }
    } catch (e: any) {
      // Fallback: keep the UI usable even if the migration/RPC is not deployed yet.
      setError(e?.message ?? null)
      return { ok: true, profile: next, storedIn: 'local' as const, warning: e?.message as string | undefined }
    } finally {
      setSaving(false)
    }
  }, [profile, supabase])

  const uploadLogo = useCallback(async (file: File) => {
    setSaving(true)
    try {
      if (!file) throw new Error('No file selected')
      if (!supabase) throw new Error('Supabase client unavailable')
      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '-') || 'logo.png'
      const path = `logos/company-${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('company-assets').getPublicUrl(path)
      const url = data?.publicUrl
      if (!url) throw new Error('Public URL was not returned')
      await saveProfile({ logo_url: url, logo_storage_path: path })
      return { ok: true, url, storedIn: 'supabase' as const }
    } catch (e: any) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      await saveProfile({ logo_url: dataUrl, logo_storage_path: null })
      setError(e?.message ?? null)
      return { ok: true, url: dataUrl, storedIn: 'local' as const, warning: e?.message as string | undefined }
    } finally {
      setSaving(false)
    }
  }, [saveProfile, supabase])

  const removeLogo = useCallback(async () => saveProfile({ logo_url: null, logo_storage_path: null }), [saveProfile])

  return { profile, loading, saving, error, setProfile, saveProfile, uploadLogo, removeLogo, refresh }
}
