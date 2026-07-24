import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import PendingApprovalsClient from '@/components/approval/PendingApprovalsClient'
import { decryptCardNumber } from '@/lib/crypto/ssn'

export const dynamic = 'force-dynamic'
import { calcAnnualLeave } from '@/lib/annualLeave'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']
const PAGE_SIZE = 10

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

export type PendingItem = { kind: 'leave' | 'expense' | 'supply'; step: unknown }

export type DoneItemExpenseDetail = {
  title: string; amount: number; expenseType: string | null
  taxType: string | null; evidenceType: string | null; cardCompany: string | null; cardNumber: string | null; payee: string | null
  paymentMethod: string | null; bankName: string | null; accountNumber: string | null
  accountHolder: string | null; paymentRequestDate: string | null; settlementDate: string | null
  lineItems: unknown[]; attachmentUrls: string[]; employeePosition: string | null
  comment: string | null
}

export type DoneItemSupplyItem = {
  id: string; category: string; description: string
  estimated_amount: number | null; note: string | null; sort_order: number
}

export type DoneItem = {
  id: string
  kind: 'leave' | 'expense' | 'supply'
  employeeName: string
  typeLabel: string
  detail: string
  requestDate: string
  actedAt: string | null
  status: 'APPROVED' | 'REJECTED'
  isJeongyeol: boolean
  leaveReason?: string | null
  expenseDetail?: DoneItemExpenseDetail | null
  supplyItems?: DoneItemSupplyItem[] | null
}

