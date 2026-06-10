'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { error: '권한이 없습니다.' }
  return { error: null }
}

export type ManualLeaveInput = {
  employeeId: string
  leaveType: string
  startDate: string
  endDate: string
  daysUsed: number
  reason: string | null
}

const DEDUCTS_LEAVE = ['ANNUAL', 'HALF_DAY', 'GROUP']

export async function adminAddLeaveRecord(input: ManualLeaveInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const client = adminClient()

  const { error: insertError } = await client
    .from('leave_requests')
    .insert({
      employee_id: input.employeeId,
      leave_type: input.leaveType,
      start_date: input.startDate,
      end_date: input.endDate,
      days_used: input.daysUsed,
      reason: input.reason,
      status: 'APPROVED',
    })

  if (insertError) return { error: insertError.message }

  if (DEDUCTS_LEAVE.includes(input.leaveType)) {
    const { data: emp } = await client
      .from('employees')
      .select('remaining_leaves')
      .eq('id', input.employeeId)
      .single()

    if (emp) {
      const newRemaining = Math.max(Number(emp.remaining_leaves) - input.daysUsed, 0)
      const { error: updateError } = await client
        .from('employees')
        .update({ remaining_leaves: newRemaining })
        .eq('id', input.employeeId)
      if (updateError) return { error: updateError.message }
    }
  }

  revalidatePath('/admin/leave-manual')
  return { error: null }
}
