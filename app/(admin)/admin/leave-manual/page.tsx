import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { calcAnnualLeave, isUnderOneYear } from '@/lib/annualLeave'
import LeaveManualClient from './LeaveManualClient'
import EmploymentTabs from '@/components/admin/EmploymentTabs'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function LeaveManualPage({
  searchParams,
}: {
  searchParams: Promise<{ employment?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const employment = params.employment === 'resigned' ? 'resigned' : 'active'

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`

  const [{ data: rawEmployees }, { data: leaveRecords, error: leaveError }, { data: usedTotals }] = await Promise.all([
    admin.from('employees').select('id, name, email, hired_at, annual_leave_days, remaining_leaves').eq('is_active', employment === 'active').order('name'),
    admin.from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, days_used, reason, is_manual')
      .eq('status', 'APPROVED')
      .order('start_date', { ascending: false })
      .limit(500),
    admin.from('leave_requests')
      .select('employee_id, days_used, start_date')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS),
  ])

  // 직원별 전체/당해연도/연도별 사용 집계
  const usedAllTime: Record<string, number> = {}
  const usedThisYear: Record<string, number> = {}
  const usedByYear: Record<string, Record<number, number>> = {}
  for (const r of usedTotals ?? []) {
    const year = parseInt(r.start_date.slice(0, 4))
    usedAllTime[r.employee_id] = (usedAllTime[r.employee_id] ?? 0) + Number(r.days_used)
    if (r.start_date >= yearStart) {
      usedThisYear[r.employee_id] = (usedThisYear[r.employee_id] ?? 0) + Number(r.days_used)
    }
    if (!usedByYear[r.employee_id]) usedByYear[r.employee_id] = {}
    usedByYear[r.employee_id][year] = (usedByYear[r.employee_id][year] ?? 0) + Number(r.days_used)
  }

  const employees = (rawEmployees ?? []).map(e => {
    const hiredAt = e.hired_at ? new Date(e.hired_at) : null
    const entitlement = hiredAt
      ? calcAnnualLeave(hiredAt, today)
      : (e.annual_leave_days ?? 15)
    // 1년 미만: 입사 이후 누적 사용 / 1년 이상: 당해연도 사용
    const used = hiredAt && isUnderOneYear(hiredAt, today)
      ? (usedAllTime[e.id] ?? 0)
      : (usedThisYear[e.id] ?? 0)
    const by_year = Object.entries(usedByYear[e.id] ?? {})
      .map(([yr, d]) => ({ year: parseInt(yr), used: Math.round(d * 10) / 10 }))
      .sort((a, b) => b.year - a.year)
    return {
      ...e,
      annual_leave_days: entitlement,
      remaining_leaves: Math.max(Math.round((entitlement - used) * 10) / 10, 0),
      total_used: Math.round((usedAllTime[e.id] ?? 0) * 10) / 10,
      by_year,
    }
  })

  const records = (leaveRecords ?? []).map(r => ({ ...r, is_manual: r.is_manual ?? false }))

  return (
    <div className="max-w-2xl">
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-gray-900">연차 관리</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">수동 등록 및 결재 승인된 연차를 조회·수정·삭제합니다.</p>
      <EmploymentTabs
        current={employment}
        activeHref="/admin/leave-manual?employment=active"
        resignedHref="/admin/leave-manual?employment=resigned"
      />
      {leaveError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-mono">
          쿼리 오류: {leaveError.message}
        </div>
      )}
      <div className="mt-4">
        <LeaveManualClient employees={employees} leaveRecords={records} />
      </div>
    </div>
  )
}
