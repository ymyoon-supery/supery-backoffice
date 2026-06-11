import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AttendanceEditor from '@/components/admin/AttendanceEditor'
import { format, subDays } from 'date-fns'

export default async function AdminAttendancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const since = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const today = format(new Date(), 'yyyy-MM-dd')

  const [{ data: records }, { data: employees }, { data: leaveRecords }] = await Promise.all([
    supabase
      .from('attendance_records')
      .select(`
        id, type, recorded_at, location, is_field, note, is_anomaly,
        employees ( id, name, email )
      `)
      .gte('recorded_at', `${since}T00:00:00+09:00`)
      .order('is_anomaly', { ascending: false })
      .order('recorded_at', { ascending: false })
      .limit(200),
    supabase
      .from('employees')
      .select('id, name, email')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, reason')
      .eq('status', 'APPROVED')
      .gte('end_date', since)
      .lte('start_date', today)
      .order('start_date', { ascending: false }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">근태 관리</h1>
      <AttendanceEditor records={records ?? []} employees={employees ?? []} leaveRecords={leaveRecords ?? []} />
    </div>
  )
}
