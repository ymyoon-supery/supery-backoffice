import { createClient as createServiceClient } from '@supabase/supabase-js'
import GeneralSettingsClient from './GeneralSettingsClient'

export default async function AdminSettingsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await admin.from('company_settings').select('inactivity_minutes').single()
  const inactivityMinutes = data?.inactivity_minutes ?? 15

  return <GeneralSettingsClient inactivityMinutes={inactivityMinutes} />
}
