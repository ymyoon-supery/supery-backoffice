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

  // KST 07:00~23:59 범위에서만 자동 퇴근 처리
  // — 새벽 Windows 업데이트 재부팅, 점심 잠깐 재시작 등으로 인한 오퇴근 방지
  const kstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours()
  if (kstHour < 7) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: lastRecord, error: recError } = await admin
    .from('attendance_records')
    .select('type')
    .eq('employee_id', employee.id)
    .gte('recorded_at', `${kstDate}T00:00:00+09:00`)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })

  // 출근 기록이 없거나 이미 퇴근 상태면 스킵
  if (!lastRecord || !ACTIVE_TYPES.has(lastRecord.type)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { error } = await admin.from('attendance_records').insert({
    employee_id: employee.id,
    type: 'CHECK_OUT',
    recorded_at: now.toISOString(),
    note: 'PC 종료 자동 퇴근',
    is_field: false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
