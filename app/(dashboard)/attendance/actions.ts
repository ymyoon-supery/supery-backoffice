'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

type RecordAttendanceInput = {
  type: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END' | 'FIELD_START' | 'FIELD_END'
  location: string | null
  latitude: number | null
  longitude: number | null
  isField: boolean
  note: string | null
}

export async function recordAttendance(input: RecordAttendanceInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) return { error: '직원 정보를 찾을 수 없습니다.' }

  const { error } = await supabase.from('attendance_records').insert({
    employee_id: employee.id,
    type: input.type,
    location: input.location,
    latitude: input.latitude,
    longitude: input.longitude,
    is_field: input.isField,
    note: input.note,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: '오늘 이미 동일한 유형의 기록이 있습니다.' }
    }
    return { error: error.message }
  }

  revalidateTag(CACHE_TAGS.attendance)
  return { error: null }
}
