'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: emp } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  return emp?.role === 'ADMIN' ? supabase : null
}

export async function resolveAnomaly(recordId: string, checkoutTime: string, note: string) {
  const supabase = await requireAdmin()
  if (!supabase) return { error: '권한이 없습니다.' }

  const { error } = await supabase
    .from('attendance_records')
    .update({ recorded_at: new Date(checkoutTime).toISOString(), note, is_anomaly: false })
    .eq('id', recordId)

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.attendance)
  revalidateTag(CACHE_TAGS.adminReport)
  return { error: null }
}

export async function correctAttendance(recordId: string, note: string) {
  const supabase = await requireAdmin()
  if (!supabase) return { error: '권한이 없습니다.' }

  const { error } = await supabase
    .from('attendance_records')
    .update({ note })
    .eq('id', recordId)

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.attendance)
  revalidateTag(CACHE_TAGS.adminReport)
  return { error: null }
}

export async function updateAttendanceRecord(recordId: string, recordedAtKST: string, note: string) {
  const supabase = await requireAdmin()
  if (!supabase) return { error: '권한이 없습니다.' }

  const kstDate = new Date(recordedAtKST)
  if (isNaN(kstDate.getTime())) return { error: '유효하지 않은 시간입니다.' }
  const utcDate = new Date(kstDate.getTime() - 9 * 60 * 60 * 1000)

  const { error } = await supabase
    .from('attendance_records')
    .update({ recorded_at: utcDate.toISOString(), note: note || null, is_anomaly: false })
    .eq('id', recordId)

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.attendance)
  revalidateTag(CACHE_TAGS.adminReport)
  return { error: null }
}

export async function insertAttendanceRecord(
  employeeId: string,
  type: string,
  recordedAtKST: string,
  note: string,
) {
  const supabase = await requireAdmin()
  if (!supabase) return { error: '권한이 없습니다.' }

  const kstDate = new Date(recordedAtKST)
  if (isNaN(kstDate.getTime())) return { error: '유효하지 않은 시간입니다.' }
  const utcDate = new Date(kstDate.getTime() - 9 * 60 * 60 * 1000)

  const { error } = await supabase.from('attendance_records').insert({
    employee_id: employeeId,
    type,
    recorded_at: utcDate.toISOString(),
    note: note || null,
    origin: 'manual',
    is_field: false,
  })

  if (error) return { error: error.message }
  revalidateTag(CACHE_TAGS.attendance)
  revalidateTag(CACHE_TAGS.adminReport)
  return { error: null }
}

export async function deleteAttendanceRecord(recordId: string) {
  const supabase = await requireAdmin()
  if (!supabase) return { error: '권한이 없습니다.' }

  const { error } = await supabase
    .from('attendance_records')
    .delete()
    .eq('id', recordId)

  if (error) return { error: error.message }
  revalidateTag(CACHE_TAGS.attendance)
  revalidateTag(CACHE_TAGS.adminReport)
  return { error: null }
}
