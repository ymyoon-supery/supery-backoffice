import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, startOfWeek, endOfWeek, differenceInMinutes } from 'date-fns'
import Link from 'next/link'
import { Download } from 'lucide-react'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const { data: records } = await supabase
    .from('attendance_records')
    .select('employee_id, type, recorded_at, is_field, employees(id, name, email)')
    .gte('recorded_at', `${weekStart}T00:00:00+09:00`)
    .lte('recorded_at', `${weekEnd}T23:59:59+09:00`)
    .order('recorded_at', { ascending: true })

  type RecordRow = NonNullable<typeof records>[number]

  // Compute weekly hours per employee
  const hoursMap = new Map<string, { name: string; email: string; totalMinutes: number }>()

  for (const r of records ?? []) {
    const emp = r.employees as unknown as { id: string; name: string; email: string } | null
    if (!emp) continue
    if (!hoursMap.has(r.employee_id)) {
      hoursMap.set(r.employee_id, { name: emp.name, email: emp.email, totalMinutes: 0 })
    }
  }

  // Pair CHECK_IN / CHECK_OUT per employee per day
  const byEmployee = new Map<string, RecordRow[]>()
  for (const r of records ?? []) {
    const list = byEmployee.get(r.employee_id) ?? []
    list.push(r)
    byEmployee.set(r.employee_id, list)
  }

  for (const [empId, recs] of byEmployee) {
    const entry = hoursMap.get(empId)
    if (!entry) continue
    let i = 0
    while (i < recs.length) {
      if (recs[i].type === 'CHECK_IN' && recs[i + 1]?.type === 'CHECK_OUT') {
        entry.totalMinutes += differenceInMinutes(
          new Date(recs[i + 1].recorded_at),
          new Date(recs[i].recorded_at),
        )
        i += 2
      } else {
        i++
      }
    }
  }

  const overLimit = Array.from(hoursMap.entries())
    .filter(([, v]) => v.totalMinutes > 52 * 60)
    .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">52시간 리포트</h1>
        <Link
          href={`/api/reports/excel?from=${weekStart}&to=${weekEnd}`}
          className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={15} />
          Excel 다운로드
        </Link>
      </div>

      <p className="text-sm text-gray-500">
        기간: {weekStart} ~ {weekEnd}
      </p>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3 text-right">주간 근무시간</th>
              <th className="px-4 py-3 text-right">초과 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {overLimit.map(([empId, v]) => {
              const hours = Math.floor(v.totalMinutes / 60)
              const mins = v.totalMinutes % 60
              const overMins = v.totalMinutes - 52 * 60
              const overH = Math.floor(overMins / 60)
              const overM = overMins % 60
              return (
                <tr key={empId} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-3 text-gray-500">{v.email}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium">
                    {hours}h {mins}m
                  </td>
                  <td className="px-4 py-3 text-right text-red-500 text-xs">
                    +{overH}h {overM}m
                  </td>
                </tr>
              )
            })}
            {overLimit.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  이번 주 52시간 초과 직원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
