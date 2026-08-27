import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-agent-key')?.trim()
  if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: employee } = await admin
    .from('employees')
    .select('id')
    .eq('agent_api_key', apiKey)
    .maybeSingle()

  if (!employee) return NextResponse.json({ error: 'Invalid key' }, { status: 401 })

  const { data: settings } = await admin
    .from('company_settings')
    .select('agent_version, agent_exe_storage_path')
    .single()

  const version = settings?.agent_version ?? null
  const storagePath = settings?.agent_exe_storage_path ?? null

  if (!version || !storagePath) {
    return NextResponse.json({ version: null, download_url: null })
  }

  // 5분짜리 서명 URL — 에이전트가 다운로드할 충분한 시간
  const { data: signed } = await admin.storage
    .from('agent-releases')
    .createSignedUrl(storagePath, 300)

  return NextResponse.json({
    version,
    download_url: signed?.signedUrl ?? null,
  })
}
