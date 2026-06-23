import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendingApprovalsClient from '@/components/approval/PendingApprovalsClient'
import { calcAnnualLeave } from '@/lib/annualLeave'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function PendingApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, position')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const { data: settings } = await supabase
    .from('company_settings')
    .select('supply_manager_id')
    .single()

  const isSupplyManager = settings?.supply_manager_id === employee.id
  const isTeamLead = employee.position === '팀장'

  if (!isTeamLead && !isSupplyManager) redirect('/approval/my')

  // Run all queries in parallel; use empty fallbacks for non-applicable roles
  const [
    leaveRes,
    expenseRes,
    fullApprovedLeaveRes,
    fullApprovedExpenseRes,
    supplyRes,
  ] = await Promise.all([
    isTeamLead
      ? supabase
          .from('leave_approval_steps')
          .select(`
            id, step_order, status,
            leave_requests (
              id, leave_type, start_date, end_date, days_used, reason, status, created_at,
              employees ( id, name, email, department_id, hired_at, annual_leave_days )
            )
          `)
          .eq('approver_id', employee.id)
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),

    isTeamLead
      ? supabase
          .from('expense_approval_steps')
          .select(`
            id, step_order, status,
            expense_reports (
              id, title, amount, category, expense_date, status, created_at,
              payee, payment_method, bank_name, account_number, account_holder,
              payment_request_date, settlement_date, line_items, attachment_urls,
              tax_type, evidence_type,
              employees ( name, email, position )
            )
          `)
          .eq('approver_id', employee.id)
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),

    isTeamLead
      ? supabase
          .from('leave_approval_steps')
          .select(`
            id, acted_at,
            leave_requests (
              id, leave_type, start_date, end_date, days_used, created_at,
              employees ( name )
            )
          `)
          .eq('approver_id', employee.id)
          .eq('status', 'APPROVED')
          .eq('comment', '전결')
          .order('acted_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as unknown[] }),

    isTeamLead
      ? supabase
          .from('expense_approval_steps')
          .select(`
            id, acted_at,
            expense_reports (
              id, title, amount, category, created_at,
              employees ( name )
            )
          `)
          .eq('approver_id', employee.id)
          .eq('status', 'APPROVED')
          .eq('comment', '전결')
          .order('acted_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as unknown[] }),

    isTeamLead || isSupplyManager
      ? supabase
          .from('supply_approval_steps')
          .select(`
            id, step_order, status,
            supply_requests (
              id, status, created_at,
              employees ( name, position ),
              supply_request_items ( id, category, description, estimated_amount, note, sort_order )
            )
          `)
          .eq('approver_id', employee.id)
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  // 연차 잔여 동적 계산 (입사일 기준, 올해 승인 사용량)
  const rawLeaveSteps = (leaveRes.data ?? []) as any[]
  const empInfoMap: Record<string, { hiredAt: string | null; annualLeaveDays: number }> = {}
  for (const step of rawLeaveSteps) {
    const emp = step.leave_requests?.employees
    if (emp?.id) empInfoMap[emp.id] = { hiredAt: emp.hired_at ?? null, annualLeaveDays: emp.annual_leave_days ?? 15 }
  }
  const empIds = Object.keys(empInfoMap)
  const usedByEmp: Record<string, number> = {}
  if (empIds.length > 0) {
    const yearStart = `${new Date().getFullYear()}-01-01`
    const { data: usedTotals } = await supabase
      .from('leave_requests')
      .select('employee_id, days_used')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS)
      .gte('start_date', yearStart)
      .in('employee_id', empIds)
    for (const r of usedTotals ?? []) {
      usedByEmp[r.employee_id] = (usedByEmp[r.employee_id] ?? 0) + Number(r.days_used)
    }
  }
  const today = new Date()
  const patchedLeaveSteps = rawLeaveSteps.map(step => {
    const emp = step.leave_requests?.employees
    if (!emp?.id || !empInfoMap[emp.id]) return step
    const { hiredAt, annualLeaveDays } = empInfoMap[emp.id]
    const entitlement = hiredAt ? calcAnnualLeave(new Date(hiredAt), today) : (annualLeaveDays ?? 15)
    const used = usedByEmp[emp.id] ?? 0
    return {
      ...step,
      leave_requests: {
        ...step.leave_requests,
        employees: { ...emp, annual_leave_days: entitlement, remaining_leaves: Math.max(Math.round((entitlement - used) * 10) / 10, 0) },
      },
    }
  })

  return (
    <PendingApprovalsClient
      leaveSteps={patchedLeaveSteps as unknown[]}
      expenseSteps={(expenseRes.data ?? []) as unknown[]}
      fullApprovedLeaveSteps={(fullApprovedLeaveRes.data ?? []) as unknown[]}
      fullApprovedExpenseSteps={(fullApprovedExpenseRes.data ?? []) as unknown[]}
      supplySteps={(supplyRes.data ?? []) as unknown[]}
    />
  )
}
