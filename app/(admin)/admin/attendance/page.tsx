import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  parseISO, differenceInMinutes, eachDayOfInterval,
} from 'date-fns'
import AttendanceSummaryView from '@/components/admin/AttendanceSummaryView'

type DaySummary = {
  checkIn: string | null
  checkOut: string | null
  breakMin: number
  workMin: number
}

function toKSTTime(utcStr: string): string {
  const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function toKSTDate(utcStr: string): string {
  return new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function calcDaySummary(recs: { type: string; recorded_at: string }[]): DaySummary {
  const sorted = [...recs].sort((a, b) =>
    new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  )
  const checkIn = sorted.find(r => r.type === 'CHECK_IN')
  const checkOut = [...sorted].reverse().find(r => r.type === 'CHECK_OUT')
  if (!checkIn) return { checkIn: null, checkOut: null, breakMin: 0, workMin: 0 }

  let breakMin = 0
  let breakStart: Date | null = null
  for (const r of sorted) {
    if (r.type === 'BREAK_START') breakStart = new Date(r.recorded_at)
    else if (r.type === 'BREAK_END' && breakStart) {
      breakMin += differenceInMinutes(new Date(r.recorded_at), breakStart)
      breakStart = null
    }
  }

  if (!checkOut) return { checkIn: toKSTTime(checkIn.recorded_at), checkOut: null, breakMin, workMin: 0 }

  const gross = differenceInMinutes(new Date(checkOut.recorded_at), new Date(checkIn.recorded_at))
  const lunch = breakMin < 30 && gross > 240 ? 60 : 0
  const workMin = Math.max(0, gross - breakMin - lunch)

  return {
    checkIn: toKSTTime(checkIn.recorded_at),
    checkOut: toKSTTime(checkOut.recorded_at),
    breakMin,
    workMin,
  }
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; empId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const view = (['day', 'week', 'month'].includes(params.view ?? '') ? params.view : 'week') as 'day' | 'week' | 'month'
  const baseDate = params.date ? parseISO(params.date) : new Date()
  const selectedEmpId = params.empId ?? ''

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

  const [{ data: records }, { data: employees }, { data: leaveRecords }] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('id, type, recorded_at, location, is_field, note, is_anomaly, employee_id, employees(id, name, email, department_id)')
      .gte('recorded_at', `${fromStr}T00:00:00+09:00`)
      .lte('recorded_at', `${toStr}T23:59:59+09:00`)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('employees')
      .select('id, name, email, department_id')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, reason')
      .eq('status', 'APPROVED')
      .gte('end_date', fromStr)
      .lte('start_date', toStr),
  ])

  const dates = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(d => format(d, 'yyyy-MM-dd'))

  // Group records by employee+KST-date
  const byEmpDate = new Map<string, { type: string; recorded_at: string }[]>()
  for (const r of records ?? []) {
    const key = `${r.employee_id}:${toKSTDate(r.recorded_at)}`
    const list = byEmpDate.get(key) ?? []
    list.push(r)
    byEmpDate.set(key, list)
  }

  // Build summaries for all active employees
  const empSummaries = new Map<string, { id: string; name: string; days: Record<string, DaySummary> }>()
  for (const emp of employees ?? []) {
    empSummaries.set(emp.id, { id: emp.id, name: emp.name, days: {} })
  }
  for (const [key, recs] of byEmpDate) {
    const [empId, date] = key.split(':')
    const entry = empSummaries.get(empId)
    if (entry) entry.days[date] = calcDaySummary(recs)
  }

  const allSummaries = Array.from(empSummaries.values())
  const displaySummaries = selectedEmpId
    ? allSummaries.filter(e => e.id === selectedEmpId)
    : allSummaries.filter(e => Object.keys(e.days).length > 0)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">근태 현황</h1>
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
