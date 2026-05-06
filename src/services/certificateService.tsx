import { supabase } from "@/lib/supabase"

export const getCertificateSummary = async (invoiceId: string) => {
  const { data, error } = await supabase
    .from("v_certificate_summary")
    .select("*")
    .eq("id", invoiceId)
    .single()

  if (error) throw error
  return data
}

export const getCertificateLines = async (invoiceId: string) => {
  const { data, error } = await supabase
    .from("subcontractor_invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}
