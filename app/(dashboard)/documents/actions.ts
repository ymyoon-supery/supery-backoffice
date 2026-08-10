'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyNewRequest, notifyApprovalResult } from '@/lib/email'

export async function submitDocumentRequest(input: {
  docType: 'EMPLOYMENT_CERT' | 'WITHHOLDING_RECEIPT'
  purpose?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) return { error: '직원 정보를 찾을 수 없습니다.' }

  const { error } = await supabase
    .from('document_requests')
    .insert({ employee_id: employee.id, doc_type: input.docType, purpose: input.purpose ?? null })

  if (error) return { error: error.message }

  await notifyNewRequest({ requestType: '서류신청', employeeName: employee.name, departmentId: employee.department_id, excludeAuthUserId: user.id })

  revalidatePath('/admin/documents')
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

  const { data: emp } = await supabase
    .from('employees').select('name, department_id').eq('auth_user_id', user.id).single()
  if (emp) {
    await notifyNewRequest({ requestType: '비품/소모품 신청', employeeName: emp.name, departmentId: emp.department_id, isSupply: true, excludeAuthUserId: user.id })
  }

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

  const { data: req } = await supabase
    .from('supply_requests').select('employee_id').eq('id', requestId).single()
  if (req) {
    await notifyApprovalResult({ employeeId: req.employee_id, requestType: '비품/소모품 신청', approved, comment })
  }

  return { error: null }
}
