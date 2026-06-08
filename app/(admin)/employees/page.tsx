import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StatusBoard from '@/components/admin/StatusBoard'
import { format } from 'date-fns'

export default async function AdminEmployeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, email, avatar_url')
    .eq('is_active', true)
    .order('name')

  // Latest attendance record per employee today
  const { data: todayRecords } = await supabase
    .from('attendance_records')
    .select('employee_id, type, recorded_at, is_field')
    .gte('recorded_at', `${today}T00:00:00+09:00`)
    .order('recorded_at', { ascending: false })

  const lastByEmployee = new Map<string, typeof todayRecords extends (infer T)[] | null ? T : never>()
  for (const r of todayRecords ?? []) {
    if (!lastByEmployee.has(r.employee_id)) {
      lastByEmployee.set(r.employee_id, r)
    }
  }

  const initial = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    avatar_url: e.avatar_url,
    lastRecord: lastByEmployee.get(e.id) ?? null,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">실시간 현황판</h1>
      <StatusBoard initial={initial} />
    </div>
  )
}
