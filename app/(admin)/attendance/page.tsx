import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AttendanceEditor from '@/components/admin/AttendanceEditor'
import { format, subDays } from 'date-fns'

export default async function AdminAttendancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const since = format(subDays(new Date(), 7), 'yyyy-MM-dd')

  const { data: records } = await supabase
    .from('attendance_records')
    .select(`
      id, type, recorded_at, location, is_field, note,
      employees ( id, name, email )
    `)
    .gte('recorded_at', `${since}T00:00:00+09:00`)
    .order('recorded_at', { ascending: false })
    .limit(200)

  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, email')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">근태 관리</h1>
      <AttendanceEditor records={records ?? []} employees={employees ?? []} />
    </div>
  )
}
