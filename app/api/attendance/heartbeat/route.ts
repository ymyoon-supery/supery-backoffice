import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  decideBrowserHeartbeat,
  type BrowserHeartbeatCtx,
} from '@/lib/attendance/decide-heartbeat'

// 5분 이내에 PC 에이전트 heartbeat가 있으면 브라우저 휴식 감지 생략
// (에이전트가 더 정확한 idle_seconds 데이터를 가지고 있음)
const AGENT_ACTIVE_WINDOW_MS = 5 * 60 * 1000

export async function POST(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [settingsRes, employeeRes] = await Promise.all([
    admin.from('company_settings').select('inactivity_minutes').single(),
    supabase.from('employees').select('id, last_heartbeat, agent_auto_break').eq('auth_user_id', user.id).single(),
  ])

  const { data: employee } = employeeRes
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const INACTIVITY_MS = (settingsRes.data?.inactivity_minutes ?? 15) * 60 * 1000

  const now = new Date()
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dayStart = `${kstDate}T00:00:00+09:00`

  const { data: lastRecord } = await supabase
    .from('attendance_records')
    .select('id, type, recorded_at, note, origin')
    .eq('employee_id', employee.id)
    .gte('recorded_at', dayStart)
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  // PC 에이전트 활성 여부: last_heartbeat가 5분 이내이고 agent_auto_break가 켜져 있는 경우
  const agentIsActive =
    employee.agent_auto_break !== false &&
    !!employee.last_heartbeat &&
    now.getTime() - new Date(employee.last_heartbeat).getTime() < AGENT_ACTIVE_WINDOW_MS

  const ctx: BrowserHeartbeatCtx = {
    kstDate,
    now,
    lastHeartbeat: employee.last_heartbeat as string | null,
    lastRecord: lastRecord ?? null,
    inactivityMs: INACTIVITY_MS,
    agentIsActive,
  }

  const { decisions } = decideBrowserHeartbeat(ctx)

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
    }
  }

  // last_heartbeat는 WORKING_TYPE 상태일 때만 갱신 (에이전트 last_heartbeat와 충돌 방지)
  const WORKING_TYPES = new Set(['CHECK_IN', 'BREAK_END', 'FIELD_END'])
  if (lastRecord && WORKING_TYPES.has(lastRecord.type)) {
    await supabase
      .from('employees')
      .update({ last_heartbeat: now.toISOString() })
      .eq('id', employee.id)
  }

  return NextResponse.json({ ok: true })
}
