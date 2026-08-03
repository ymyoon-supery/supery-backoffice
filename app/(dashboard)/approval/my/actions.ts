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

  const { data, error } = await supabase
    .from('document_requests')
    .update({ status: 'CANCELLED' })
    .eq('id', id)
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING')
    .select('id')

  if (error) return { error: error.message }
  if (!data?.length) return { error: '취소할 수 없는 상태입니다.' }
  revalidatePath('/approval/my')
  return { error: null }
}

export async function cancelSupplyRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  // Disallow cancellation once any approver has already approved a step
  const { data: approvedSteps } = await supabase
    .from('supply_approval_steps')
    .select('id')
    .eq('supply_request_id', id)
    .eq('status', 'APPROVED')
    .limit(1)
  if (approvedSteps?.length) return { error: '이미 결재가 진행된 신청은 취소할 수 없습니다. 담당자에게 반려를 요청해 주세요.' }

  const { data, error } = await supabase
    .from('supply_requests')
    .update({ status: 'CANCELLED' })
    .eq('id', id)
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING')
    .select('id')

  if (error) return { error: error.message }
  if (!data?.length) return { error: '취소할 수 없는 상태입니다.' }

  await supabase
    .from('supply_approval_steps')
    .update({ status: 'CANCELLED' })
    .eq('supply_request_id', id)
    .in('status', ['PENDING', 'WAITING'])

  revalidatePath('/approval/my')
  revalidatePath('/approval/pending')
  return { error: null }
}
