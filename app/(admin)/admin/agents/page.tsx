import { createClient as createServiceClient } from '@supabase/supabase-js'
import AgentsClient from './AgentsClient'

export default async function AgentsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: employees }, { data: employeesWithKey }, { data: installations }, { data: settings }] = await Promise.all([
    admin
      .from('employees')
      .select('id, name, email, agent_auto_break')
      .eq('is_active', true)
      .order('name'),
    // agent_api_key 원본 노출 없이 "키 존재 여부"만 별도 조회
    admin
      .from('employees')
      .select('id')
      .eq('is_active', true)
      .not('agent_api_key', 'is', null),
    admin
      .from('agent_installations')
      .select('employee_id, device_name, os_info, app_version, registered_at, last_seen_at')
      .order('last_seen_at', { ascending: false }),
    admin
      .from('company_settings')
      .select('agent_version, agent_version_updated_at')
      .single(),
  ])

  const keySet = new Set((employeesWithKey ?? []).map(e => e.id))

  const installMap = new Map<string, typeof installations>()
  for (const inst of installations ?? []) {
    if (!installMap.has(inst.employee_id)) installMap.set(inst.employee_id, [])
    installMap.get(inst.employee_id)!.push(inst)
  }

  const rows = (employees ?? []).map(emp => ({
    id: emp.id,
    name: emp.name,
    email: emp.email,
    hasKey: keySet.has(emp.id),
    autoBreak: emp.agent_auto_break !== false,
    installations: installMap.get(emp.id) ?? [],
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">PC 에이전트 현황</h1>
      <AgentsClient
        rows={rows}
        agentVersion={settings?.agent_version ?? null}
        agentVersionUpdatedAt={settings?.agent_version_updated_at ?? null}
      />
    </div>
  )
}
