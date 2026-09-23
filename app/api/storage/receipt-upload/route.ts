import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: emp } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (emp?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const reportId = formData.get('reportId') as string | null
  const files = formData.getAll('files') as File[]

  if (!reportId || !files.length) {
    return NextResponse.json({ error: 'Missing reportId or files' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const paths: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop()
    const path = `expense-reports/${reportId}/${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await admin.storage.from('receipts').upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    paths.push(path)
  }

  return NextResponse.json({ paths })
}
