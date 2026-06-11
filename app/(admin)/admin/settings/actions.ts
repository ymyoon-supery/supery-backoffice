'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

async function getAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: employee } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  if (employee?.role !== 'ADMIN') return null

  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function updateInactivityMinutes(minutes: number) {
  if (![10, 15, 20, 30].includes(minutes)) return { error: '유효하지 않은 값입니다.' }

  const admin = await getAdminClient()
  if (!admin) return { error: 'Unauthorized' }

  const { error } = await admin
    .from('company_settings')
    .update({ inactivity_minutes: minutes, updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}

const VALID_RADII = [0, 100, 200, 300, 500, 1000, 2000]

export async function updateRemoteRadius(radiusM: number) {
  if (!VALID_RADII.includes(radiusM)) return { error: '유효하지 않은 거리입니다.' }

  const admin = await getAdminClient()
  if (!admin) return { error: 'Unauthorized' }

  const { error } = await admin
    .from('company_settings')
    .update({ remote_radius_m: radiusM, updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function updateAutoBreakMode(mode: 'frontend' | 'server') {
  const admin = await getAdminClient()
  if (!admin) return { error: 'Unauthorized' }

  const { error } = await admin
    .from('company_settings')
    .update({ auto_break_mode: mode, updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function addOfficeIp(ip: string) {
  const trimmed = ip.trim()
  if (!IP_RE.test(trimmed)) return { error: '올바른 IP 형식이 아닙니다. (예: 123.456.789.0)' }

  const admin = await getAdminClient()
  if (!admin) return { error: 'Unauthorized' }

  const { data } = await admin.from('company_settings').select('office_ips').single()
  const current: string[] = data?.office_ips ?? []
  if (current.includes(trimmed)) return { error: '이미 등록된 IP입니다.' }

  const { error } = await admin
    .from('company_settings')
    .update({ office_ips: [...current, trimmed], updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function removeOfficeIp(ip: string) {
  const admin = await getAdminClient()
  if (!admin) return { error: 'Unauthorized' }

  const { data } = await admin.from('company_settings').select('office_ips').single()
  const current: string[] = data?.office_ips ?? []

  const { error } = await admin
    .from('company_settings')
    .update({ office_ips: current.filter(x => x !== ip), updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}
