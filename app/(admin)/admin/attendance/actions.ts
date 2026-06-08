'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

export async function correctAttendance(recordId: string, note: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase
    .from('attendance_records')
    .update({ note })
    .eq('id', recordId)

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.attendance)
  revalidateTag(CACHE_TAGS.adminReport)
  return { error: null }
}
