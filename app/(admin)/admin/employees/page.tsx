import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StatusBoard from '@/components/admin/StatusBoard'
import EmploymentTabs from '@/components/admin/EmploymentTabs'
import { format } from 'date-fns'

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ employment?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const employment = params.employment === 'resigned' ? 'resigned' : 'active'

  const today = format(new Date(new Date().getTime() + 9 * 60 * 60 * 1000), 'yyyy-MM-dd')

  const [{ data: employees }, { data: todayRecords }, { data: todayLeaves }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, avatar_url')
      .eq('is_active', employment === 'active')
      .order('name'),
    supabase
      .from('attendance_records')
      .select('employee_id, type, recorded_at, is_field')
      .gte('recorded_at', `${today}T00:00:00+09:00`)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('leave_requests')
      .select('employee_id, leave_type')
      .eq('status', 'APPROVED')
      .lte('start_date', today)
      .gte('end_date', today),
  ])

  const lastByEmployee = new Map<string, typeof todayRecords extends (infer T)[] | null ? T : never>()
  for (const r of todayRecords ?? []) {
    if (!lastByEmployee.has(r.employee_id)) {
      lastByEmployee.set(r.employee_id, r)
    }
  }

  const onLeaveMap: Record<string, string> = {}
  for (const l of todayLeaves ?? []) {
    onLeaveMap[l.employee_id] = l.leave_type
  }

  const initial = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    avatar_url: e.avatar_url,
    lastRecord: lastByEmployee.get(e.id) ?? null,
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">실시간 현황판</h1>
      <EmploymentTabs
        current={employment}
        activeHref="/admin/employees?employment=active"
        resignedHref="/admin/employees?employment=resigned"
      />
      <StatusBoard initial={initial} onLeaveMap={onLeaveMap} />
    </div>
  )
}
