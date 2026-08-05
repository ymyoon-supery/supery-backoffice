'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getEmployeeId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, employeeId: null }
  const { data } = await supabase.from('employees').select('id').eq('auth_user_id', user.id).single()
  return { supabase, employeeId: data?.id ?? null }
}

export async function cancelLeaveRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.rpc('cancel_own_leave_request', { p_request_id: id })

  if (error) return { error: error.message }

  revalidatePath('/approval/my')
  revalidatePath('/approval/pending')
  return { error: null }
}

export async function cancelExpenseRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.rpc('cancel_own_expense_request', { p_report_id: id })

  if (error) return { error: error.message }

  revalidatePath('/approval/my')
  revalidatePath('/approval/pending')
  return { error: null }
}

export async function cancelDocumentRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.rpc('cancel_own_document_request', { p_request_id: id })

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  return { error: null }
}

export async function cancelSupplyRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.rpc('cancel_own_supply_request', { p_request_id: id })

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  revalidatePath('/approval/pending')
  return { error: null }
}

export async function resubmitSupplyRequest(
  id: string,
  items: Array<{
    category: string
    description: string
    estimated_amount: number | null
    note: string | null
  }>
) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.rpc('resubmit_supply_request', {
    p_request_id: id,
    p_items: items,
  })

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  revalidatePath('/approval/pending')
  return { error: null }
}
