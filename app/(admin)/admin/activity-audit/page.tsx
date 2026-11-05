import { createClient } from '@supabase/supabase-js'
import {
  detectSuspiciousActivity,
  detectScheduledPattern,
  type HeartbeatSample,
  type ScheduledRecord,
} from '@/lib/attendance/detect-suspicious'
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

  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: logs }, { data: employees }, { data: attendanceRows }] = await Promise.all([
    admin
      .from('heartbeat_debug_log')
      .select('employee_id, ts, payload')
      .gte('ts', `${date}T00:00:00+09:00`)
      .lt('ts', `${nextDay(date)}T00:00:00+09:00`)
      .order('employee_id')
      .order('ts'),
    admin.from('employees').select('id, name').eq('is_active', true),
    admin
      .from('attendance_records')
      .select('employee_id, type, recorded_at')
      .in('type', ['CHECK_OUT', 'BREAK_END'])
      .gte('recorded_at', thirtyDaysAgoISO)
      .order('recorded_at'),
  ])

  const empNameMap = Object.fromEntries((employees ?? []).map((e: { id: string; name: string }) => [e.id, e.name]))

  // heartbeat 샘플 그룹핑
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

  // 출퇴근 기록 그룹핑 (예약 패턴 탐지용)
  const KST_MS = 9 * 60 * 60 * 1000
  const attendanceByEmp = new Map<string, ScheduledRecord[]>()
  for (const row of attendanceRows ?? []) {
    if (!attendanceByEmp.has(row.employee_id)) attendanceByEmp.set(row.employee_id, [])
    const kstDate = new Date(new Date(row.recorded_at).getTime() + KST_MS).toISOString().slice(0, 10)
    attendanceByEmp.get(row.employee_id)!.push({
      date: kstDate,
      recorded_at: row.recorded_at,
      type: row.type as 'CHECK_OUT' | 'BREAK_END',
    })
  }

  // 모든 직원 ID 합집합 (heartbeat 없어도 출퇴근 기록 있으면 포함)
  const allEmpIds = new Set([...byEmp.keys(), ...attendanceByEmp.keys()])

  const results = Array.from(allEmpIds)
    .map(empId => {
      const samples = byEmp.get(empId) ?? []
      const schedRecords = attendanceByEmp.get(empId) ?? []
      return {
        empId,
        name: empNameMap[empId] ?? '알 수 없음',
        sampleCount: samples.length,
        flags: [
          ...detectSuspiciousActivity(samples),
          ...detectScheduledPattern(schedRecords),
        ],
      }
    })
    .sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name, 'ko'))

  return <ActivityAuditClient date={date} results={results} today={kstToday} />
}
