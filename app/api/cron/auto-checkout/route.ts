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
  const now = new Date()
  const kstYesterday = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  kstYesterday.setDate(kstYesterday.getDate() - 1)
  const dateStr = kstYesterday.toISOString().split('T')[0]
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
    .select('employee_id')
    .eq('type', 'CHECK_OUT')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)

  const checkedOutIds = new Set(checkOuts?.map(r => r.employee_id) ?? [])
  const unprocessed = checkIns.filter(r => !checkedOutIds.has(r.employee_id))

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

    if (lastHeartbeat) {
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
        recorded_at: record.recorded_at,
        note: '근태 이상 - 퇴근 기록 없음',
        is_field: false,
        is_anomaly: true,
      })
      if (!error) anomalies++
    }
  }

  return NextResponse.json({ ok: true, autoCheckouts, anomalies })
}
