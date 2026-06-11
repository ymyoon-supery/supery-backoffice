import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcAnnualLeave } from '@/lib/annualLeave'
import LeaveManualClient from './LeaveManualClient'

export default async function LeaveManualPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: rawEmployees }, { data: leaveRecords }] = await Promise.all([
    supabase.from('employees').select('id, name, email, hired_at, annual_leave_days, remaining_leaves').eq('is_active', true).order('name'),
    supabase.from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, days_used, reason, is_manual, employees(name)')
      .eq('status', 'APPROVED')
      .order('start_date', { ascending: false })
      .limit(500),
  ])

  const today = new Date()
  const employees = (rawEmployees ?? []).map(e => ({
    ...e,
    annual_leave_days: e.hired_at
      ? calcAnnualLeave(new Date(e.hired_at), today)
      : (e.annual_leave_days ?? 15),
  }))

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">연차 관리</h1>
      <p className="text-sm text-gray-500 mb-6">수동 등록 및 결재 승인된 연차를 조회·수정·삭제합니다.</p>
      <LeaveManualClient employees={employees} leaveRecords={leaveRecords ?? []} />
    </div>
  )
}
