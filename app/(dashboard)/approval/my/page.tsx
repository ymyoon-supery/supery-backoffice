import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyRequestsClient from './MyRequestsClient'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

function getPendingApproverLabel(
  steps: Array<{ step_order: number; status: string; employees?: { position?: string | null; name?: string | null } | null }> | null | undefined
): string | null {
  if (!steps?.length) return null
  const pending = [...steps]
    .filter(s => s.status === 'PENDING')
    .sort((a, b) => a.step_order - b.step_order)[0]
  if (!pending) return null
  const label = pending.employees?.position || pending.employees?.name || '담당자'
  return `${label} 승인 대기중`
}

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    expenseType?: string
    month?: string
    dateFrom?: string
    dateTo?: string
    keyword?: string
  }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const expenseType = params.expenseType ?? ''
  const month       = params.month ?? ''
  const dateFrom    = params.dateFrom ?? ''
  const dateTo      = params.dateTo ?? ''
  const keyword     = params.keyword ?? ''

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, position, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const employeeName = employee.name ?? ''
  const employeePosition = employee.position ?? null

  let departmentName: string | null = null
  if (employee.department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', employee.department_id)
      .single()
    departmentName = dept?.name ?? null
  }

  const [
    { data: myLeave },
    { data: myExpense },
    { data: myDocuments },
    { data: mySupply },
  ] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, days_used, reason, status, created_at, leave_approval_steps(step_order, comment, status, employees(position, name))')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .limit(20),
    (() => {
      let q = supabase
        .from('expense_reports')
        .select('id, title, amount, category, expense_type, status, created_at, tax_type, evidence_type, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, expense_approval_steps(step_order, status, employees(position, name))')
        .eq('employee_id', employee.id)
        .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
        .order('created_at', { ascending: false })
      if (expenseType) q = q.eq('expense_type', expenseType)
      if (month) {
        const [y, m] = month.split('-').map(Number)
        const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
        q = q.gte('created_at', `${month}-01T00:00:00`).lt('created_at', `${nextM}-01T00:00:00`)
      } else if (dateFrom || dateTo) {
        if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
        if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (keyword) q = (q as any).filter('line_items::text', 'ilike', `%${keyword}%`)
      return q
    })(),
    supabase
      .from('document_requests')
      .select('id, doc_type, status, purpose, created_at')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'COMPLETED', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('supply_requests')
      .select('id, status, created_at, supply_request_items(id, category, description, estimated_amount, note, sort_order), supply_approval_steps(step_order, status, employees(position, name))')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaveItems = (myLeave ?? []).map((r: any) => ({
    ...r,
    kind: 'leave' as const,
    displayLabel: `${LEAVE_LABELS[r.leave_type] ?? r.leave_type} ${r.days_used}일`,
    pendingApproverLabel: r.status === 'PENDING' ? getPendingApproverLabel(r.leave_approval_steps) : null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenseItems = (myExpense ?? []).map((r: any) => ({
    ...r,
    kind: 'expense' as const,
    displayLabel: `${r.title} — ${Number(r.amount).toLocaleString()}원`,
    pendingApproverLabel: r.status === 'PENDING' ? getPendingApproverLabel(r.expense_approval_steps) : null,
  }))

  const items = [...leaveItems, ...expenseItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supplyRequests = (mySupply ?? []).map((r: any) => ({
    ...r,
    pendingApproverLabel: r.status === 'PENDING' ? getPendingApproverLabel(r.supply_approval_steps) : null,
  }))

  return (
    <MyRequestsClient
      items={items}
      employeeName={employeeName}
      employeePosition={employeePosition}
      departmentName={departmentName}
      documentRequests={myDocuments ?? []}
      supplyRequests={supplyRequests as any[]}
      expenseType={expenseType}
      month={month}
      dateFrom={dateFrom}
      dateTo={dateTo}
      keyword={keyword}
    />
  )
}
