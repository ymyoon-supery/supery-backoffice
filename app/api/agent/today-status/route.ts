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

  const { data: checkIn } = await admin
    .from('attendance_records')
    .select('id')
    .eq('employee_id', employee.id)
    .eq('type', 'CHECK_IN')
    .gte('recorded_at', `${kstDate}T00:00:00+09:00`)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ checked_in: !!checkIn })
}
