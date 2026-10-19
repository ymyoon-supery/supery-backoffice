import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaveForm from '@/components/approval/LeaveForm'
import { calcAnnualLeave, isUnderOneYear } from '@/lib/annualLeave'

const DEDUCTS = new Set(['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP'])

export default async function NewLeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, hired_at, annual_leave_days')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const today = new Date(Date.now() + 9 * 3600000)
  const yearStart = `${today.getUTCFullYear()}-01-01`
  const hiredAt = employee.hired_at ? new Date(employee.hired_at) : null
  const entitlement = hiredAt
    ? calcAnnualLeave(hiredAt, today)
    : (employee.annual_leave_days ?? 15)
  const under1Year = hiredAt && isUnderOneYear(hiredAt, today)

  // 사용내역 화면과 동일한 방식으로 계산: APPROVED + PENDING 모두 차감
  const { data: usedRows } = await supabase
    .from('leave_requests')
    .select('days_used, start_date, status')
    .eq('employee_id', employee.id)
    .in('status', ['APPROVED', 'PENDING'])
    .in('leave_type', [...DEDUCTS])

  const used = Math.round(
    ((usedRows ?? [])
      .filter(r => under1Year || r.start_date >= yearStart)
      .reduce((s, r) => s + Number(r.days_used), 0)) * 10
  ) / 10
  const remaining = Math.max(Math.round((entitlement - used) * 10) / 10, 0)

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">연차 신청</h1>
      <LeaveForm remainingLeaves={remaining} annualLeaveDays={entitlement} />
    </div>
  )
}
