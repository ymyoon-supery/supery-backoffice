import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApprovalInboxClient from '@/components/approval/ApprovalInboxClient'

export default async function ApprovalInboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  // Items pending this employee's approval
  const { data: leaveSteps } = await supabase
    .from('leave_approval_steps')
    .select(`
      id, step_order, status,
      leave_requests (
        id, leave_type, start_date, end_date, days_used, reason, status, created_at,
        employees ( name, email, department_id )
      )
    `)
    .eq('approver_id', employee.id)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })

  const { data: expenseSteps } = await supabase
    .from('expense_approval_steps')
    .select(`
      id, step_order, status,
      expense_reports (
        id, title, amount, category, expense_date, status, created_at,
        employees ( name, email )
      )
    `)
    .eq('approver_id', employee.id)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })

  // My own pending requests
  const { data: myLeave } = await supabase
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, days_used, status, created_at, leave_approval_steps(comment, status)')
    .eq('employee_id', employee.id)
    .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: myExpense } = await supabase
    .from('expense_reports')
    .select('id, title, amount, category, status, created_at')
    .eq('employee_id', employee.id)
    .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <ApprovalInboxClient
      leaveSteps={leaveSteps ?? []}
      expenseSteps={expenseSteps ?? []}
      myLeave={myLeave ?? []}
      myExpense={myExpense ?? []}
    />
  )
}
