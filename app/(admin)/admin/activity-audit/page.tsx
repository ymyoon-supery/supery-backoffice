import { createClient } from '@supabase/supabase-js'
import { detectSuspiciousActivity, type HeartbeatSample } from '@/lib/attendance/detect-suspicious'
import ActivityAuditClient from './ActivityAuditClient'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default async function ActivityAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const date = params.date ?? kstToday

  const [{ data: logs }, { data: employees }] = await Promise.all([
    admin
      .from('heartbeat_debug_log')
      .select('employee_id, ts, payload')
      .gte('ts', `${date}T00:00:00+09:00`)
      .lt('ts', `${nextDay(date)}T00:00:00+09:00`)
      .order('employee_id')
      .order('ts'),
    admin.from('employees').select('id, name').eq('is_active', true),
  ])

  const empNameMap = Object.fromEntries((employees ?? []).map((e: { id: string; name: string }) => [e.id, e.name]))

  const byEmp = new Map<string, HeartbeatSample[]>()
  for (const row of logs ?? []) {
    if (!byEmp.has(row.employee_id)) byEmp.set(row.employee_id, [])
    const p = row.payload as Record<string, unknown>
    byEmp.get(row.employee_id)!.push({
      ts: row.ts,
      idle: typeof p?.idle_seconds === 'number' ? p.idle_seconds : 9999,
      mouse_px: typeof p?.mouse_px === 'number' ? p.mouse_px : null,
      key_count: typeof p?.key_count === 'number' ? p.key_count : null,
      activity_ticks: typeof p?.activity_ticks === 'number' ? p.activity_ticks : null,
    })
  }

  const results = Array.from(byEmp.entries())
    .map(([empId, samples]) => ({
      empId,
      name: empNameMap[empId] ?? '알 수 없음',
      sampleCount: samples.length,
      flags: detectSuspiciousActivity(samples),
    }))
    .sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name, 'ko'))

  return <ActivityAuditClient date={date} results={results} today={kstToday} />
}
