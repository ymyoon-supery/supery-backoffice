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
  const nowKst = new Date(Date.now() + 9 * 3600000)
  nowKst.setUTCDate(nowKst.getUTCDate() - 1)
  const dateStr = nowKst.toISOString().slice(0, 10)
  const dayStart = `${dateStr}T00:00:00+09:00`
  const dayEnd = `${dateStr}T23:59:59.999+09:00`

  const { data: checkIns } = await supabase
    .from('attendance_records')
    .select('id, employee_id, recorded_at')
    .eq('type', 'CHECK_IN')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)

  if (!checkIns || checkIns.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  // 야근으로 자정을 넘어 퇴근한 경우를 포함하기 위해 dayEnd + 10h까지 조회
  // (23:59 KST 이후 퇴근해도 미처리로 분류되어 중복 CHECK_OUT 삽입 방지)
  const checkoutQueryEnd = new Date(new Date(dayEnd).getTime() + 10 * 3600000).toISOString()
  const { data: checkOuts } = await supabase
    .from('attendance_records')
    .select('employee_id, recorded_at')
    .eq('type', 'CHECK_OUT')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', checkoutQueryEnd)

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

  // PC 비활동 자동 휴식 BREAK_START가 있으면 그 시각이 실질적 퇴근 시각
  // (PC를 끄지 않고 퇴근 시 heartbeat는 계속 오지만 비활동 감지 시각이 정확한 이탈 시각)
  // 단, 그 이후 BREAK_END가 있으면(복귀 후 퇴근) BREAK_START는 퇴근 시각이 아님
  const { data: lastBreakStarts } = await supabase
    .from('attendance_records')
    .select('employee_id, recorded_at')
    .in('employee_id', employeeIds)
    .eq('type', 'BREAK_START')
    .eq('note', 'PC 비활동 자동 휴식')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)
    .order('recorded_at', { ascending: false })

  const lastBreakStartMap = new Map<string, string>()
  for (const bs of lastBreakStarts ?? []) {
    if (!lastBreakStartMap.has(bs.employee_id)) {
      lastBreakStartMap.set(bs.employee_id, bs.recorded_at)
    }
  }

  // 직원별 마지막 BREAK_END 시각 — BREAK_START 이후 복귀 여부 판별용
  const { data: lastBreakEnds } = await supabase
    .from('attendance_records')
    .select('employee_id, recorded_at')
    .in('employee_id', employeeIds)
    .eq('type', 'BREAK_END')
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)
    .order('recorded_at', { ascending: false })

  const lastBreakEndMap = new Map<string, string>()
  for (const be of lastBreakEnds ?? []) {
    if (!lastBreakEndMap.has(be.employee_id)) {
      lastBreakEndMap.set(be.employee_id, be.recorded_at)
    }
  }

  const { data: employees } = await supabase
    .from('employees')
    .select('id, last_heartbeat, last_activity_at')
    .in('id', employeeIds)

  const heartbeatMap = new Map(employees?.map(e => [e.id, e.last_heartbeat as string | null]) ?? [])
  const lastActivityMap = new Map(employees?.map(e => [e.id, e.last_activity_at as string | null]) ?? [])

  let autoCheckouts = 0
  let anomalies = 0
  const failures: { employeeId: string; reason: string }[] = []

  for (const record of unprocessed) {
    const lastHeartbeat = heartbeatMap.get(record.employee_id)
    const lastActivityAt = lastActivityMap.get(record.employee_id)
    const lastBreakStart = lastBreakStartMap.get(record.employee_id)

    const dayStartMs = new Date(dayStart).getTime()
    const dayEndMs = new Date(dayEnd).getTime()
    const heartbeatMs = lastHeartbeat ? new Date(lastHeartbeat).getTime() : null
    // PC를 끄지 않고 퇴근하면 heartbeat가 자정을 넘어 계속 오므로 dayEnd 이후 값도 유효 신호로 처리
    const heartbeatActive = heartbeatMs !== null && heartbeatMs >= dayStartMs

    // 퇴근 시각 결정 우선순위:
    // 1. effectiveBreakStart: 비활동 감지 시각 (suspend wake로 인한 BREAK_END가 없는 경우)
    // 2. last_activity_at: 실제 마지막 키보드/마우스 활동 시각 (절전 wake 제외, dayEnd 캡핑)
    // 3. last_heartbeat: heartbeat 기반 fallback (dayEnd 캡핑)
    // 4. 없으면 anomaly 23:59
    const lastBreakEnd = lastBreakEndMap.get(record.employee_id)
    const effectiveBreakStart =
      lastBreakStart && (!lastBreakEnd || new Date(lastBreakStart) > new Date(lastBreakEnd))
        ? lastBreakStart
        : null

    // last_activity_at: 당일 범위이거나 dayEnd 이후(자정 초과 시 캡핑)
    const lastActivityMs = lastActivityAt ? new Date(lastActivityAt).getTime() : null
    const activityCheckoutAt = lastActivityMs !== null && lastActivityMs >= dayStartMs
      ? (lastActivityMs <= dayEndMs ? lastActivityAt! : dayEnd)
      : null

    // heartbeat: 당일 이후면 dayEnd 캡핑
    const heartbeatCheckoutAt = heartbeatActive
      ? (heartbeatMs! <= dayEndMs ? lastHeartbeat! : dayEnd)
      : null

    const checkoutAt = effectiveBreakStart ?? activityCheckoutAt ?? heartbeatCheckoutAt

    if (checkoutAt) {
      const note = effectiveBreakStart
        ? '자동 퇴근 (PC 비활동 감지 시각 기준)'
        : activityCheckoutAt
          ? (lastActivityMs! > dayEndMs ? '자동 퇴근 (PC 미종료 - 마지막 활동 기준 자정 마감)' : '자동 퇴근 (마지막 활동 기준)')
          : heartbeatMs! > dayEndMs
            ? '자동 퇴근 (PC 미종료 - 자정 기준 마감)'
            : '자동 퇴근 (마지막 활동 기준)'
      const { error } = await supabase.from('attendance_records').insert({
        employee_id: record.employee_id,
        type: 'CHECK_OUT',
        recorded_at: checkoutAt,
        note,
        is_field: false,
        is_anomaly: false,
      })
      if (!error) {
        autoCheckouts++
        if (heartbeatActive) {
          const { error: clearError } = await supabase
            .from('employees')
            .update({ last_heartbeat: null })
            .eq('id', record.employee_id)
          if (clearError) {
            console.error('[auto-checkout] heartbeat clear failed for', record.employee_id, clearError.message)
            failures.push({ employeeId: record.employee_id, reason: `heartbeat clear: ${clearError.message}` })
          }
        }
      } else {
        failures.push({ employeeId: record.employee_id, reason: error.message })
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
      if (!error) {
        anomalies++
      } else {
        failures.push({ employeeId: record.employee_id, reason: error.message })
      }
    }
  }

  return NextResponse.json({ ok: true, autoCheckouts, anomalies, failures })
}
