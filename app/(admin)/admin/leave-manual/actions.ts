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

const DEDUCTS_LEAVE = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

async function checkOverlap(
  client: ReturnType<typeof adminClient>,
  employeeId: string,
  startDate: string,
  endDate: string,
  leaveType: string,
  excludeId?: string,
): Promise<string | null> {
  let query = client
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date')
    .eq('employee_id', employeeId)
    .eq('status', 'APPROVED')
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query
  if (!data || data.length === 0) return null

  for (const r of data) {
    const sameDay = startDate === endDate && r.start_date === r.end_date && startDate === r.start_date
    const halfDayCombo = sameDay &&
      ((leaveType === 'AM_HALF' && r.leave_type === 'PM_HALF') ||
       (leaveType === 'PM_HALF' && r.leave_type === 'AM_HALF'))
    if (!halfDayCombo) {
      const dateStr = r.start_date === r.end_date ? r.start_date : `${r.start_date}~${r.end_date}`
      return `${dateStr}에 이미 등록된 휴가가 있습니다.`
    }
  }
  return null
}

async function adjustLeaves(client: ReturnType<typeof adminClient>, employeeId: string, delta: number) {
  const { data: emp } = await client.from('employees').select('remaining_leaves').eq('id', employeeId).single()
  if (!emp) return
  await client.from('employees')
    .update({ remaining_leaves: Math.max(Number(emp.remaining_leaves) + delta, 0) })
    .eq('id', employeeId)
}

export async function adminAddLeaveRecord(input: ManualLeaveInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const client = adminClient()

  const overlapMsg = await checkOverlap(client, input.employeeId, input.startDate, input.endDate, input.leaveType)
  if (overlapMsg) return { error: overlapMsg }

  const { error: insertError } = await client.from('leave_requests').insert({
    employee_id: input.employeeId,
    leave_type: input.leaveType,
    start_date: input.startDate,
    end_date: input.endDate,
    days_used: input.daysUsed,
    reason: input.reason,
    status: 'APPROVED',
    is_manual: true,
  })
  if (insertError) return { error: insertError.message }

  if (DEDUCTS_LEAVE.includes(input.leaveType)) {
    await adjustLeaves(client, input.employeeId, -input.daysUsed)
  }

  revalidatePath('/admin/leave-manual')
  return { error: null }
}

export async function adminUpdateLeaveRecord(id: string, input: ManualLeaveInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const client = adminClient()

  const { data: current, error: fetchError } = await client
    .from('leave_requests')
    .select('employee_id, leave_type, days_used')
    .eq('id', id)
    .single()

  if (fetchError || !current) return { error: '수정할 내역을 찾을 수 없습니다.' }

  const overlapMsg = await checkOverlap(client, current.employee_id, input.startDate, input.endDate, input.leaveType, id)
  if (overlapMsg) return { error: overlapMsg }

  const oldDeduction = DEDUCTS_LEAVE.includes(current.leave_type) ? Number(current.days_used) : 0
  const newDeduction = DEDUCTS_LEAVE.includes(input.leaveType) ? input.daysUsed : 0
  const delta = oldDeduction - newDeduction  // positive = restore, negative = extra deduction

  if (delta !== 0) {
    await adjustLeaves(client, current.employee_id, delta)
  }

  const { error: updateError } = await client.from('leave_requests').update({
    leave_type: input.leaveType,
    start_date: input.startDate,
    end_date: input.endDate,
    days_used: input.daysUsed,
    reason: input.reason,
  }).eq('id', id)

  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/leave-manual')
  return { error: null }
}

export async function adminDeleteLeaveRecord(id: string) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const client = adminClient()

  const { data: record, error: fetchError } = await client
    .from('leave_requests')
    .select('employee_id, leave_type, days_used')
    .eq('id', id)
    .single()

  if (fetchError || !record) return { error: '삭제할 내역을 찾을 수 없습니다.' }

  if (DEDUCTS_LEAVE.includes(record.leave_type)) {
    await adjustLeaves(client, record.employee_id, Number(record.days_used))
  }

  const { error: deleteError } = await client.from('leave_requests').delete()
    .eq('id', id)

  if (deleteError) return { error: deleteError.message }

  revalidatePath('/admin/leave-manual')
  return { error: null }
}
