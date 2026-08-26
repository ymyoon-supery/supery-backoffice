'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }
  const { data: emp } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!emp || emp.role !== 'ADMIN') return { error: '권한이 없습니다.' }
  return { error: null }
}

export type SubscriptionFormData = {
  name: string
  cost: number
  billing_cycle: 'MONTHLY' | 'YEARLY'
  renewal_date: string
  manager_id: string | null
  payment_method: 'CARD' | 'TRANSFER' | 'OTHER'
  card_name: string | null
  card_last4: string | null
  license_count: number | null
  department_id: string | null
  notes: string | null
}

export async function createSubscription(
  data: SubscriptionFormData,
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { error } = await adminClient().from('subscriptions').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/admin/subscriptions')
  return {}
}

export async function updateSubscription(
  id: string,
  data: SubscriptionFormData,
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { error } = await adminClient()
    .from('subscriptions')
    .update(data)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/subscriptions')
  return {}
}

export async function deleteSubscription(id: string): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { error } = await adminClient()
    .from('subscriptions')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/subscriptions')
  return {}
}
