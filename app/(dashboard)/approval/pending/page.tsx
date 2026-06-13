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
  if (employee.position !== '팀장') redirect('/approval/my')

  const [{ data: leaveSteps }, { data: expenseSteps }] = await Promise.all([
    supabase
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
      .order('created_at', { ascending: false }),
    supabase
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
      .order('created_at', { ascending: false }),
  ])

  return (
    <PendingApprovalsClient
      leaveSteps={leaveSteps ?? []}
      expenseSteps={expenseSteps ?? []}
    />
  )
}
