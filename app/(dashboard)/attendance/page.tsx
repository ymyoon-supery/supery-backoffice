import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'
import TimeTracker from '@/components/attendance/TimeTracker'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { ko } from 'date-fns/locale'

export default async function AttendancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const today = new Date()
  // KST 기준 날짜 (UTC+9 고정 오프셋)
  const kstNow = new Date(today.getTime() + 9 * 60 * 60 * 1000)
  const todayStr = format(kstNow, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const getRecords = unstable_cache(
    async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('id, type, recorded_at, location, is_field, note')
        .eq('employee_id', employee.id)
        .gte('recorded_at', `${weekStart}T00:00:00+09:00`)
        .lte('recorded_at', `${weekEnd}T23:59:59+09:00`)
        .order('recorded_at', { ascending: true })
      return data ?? []
    },
    [`attendance-${employee.id}-${weekStart}`],
    { tags: [CACHE_TAGS.attendance], revalidate: 60 },
  )

  const records = await getRecords()
  // KST 날짜 기준으로 오늘 기록 필터 (recorded_at은 UTC ISO이므로 변환 후 비교)
  const todayRecords = records.filter((r) => {
    const kst = new Date(new Date(r.recorded_at).getTime() + 9 * 60 * 60 * 1000)
    return format(kst, 'yyyy-MM-dd') === todayStr
  })

  const lastRecord = todayRecords[todayRecords.length - 1]
  const initialState =
    lastRecord?.type === 'CHECK_OUT' ? 'DONE'
    : lastRecord?.type === 'BREAK_START' ? 'BREAK'
    : lastRecord?.type === 'FIELD_START' ? 'FIELD'
    : lastRecord?.type === 'CHECK_IN' || lastRecord?.type === 'BREAK_END' || lastRecord?.type === 'FIELD_END' ? 'WORKING'
    : 'BEFORE_WORK'

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">근태 기록</h1>

      <TimeTracker initialState={initialState as never} />

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-medium text-gray-700">
            오늘 기록 ({format(kstNow, 'M월 d일 EEEE', { locale: ko })})
          </h2>
        </div>
        {todayRecords.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            오늘 기록이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {todayRecords.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-gray-600">
                  {r.type === 'CHECK_IN' ? '출근'
                    : r.type === 'CHECK_OUT' ? '퇴근'
                    : r.type === 'BREAK_START' ? '휴식 시작'
                    : r.type === 'BREAK_END' ? '업무 복귀'
                    : r.type === 'FIELD_START' ? '외근 시작'
                    : r.type === 'FIELD_END' ? '외근 복귀'
                    : r.type}
                  {r.is_field && r.type === 'CHECK_IN' && (
                    <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">외근</span>
                  )}
                  {r.note && (
                    <span className="ml-2 text-xs text-gray-400">{r.note}</span>
                  )}
                </span>
                <div className="text-right">
                  <span className="text-gray-900 font-medium">
                    {format(new Date(new Date(r.recorded_at).getTime() + 9 * 60 * 60 * 1000), 'HH:mm')}
                  </span>
                  {r.location && (
                    <p className="text-xs text-gray-400">{r.location}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
