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

  // departments 를 별도 조회해서 join 모호성 오류 방지
  let empQ = admin.from('employees')
    .select('id, name, email, hired_at, annual_leave_days, department_id')
    .eq('is_active', true)
    .order('name')
  if (employeeIdFilter) empQ = empQ.eq('id', employeeIdFilter) as typeof empQ

  let recQ = admin.from('leave_requests')
    .select('id, employee_id, leave_type, start_date, end_date, days_used, reason, is_manual')
    .eq('status', 'APPROVED')
    .order('start_date', { ascending: false })
  if (employeeIdFilter) recQ = recQ.eq('employee_id', employeeIdFilter) as typeof recQ

  let usedQ = admin.from('leave_requests')
    .select('employee_id, leave_type, days_used')
    .eq('status', 'APPROVED')
    .in('leave_type', [...DEDUCTS])
  if (employeeIdFilter) usedQ = usedQ.eq('employee_id', employeeIdFilter) as typeof usedQ

  const [
    { data: rawEmployees, error: empError },
    { data: leaveRecords, error: recError },
    { data: usedTotals },
    { data: depts },
  ] = await Promise.all([
    empQ, recQ, usedQ,
    admin.from('departments').select('id, name'),
  ])

  if (empError) console.error('[excel] employees error:', empError)
  if (recError) console.error('[excel] records error:', recError)

  const deptMap = new Map((depts ?? []).map(d => [d.id, d.name as string]))

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
    return { ...e, entitlement, used, remaining, deptName: deptMap.get(e.department_id) ?? '' }
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

  // ── Sheet 1: 연차 사용 내역 (UI 조회 화면과 동일한 순서) ──────
  const s1 = wb.addWorksheet('연차 사용 내역')
  const s1ColWidths = [14, 14, 12, 13, 13, 10, 30, 8]
  s1ColWidths.forEach((w, i) => { s1.getColumn(i + 1).width = w })

  // 직원 개인 조회 시 상단에 연차 현황 요약 표시
  if (employeeIdFilter && employees.length > 0) {
    const emp = employees[0]
    const usedDays = Math.round((emp.entitlement - emp.remaining) * 10) / 10
    const infoRow = s1.addRow([
      `${emp.name}`,
      `보유연차: ${emp.entitlement}일`,
      `사용연차: ${usedDays}일`,
      `잔여연차: ${emp.remaining}일`,
    ])
    infoRow.font = { bold: true, size: 11 }
    infoRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E4FF' } }
    s1.addRow([]) // spacer
  }

  const s1Header = s1.addRow(['직원', '부서', '유형', '시작일', '종료일', '사용일수', '사유', '구분'])
  s1Header.font = { bold: true }
  s1Header.fill = headerFill

  for (const r of leaveRecords ?? []) {
    const emp = empMap.get(r.employee_id)
    s1.addRow([
      emp?.name     ?? '—',
      emp?.deptName ?? '—',
      LEAVE_LABELS[r.leave_type] ?? r.leave_type,
      r.start_date,
      r.end_date,
      DEDUCTS.has(r.leave_type) ? Number(r.days_used) : 0,
      r.reason ?? '',
      r.is_manual ? '수동' : '결재',
    ])
  }

  // ── Sheet 2: 연차 현황 (직원별 요약) ──────────────────────────
  const s2 = wb.addWorksheet('연차 현황')
  s2.columns = [
    { header: '직원',     key: 'name',        width: 14 },
    { header: '부서',     key: 'dept',        width: 14 },
    { header: '이메일',   key: 'email',       width: 26 },
    { header: '보유 연차', key: 'entitlement', width: 12 },
    { header: '사용 연차', key: 'used',        width: 12 },
    { header: '잔여 연차', key: 'remaining',   width: 12 },
  ]
  s2.getRow(1).font = { bold: true }
  s2.getRow(1).fill = headerFill

  for (const e of employees) {
    s2.addRow({
      name:        e.name,
      dept:        e.deptName,
      email:       e.email,
      entitlement: e.entitlement,
      used:        e.used,
      remaining:   e.remaining,
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
