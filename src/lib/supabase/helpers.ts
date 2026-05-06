// src/lib/supabase/helpers.ts
import type { PostgrestError } from '@supabase/supabase-js'

export class SupabaseQueryError extends Error {
  code: string
  constructor(error: PostgrestError) {
    super(error.message)
    this.name = 'SupabaseQueryError'
    this.code = error.code
  }
}

export function unwrap<T>(
  result: { data: T | null; error: PostgrestError | null },
  fallback?: T
): T {
  if (result.error) throw new SupabaseQueryError(result.error)
  if (result.data === null) {
    if (fallback !== undefined) return fallback
    throw new Error('Unexpected null response from Supabase')
  }
  return result.data
}

export function unwrapOptional<T>(
  result: { data: T | null; error: PostgrestError | null }
): T | null {
  if (result.error) {
    if (result.error.code === 'PGRST116') return null
    throw new SupabaseQueryError(result.error)
  }
  return result.data
}
