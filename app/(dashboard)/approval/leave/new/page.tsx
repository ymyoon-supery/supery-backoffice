import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaveForm from '@/components/approval/LeaveForm'
import { calcAnnualLeave } from '@/lib/annualLeave'

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

  const { data: usedRows } = await supabase
    .from('leave_requests')
    .select('days_used')
    .eq('employee_id', employee.id)
    .eq('status', 'APPROVED')
    .in('leave_type', [...DEDUCTS])

  const today = new Date()
  const entitlement = employee.hired_at
    ? calcAnnualLeave(new Date(employee.hired_at), today)
    : (employee.annual_leave_days ?? 15)

  const used = Math.round(((usedRows ?? []).reduce((s: number, r: { days_used: number }) => s + Number(r.days_used), 0)) * 10) / 10
  const remaining = Math.max(Math.round((entitlement - used) * 10) / 10, 0)

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">연차 신청</h1>
      <LeaveForm remainingLeaves={remaining} annualLeaveDays={entitlement} />
    </div>
  )
}
