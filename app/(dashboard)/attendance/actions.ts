'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

export async function checkOfficeIp() {
  const hdrs = await headers()
  const currentIp =
    hdrs.get('x-forwarded-for')?.split(',')[0].trim() ??
    hdrs.get('x-real-ip') ??
    ''

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await admin.from('company_settings').select('office_ips').single()
  const officeIps: string[] = data?.office_ips ?? []

  // No IPs registered → no restriction
  if (officeIps.length === 0) return { match: true, currentIp, officeIps }

  return { match: officeIps.includes(currentIp), currentIp, officeIps }
}

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
