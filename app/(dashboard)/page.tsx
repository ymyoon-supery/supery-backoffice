import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pin, ChevronRight, AlarmClock } from 'lucide-react'
import LogoImage from '@/components/ui/LogoImage'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: employee }, { data: notices }] = await Promise.all([
    supabase.from('employees').select('name, role, remaining_leaves').eq('auth_user_id', user.id).single(),
    admin.from('notices')
      .select('id, title, is_pinned, created_at, employees(name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return (
    <div className="max-w-2xl space-y-6">

      {/* Logo + Greeting */}
      <div className="bg-white rounded-xl border border-gray-100 px-6 py-7 space-y-4">
        <LogoImage />
        <div>
          <p className="text-xs font-semibold text-primary tracking-widest uppercase mb-1">
            SUPERY CREW
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {employee?.name ?? ''}님
          </h1>
          <p className="text-sm text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
        </div>
      </div>

      {/* Reminder */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlarmClock size={16} className="text-amber-600 shrink-0" />
          <span className="text-sm font-bold text-amber-800">잊지 않으셨죠?</span>
        </div>
        <p className="text-sm text-amber-800 leading-relaxed">
          출근하시면 가장 먼저 근태등록에서{' '}
          <Link
            href="/attendance"
            className="inline-flex items-center gap-1 font-bold text-white bg-amber-500 hover:bg-amber-600 px-2 py-0.5 rounded transition-colors"
          >
            출근 버튼
          </Link>
          을 반드시 눌러주세요.
        </p>
        <p className="text-sm text-amber-700 leading-relaxed">
          업무 종료 및 퇴근 전에 근태등록에서{' '}
          <span className="font-semibold">퇴근 버튼</span>
          도 꼭 눌러주셔야 업무시간이 기록됩니다.
        </p>
      </div>

      {/* Latest Notices */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-800">최신 공지사항</span>
          <Link
            href="/notices"
            className="flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            더보기 <ChevronRight size={13} />
          </Link>
        </div>

        {(notices ?? []).length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">공지사항이 없습니다.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(notices as any[]).map((n) => (
              <Link
                key={n.id}
                href={`/notices/${n.id}`}
                className={`flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors ${n.is_pinned ? 'bg-primary/[0.02]' : ''}`}
              >
                {n.is_pinned
                  ? <Pin size={12} className="text-primary mt-0.5 shrink-0" />
                  : <span className="w-3 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${n.is_pinned ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(n.employees as any)?.name} · {format(new Date(n.created_at), 'MM.dd', { locale: ko })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
