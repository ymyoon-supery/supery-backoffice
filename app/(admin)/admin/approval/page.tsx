import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminApprovalClient from '@/components/admin/AdminApprovalClient'
import { calcAnnualLeave } from '@/lib/annualLeave'

const PAGE_SIZE = 20
const DEDUCTS_LEAVE = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const EXPENSE_LABELS: Record<string, string> = {
  TRANSPORT: '교통비', MEAL: '식대', ACCOMMODATION: '숙박비', SUPPLIES: '소모품', OTHER: '기타',
}

export type ApprovalItem = {
  stepId: string
  kind: 'leave' | 'expense' | 'home_location'
  requestId: string
  employeeName: string
  employeePosition?: string | null
  departmentName?: string | null
  typeLabel: string
  detail: string
  requestDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comment?: string | null
  paymentStatus?: 'PENDING_PAYMENT' | 'PAID' | 'SETTLED' | null
  managerName?: string
  // leave detail
  reason?: string | null
  totalLeaves?: number | null
  remainingLeaves?: number | null
  // expense detail
  expenseType?: string | null
  title?: string | null
  taxType?: string | null
  evidenceType?: string | null
  lineItems?: Array<{ item: string; date: string; amount?: number; note?: string; count?: number; userName?: string }> | null
  payee?: string | null
  paymentMethod?: string | null
  bankName?: string | null
  accountNumber?: string | null
  accountHolder?: string | null
  paymentRequestDate?: string | null
  settlementDate?: string | null
  attachmentUrls?: string[] | null
}

