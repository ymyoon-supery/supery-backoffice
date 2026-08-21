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
  const deviceName = (body.device as string) || 'Unknown'
  const now = new Date().toISOString()

  const { data: existing } = await admin
    .from('agent_installations')
    .select('id')
    .eq('employee_id', employee.id)
    .eq('device_name', deviceName)
    .maybeSingle()

  console.log('[agent/register] employee_id:', employee.id, 'device:', deviceName, 'existing:', existing?.id ?? null)

  if (existing) {
    const { error } = await admin
      .from('agent_installations')
      .update({ os_info: body.os || null, app_version: body.version || null, last_seen_at: now })
      .eq('id', existing.id)
    console.log('[agent/register] update error:', error)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error, data } = await admin.from('agent_installations').insert({
      employee_id: employee.id,
      device_name: deviceName,
      os_info: (body.os as string) || null,
      app_version: (body.version as string) || null,
      registered_at: now,
      last_seen_at: now,
    }).select()
    console.log('[agent/register] insert error:', error, 'data:', data)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
