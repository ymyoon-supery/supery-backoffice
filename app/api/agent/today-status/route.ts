import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-agent-key')?.trim()
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id')
    .eq('agent_api_key', apiKey)
    .maybeSingle()

  if (empError || !employee) return NextResponse.json({ error: 'Invalid key' }, { status: 401 })

  const now = new Date()
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // 오늘 마지막 근태 레코드가 CHECK_OUT이면 퇴근 상태 → 재출근 팝업 허용
  const { data: lastRecord } = await admin
    .from('attendance_records')
    .select('type')
    .eq('employee_id', employee.id)
    .gte('recorded_at', `${kstDate}T00:00:00+09:00`)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const checkedIn = !!lastRecord && lastRecord.type !== 'CHECK_OUT'
  return NextResponse.json({ checked_in: checkedIn })
}
