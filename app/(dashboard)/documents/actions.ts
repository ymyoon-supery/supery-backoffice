'use server'

import { createClient } from '@/lib/supabase/server'

export async function submitDocumentRequest(input: {
  docType: 'EMPLOYMENT_CERT' | 'WITHHOLDING_RECEIPT'
  purpose?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) return { error: '직원 정보를 찾을 수 없습니다.' }

  const { error } = await supabase
    .from('document_requests')
    .insert({ employee_id: employee.id, doc_type: input.docType, purpose: input.purpose ?? null })

  if (error) return { error: error.message }
  return { error: null }
}

export async function submitSupplyRequest(input: {
  items: Array<{
    category: 'EQUIPMENT' | 'CONSUMABLE' | 'SOFTWARE' | 'OTHER'
    description: string
    estimatedAmount?: number | null
    note?: string | null
  }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  if (!input.items || input.items.length === 0) {
    return { error: '항목을 1개 이상 입력해주세요.' }
  }

  const pItems = input.items.map(it => ({
    category: it.category,
    description: it.description,
    estimated_amount: it.estimatedAmount ?? null,
    note: it.note ?? null,
  }))

  const { error } = await supabase.rpc('submit_supply_request', {
    p_items: pItems,
  })

  if (error) return { error: error.message }
  return { error: null }
}

export async function approveSupplyAction(
  requestId: string,
  approved: boolean,
  comment?: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.rpc('approve_supply_step', {
    p_request_id: requestId,
    p_approved: approved,
    p_comment: comment ?? null,
  })

  if (error) return { error: error.message }
  return { error: null }
}
