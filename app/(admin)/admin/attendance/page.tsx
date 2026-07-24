import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  parseISO, eachDayOfInterval,
} from 'date-fns'
import AttendanceSummaryView from '@/components/admin/AttendanceSummaryView'
import EmploymentTabs from '@/components/admin/EmploymentTabs'
import { calcDaySummary, groupByEmpDate, WorkSchedule } from '@/lib/attendance/calc'

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; empId?: string; employment?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const view = (['day', 'week', 'month'].includes(params.view ?? '') ? params.view : 'day') as 'day' | 'week' | 'month'
  const baseDate = params.date ? parseISO(params.date) : new Date()
  const selectedEmpId = params.empId ?? ''
  const employment = params.employment === 'resigned' ? 'resigned' : 'active'

  let rangeStart: Date, rangeEnd: Date
  if (view === 'day') {
    rangeStart = rangeEnd = baseDate
  } else if (view === 'week') {
    rangeStart = startOfWeek(baseDate, { weekStartsOn: 1 })
    rangeEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  } else {
    rangeStart = startOfMonth(baseDate)
    rangeEnd = endOfMonth(baseDate)
  }

  const fromStr = format(rangeStart, 'yyyy-MM-dd')
  const toStr = format(rangeEnd, 'yyyy-MM-dd')

  function tabHref(status: string) {
    const p = new URLSearchParams({ view, employment: status })
    if (params.date) p.set('date', params.date)
    if (params.empId) p.set('empId', params.empId)
    return `/admin/attendance?${p.toString()}`
  }

  const [{ data: records }, { data: employees }, { data: leaveRecords }, { data: settingsData }] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('id, type, recorded_at, location, is_field, note, is_anomaly, employee_id, employees(id, name, email, department_id)')
      .gte('recorded_at', `${fromStr}T00:00:00+09:00`)
      .lte('recorded_at', `${toStr}T23:59:59+09:00`)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('employees')
      .select('id, name, email, department_id')
      .eq('is_active', employment === 'active')
      .order('name'),
    supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, reason')
      .eq('status', 'APPROVED')
      .gte('end_date', fromStr)
      .lte('start_date', toStr),
    supabase
      .from('company_settings')
      .select('work_start_time, work_end_time, lunch_start_time, lunch_end_time')
      .single(),
  ])

  const schedule: WorkSchedule = {
    workStartTime: settingsData?.work_start_time ?? '09:00',
    workEndTime: settingsData?.work_end_time ?? '18:00',
    lunchStartTime: settingsData?.lunch_start_time ?? '12:00',
    lunchEndTime: settingsData?.lunch_end_time ?? '13:00',
  }

  const dates = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(d => format(d, 'yyyy-MM-dd'))

  const byEmpDate = groupByEmpDate(records ?? [])

  const empSummaries = new Map<string, { id: string; name: string; days: Record<string, ReturnType<typeof calcDaySummary>> }>()
  for (const emp of employees ?? []) {
    empSummaries.set(emp.id, { id: emp.id, name: emp.name, days: {} })
  }
  for (const [key, recs] of byEmpDate) {
    const [empId, date] = key.split(':')
    const entry = empSummaries.get(empId)
    if (entry) entry.days[date] = calcDaySummary(recs, schedule)
  }

  const allSummaries = Array.from(empSummaries.values())
  const displaySummaries = selectedEmpId
    ? allSummaries.filter(e => e.id === selectedEmpId)
    : allSummaries.filter(e => Object.keys(e.days).length > 0)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">근태 현황</h1>
      <EmploymentTabs
        current={employment}
        activeHref={tabHref('active')}
        resignedHref={tabHref('resigned')}
      />
      <AttendanceSummaryView
        view={view}
        baseDate={format(baseDate, 'yyyy-MM-dd')}
        dates={dates}
        employees={displaySummaries}
        allEmployees={(employees ?? []).map(e => ({ id: e.id, name: e.name }))}
        selectedEmpId={selectedEmpId}
        leaveRecords={leaveRecords ?? []}
        rawRecords={records ?? []}
        allEmployeesForEditor={employees ?? []}
      />
    </div>
  )
}