export default async function PendingApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    viewTab?: string; type?: string; page?: string
    expenseType?: string; month?: string; dateFrom?: string; dateTo?: string
    keyword?: string; employeeName?: string
  }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees').select('id, position').eq('auth_user_id', user.id).single()
  if (!employee) redirect('/login')

  const { data: settings } = await supabase
    .from('company_settings').select('supply_manager_id').single()

  const isSupplyManager = settings?.supply_manager_id === employee.id
  const isTeamLead = employee.position === '팀장'
  if (!isTeamLead && !isSupplyManager) redirect('/approval/my')

  const params = await searchParams
  const viewTab      = params.viewTab === 'done' ? 'done' : 'pending'
  const type         = ['all', 'leave', 'expense', 'supply'].includes(params.type ?? '') ? params.type! : 'all'
  const page         = Math.max(1, parseInt(params.page ?? '1') || 1)
  const expenseType  = params.expenseType ?? ''
  const month        = params.month ?? ''
  const dateFrom     = params.dateFrom ?? ''
  const dateTo       = params.dateTo ?? ''
  const keyword      = params.keyword ?? ''
  const employeeName = params.employeeName ?? ''

  const wantLeave   = isTeamLead && (type === 'all' || type === 'leave')
  const wantExpense = isTeamLead && (type === 'all' || type === 'expense')
  const wantSupply  = (isTeamLead || isSupplyManager) && (type === 'all' || type === 'supply')

  if (viewTab === 'pending') {
    const [leaveRes, expenseRes, supplyRes] = await Promise.all([
      wantLeave
        ? supabase.from('leave_approval_steps')
            .select('id, step_order, status, leave_requests(id, leave_type, start_date, end_date, days_used, reason, status, created_at, employees(id, name, hired_at, annual_leave_days))')
            .eq('approver_id', employee.id).eq('status', 'PENDING').order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[] }),
      wantExpense
        ? supabase.from('expense_approval_steps')
            .select('id, step_order, status, expense_reports(id, title, amount, category, expense_type, status, created_at, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, tax_type, evidence_type, card_company, employees(name, position))')
            .eq('approver_id', employee.id).eq('status', 'PENDING').order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[] }),
      wantSupply
        ? supabase.from('supply_approval_steps')
            .select('id, step_order, status, supply_requests(id, status, created_at, employees(name, position), supply_request_items(id, category, description, estimated_amount, note, sort_order))')
            .eq('approver_id', employee.id).eq('status', 'PENDING').order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[] }),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let leaveSteps   = ((leaveRes.data   ?? []) as any[]).filter((s: any) => s.leave_requests?.status !== 'CANCELLED')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let expenseSteps = ((expenseRes.data ?? []) as any[]).filter((s: any) => s.expense_reports?.status !== 'CANCELLED')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supplySteps  = ((supplyRes.data  ?? []) as any[]).filter((s: any) => s.supply_requests?.status !== 'CANCELLED')

    // Annual leave remaining calculation
    const empInfoMap: Record<string, { hiredAt: string | null; annualLeaveDays: number }> = {}
    for (const step of leaveSteps) {
      const emp = step.leave_requests?.employees
      if (emp?.id) empInfoMap[emp.id] = { hiredAt: emp.hired_at ?? null, annualLeaveDays: emp.annual_leave_days ?? 15 }
    }
    const empIds = Object.keys(empInfoMap)
    const usedByEmp: Record<string, number> = {}
    if (empIds.length > 0) {
      const yearStart = `${new Date(Date.now() + 9 * 3600000).getUTCFullYear()}-01-01`
      const { data: usedTotals } = await supabase.from('leave_requests').select('employee_id, days_used').eq('status', 'APPROVED').in('leave_type', DEDUCTS).gte('start_date', yearStart).in('employee_id', empIds)
      for (const r of usedTotals ?? []) usedByEmp[r.employee_id] = (usedByEmp[r.employee_id] ?? 0) + Number(r.days_used)
    }
    const today = new Date()
    leaveSteps = leaveSteps.map(step => {
      const emp = step.leave_requests?.employees
      if (!emp?.id || !empInfoMap[emp.id]) return step
      const { hiredAt, annualLeaveDays } = empInfoMap[emp.id]
      const entitlement = hiredAt ? calcAnnualLeave(new Date(hiredAt), today) : (annualLeaveDays ?? 15)
      const used = usedByEmp[emp.id] ?? 0
      return { ...step, leave_requests: { ...step.leave_requests, employees: { ...emp, annual_leave_days: entitlement, remaining_leaves: Math.max(Math.round((entitlement - used) * 10) / 10, 0) } } }
    })

    // JS-side filters
    if (employeeName) {
      leaveSteps   = leaveSteps.filter(  (s: any) => s.leave_requests?.employees?.name?.includes(employeeName))
      expenseSteps = expenseSteps.filter((s: any) => s.expense_reports?.employees?.name?.includes(employeeName))
      supplySteps  = supplySteps.filter( (s: any) => s.supply_requests?.employees?.name?.includes(employeeName))
    }
    if (expenseType) expenseSteps = expenseSteps.filter((s: any) => s.expense_reports?.expense_type === expenseType)
    if (keyword)     expenseSteps = expenseSteps.filter((s: any) => JSON.stringify(s.expense_reports?.line_items ?? []).toLowerCase().includes(keyword.toLowerCase()))
    if (month) {
      const [y, m] = month.split('-').map(Number)
      expenseSteps = expenseSteps.filter((s: any) => { const d = new Date(s.expense_reports?.created_at ?? ''); return d.getFullYear() === y && d.getMonth() + 1 === m })
    } else if (dateFrom || dateTo) {
      expenseSteps = expenseSteps.filter((s: any) => {
        const d = new Date(s.expense_reports?.created_at ?? '')
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false
        return true
      })
    }

    // Decrypt card numbers for PRIZE personal card expenses
    const pendingPrizeIds = expenseSteps
      .filter((s: any) => s.expense_reports?.evidence_type === 'PERSONAL_CARD')
      .map((s: any) => s.expense_reports?.id as string).filter(Boolean)
    if (pendingPrizeIds.length > 0) {
      const adminClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data: cardSecrets } = await adminClient.from('expense_card_sensitive_data')
        .select('expense_report_id, encrypted_card_number, iv').in('expense_report_id', pendingPrizeIds)
      const cardMap = new Map<string, string>()
      for (const cs of cardSecrets ?? []) {
        try { cardMap.set(cs.expense_report_id, decryptCardNumber(cs.encrypted_card_number, cs.iv)) } catch {}
      }
      expenseSteps = expenseSteps.map((s: any) => {
        const rep = s.expense_reports
        if (!rep || !cardMap.has(rep.id)) return s
        return { ...s, expense_reports: { ...rep, card_number: cardMap.get(rep.id) } }
      })
    }

    // Combine, sort by created_at desc, paginate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const combined: { kind: 'leave' | 'expense' | 'supply'; step: any }[] = [
      ...leaveSteps.map(  (s: any) => ({ kind: 'leave'   as const, step: s })),
      ...expenseSteps.map((s: any) => ({ kind: 'expense' as const, step: s })),
      ...supplySteps.map( (s: any) => ({ kind: 'supply'  as const, step: s })),
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getDate = (item: { kind: string; step: any }) => {
      if (item.kind === 'leave')   return item.step.leave_requests?.created_at ?? ''
      if (item.kind === 'expense') return item.step.expense_reports?.created_at ?? ''
      return item.step.supply_requests?.created_at ?? ''
    }
    combined.sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime())

    const totalPages = Math.max(1, Math.ceil(combined.length / PAGE_SIZE))
    const offset = (page - 1) * PAGE_SIZE
    const pagedItems = combined.slice(offset, offset + PAGE_SIZE)

    return (
      <PendingApprovalsClient
        viewTab={viewTab} type={type} page={page} totalPages={totalPages}
        pendingItems={pagedItems as PendingItem[]} doneItems={[]}
        expenseType={expenseType} month={month} dateFrom={dateFrom} dateTo={dateTo}
        keyword={keyword} employeeName={employeeName}
      />
    )
  }

  // Done tab: all APPROVED/REJECTED steps this approver acted on
  const [doneLeaveRes, doneExpenseRes, doneSupplyRes] = await Promise.all([
    wantLeave
      ? supabase.from('leave_approval_steps')
          .select('id, acted_at, status, comment, leave_requests(id, leave_type, start_date, end_date, days_used, reason, created_at, employees(name))')
          .eq('approver_id', employee.id).in('status', ['APPROVED', 'REJECTED']).order('acted_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    wantExpense
      ? supabase.from('expense_approval_steps')
          .select('id, acted_at, status, comment, expense_reports(id, title, amount, expense_type, created_at, tax_type, evidence_type, card_company, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, employees(name, position))')
          .eq('approver_id', employee.id).in('status', ['APPROVED', 'REJECTED']).order('acted_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    wantSupply
      ? supabase.from('supply_approval_steps')
          .select('id, acted_at, status, comment, supply_requests(id, created_at, employees(name), supply_request_items(id, category, description, estimated_amount, note, sort_order))')
          .eq('approver_id', employee.id).in('status', ['APPROVED', 'REJECTED']).order('acted_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  let doneItems: DoneItem[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const step of (doneLeaveRes.data ?? []) as any[]) {
    const req = step.leave_requests
    if (!req) continue
    if (employeeName && !req.employees?.name?.includes(employeeName)) continue
    doneItems.push({
      id: step.id, kind: 'leave',
      employeeName: req.employees?.name ?? '—',
      typeLabel: `${LEAVE_LABELS[req.leave_type] ?? req.leave_type} ${req.days_used}일`,
      detail: `${req.start_date}${req.start_date !== req.end_date ? ` ~ ${req.end_date}` : ''}`,
      requestDate: req.created_at, actedAt: step.acted_at,
      status: step.status, isJeongyeol: step.comment === '전결',
      leaveReason: req.reason ?? null,
    })
  }

  // Decrypt card numbers for done PRIZE personal card expenses
  const donePrizeIds = ((doneExpenseRes.data ?? []) as any[])
    .filter((s: any) => s.expense_reports?.evidence_type === 'PERSONAL_CARD')
    .map((s: any) => s.expense_reports?.id as string).filter(Boolean)
  const doneCardMap = new Map<string, string>()
  if (donePrizeIds.length > 0) {
    const adminClient = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: cardSecrets } = await adminClient.from('expense_card_sensitive_data')
      .select('expense_report_id, encrypted_card_number, iv').in('expense_report_id', donePrizeIds)
    for (const cs of cardSecrets ?? []) {
      try { doneCardMap.set(cs.expense_report_id, decryptCardNumber(cs.encrypted_card_number, cs.iv)) } catch {}
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const step of (doneExpenseRes.data ?? []) as any[]) {
    const rep = step.expense_reports
    if (!rep) continue
    if (employeeName && !rep.employees?.name?.includes(employeeName)) continue
    if (expenseType && rep.expense_type !== expenseType) continue
    if (keyword && !JSON.stringify(rep.line_items ?? []).toLowerCase().includes(keyword.toLowerCase())) continue
    if (month) {
      const [y, m] = month.split('-').map(Number)
      const d = new Date(rep.created_at)
      if (d.getFullYear() !== y || d.getMonth() + 1 !== m) continue
    } else if (dateFrom || dateTo) {
      const d = new Date(rep.created_at)
      if (dateFrom && d < new Date(dateFrom)) continue
      if (dateTo && d > new Date(`${dateTo}T23:59:59`)) continue
    }
    doneItems.push({
      id: step.id, kind: 'expense',
      employeeName: rep.employees?.name ?? '—',
      typeLabel: rep.title ?? '지출결의',
      detail: `${Number(rep.amount ?? 0).toLocaleString()}원`,
      requestDate: rep.created_at, actedAt: step.acted_at,
      status: step.status, isJeongyeol: step.comment === '전결',
      expenseDetail: {
        title: rep.title ?? '', amount: Number(rep.amount ?? 0),
        expenseType: rep.expense_type ?? null, taxType: rep.tax_type ?? null,
        evidenceType: rep.evidence_type ?? null,
        cardCompany: rep.card_company ?? null, cardNumber: doneCardMap.get(rep.id) ?? null,
        payee: rep.payee ?? null,
        paymentMethod: rep.payment_method ?? null, bankName: rep.bank_name ?? null,
        accountNumber: rep.account_number ?? null, accountHolder: rep.account_holder ?? null,
        paymentRequestDate: rep.payment_request_date ?? null, settlementDate: rep.settlement_date ?? null,
        lineItems: rep.line_items ?? [], attachmentUrls: rep.attachment_urls ?? [],
        employeePosition: rep.employees?.position ?? null,
        comment: step.status === 'REJECTED' ? (step.comment ?? null) : null,
      },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const step of (doneSupplyRes.data ?? []) as any[]) {
    const req = step.supply_requests
    if (!req) continue
    if (employeeName && !req.employees?.name?.includes(employeeName)) continue
    doneItems.push({
      id: step.id, kind: 'supply',
      employeeName: req.employees?.name ?? '—',
      typeLabel: '비품/소모품',
      detail: `${req.supply_request_items?.length ?? 0}개 항목`,
      requestDate: req.created_at, actedAt: step.acted_at,
      status: step.status, isJeongyeol: step.comment === '전결',
      supplyItems: (req.supply_request_items ?? []).map((i: { id: string; category: string; description: string; estimated_amount: number | null; note: string | null; sort_order: number }) => ({
        id: i.id, category: i.category, description: i.description,
        estimated_amount: i.estimated_amount, note: i.note, sort_order: i.sort_order,
      })),
    })
  }

  doneItems.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime())

  const totalPages = Math.max(1, Math.ceil(doneItems.length / PAGE_SIZE))
  const offset = (page - 1) * PAGE_SIZE
  doneItems = doneItems.slice(offset, offset + PAGE_SIZE)

  return (
    <PendingApprovalsClient
      viewTab={viewTab} type={type} page={page} totalPages={totalPages}
      pendingItems={[]} doneItems={doneItems}
      expenseType={expenseType} month={month} dateFrom={dateFrom} dateTo={dateTo}
      keyword={keyword} employeeName={employeeName}
    />
  )
}
