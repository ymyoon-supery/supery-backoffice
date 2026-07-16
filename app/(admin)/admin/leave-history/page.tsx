import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { calcAnnualLeave, isUnderOneYear } from '@/lib/annualLeave'
import LeaveHistoryClient from './LeaveHistoryClient'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function LeaveHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`

  const [{ data: rawEmployees }, { data: allUsed }] = await Promise.all([
    admin
      .from('employees')
      .select('id, name, email, hired_at, annual_leave_days')
      .eq('is_active', true)
      .order('name'),
    admin
      .from('leave_requests')
      .select('employee_id, days_used, start_date')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS),
  ])

  // 직원별 연도 → 사용일수 매핑
  const usedByEmpYear: Record<string, Record<number, number>> = {}
  const usedAllTime: Record<string, number> = {}
  const usedThisYear: Record<string, number> = {}

  for (const r of allUsed ?? []) {
    const year = parseInt(r.start_date.slice(0, 4))
    if (!usedByEmpYear[r.employee_id]) usedByEmpYear[r.employee_id] = {}
    usedByEmpYear[r.employee_id][year] =
      (usedByEmpYear[r.employee_id][year] ?? 0) + Number(r.days_used)
    usedAllTime[r.employee_id] = (usedAllTime[r.employee_id] ?? 0) + Number(r.days_used)
    if (r.start_date >= yearStart) {
      usedThisYear[r.employee_id] = (usedThisYear[r.employee_id] ?? 0) + Number(r.days_used)
    }
  }

  const employees = (rawEmployees ?? []).map(e => {
    const hiredAt = e.hired_at ? new Date(e.hired_at) : null
    const entitlement = hiredAt
      ? calcAnnualLeave(hiredAt, today)
      : (e.annual_leave_days ?? 15)
    const under1Year = hiredAt && isUnderOneYear(hiredAt, today)
    const usedForRemaining = under1Year
      ? (usedAllTime[e.id] ?? 0)
      : (usedThisYear[e.id] ?? 0)

    const byYear = Object.entries(usedByEmpYear[e.id] ?? {})
      .map(([yr, used]) => ({ year: parseInt(yr), used: Math.round(used * 10) / 10 }))
      .sort((a, b) => b.year - a.year)

    return {
      id: e.id,
      name: e.name,
      email: e.email,
      hired_at: e.hired_at as string | null,
      annual_leave_days: Math.round(entitlement * 10) / 10,
      total_used: Math.round((usedAllTime[e.id] ?? 0) * 10) / 10,
      remaining_leaves: Math.max(Math.round((entitlement - usedForRemaining) * 10) / 10, 0),
      under_one_year: !!under1Year,
      by_year: byYear,
    }
  })

  return (
    <div className="max-w-3xl">
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-gray-900">연차 사용내역</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">전체 직원 및 개인별 연차 사용 현황을 조회합니다.</p>
      <LeaveHistoryClient employees={employees} />
    </div>
  )
}
