'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { notifyNewRequest, notifyApprovalResult } from '@/lib/email'

type SubmitLeaveInput = {
  leaveType: string
  startDate: string
  endDate: string
  daysUsed: number
  reason: string | null
}

export async function submitLeave(input: SubmitLeaveInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data, error } = await supabase.rpc('validate_and_submit_leave', {
    p_leave_type: input.leaveType,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_days_used: input.daysUsed,
    p_reason: input.reason,
  })

  if (error) {
    if (error.message.includes('Insufficient leave balance')) {
      return { error: '잔여 연차가 부족합니다.' }
    }
    return { error: error.message }
  }

  const { data: emp } = await supabase
    .from('employees').select('name, department_id').eq('auth_user_id', user.id).single()
  if (emp) {
    await notifyNewRequest({ requestType: '연차신청', employeeName: emp.name, departmentId: emp.department_id, excludeAuthUserId: user.id })
  }

  revalidateTag(CACHE_TAGS.approvalInbox)
  revalidateTag(CACHE_TAGS.leaveBalance)
  return { error: null, id: data as string }
}

export async function approveLeave(requestId: string, approved: boolean, comment?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.rpc('approve_leave_step', {
    p_request_id: requestId,
    p_approved: approved,
    p_comment: comment ?? null,
  })

  if (error) return { error: error.message }

  const { data: req } = await supabase
    .from('leave_requests').select('employee_id, created_at').eq('id', requestId).single()
  if (req) {
    await notifyApprovalResult({ employeeId: req.employee_id, requestType: '연차신청', approved, comment, requestedAt: req.created_at })
  }

  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}
