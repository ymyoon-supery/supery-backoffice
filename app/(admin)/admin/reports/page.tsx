import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, startOfWeek, endOfWeek, parseISO, addWeeks } from 'date-fns'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { calcDaySummary, toKSTDate, WorkSchedule } from '@/lib/attendance/calc'

function fmtHM(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; group?: string; weekStart?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const selectedTeam = params.team ?? ''
  const selectedGroup = params.group ?? ''

  const weekStartDate = params.weekStart
    ? parseISO(params.weekStart)
    : startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekStart = format(weekStartDate, 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(weekStartDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const prevWeek = format(addWeeks(weekStartDate, -1), 'yyyy-MM-dd')
  const nextWeek = format(addWeeks(weekStartDate, 1), 'yyyy-MM-dd')

  const [{ data: groups }, { data: allTeams }, { data: records }, { data: settingsData }] = await Promise.all([
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
    supabase
      .from('attendance_records')
      .select('employee_id, type, recorded_at, employees(id, name, email, department_id)')
      .gte('recorded_at', `${weekStart}T00:00:00+09:00`)
      .lte('recorded_at', `${weekEnd}T23:59:59+09:00`)
      .order('recorded_at', { ascending: true }),
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

  const teams = selectedGroup
    ? (allTeams ?? []).filter(t => t.group_id === selectedGroup)
    : (allTeams ?? [])

  type RecordRow = NonNullable<typeof records>[number]

  const hoursMap = new Map<string, {
    name: string
    email: string
    teamId: string | null
    workMinutes: number
    breakMinutes: number
    lateCount: number
    earlyLeaveCount: number
  }>()

  for (const r of records ?? []) {
    const emp = r.employees as unknown as { id: string; name: string; email: string; department_id: string | null } | null
    if (!emp) continue
    if (selectedTeam && emp.department_id !== selectedTeam) continue
    if (selectedGroup && !teams.some(t => t.id === emp.department_id)) continue
    if (!hoursMap.has(r.employee_id)) {
      hoursMap.set(r.employee_id, { name: emp.name, email: emp.email, teamId: emp.department_id, workMinutes: 0, breakMinutes: 0, lateCount: 0, earlyLeaveCount: 0 })
    }
  }

  const byEmployeeDay = new Map<string, RecordRow[]>()
  for (const r of records ?? []) {
    const emp = r.employees as unknown as { id: string; name: string; email: string; department_id: string | null } | null
    if (!emp) continue
    if (selectedTeam && emp.department_id !== selectedTeam) continue
    if (selectedGroup && !teams.some(t => t.id === emp.department_id)) continue
    const kstDate = toKSTDate(r.recorded_at)
    const key = `${r.employee_id}:${kstDate}`
    const list = byEmployeeDay.get(key) ?? []
    list.push(r)
    byEmployeeDay.set(key, list)
  }

  for (const [key, recs] of byEmployeeDay) {
    const empId = key.split(':')[0]
    const entry = hoursMap.get(empId)
    if (!entry) continue
    const ds = calcDaySummary(recs, schedule)
    entry.workMinutes += ds.workMin
    entry.breakMinutes += ds.breakMin
    if (ds.lateMin > 0) entry.lateCount += 1
    if (ds.earlyLeaveMin > 0) entry.earlyLeaveCount += 1
  }

  const sorted = Array.from(hoursMap.entries())
    .filter(([, v]) => v.workMinutes > 0)
    .sort((a, b) => b[1].workMinutes - a[1].workMinutes)

  const overLimit = sorted.filter(([, v]) => v.workMinutes > 52 * 60)

  function buildUrl(team: string, group: string, ws = weekStart) {
    const p = new URLSearchParams({ weekStart: ws })
    if (team) p.set('team', team)
    if (group) p.set('group', group)
    return `/admin/reports?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">52시간 리포트</h1>
        <Link
          href={`/api/reports/excel?from=${weekStart}&to=${weekEnd}${selectedTeam ? `&team=${selectedTeam}` : ''}`}
          className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={15} /> Excel 다운로드
        </Link>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Link href={buildUrl(selectedTeam, selectedGroup, prevWeek)}
          className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">
          ‹
        </Link>
        <span className="text-sm font-medium text-gray-700">{weekStart} ~ {weekEnd}</span>
        <Link href={buildUrl(selectedTeam, selectedGroup, nextWeek)}
          className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">
          ›
        </Link>
      </div>

      {/* Group / Team filter */}
      <div className="flex flex-wrap gap-2">
        <Link href={buildUrl('', '')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!selectedGroup && !selectedTeam ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-primary hover:text-primary'}`}>
          전체
        </Link>
        {(groups ?? []).map(g => (
          <Link key={g.id} href={buildUrl('', g.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedGroup === g.id && !selectedTeam ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-primary hover:text-primary'}`}>
            {g.name}
          </Link>
        ))}
        {selectedGroup && teams.map(t => (
          <Link key={t.id} href={buildUrl(t.id, selectedGroup)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedTeam === t.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}>
            {t.name}
          </Link>
        ))}
      </div>

      {overLimit.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          이번 주 52시간 초과 직원 <strong>{overLimit.length}명</strong>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3 text-right">순 근무시간</th>
              <th className="px-4 py-3 text-right">휴식시간</th>
              <th className="px-4 py-3 text-right">지각</th>
              <th className="px-4 py-3 text-right">조퇴</th>
              <th className="px-4 py-3 text-right">초과</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map(([empId, v]) => {
              const over = v.workMinutes - 52 * 60
              const team = allTeams?.find(t => t.id === v.teamId)
              return (
                <tr key={empId} className={over > 0 ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{team?.name ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${over > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtHM(v.workMinutes)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                    {v.breakMinutes > 0 ? fmtHM(v.breakMinutes) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {v.lateCount > 0
                      ? <span className="text-red-500">{v.lateCount}회</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {v.earlyLeaveCount > 0
                      ? <span className="text-orange-500">{v.earlyLeaveCount}회</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {over > 0
                      ? <span className="text-red-500">+{fmtHM(over)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  해당 주간 근무 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
