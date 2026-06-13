'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

export async function fullApproveLeave(requestId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_full_approve_leave', { p_request_id: requestId })
  if (error) return { error: error.message }
  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}

export async function fullApproveExpense(reportId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_full_approve_expense', { p_report_id: reportId })
  if (error) return { error: error.message }
  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}

export async function fullRejectLeave(requestId: string, comment?: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_full_reject_leave', {
    p_request_id: requestId,
    p_comment: comment ?? null,
  })
  if (error) return { error: error.message }
  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}

export async function fullRejectExpense(reportId: string, comment?: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_full_reject_expense', {
    p_report_id: reportId,
    p_comment: comment ?? null,
  })
  if (error) return { error: error.message }
  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}

export async function updateExpensePaymentStatus(
  reportId: string,
  paymentStatus: 'PENDING_PAYMENT' | 'PAID' | 'SETTLED',
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: adminEmployee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!adminEmployee || adminEmployee.role !== 'ADMIN') return { error: '권한이 없습니다.' }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await admin
    .from('expense_reports')
    .update({ payment_status: paymentStatus })
    .eq('id', reportId)

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}

export async function approveHomeLocationRequest(
  requestId: string,
  approved: boolean,
  comment?: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: adminEmployee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!adminEmployee || adminEmployee.role !== 'ADMIN') return { error: '권한이 없습니다.' }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: req } = await admin
    .from('home_location_requests')
    .select('id, employee_id, new_lat, new_lng')
    .eq('id', requestId)
    .single()

  if (!req) return { error: '신청 내역을 찾을 수 없습니다.' }

  const { error } = await admin
    .from('home_location_requests')
    .update({
      status: approved ? 'APPROVED' : 'REJECTED',
      comment: comment ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (error) return { error: error.message }

  if (approved) {
    await admin
      .from('employees')
      .update({ home_lat: req.new_lat, home_lng: req.new_lng })
      .eq('id', req.employee_id)
  }

  revalidateTag(CACHE_TAGS.attendance)
  return { error: null }
}
