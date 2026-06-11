import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { calcAnnualLeave } from '@/lib/annualLeave'

export const runtime = 'nodejs'

const DEDUCTS = new Set(['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP'])
const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { searchParams } = new URL(request.url)
  const employeeIdFilter = searchParams.get('employeeId') ?? undefined

  const today = new Date()
  const kstNow = new Date(today.getTime() + 9 * 60 * 60 * 1000)
  const dateStr = kstNow.toISOString().slice(0, 10).replace(/-/g, '')

  let empQuery = admin.from('employees')
    .select('id, name, email, hired_at, annual_leave_days, department_id, departments(name)')
    .eq('is_active', true)
    .order('name')
  if (employeeIdFilter) {
    empQuery = empQuery.eq('id', employeeIdFilter) as typeof empQuery
  }

  let recordsQuery = admin.from('leave_requests')
    .select('id, employee_id, leave_type, start_date, end_date, days_used, reason, is_manual, created_at')
    .eq('status', 'APPROVED')
    .order('start_date', { ascending: false })
  if (employeeIdFilter) {
    recordsQuery = recordsQuery.eq('employee_id', employeeIdFilter) as typeof recordsQuery
  }

  let usedQuery = admin.from('leave_requests')
    .select('employee_id, leave_type, days_used')
    .eq('status', 'APPROVED')
    .in('leave_type', [...DEDUCTS])
  if (employeeIdFilter) {
    usedQuery = usedQuery.eq('employee_id', employeeIdFilter) as typeof usedQuery
  }

  const [{ data: rawEmployees }, { data: leaveRecords }, { data: usedTotals }] = await Promise.all([
    empQuery, recordsQuery, usedQuery,
  ])

  const usedByEmp: Record<string, number> = {}
  for (const r of usedTotals ?? []) {
    usedByEmp[r.employee_id] = (usedByEmp[r.employee_id] ?? 0) + Number(r.days_used)
  }

  const employees = (rawEmployees ?? []).map(e => {
    const entitlement = e.hired_at
      ? calcAnnualLeave(new Date(e.hired_at), today)
      : (e.annual_leave_days ?? 15)
    const used = usedByEmp[e.id] ?? 0
    const remaining = Math.max(Math.round((entitlement - used) * 10) / 10, 0)
    const dept = e.departments as unknown as { name: string } | null
    return { ...e, entitlement, used, remaining, deptName: dept?.name ?? '' }
  })

  const filterLabel = employeeIdFilter
    ? (employees[0]?.name ?? '직원')
    : '전체'

  const empMap = new Map(employees.map(e => [e.id, e]))

  // ── Workbook ──────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SuperY WorkSync'
  wb.created = today

  const headerFill: ExcelJS.Fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' },
  }

  // ── Sheet 1: 연차 현황 ──────────────────────────────────────
  const s1 = wb.addWorksheet('연차 현황')
  s1.columns = [
    { header: '이름',       key: 'name',        width: 14 },
    { header: '이메일',     key: 'email',       width: 26 },
    { header: '부서',       key: 'dept',        width: 14 },
    { header: '보유 연차',  key: 'entitlement', width: 12 },
    { header: '사용 연차',  key: 'used',        width: 12 },
    { header: '잔여 연차',  key: 'remaining',   width: 12 },
  ]
  s1.getRow(1).font = { bold: true }
  s1.getRow(1).fill = headerFill

  for (const e of employees) {
    s1.addRow({
      name: e.name,
      email: e.email,
      dept: e.deptName,
      entitlement: e.entitlement,
      used: e.used,
      remaining: e.remaining,
    })
  }

  // ── Sheet 2: 연차 사용 내역 ─────────────────────────────────
  const s2 = wb.addWorksheet('연차 사용 내역')
  s2.columns = [
    { header: '직원',    key: 'name',      width: 14 },
    { header: '이메일',  key: 'email',     width: 26 },
    { header: '부서',    key: 'dept',      width: 14 },
    { header: '유형',    key: 'type',      width: 12 },
    { header: '시작일',  key: 'startDate', width: 13 },
    { header: '종료일',  key: 'endDate',   width: 13 },
    { header: '사용일수', key: 'days',     width: 10 },
    { header: '사유',    key: 'reason',    width: 30 },
    { header: '구분',    key: 'source',    width: 8  },
  ]
  s2.getRow(1).font = { bold: true }
  s2.getRow(1).fill = headerFill

  for (const r of leaveRecords ?? []) {
    const emp = empMap.get(r.employee_id)
    s2.addRow({
      name:      emp?.name   ?? '—',
      email:     emp?.email  ?? '—',
      dept:      emp?.deptName ?? '—',
      type:      LEAVE_LABELS[r.leave_type] ?? r.leave_type,
      startDate: r.start_date,
      endDate:   r.end_date,
      days:      DEDUCTS.has(r.leave_type) ? Number(r.days_used) : 0,
      reason:    r.reason ?? '',
      source:    r.is_manual ? '수동' : '결재',
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = encodeURIComponent(`연차사용내역_${filterLabel}_${dateStr}.xlsx`)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
