import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ACTIVE_TYPES = new Set(['CHECK_IN', 'BREAK_START', 'BREAK_END', 'FIELD_START', 'FIELD_END'])

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-agent-key')?.trim()
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id')
    .eq('agent_api_key', apiKey)
    .maybeSingle()

  if (empError || !employee) return NextResponse.json({ error: 'Invalid key' }, { status: 401 })

  const now = new Date()
  const body = await req.json().catch(() => ({}))
  const reason = body.reason as string | undefined
  const lastActiveAt = body.last_active_at as string | undefined

  // 버전 업데이트 재시작 — 직전 30분 이내 'PC 종료 자동 퇴근' CHECK_OUT 취소 후 즉시 반환
  if (reason === 'agent_update') {
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
    const { data: recentCheckout } = await admin
      .from('attendance_records')
      .select('id')
      .eq('employee_id', employee.id)
      .eq('type', 'CHECK_OUT')
      .eq('note', 'PC 종료 자동 퇴근')
      .gte('recorded_at', thirtyMinAgo)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recentCheckout) {
      await admin.from('attendance_records').delete().eq('id', recentCheckout.id)
    }
    return NextResponse.json({ ok: true, cancelled: !!recentCheckout })
  }

  // 강제 종료 재부팅 시 이전 세션의 실제 마지막 활동 시각을 퇴근 시각으로 사용
  let recordedAt = now.toISOString()
  let prevSessionResolved = false
  if (reason === 'prev_session_killed' && lastActiveAt) {
    const parsed = new Date(lastActiveAt)
    if (!isNaN(parsed.getTime())) {
      const ageMs = now.getTime() - parsed.getTime()
      // 36시간 이내 과거 && 5분 이내 미래만 허용 — 시계 오류·버그로 인한 비정상 시각 차단
      if (ageMs >= -5 * 60 * 1000 && ageMs <= 36 * 60 * 60 * 1000) {
        recordedAt = parsed.toISOString()
        prevSessionResolved = true
      }
    }
  }
  // prev_session_killed인데 lastActiveAt이 없거나 범위 초과 → 이전 세션 종료 시각 불명.
  // now를 쓰면 에이전트 시작 시각이 퇴근 시각이 되어 수동 체크인 직후 오퇴근이 삽입됨.
  if (reason === 'prev_session_killed' && !prevSessionResolved) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // KST 07:00~23:59 범위에서만 자동 퇴근 처리 (퇴근 시각 기준)
  // — 새벽 Windows 업데이트 재부팅, 점심 잠깐 재시작 등으로 인한 오퇴근 방지
  const checkoutTime = new Date(recordedAt)
  const kstHour = new Date(checkoutTime.getTime() + 9 * 60 * 60 * 1000).getUTCHours()
  if (kstHour < 7) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const kstDate = new Date(checkoutTime.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: lastRecord, error: recError } = await admin
    .from('attendance_records')
    .select('type, recorded_at, note')
    .eq('employee_id', employee.id)
    .gte('recorded_at', `${kstDate}T00:00:00+09:00`)
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })

  // 출근 기록이 없거나 이미 퇴근 상태면 스킵
  if (!lastRecord || !ACTIVE_TYPES.has(lastRecord.type)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // 마지막 기록이 'PC 비활동 자동 휴식' BREAK_START이면 그 시각을 퇴근 시각으로 사용.
  // PC가 새벽에 Windows Update 등으로 종료된 경우 now를 쓰면 23:xx 오퇴근이 삽입됨.
  if (lastRecord.type === 'BREAK_START' && lastRecord.note === 'PC 비활동 자동 휴식') {
    const breakKSTHour = new Date(
      new Date(lastRecord.recorded_at).getTime() + 9 * 60 * 60 * 1000,
    ).getUTCHours()
    if (breakKSTHour < 7) {
      return NextResponse.json({ ok: true, skipped: true })
    }
    recordedAt = lastRecord.recorded_at
  }

  const { error } = await admin.from('attendance_records').insert({
    employee_id: employee.id,
    type: 'CHECK_OUT',
    recorded_at: recordedAt,
    note: 'PC 종료 자동 퇴근',
    origin: 'agent_auto',
    is_field: false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
