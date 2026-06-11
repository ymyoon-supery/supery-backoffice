import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminApprovalClient from '@/components/admin/AdminApprovalClient'

const PAGE_SIZE = 20

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
  typeLabel: string
  detail: string
  requestDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comment?: string | null
}

export default async function AdminApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string; period?: string; sort?: string; page?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee || employee.role !== 'ADMIN') redirect('/approval/inbox')

  const params = await searchParams
  const tab    = params.tab    === 'done'    ? 'done'    : 'pending'
  const type   = ['leave', 'expense', 'home_location'].includes(params.type ?? '') ? params.type! : 'all'
  const period = ['day',   'week',  'month' ].includes(params.period ?? '') ? params.period! : 'all'
  const sort   = params.sort  === 'asc'  ? 'asc'  : 'desc'
  const page   = Math.max(1, parseInt(params.page ?? '1') || 1)

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

  // ── Leave steps ──────────────────────────────────────────────
  let leaveItems: ApprovalItem[] = []
  if (type !== 'expense' && type !== 'home_location') {
    let q = admin
      .from('leave_approval_steps')
      .select(`
        id, status, comment,
        leave_requests (
          id, leave_type, start_date, end_date, days_used, created_at,
          employees ( name )
        )
      `)
      .eq('approver_id', employee.id)
      .in('status', statusFilter)
    if (fromDate) q = q.gte('created_at', fromDate)

    const { data } = await q
    leaveItems = (data ?? []).flatMap((s: any) => {
      const req = s.leave_requests
      if (!req) return []
      return [{
        stepId:       s.id,
        kind:         'leave' as const,
        requestId:    req.id,
        employeeName: req.employees?.name ?? '—',
        typeLabel:    LEAVE_LABELS[req.leave_type] ?? req.leave_type,
        detail:       `${req.days_used}일 · ${req.start_date}${req.start_date !== req.end_date ? ` ~ ${req.end_date}` : ''}`,
        requestDate:  req.created_at,
        status:       s.status,
        comment:      s.comment,
      }]
    })
  }

  // ── Expense steps ─────────────────────────────────────────────
  let expenseItems: ApprovalItem[] = []
  if (type !== 'leave' && type !== 'home_location') {
    let q = admin
      .from('expense_approval_steps')
      .select(`
        id, status,
        expense_reports (
          id, title, amount, category, created_at,
          employees ( name )
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
        stepId:       s.id,
        kind:         'expense' as const,
        requestId:    rep.id,
        employeeName: rep.employees?.name ?? '—',
        typeLabel:    EXPENSE_LABELS[rep.category] ?? rep.category,
        detail:       `${rep.title} · ${Number(rep.amount).toLocaleString()}원`,
        requestDate:  rep.created_at,
        status:       s.status,
      }]
    })
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
    />
  )
}
