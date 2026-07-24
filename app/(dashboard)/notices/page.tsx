import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pin, PenLine } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NoticesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: emp }, { data: notices }] = await Promise.all([
    supabase.from('employees')
      .select('id, role, can_write_notice')
      .eq('auth_user_id', user.id)
      .single(),
    supabase.from('notices')
      .select('id, title, is_pinned, created_at, employees(name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const canWrite = emp?.role === 'ADMIN' || emp?.can_write_notice === true

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">공지사항</h1>
        {canWrite && (
          <Link
            href="/notices/new"
            className="flex items-center gap-1.5 text-sm text-white bg-primary px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <PenLine size={14} />
            새 공지 작성
          </Link>
        )}
      </div>

      {(notices ?? []).length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-gray-100">
          등록된 공지사항이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {(notices as any[]).map((n) => (
            <Link
              key={n.id}
              href={`/notices/${n.id}`}
              className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50/50 transition-colors ${n.is_pinned ? 'bg-primary/[0.03]' : ''}`}
            >
              {n.is_pinned
                ? <Pin size={13} className="text-primary mt-0.5 shrink-0" />
                : <span className="w-[13px] shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${n.is_pinned ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(n.employees as any)?.name} · {format(new Date(n.created_at), 'yyyy.MM.dd', { locale: ko })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
