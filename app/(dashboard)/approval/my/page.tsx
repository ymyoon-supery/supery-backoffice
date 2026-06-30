import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyRequestsClient from './MyRequestsClient'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

const PAGE_SIZE = 10

function getPendingApproverLabel(
  steps: Array<{ step_order: number; status: string; approver_id?: string | null; employees?: { position?: string | null; name?: string | null; role?: string | null } | null }> | null | undefined,
  selfId?: string | null
): string | null {
  if (!steps?.length) return null
  const pending = [...steps]
    .filter(s => s.status === 'PENDING' && (!selfId || s.approver_id !== selfId))
    .sort((a, b) => a.step_order - b.step_order)[0]
  if (!pending) return null
  const label = pending.employees?.role === 'ADMIN'
    ? '관리자'
    : (pending.employees?.position || pending.employees?.name || '담당자')
  return `${label} 승인 대기중`
}

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    catTab?: string
    catPage?: string
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
  const catTab      = ['all', 'leave', 'expense', 'document', 'supply'].includes(params.catTab ?? '') ? params.catTab! : 'all'
  const catPage     = Math.max(1, parseInt(params.catPage ?? '1') || 1)
  const offset      = (catPage - 1) * PAGE_SIZE
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

  // 활성 탭의 count 쿼리 (페이지네이션용)
  let leaveTotalPages   = 1
  let expenseTotalPages = 1
  let documentTotalPages = 1
  let supplyTotalPages  = 1

  if (catTab === 'leave') {
    const { count } = await supabase
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
    leaveTotalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  }

  if (catTab === 'expense') {
    let cq = supabase
      .from('expense_reports')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
    if (expenseType) cq = cq.eq('expense_type', expenseType)
    if (month) {
      const [y, m] = month.split('-').map(Number)
      const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      cq = cq.gte('created_at', `${month}-01T00:00:00`).lt('created_at', `${nextM}-01T00:00:00`)
    } else if (dateFrom || dateTo) {
      if (dateFrom) cq = cq.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   cq = cq.lte('created_at', `${dateTo}T23:59:59`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (keyword) cq = (cq as any).filter('line_items::text', 'ilike', `%${keyword}%`)
    const { count } = await cq
    expenseTotalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  }

  if (catTab === 'document') {
    const { count } = await supabase
      .from('document_requests')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'COMPLETED', 'CANCELLED'])
    documentTotalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  }

  if (catTab === 'supply') {
    const { count } = await supabase
      .from('supply_requests')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
    supplyTotalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  }

  // 데이터 쿼리: 활성 탭은 range(), 전체 탭은 limit(10) 미리보기
  const leaveRange   = catTab === 'leave'    ? [offset, offset + PAGE_SIZE - 1] as const : [0, PAGE_SIZE - 1] as const
  const documentRange = catTab === 'document' ? [offset, offset + PAGE_SIZE - 1] as const : [0, PAGE_SIZE - 1] as const
  const supplyRange  = catTab === 'supply'   ? [offset, offset + PAGE_SIZE - 1] as const : [0, PAGE_SIZE - 1] as const

  const [
    { data: myLeave },
    { data: myExpense },
    { data: myDocuments },
    { data: mySupply },
  ] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, days_used, reason, status, created_at, leave_approval_steps(step_order, comment, status, approver_id, employees(position, name, role))')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .range(leaveRange[0], leaveRange[1]),
    (() => {
      let q = supabase
        .from('expense_reports')
        .select('id, title, amount, category, expense_type, status, created_at, tax_type, evidence_type, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, expense_approval_steps(step_order, status, approver_id, employees(position, name, role))')
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
      const expRange = catTab === 'expense' ? [offset, offset + PAGE_SIZE - 1] as const : [0, PAGE_SIZE - 1] as const
      return q.range(expRange[0], expRange[1])
    })(),
    supabase
      .from('document_requests')
      .select('id, doc_type, status, purpose, created_at')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'COMPLETED', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .range(documentRange[0], documentRange[1]),
    supabase
      .from('supply_requests')
      .select('id, status, created_at, supply_request_items(id, category, description, estimated_amount, note, sort_order), supply_approval_steps(step_order, status, approver_id, employees(position, name, role))')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
      .order('created_at', { ascending: false })
      .range(supplyRange[0], supplyRange[1]),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaveItems = (myLeave ?? []).map((r: any) => ({
    ...r,
    kind: 'leave' as const,
    displayLabel: `${LEAVE_LABELS[r.leave_type] ?? r.leave_type} ${r.days_used}일`,
    pendingApproverLabel: r.status === 'PENDING' ? getPendingApproverLabel(r.leave_approval_steps, employee.id) : null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenseItems = (myExpense ?? []).map((r: any) => ({
    ...r,
    kind: 'expense' as const,
    displayLabel: `${r.title} — ${Number(r.amount).toLocaleString()}원`,
    pendingApproverLabel: r.status === 'PENDING' ? getPendingApproverLabel(r.expense_approval_steps, employee.id) : null,
  }))

  const items = [...leaveItems, ...expenseItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supplyRequests = (mySupply ?? []).map((r: any) => ({
    ...r,
    pendingApproverLabel: r.status === 'PENDING' ? getPendingApproverLabel(r.supply_approval_steps, employee.id) : null,
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
      catTab={catTab}
      catPage={catPage}
      leaveTotalPages={leaveTotalPages}
      expenseTotalPages={expenseTotalPages}
      documentTotalPages={documentTotalPages}
      supplyTotalPages={supplyTotalPages}
    />
  )
}
