import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  decideAgentHeartbeat,
  type AgentHeartbeatCtx,
  type AgentHeartbeatInput,
} from '@/lib/attendance/decide-heartbeat'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const INACTIVITY_THRESHOLD = 15 * 60
const MAX_IDLE_SECONDS = 6 * 60 * 60

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-agent-key')?.trim()
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id, agent_auto_break, last_agent_heartbeat, last_activity_at')
    .eq('agent_api_key', apiKey)
    .maybeSingle()

  if (empError || !employee) return NextResponse.json({ error: 'Invalid key' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  // idle_seconds를 [0, 6시간]으로 클램프 — 버그/악의적 클라이언트의 큰 값이 과거 시각 삽입을 유발하지 않도록
  const rawIdle = Number(body.idle_seconds) || 0
  const idleSeconds: number = Math.max(0, Math.min(rawIdle, MAX_IDLE_SECONDS))
  // activity_ticks: 에이전트 v1.3.12+에서 전송. 60초 구간 내 15초마다 샘플링 → idle<60s인 횟수(0~4).
  // null이면 구형 에이전트 → isConfirmedActive gate 제거(idle<60 자체가 충분한 필터)
  const activityTicks: number | null = typeof body.activity_ticks === 'number' ? (body.activity_ticks as number) : null
  const deviceName = (body.device as string) || 'Unknown'
  const now = new Date()

  // 절전 wake heartbeat 전용: suspend_at - idle_at_suspend = 실제 마지막 활동 시각
  const suspendAtStr = body.suspend_at as string | undefined
  const idleAtSuspend = Math.max(0, Math.min(Number(body.idle_at_suspend) || 0, MAX_IDLE_SECONDS))
  const suspendAtMs = suspendAtStr ? new Date(suspendAtStr).getTime() : NaN
  const lastActivityBeforeSleep: Date | null =
    !isNaN(suspendAtMs) ? new Date(suspendAtMs - idleAtSuspend * 1000) : null

  // 설치 현황 last_seen_at 업데이트 (UPDATE-first 패턴)
  const { data: updated } = await admin
    .from('agent_installations')
    .update({ last_seen_at: now.toISOString(), app_version: body.version || null })
    .eq('employee_id', employee.id)
    .eq('device_name', deviceName)
    .select('id')

  if (!updated || updated.length === 0) {
    await admin.from('agent_installations').insert({
      employee_id: employee.id,
      device_name: deviceName,
      app_version: (body.version as string) || null,
      registered_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    })
  }

  const autoBreakEnabled = employee.agent_auto_break !== false

  if (autoBreakEnabled) {
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const yesterdayKSTDate = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const todayStart = `${kstDate}T00:00:00+09:00`
    const yesterdayStart = `${yesterdayKSTDate}T00:00:00+09:00`

    // 오늘 기록(전체) + 어제 기록(최대 20개) 동시 조회 — race guard는 전체 오늘 기록을 참조
    const [{ data: todayRaw }, { data: yestRaw }] = await Promise.all([
      admin
        .from('attendance_records')
        .select('id, type, recorded_at, note, origin')
        .eq('employee_id', employee.id)
        .gte('recorded_at', todayStart)
        .order('recorded_at', { ascending: false })
        .order('id', { ascending: false }),
      admin
        .from('attendance_records')
        .select('id, type, recorded_at, note, origin')
        .eq('employee_id', employee.id)
        .gte('recorded_at', yesterdayStart)
        .lt('recorded_at', todayStart)
        .order('recorded_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(20),
    ])

    const todayRecords = todayRaw ?? []
    const yestLastRecord = yestRaw?.[0] ?? null
    const yestCheckout = yestRaw?.find(r => r.type === 'CHECK_OUT') ?? null

    const ctx: AgentHeartbeatCtx = {
      kstDate,
      yesterdayKSTDate,
      now,
      lastHeartbeat: employee.last_agent_heartbeat as string | null,
      lastActivityAt: employee.last_activity_at as string | null,
      todayRecords,
      yestLastRecord,
      yestCheckout,
    }

    const input: AgentHeartbeatInput = {
      idleSeconds,
      activityTicks,
      suspendAtStr,
      lastActivityBeforeSleep,
    }

    const { decisions, logs } = decideAgentHeartbeat(ctx, input)

    // 결정 실행
    for (const d of decisions) {
      if (d.action === 'insert') {
        await admin.from('attendance_records').insert({
          employee_id: employee.id,
          type: d.type,
          recorded_at: d.recorded_at,
          note: d.note,
          origin: d.origin,
          is_field: false,
        })
      } else {
        await admin
          .from('attendance_records')
          .update({ recorded_at: d.recorded_at, note: d.note })
          .eq('id', d.id)
      }
    }

    // 디버그 로그 (fire-and-forget — 응답 지연 없음)
    void Promise.resolve(admin.from('heartbeat_debug_log').insert({
      employee_id: employee.id,
      payload: {
        idle_seconds: idleSeconds,
        activity_ticks: activityTicks,
        suspend_at: suspendAtStr ?? null,
        version: body.version ?? null,
      },
      last_type: todayRecords[0]?.type ?? null,
      logs,
    })).catch(() => {})
  }

  // last_heartbeat: cron용 마지막 heartbeat 시각
  // last_activity_at: 실제 사람이 키보드/마우스를 사용한 마지막 시각
  const activityUpdate: Record<string, string> = {
    last_heartbeat: now.toISOString(),
    last_agent_heartbeat: now.toISOString(),
  }
  if (!suspendAtStr && idleSeconds < INACTIVITY_THRESHOLD) {
    activityUpdate.last_activity_at = new Date(now.getTime() - idleSeconds * 1000).toISOString()
  }
  await admin.from('employees').update(activityUpdate).eq('id', employee.id)

  return NextResponse.json({ ok: true })
}
