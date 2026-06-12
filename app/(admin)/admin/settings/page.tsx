import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import GeneralSettingsClient from './GeneralSettingsClient'

export default async function AdminSettingsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await admin
    .from('company_settings')
    .select('inactivity_minutes, office_ips, auto_break_mode, remote_radius_m, work_start_time, work_end_time, lunch_start_time, lunch_end_time')
    .single()

  const hdrs = await headers()
  const currentIp =
    hdrs.get('x-forwarded-for')?.split(',')[0].trim() ??
    hdrs.get('x-real-ip') ??
    ''

  return (
    <GeneralSettingsClient
      inactivityMinutes={data?.inactivity_minutes ?? 15}
      officeIps={data?.office_ips ?? []}
      currentIp={currentIp}
      autoBreakMode={(data?.auto_break_mode ?? 'frontend') as 'frontend' | 'server'}
      remoteRadiusM={data?.remote_radius_m ?? 500}
      workStartTime={data?.work_start_time ?? '09:00'}
      workEndTime={data?.work_end_time ?? '18:00'}
      lunchStartTime={data?.lunch_start_time ?? '12:00'}
      lunchEndTime={data?.lunch_end_time ?? '13:00'}
    />
  )
}
