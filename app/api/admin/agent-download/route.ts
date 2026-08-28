import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: emp } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!emp || emp.role !== 'ADMIN') return new NextResponse('Forbidden', { status: 403 })

  const admin = adminClient()

  const { data: settings } = await admin
    .from('company_settings')
    .select('agent_exe_storage_path')
    .single()

  if (!settings?.agent_exe_storage_path) {
    return new NextResponse('배포된 버전 없음', { status: 404 })
  }

  const { data: signed } = await admin.storage
    .from('agent-releases')
    .createSignedUrl(settings.agent_exe_storage_path, 300)

  if (!signed?.signedUrl) {
    return new NextResponse('다운로드 URL 생성 실패', { status: 500 })
  }

  const fileResp = await fetch(signed.signedUrl)
  if (!fileResp.ok) return new NextResponse('Storage 오류', { status: 502 })

  return new NextResponse(fileResp.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="SuperyAgent.exe"',
    },
  })
}
