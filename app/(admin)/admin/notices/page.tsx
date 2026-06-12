import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminNoticesClient from './AdminNoticesClient'

export const dynamic = 'force-dynamic'

export default async function AdminNoticesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!me || me.role !== 'ADMIN') redirect('/')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: notices }, { data: employees }] = await Promise.all([
    admin.from('notices')
      .select('id, title, content, is_pinned, created_at, author_id, employees(name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
    admin.from('employees')
      .select('id, name, can_write_notice')
      .eq('is_active', true)
      .neq('role', 'ADMIN')
      .order('name'),
  ])

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">공지사항 관리</h1>
        <p className="text-sm text-gray-500 mt-1">공지사항 등록·수정·삭제 및 작성 권한을 관리합니다.</p>
      </div>
      <AdminNoticesClient
        initialNotices={(notices ?? []) as any[]}
        employees={(employees ?? []) as any[]}
      />
    </div>
  )
}
