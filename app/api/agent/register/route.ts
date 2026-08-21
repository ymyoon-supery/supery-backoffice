import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-agent-key')?.trim()
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee } = await admin
    .from('employees')
    .select('id')
    .eq('agent_api_key', apiKey)
    .single()

  if (!employee) return NextResponse.json({ error: 'Invalid key' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  await admin.from('agent_installations').upsert({
    employee_id: employee.id,
    device_name: (body.device as string) || 'Unknown',
    os_info: (body.os as string) || null,
    app_version: (body.version as string) || null,
    registered_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'employee_id,device_name' })

  return NextResponse.json({ ok: true })
}
