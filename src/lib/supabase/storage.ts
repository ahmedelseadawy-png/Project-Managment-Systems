// src/lib/supabase/storage.ts
import { createClient } from './client'

export const BUCKET = {
  ATTACHMENTS:  process.env.NEXT_PUBLIC_STORAGE_BUCKET_ATTACHMENTS  ?? 'pcs-attachments',
  CERTIFICATES: process.env.NEXT_PUBLIC_STORAGE_BUCKET_CERTIFICATES ?? 'pcs-certificates',
  EXPORTS:      process.env.NEXT_PUBLIC_STORAGE_BUCKET_EXPORTS       ?? 'pcs-exports',
} as const

export async function uploadFile(bucket: string, path: string, file: File) {
  const supabase = createClient()
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return { url: null, error: error.message }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600) {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) return { url: null, error: error.message }
  return { url: data.signedUrl, error: null }
}
