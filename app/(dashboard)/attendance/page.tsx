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
  const todayStr = format(today, 'yyyy-MM-dd')
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
  const todayRecords = records.filter((r) =>
    r.recorded_at.startsWith(todayStr),
  )

  const lastRecord = todayRecords[todayRecords.length - 1]
  const initialState =
    lastRecord?.type === 'CHECK_OUT'
      ? 'DONE'
      : lastRecord?.type === 'CHECK_IN'
        ? 'WORKING'
        : 'BEFORE_WORK'

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">근태 기록</h1>

      <TimeTracker initialState={initialState as never} />

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-medium text-gray-700">
            오늘 기록 ({format(today, 'M월 d일 EEEE', { locale: ko })})
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
                  {r.type === 'CHECK_IN' ? '출근' : '퇴근'}
                  {r.is_field && (
                    <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">외근</span>
                  )}
                  {r.note && (
                    <span className="ml-2 text-xs text-gray-400">{r.note}</span>
                  )}
                </span>
                <div className="text-right">
                  <span className="text-gray-900 font-medium">
                    {format(new Date(r.recorded_at), 'HH:mm')}
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
