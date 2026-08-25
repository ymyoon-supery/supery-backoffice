import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WORKING_TYPES = new Set(['CHECK_IN', 'BREAK_END', 'FIELD_END'])
const INACTIVITY_THRESHOLD = 15 * 60
const MIN_BREAK_DURATION_SEC = 5 * 60  // 자동 BREAK_END 삽입 전 최소 휴식 시간 (짧은 idle 스파이크 방지)
const MAX_IDLE_SECONDS = 6 * 60 * 60   // idle_seconds 최대값 클램프

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-agent-key')?.trim()
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id, agent_auto_break')
    .eq('agent_api_key', apiKey)
    .maybeSingle()

  if (empError || !employee) return NextResponse.json({ error: 'Invalid key' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  // idle_seconds를 [0, 6시간]으로 클램프 — 버그/악의적 클라이언트의 큰 값이 과거 시각 삽입을 유발하지 않도록
  const rawIdle = Number(body.idle_seconds) || 0
  const idleSeconds: number = Math.max(0, Math.min(rawIdle, MAX_IDLE_SECONDS))
  const deviceName = (body.device as string) || 'Unknown'
  const now = new Date()

  // 설치 현황 last_seen_at 업데이트
  const { data: existing } = await admin
    .from('agent_installations')
    .select('id')
    .eq('employee_id', employee.id)
    .eq('device_name', deviceName)
    .maybeSingle()

  if (existing) {
    await admin
      .from('agent_installations')
      .update({ last_seen_at: now.toISOString(), app_version: body.version || null })
      .eq('id', existing.id)
  } else {
    await admin.from('agent_installations').insert({
      employee_id: employee.id,
      device_name: deviceName,
      app_version: (body.version as string) || null,
      registered_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    })
  }

  // 자동 휴식 감지가 꺼진 직원(외근직 등)은 이하 로직 스킵
  const autoBreakEnabled = employee.agent_auto_break !== false

  if (autoBreakEnabled) {
    // 오늘 마지막 근태 기록 조회
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: lastRecord } = await admin
      .from('attendance_records')
      .select('type, recorded_at, note')
      .eq('employee_id', employee.id)
      .gte('recorded_at', `${kstDate}T00:00:00+09:00`)
      .order('recorded_at', { ascending: false })
      .order('id', { ascending: false })  // 동일 recorded_at 시 id 높은 것(나중 삽입) 우선
      .limit(1)
      .maybeSingle()

    const lastType = lastRecord?.type ?? null

    // 15분 이상 비활동 → 자동 휴식 시작
    if (lastType && WORKING_TYPES.has(lastType) && idleSeconds >= INACTIVITY_THRESHOLD) {
      const lastActivityAt = new Date(now.getTime() - idleSeconds * 1000)
      const lastRecordAt = new Date(lastRecord!.recorded_at)

      // Stale heartbeat 방지: 비활동 시작 시점이 마지막 기록보다 이전이면 지연 도착한 heartbeat → 스킵
      // (예: BREAK_END 직후 도착한 오래된 high-idle heartbeat가 새 BREAK_START를 만드는 것 차단)
      if (lastActivityAt >= lastRecordAt) {
        const breakStartAt = new Date(Math.max(lastActivityAt.getTime(), lastRecordAt.getTime()))

        // Race Condition 방지: 최근 30분 내 자동 BREAK_START가 이미 있으면 스킵
        const recentWindow = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
        const { data: recentAutoBreak } = await admin
          .from('attendance_records')
          .select('id')
          .eq('employee_id', employee.id)
          .eq('type', 'BREAK_START')
          .eq('note', 'PC 비활동 자동 휴식')
          .gte('recorded_at', recentWindow)
          .maybeSingle()

        if (!recentAutoBreak) {
          await admin.from('attendance_records').insert({
            employee_id: employee.id,
            type: 'BREAK_START',
            recorded_at: breakStartAt.toISOString(),
            note: 'PC 비활동 자동 휴식',
            is_field: false,
          })
        }
      }
    }

    // 활동 재개 감지 → 자동 업무 복귀
    // note 정확 일치로 수동 기록과 구분 + 최소 5분 휴식 후에만 삽입 (idle 스파이크로 인한 무한 BREAK 루프 방지)
    if (
      lastType === 'BREAK_START' &&
      lastRecord?.note === 'PC 비활동 자동 휴식' &&
      idleSeconds < 60
    ) {
      const breakDurationSec = (now.getTime() - new Date(lastRecord!.recorded_at).getTime()) / 1000
      if (breakDurationSec >= MIN_BREAK_DURATION_SEC) {
        await admin.from('attendance_records').insert({
          employee_id: employee.id,
          type: 'BREAK_END',
          recorded_at: now.toISOString(),
          note: 'PC 활동 감지 자동 업무 복귀',
          is_field: false,
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
