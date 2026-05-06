import { supabase } from "@/lib/supabase"

export const addSubcontractorPayment = async (payload: {
  project_id: string
  subcontractor_id: string
  invoice_id: string
  payment_date?: string
  amount: number
  method?: string
  reference?: string
  notes?: string
}) => {
  const { data, error } = await supabase
    .from("subcontractor_payments")
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}
