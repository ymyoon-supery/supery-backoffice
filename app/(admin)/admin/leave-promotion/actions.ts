'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { generateNoticeContent } from '@/lib/annualLeave'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin(): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { ok: false, error: '권한이 없습니다.' }
  return { ok: true, error: null }
}

export async function generateNotice(
  employeeId: string,
  employeeName: string,
  noticeType: 'FIRST' | 'SECOND',
  fiscalYear: number,
  remainingDays: number,
) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error, notice: null }

  const content = generateNoticeContent(noticeType, employeeName, fiscalYear, remainingDays)

  const { data, error: err } = await adminClient()
    .from('leave_promotion_notices')
    .upsert(
      {
        employee_id: employeeId,
        fiscal_year: fiscalYear,
        notice_type: noticeType,
        remaining_days: remainingDays,
        content,
        status: 'DRAFT',
        sent_at: null,
      },
      { onConflict: 'employee_id,fiscal_year,notice_type', ignoreDuplicates: false },
    )
    .select()
    .single()

  if (err) {
    console.error('[generateNotice] error:', err)
    return { error: err.message, notice: null }
  }

  revalidatePath('/admin/leave-promotion')
  return { error: null, notice: data }
}

export async function updateNoticeContent(id: string, content: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error }

  const { error: err } = await adminClient()
    .from('leave_promotion_notices')
    .update({ content })
    .eq('id', id)
    .eq('status', 'DRAFT')

  if (err) return { error: err.message }
  revalidatePath('/admin/leave-promotion')
  return { error: null }
}

export async function markNoticeSent(id: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error }

  const { error: err } = await adminClient()
    .from('leave_promotion_notices')
    .update({ status: 'SENT', sent_at: new Date().toISOString() })
    .eq('id', id)

  if (err) return { error: err.message }
  revalidatePath('/admin/leave-promotion')
  return { error: null }
}

export async function deleteNotice(id: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error }

  const { error: err } = await adminClient()
    .from('leave_promotion_notices')
    .delete()
    .eq('id', id)
    .eq('status', 'DRAFT')

  if (err) return { error: err.message }
  revalidatePath('/admin/leave-promotion')
  return { error: null }
}
