import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaveForm from '@/components/approval/LeaveForm'
import { calcAnnualLeave } from '@/lib/annualLeave'

export default async function NewLeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, hired_at, annual_leave_days, remaining_leaves')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const today = new Date(Date.now() + 9 * 3600000)
  const hiredAt = employee.hired_at ? new Date(employee.hired_at) : null
  const entitlement = hiredAt
    ? calcAnnualLeave(hiredAt, today)
    : (employee.annual_leave_days ?? 15)

  // remaining_leaves는 DB에서 PENDING 시 즉시 차감·취소 시 복구되는 단일 진실 소스
  const remaining = Math.max(Number(employee.remaining_leaves ?? 0), 0)

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">연차 신청</h1>
      <LeaveForm remainingLeaves={remaining} annualLeaveDays={entitlement} />
    </div>
  )
}
