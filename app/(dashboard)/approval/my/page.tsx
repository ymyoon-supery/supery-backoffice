import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyRequestsClient from './MyRequestsClient'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

export default async function MyRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, position, department_id, departments ( name )')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const emp = employee as any
  const employeeName = emp.name ?? ''
  const employeePosition = emp.position ?? null
  const departmentName = emp.departments?.name ?? null

  const [{ data: myLeave }, { data: myExpense }] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, days_used, status, created_at, leave_approval_steps(comment, status)')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('expense_reports')
      .select('id, title, amount, category, status, created_at, tax_type, evidence_type, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const leaveItems = (myLeave ?? []).map(r => ({
    ...r,
    kind: 'leave' as const,
    displayLabel: `${LEAVE_LABELS[r.leave_type] ?? r.leave_type} ${r.days_used}일`,
  }))

  const expenseItems = (myExpense ?? []).map((r: any) => ({
    ...r,
    kind: 'expense' as const,
    displayLabel: `${r.title} — ${Number(r.amount).toLocaleString()}원`,
  }))

  const items = [...leaveItems, ...expenseItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <MyRequestsClient
      items={items}
      employeeName={employeeName}
      employeePosition={employeePosition}
      departmentName={departmentName}
    />
  )
}
