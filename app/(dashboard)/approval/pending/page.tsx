import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendingApprovalsClient from '@/components/approval/PendingApprovalsClient'

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
              employees ( name, email, department_id, annual_leave_days, remaining_leaves )
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

  return (
    <PendingApprovalsClient
      leaveSteps={(leaveRes.data ?? []) as unknown[]}
      expenseSteps={(expenseRes.data ?? []) as unknown[]}
      fullApprovedLeaveSteps={(fullApprovedLeaveRes.data ?? []) as unknown[]}
      fullApprovedExpenseSteps={(fullApprovedExpenseRes.data ?? []) as unknown[]}
      supplySteps={(supplyRes.data ?? []) as unknown[]}
    />
  )
}
