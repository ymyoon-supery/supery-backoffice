'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function updateInactivityMinutes(minutes: number) {
  if (![10, 15, 20, 30].includes(minutes)) return { error: '유효하지 않은 값입니다.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: employee } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  if (employee?.role !== 'ADMIN') return { error: 'Forbidden' }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await admin
    .from('company_settings')
    .update({ inactivity_minutes: minutes, updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}
