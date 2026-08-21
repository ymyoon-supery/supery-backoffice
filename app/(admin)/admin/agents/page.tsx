import { createClient as createServiceClient } from '@supabase/supabase-js'
import AgentsClient from './AgentsClient'

export default async function AgentsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: employees }, { data: installations }] = await Promise.all([
    admin
      .from('employees')
      .select('id, name, email, agent_api_key')
      .eq('is_active', true)
      .order('name'),
    admin
      .from('agent_installations')
      .select('employee_id, device_name, os_info, app_version, registered_at, last_seen_at')
      .order('last_seen_at', { ascending: false }),
  ])

  const installMap = new Map<string, typeof installations>()
  for (const inst of installations ?? []) {
    if (!installMap.has(inst.employee_id)) installMap.set(inst.employee_id, [])
    installMap.get(inst.employee_id)!.push(inst)
  }

  const rows = (employees ?? []).map(emp => ({
    id: emp.id,
    name: emp.name,
    email: emp.email,
    hasKey: !!emp.agent_api_key,
    installations: installMap.get(emp.id) ?? [],
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">PC 에이전트 현황</h1>
      <AgentsClient rows={rows} />
    </div>
  )
}
