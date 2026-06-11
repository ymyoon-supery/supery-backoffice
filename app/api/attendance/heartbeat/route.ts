import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const INACTIVITY_MS = 15 * 60 * 1000

// Types where employee is actively working (not on break/field/done)
const WORKING_TYPES = new Set(['CHECK_IN', 'BREAK_END', 'FIELD_END'])

export async function POST(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: employee } = await supabase
    .from('employees')
    .select('id, last_heartbeat')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dayStart = `${kstDate}T00:00:00+09:00`

  // Today's last attendance record
  const { data: lastRecord } = await supabase
    .from('attendance_records')
    .select('type, recorded_at, note')
    .eq('employee_id', employee.id)
    .gte('recorded_at', dayStart)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastType = lastRecord?.type ?? null

  // Detect missed break: employee was working but browser went away
  if (employee.last_heartbeat && lastType && WORKING_TYPES.has(lastType)) {
    const lastHeartbeatMs = new Date(employee.last_heartbeat).getTime()
    const lastRecordMs = new Date(lastRecord!.recorded_at).getTime()

    // Effective inactivity = time since the LATER of (last heartbeat, last working event)
    // This prevents false positives when employee just returned from a frontend-detected break:
    // in that case lastRecord (BREAK_END) is very recent even though last_heartbeat is stale
    const lastActiveMs = Math.max(lastHeartbeatMs, lastRecordMs)
    const inactiveMs = now.getTime() - lastActiveMs

    if (inactiveMs > INACTIVITY_MS) {
      const breakStartTime = new Date(lastActiveMs + INACTIVITY_MS)

      // Retroactively insert BREAK_START at (last active + 15 min)
      await admin.from('attendance_records').insert({
        employee_id: employee.id,
        type: 'BREAK_START',
        recorded_at: breakStartTime.toISOString(),
        note: '자동 휴식 (비활동 감지)',
        is_field: false,
      })

      // Insert BREAK_END at now (employee just came back)
      await admin.from('attendance_records').insert({
        employee_id: employee.id,
        type: 'BREAK_END',
        recorded_at: now.toISOString(),
        note: '자동 업무 복귀',
        is_field: false,
      })
    }
  }

  // Update last_heartbeat
  await supabase
    .from('employees')
    .update({ last_heartbeat: now.toISOString() })
    .eq('id', employee.id)

  return NextResponse.json({ ok: true })
}
