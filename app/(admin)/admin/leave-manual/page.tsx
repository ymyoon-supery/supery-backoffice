import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { calcAnnualLeave } from '@/lib/annualLeave'
import LeaveManualClient from './LeaveManualClient'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF']

export default async function LeaveManualPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // service role로 RLS 우회 — 어드민 전용 페이지
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: rawEmployees }, { data: leaveRecords, error: leaveError }, { data: usedTotals }] = await Promise.all([
    admin.from('employees').select('id, name, email, hired_at, annual_leave_days, remaining_leaves').eq('is_active', true).order('name'),
    admin.from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, days_used, reason, is_manual')
      .eq('status', 'APPROVED')
      .order('start_date', { ascending: false })
      .limit(500),
    admin.from('leave_requests')
      .select('employee_id, leave_type, days_used')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS),
  ])

  const today = new Date()
  const usedByEmp: Record<string, number> = {}
  for (const r of usedTotals ?? []) {
    usedByEmp[r.employee_id] = (usedByEmp[r.employee_id] ?? 0) + Number(r.days_used)
  }

  const employees = (rawEmployees ?? []).map(e => {
    const entitlement = e.hired_at
      ? calcAnnualLeave(new Date(e.hired_at), today)
      : (e.annual_leave_days ?? 15)
    return {
      ...e,
      annual_leave_days: entitlement,
      remaining_leaves: Math.max(entitlement - (usedByEmp[e.id] ?? 0), 0),
    }
  })

  const records = (leaveRecords ?? []).map(r => ({ ...r, is_manual: r.is_manual ?? false }))

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">연차 관리</h1>
      <p className="text-sm text-gray-500 mb-6">수동 등록 및 결재 승인된 연차를 조회·수정·삭제합니다.</p>
      {leaveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-mono">
          쿼리 오류: {leaveError.message}
        </div>
      )}
      <LeaveManualClient employees={employees} leaveRecords={records} />
    </div>
  )
}
