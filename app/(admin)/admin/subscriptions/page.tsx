import { createClient as createServiceClient } from '@supabase/supabase-js'
import SubscriptionsClient from './SubscriptionsClient'

export default async function SubscriptionsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: subscriptions }, { data: employees }, { data: departments }] =
    await Promise.all([
      admin
        .from('subscriptions')
        .select('*, manager:manager_id(id, name), department:department_id(id, name)')
        .order('renewal_date', { ascending: true }),
      admin
        .from('employees')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
      admin.from('departments').select('id, name').order('name'),
    ])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">구독서비스 관리</h1>
      <SubscriptionsClient
        subscriptions={subscriptions ?? []}
        employees={employees ?? []}
        departments={departments ?? []}
      />
    </div>
  )
}
