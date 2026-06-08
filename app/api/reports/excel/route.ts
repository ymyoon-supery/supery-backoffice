import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee || employee.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? format(new Date(), 'yyyy-MM-dd')
  const to = searchParams.get('to') ?? from

  const { data: records } = await supabase
    .from('attendance_records')
    .select(`
      employee_id, type, recorded_at, is_field, location,
      employees ( name, email, departments(name) )
    `)
    .gte('recorded_at', `${from}T00:00:00+09:00`)
    .lte('recorded_at', `${to}T23:59:59+09:00`)
    .order('recorded_at', { ascending: true })

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SuperY WorkSync'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('근태현황')

  sheet.columns = [
    { header: '이름', key: 'name', width: 15 },
    { header: '이메일', key: 'email', width: 25 },
    { header: '부서', key: 'department', width: 15 },
    { header: '날짜', key: 'date', width: 12 },
    { header: '출근', key: 'checkIn', width: 10 },
    { header: '퇴근', key: 'checkOut', width: 10 },
    { header: '근무시간(분)', key: 'workMinutes', width: 14 },
    { header: '재택/외근', key: 'workType', width: 12 },
    { header: '위치', key: 'location', width: 30 },
  ]

  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F0FE' },
  }

  // Group by employee + date
  type DayKey = string
  type DayRecord = { name: string; email: string; dept: string; checkIn?: string; checkOut?: string; isField: boolean; location?: string }
  const byDay = new Map<DayKey, DayRecord>()

  for (const r of records ?? []) {
    const emp = r.employees as unknown as { name: string; email: string; departments: { name: string } | null } | null
    if (!emp) continue
    const kstDate = format(new Date(r.recorded_at), 'yyyy-MM-dd')
    const key = `${r.employee_id}:${kstDate}`
    const existing = byDay.get(key) ?? {
      name: emp.name,
      email: emp.email,
      dept: emp.departments?.name ?? '',
      isField: false,
    }
    if (r.type === 'CHECK_IN') {
      existing.checkIn = format(new Date(r.recorded_at), 'HH:mm')
      existing.isField = r.is_field
      existing.location = r.location ?? undefined
    } else {
      existing.checkOut = format(new Date(r.recorded_at), 'HH:mm')
    }
    byDay.set(key, existing)
  }

  for (const [key, day] of byDay) {
    const date = key.split(':')[1]
    let workMinutes = 0
    if (day.checkIn && day.checkOut) {
      const [ih, im] = day.checkIn.split(':').map(Number)
      const [oh, om] = day.checkOut.split(':').map(Number)
      workMinutes = (oh * 60 + om) - (ih * 60 + im)
    }
    sheet.addRow({
      name: day.name,
      email: day.email,
      department: day.dept,
      date,
      checkIn: day.checkIn ?? '',
      checkOut: day.checkOut ?? '',
      workMinutes: workMinutes > 0 ? workMinutes : '',
      workType: day.isField ? '외근' : '사무실',
      location: day.location ?? '',
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="attendance_${from}_${to}.xlsx"`,
    },
  })
}
