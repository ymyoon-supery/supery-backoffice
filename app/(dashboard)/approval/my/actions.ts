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

  const { error } = await supabase
    .from('leave_requests')
    .delete()
    .eq('id', id)
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING')

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  return { error: null }
}

export async function cancelExpenseRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase
    .from('expense_reports')
    .delete()
    .eq('id', id)
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING')

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  return { error: null }
}

export async function cancelDocumentRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase
    .from('document_requests')
    .delete()
    .eq('id', id)
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING')

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  return { error: null }
}

export async function cancelSupplyRequest(id: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!employeeId) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase
    .from('supply_requests')
    .delete()
    .eq('id', id)
    .eq('employee_id', employeeId)
    .eq('status', 'PENDING')

  if (error) return { error: error.message }
  revalidatePath('/approval/my')
  return { error: null }
}
