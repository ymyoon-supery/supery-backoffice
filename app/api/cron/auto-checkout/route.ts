import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Cron runs at 02:00 KST — process previous KST day
  // Use UTC arithmetic after shifting to KST to avoid server-TZ dependency
  const kstYesterdayMs = Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000
  const dateStr = new Date(kstYesterdayMs).toISOString().slice(0, 10)
  const dayStart = `${dateStr}T00:00:00+09:00`
  const dayEnd = `${dateStr}T23:59:59+09:00`

  const { data: checkIns } = await supabase
    .from('attendance_records')
    .select('id, employee_id, recorded_at')
    .eq('type', 'CHECK_IN')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)

  if (!checkIns || checkIns.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const { data: checkOuts } = await supabase
    .from('attendance_records')
    .select('employee_id, recorded_at')
    .eq('type', 'CHECK_OUT')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)

  // Group check-outs by employee for fast lookup
  const checkOutsByEmployee = new Map<string, Date[]>()
  for (const co of checkOuts ?? []) {
    if (!checkOutsByEmployee.has(co.employee_id)) checkOutsByEmployee.set(co.employee_id, [])
    checkOutsByEmployee.get(co.employee_id)!.push(new Date(co.recorded_at))
  }

  // Find the last CHECK_IN per employee, then check if a CHECK_OUT exists after it.
  // Supports mid-day leave-and-return: employee is unprocessed only when their
  // final CHECK_IN has no subsequent CHECK_OUT.
  const lastCheckInByEmployee = new Map<string, typeof checkIns[0]>()
  for (const ci of checkIns) {
    const prev = lastCheckInByEmployee.get(ci.employee_id)
    if (!prev || new Date(ci.recorded_at) > new Date(prev.recorded_at)) {
      lastCheckInByEmployee.set(ci.employee_id, ci)
    }
  }

  const unprocessed = [...lastCheckInByEmployee.values()].filter(ci => {
    const outs = checkOutsByEmployee.get(ci.employee_id) ?? []
    return !outs.some(outTime => outTime > new Date(ci.recorded_at))
  })

  if (unprocessed.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const employeeIds = unprocessed.map(r => r.employee_id)
  const { data: employees } = await supabase
    .from('employees')
    .select('id, last_heartbeat')
    .in('id', employeeIds)

  const heartbeatMap = new Map(employees?.map(e => [e.id, e.last_heartbeat as string | null]) ?? [])

  let autoCheckouts = 0
  let anomalies = 0

  for (const record of unprocessed) {
    const lastHeartbeat = heartbeatMap.get(record.employee_id)

    const heartbeatInRange =
      lastHeartbeat &&
      lastHeartbeat >= dayStart &&
      lastHeartbeat <= dayEnd

    if (heartbeatInRange) {
      const { error } = await supabase.from('attendance_records').insert({
        employee_id: record.employee_id,
        type: 'CHECK_OUT',
        recorded_at: lastHeartbeat,
        note: '자동 퇴근 (마지막 활동 기준)',
        is_field: false,
        is_anomaly: false,
      })
      if (!error) {
        autoCheckouts++
        await supabase
          .from('employees')
          .update({ last_heartbeat: null })
          .eq('id', record.employee_id)
      }
    } else {
      const { error } = await supabase.from('attendance_records').insert({
        employee_id: record.employee_id,
        type: 'CHECK_OUT',
        recorded_at: dayEnd,
        note: '근태 이상 - 퇴근 기록 없음 (자동 마감)',
        is_field: false,
        is_anomaly: true,
      })
      if (!error) anomalies++
    }
  }

  return NextResponse.json({ ok: true, autoCheckouts, anomalies })
}
