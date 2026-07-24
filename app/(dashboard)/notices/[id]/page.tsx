import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import NoticeDetailClient from './NoticeDetailClient'

export const dynamic = 'force-dynamic'

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: notice }, { data: emp }] = await Promise.all([
    supabase.from('notices')
      .select('id, title, content, is_pinned, created_at, author_id, employees(name)')
      .eq('id', id)
      .single(),
    supabase.from('employees')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single(),
  ])

  if (!notice) notFound()

  const canEdit = emp?.role === 'ADMIN' || emp?.id === notice.author_id

  return (
    <div className="max-w-2xl">
      <NoticeDetailClient
        notice={{
          id: notice.id,
          title: notice.title,
          content: notice.content,
          isPinned: notice.is_pinned,
          createdAt: notice.created_at,
          authorName: (notice.employees as any)?.name ?? '—',
        }}
        canEdit={canEdit}
        isAdmin={emp?.role === 'ADMIN'}
      />
    </div>
  )
}
