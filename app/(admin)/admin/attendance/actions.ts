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
