import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, startOfWeek, endOfWeek, differenceInMinutes } from 'date-fns'
import Link from 'next/link'
import { Download } from 'lucide-react'

function fmtHM(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const { data: records } = await supabase
    .from('attendance_records')
    .select('employee_id, type, recorded_at, employees(id, name, email)')
    .gte('recorded_at', `${weekStart}T00:00:00+09:00`)
    .lte('recorded_at', `${weekEnd}T23:59:59+09:00`)
    .order('recorded_at', { ascending: true })

  type RecordRow = NonNullable<typeof records>[number]

  // Collect all employees
  const hoursMap = new Map<string, { name: string; email: string; workMinutes: number; breakMinutes: number }>()
  for (const r of records ?? []) {
    const emp = r.employees as unknown as { id: string; name: string; email: string } | null
    if (!emp || hoursMap.has(r.employee_id)) continue
    hoursMap.set(r.employee_id, { name: emp.name, email: emp.email, workMinutes: 0, breakMinutes: 0 })
  }

  // Group by employee + KST day
  const byEmployeeDay = new Map<string, RecordRow[]>()
  for (const r of records ?? []) {
    const kstDate = new Date(r.recorded_at)
      .toLocaleString('sv', { timeZone: 'Asia/Seoul' })
      .split(' ')[0]
    const key = `${r.employee_id}:${kstDate}`
    const list = byEmployeeDay.get(key) ?? []
    list.push(r)
    byEmployeeDay.set(key, list)
  }

  for (const [key, recs] of byEmployeeDay) {
    const empId = key.split(':')[0]
    const entry = hoursMap.get(empId)
    if (!entry) continue

    const checkIn = recs.find(r => r.type === 'CHECK_IN')
    const checkOut = recs.find(r => r.type === 'CHECK_OUT')
    if (!checkIn || !checkOut) continue

    // Sum all BREAK_START → BREAK_END pairs
    let dayBreak = 0
    let breakStart: Date | null = null
    for (const r of recs) {
      if (r.type === 'BREAK_START') {
        breakStart = new Date(r.recorded_at)
      } else if (r.type === 'BREAK_END' && breakStart) {
        dayBreak += differenceInMinutes(new Date(r.recorded_at), breakStart)
        breakStart = null
      }
    }

    const gross = differenceInMinutes(new Date(checkOut.recorded_at), new Date(checkIn.recorded_at))
    entry.workMinutes += Math.max(0, gross - dayBreak)
    entry.breakMinutes += dayBreak
  }

  const sorted = Array.from(hoursMap.entries())
    .filter(([, v]) => v.workMinutes > 0)
    .sort((a, b) => b[1].workMinutes - a[1].workMinutes)

  const overLimit = sorted.filter(([, v]) => v.workMinutes > 52 * 60)

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

      <p className="text-sm text-gray-500">기간: {weekStart} ~ {weekEnd}</p>

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
              <th className="px-4 py-3 text-right">순 근무시간</th>
              <th className="px-4 py-3 text-right">휴식시간</th>
              <th className="px-4 py-3 text-right">초과</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map(([empId, v]) => {
              const over = v.workMinutes - 52 * 60
              return (
                <tr key={empId} className={over > 0 ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${over > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtHM(v.workMinutes)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                    {v.breakMinutes > 0 ? fmtHM(v.breakMinutes) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {over > 0
                      ? <span className="text-red-500">+{fmtHM(over)}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  이번 주 근무 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