export default async function AdminApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string; period?: string; sort?: string; page?: string; expenseType?: string; month?: string; dateFrom?: string; dateTo?: string; keyword?: string; employeeName?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee || employee.role !== 'ADMIN') redirect('/approval/my')

  const params = await searchParams
  const tab    = params.tab    === 'done'    ? 'done'    : 'pending'
  const type   = ['leave', 'expense', 'home_location'].includes(params.type ?? '') ? params.type! : 'all'
  const period = ['day',   'week',  'month' ].includes(params.period ?? '') ? params.period! : 'all'
  const sort   = params.sort  === 'asc'  ? 'asc'  : 'desc'
  const page   = Math.max(1, parseInt(params.page ?? '1') || 1)
  const expenseType  = params.expenseType ?? ''
  const month        = params.month ?? ''
  const dateFrom     = params.dateFrom ?? ''
  const dateTo       = params.dateTo ?? ''
  const keyword      = params.keyword ?? ''
  const employeeName = params.employeeName ?? ''

  // Period → KST fromDate
  const kstMs  = Date.now() + 9 * 60 * 60 * 1000
  const kstD   = new Date(kstMs)
  const today  = kstD.toISOString().slice(0, 10)
  let fromDate: string | undefined
  if (period === 'day') {
    fromDate = `${today}T00:00:00+09:00`
  } else if (period === 'week') {
    const dow = kstD.getUTCDay()
    const diffToMon = dow === 0 ? -6 : 1 - dow
    const mon = new Date(kstMs + diffToMon * 86400000).toISOString().slice(0, 10)
    fromDate = `${mon}T00:00:00+09:00`
  } else if (period === 'month') {
    fromDate = `${today.slice(0, 7)}-01T00:00:00+09:00`
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const statusFilter = tab === 'pending' ? ['PENDING'] : ['APPROVED', 'REJECTED']

  const empInfoMap: Record<string, { hiredAt: string | null; annualLeaveDays: number }> = {}
  const leaveItemEmpIds: (string | null)[] = []
  const fullApproveItemEmpIds: (string | null)[] = []

  // ── Leave steps ──────────────────────────────────────────────
  let leaveItems: ApprovalItem[] = []
  if (type !== 'expense' && type !== 'home_location') {
    let q = admin
      .from('leave_approval_steps')
      .select(`
        id, status, comment,
        leave_requests (
          id, leave_type, start_date, end_date, days_used, reason, created_at,
          employees ( id, name, hired_at, annual_leave_days )
        )
      `)
      .eq('approver_id', employee.id)
      .in('status', statusFilter)
    if (fromDate) q = q.gte('created_at', fromDate)

    const { data } = await q
    for (const s of (data ?? []) as any[]) {
      const req = s.leave_requests
      if (!req) continue
      const empId: string | null = req.employees?.id ?? null
      if (empId && req.employees) {
        empInfoMap[empId] = { hiredAt: req.employees.hired_at ?? null, annualLeaveDays: req.employees.annual_leave_days ?? 15 }
      }
      leaveItemEmpIds.push(empId)
      leaveItems.push({
        stepId:          s.id,
        kind:            'leave' as const,
        requestId:       req.id,
        employeeName:    req.employees?.name ?? '—',
        typeLabel:       LEAVE_LABELS[req.leave_type] ?? req.leave_type,
        detail:          `${req.days_used}일 · ${req.start_date}${req.start_date !== req.end_date ? ` ~ ${req.end_date}` : ''}`,
        requestDate:     req.created_at,
        status:          s.status,
        comment:         s.comment,
        reason:          req.reason ?? null,
        totalLeaves:     null,
        remainingLeaves: null,
      })
    }
  }

  // ── Expense steps ─────────────────────────────────────────────
  let expenseItems: ApprovalItem[] = []
  if (type !== 'leave' && type !== 'home_location') {
    let q = admin
      .from('expense_approval_steps')
      .select(`
        id, status,
        expense_reports (
          id, title, amount, category, expense_type, created_at, payment_status,
          payee, payment_method, bank_name, account_number, account_holder,
          payment_request_date, settlement_date, line_items, attachment_urls,
          tax_type, evidence_type,
          employees ( name, position )
        )
      `)
      .eq('approver_id', employee.id)
      .in('status', statusFilter)
    if (fromDate) q = q.gte('created_at', fromDate)

    const { data } = await q
    expenseItems = (data ?? []).flatMap((s: any) => {
      const rep = s.expense_reports
      if (!rep) return []
      return [{
        stepId:             s.id,
        kind:               'expense' as const,
        requestId:          rep.id,
        employeeName:       rep.employees?.name ?? '—',
        employeePosition:   rep.employees?.position ?? null,
        departmentName:     null,
        typeLabel:          EXPENSE_LABELS[rep.category] ?? rep.category,
        detail:             `${rep.title} · ${Number(rep.amount).toLocaleString()}원`,
        requestDate:        rep.created_at,
        status:             s.status,
        paymentStatus:      rep.payment_status ?? null,
        expenseType:        rep.expense_type ?? null,
        title:              rep.title ?? null,
        taxType:            rep.tax_type ?? null,
        evidenceType:       rep.evidence_type ?? null,
        payee:              rep.payee ?? null,
        paymentMethod:      rep.payment_method ?? null,
        bankName:           rep.bank_name ?? null,
        accountNumber:      rep.account_number ?? null,
        accountHolder:      rep.account_holder ?? null,
        paymentRequestDate: rep.payment_request_date ?? null,
        settlementDate:     rep.settlement_date ?? null,
        lineItems:          rep.line_items ?? null,
        attachmentUrls:     rep.attachment_urls ?? null,
      }]
    })
  }

  // ── Expense JS 필터 ──────────────────────────────────────────────
  if (expenseType) expenseItems = expenseItems.filter(e => e.expenseType === expenseType)
  if (month) {
    expenseItems = expenseItems.filter(e => e.requestDate.startsWith(month))
  } else if (dateFrom || dateTo) {
    if (dateFrom) expenseItems = expenseItems.filter(e => e.requestDate.slice(0, 10) >= dateFrom)
    if (dateTo)   expenseItems = expenseItems.filter(e => e.requestDate.slice(0, 10) <= dateTo)
  }
  if (keyword) {
    const kw = keyword.toLowerCase()
    expenseItems = expenseItems.filter(e => JSON.stringify(e.lineItems ?? []).toLowerCase().includes(kw))
  }
  if (employeeName) {
    const en = employeeName.toLowerCase()
    expenseItems = expenseItems.filter(e => e.employeeName.toLowerCase().includes(en))
  }

  // ── Home location requests ────────────────────────────────────
  let homeLocationItems: ApprovalItem[] = []
  if (type === 'all' || type === 'home_location') {
    let q = admin
      .from('home_location_requests')
      .select(`id, status, comment, new_lat, new_lng, location_name, created_at, employees ( name )`)
      .in('status', statusFilter)
    if (fromDate) q = q.gte('created_at', fromDate)

    const { data } = await q
    homeLocationItems = (data ?? []).map((r: any) => ({
      stepId:       r.id,
      kind:         'home_location' as const,
      requestId:    r.id,
      employeeName: r.employees?.name ?? '—',
      typeLabel:    '재택변경',
      detail:       r.location_name
        ? `${r.location_name} · ${Number(r.new_lat).toFixed(5)}, ${Number(r.new_lng).toFixed(5)}`
        : `${Number(r.new_lat).toFixed(5)}, ${Number(r.new_lng).toFixed(5)}`,
      requestDate:  r.created_at,
      status:       r.status,
      comment:      r.comment,
    }))
  }

  // ── 전결 대기: admin WAITING step2 where step1 is still PENDING ──
  let fullApproveLeaveItems: ApprovalItem[] = []
  let fullApproveExpenseItems: ApprovalItem[] = []

  if (tab === 'pending') {
    if (type !== 'expense' && type !== 'home_location') {
      const { data: waitingLeave } = await admin
        .from('leave_approval_steps')
        .select(`id, leave_request_id, leave_requests ( id, leave_type, start_date, end_date, days_used, reason, created_at, employees ( id, name, hired_at, annual_leave_days ) )`)
        .eq('approver_id', employee.id)
        .eq('status', 'WAITING')
        .eq('step_order', 2)

      if (waitingLeave && waitingLeave.length > 0) {
        const reqIds = waitingLeave.map((s: any) => s.leave_request_id)
        const { data: step1s } = await admin
          .from('leave_approval_steps')
          .select(`leave_request_id, employees ( name )`)
          .in('leave_request_id', reqIds)
          .eq('step_order', 1)
          .eq('status', 'PENDING')

        const managerByReqId = Object.fromEntries(
          (step1s ?? []).map((s: any) => [s.leave_request_id, s.employees?.name ?? '—'])
        )
        for (const s of waitingLeave.filter((s: any) => managerByReqId[s.leave_request_id])) {
          const req = (s as any).leave_requests
          if (!req) continue
          const empId: string | null = req.employees?.id ?? null
          if (empId && req.employees) {
            empInfoMap[empId] = { hiredAt: req.employees.hired_at ?? null, annualLeaveDays: req.employees.annual_leave_days ?? 15 }
          }
          fullApproveItemEmpIds.push(empId)
          fullApproveLeaveItems.push({
            stepId:          (s as any).id,
            kind:            'leave' as const,
            requestId:       req.id,
            employeeName:    req.employees?.name ?? '—',
            managerName:     managerByReqId[(s as any).leave_request_id],
            typeLabel:       LEAVE_LABELS[req.leave_type] ?? req.leave_type,
            detail:          `${req.days_used}일 · ${req.start_date}${req.start_date !== req.end_date ? ` ~ ${req.end_date}` : ''}`,
            requestDate:     req.created_at,
            status:          'PENDING' as const,
            reason:          req.reason ?? null,
            totalLeaves:     null,
            remainingLeaves: null,
          })
        }
      }
    }

    if (type !== 'leave' && type !== 'home_location') {
      const { data: waitingExpense } = await admin
        .from('expense_approval_steps')
        .select(`id, expense_report_id, expense_reports ( id, title, amount, category, expense_type, created_at, payment_status, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, tax_type, evidence_type, employees ( name, position ) )`)
        .eq('approver_id', employee.id)
        .eq('status', 'WAITING')
        .eq('step_order', 2)

      if (waitingExpense && waitingExpense.length > 0) {
        const repIds = waitingExpense.map((s: any) => s.expense_report_id)
        const { data: step1s } = await admin
          .from('expense_approval_steps')
          .select(`expense_report_id, employees ( name )`)
          .in('expense_report_id', repIds)
          .eq('step_order', 1)
          .eq('status', 'PENDING')

        const managerByRepId = Object.fromEntries(
          (step1s ?? []).map((s: any) => [s.expense_report_id, s.employees?.name ?? '—'])
        )
        fullApproveExpenseItems = waitingExpense
          .filter((s: any) => managerByRepId[s.expense_report_id])
          .flatMap((s: any) => {
            const rep = s.expense_reports
            if (!rep) return []
            return [{
              stepId:             s.id,
              kind:               'expense' as const,
              requestId:          rep.id,
              employeeName:       rep.employees?.name ?? '—',
              employeePosition:   rep.employees?.position ?? null,
              departmentName:     null,
              managerName:        managerByRepId[s.expense_report_id],
              typeLabel:          EXPENSE_LABELS[rep.category] ?? rep.category,
              detail:             `${rep.title} · ${Number(rep.amount).toLocaleString()}원`,
              requestDate:        rep.created_at,
              status:             'PENDING' as const,
              paymentStatus:      rep.payment_status ?? null,
              expenseType:        rep.expense_type ?? null,
              title:              rep.title ?? null,
              taxType:            rep.tax_type ?? null,
              evidenceType:       rep.evidence_type ?? null,
              payee:              rep.payee ?? null,
              paymentMethod:      rep.payment_method ?? null,
              bankName:           rep.bank_name ?? null,
              accountNumber:      rep.account_number ?? null,
              accountHolder:      rep.account_holder ?? null,
              paymentRequestDate: rep.payment_request_date ?? null,
              settlementDate:     rep.settlement_date ?? null,
              lineItems:          rep.line_items ?? null,
              attachmentUrls:     rep.attachment_urls ?? null,
            }]
          })
      }
    }
  }

  // ── fullApprove Expense JS 필터 ──────────────────────────────────
  if (expenseType) fullApproveExpenseItems = fullApproveExpenseItems.filter(e => e.expenseType === expenseType)
  if (month) {
    fullApproveExpenseItems = fullApproveExpenseItems.filter(e => e.requestDate.startsWith(month))
  } else if (dateFrom || dateTo) {
    if (dateFrom) fullApproveExpenseItems = fullApproveExpenseItems.filter(e => e.requestDate.slice(0, 10) >= dateFrom)
    if (dateTo)   fullApproveExpenseItems = fullApproveExpenseItems.filter(e => e.requestDate.slice(0, 10) <= dateTo)
  }
  if (keyword) {
    const kw = keyword.toLowerCase()
    fullApproveExpenseItems = fullApproveExpenseItems.filter(e => JSON.stringify(e.lineItems ?? []).toLowerCase().includes(kw))
  }
  if (employeeName) {
    const en = employeeName.toLowerCase()
    fullApproveExpenseItems = fullApproveExpenseItems.filter(e => e.employeeName.toLowerCase().includes(en))
  }

  // ── 연차 잔여 동적 계산 (입사일 기준, 올해 승인 사용량 기준) ──────
  const allLeaveEmpIds = [...new Set([...leaveItemEmpIds, ...fullApproveItemEmpIds].filter((id): id is string => !!id))]
  if (allLeaveEmpIds.length > 0) {
    const yearStart = `${new Date().getFullYear()}-01-01`
    const { data: usedTotals } = await admin
      .from('leave_requests')
      .select('employee_id, days_used')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS_LEAVE)
      .gte('start_date', yearStart)
      .in('employee_id', allLeaveEmpIds)

    const usedByEmp: Record<string, number> = {}
    for (const r of usedTotals ?? []) {
      usedByEmp[r.employee_id] = (usedByEmp[r.employee_id] ?? 0) + Number(r.days_used)
    }

    const today = new Date()
    const patchLeave = (items: ApprovalItem[], empIds: (string | null)[]) => {
      items.forEach((item, idx) => {
        const empId = empIds[idx]
        if (!empId) return
        const info = empInfoMap[empId]
        if (!info) return
        const entitlement = info.hiredAt ? calcAnnualLeave(new Date(info.hiredAt), today) : (info.annualLeaveDays ?? 15)
        item.totalLeaves = entitlement
        item.remainingLeaves = Math.max(Math.round((entitlement - (usedByEmp[empId] ?? 0)) * 10) / 10, 0)
      })
    }
    patchLeave(leaveItems, leaveItemEmpIds)
    patchLeave(fullApproveLeaveItems, fullApproveItemEmpIds)
  }

  // ── Merge, sort, paginate ─────────────────────────────────────
  const all = [...leaveItems, ...expenseItems, ...homeLocationItems].sort((a, b) => {
    const diff = new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime()
    return sort === 'asc' ? diff : -diff
  })

  const total      = all.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const curPage    = Math.min(page, totalPages)
  const items      = all.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  return (
    <AdminApprovalClient
      items={items}
      total={total}
      page={curPage}
      totalPages={totalPages}
      tab={tab}
      type={type}
      period={period}
      sort={sort}
      fullApproveItems={[...fullApproveLeaveItems, ...fullApproveExpenseItems]}
      expenseType={expenseType}
      month={month}
      dateFrom={dateFrom}
      dateTo={dateTo}
      keyword={keyword}
      employeeName={employeeName}
    />
  )
}
