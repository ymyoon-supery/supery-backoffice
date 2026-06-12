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

  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dateStr = format(kstNow, 'yyyy년 M월 d일 EEEE', { locale: ko })

  const [{ data: employee }, { data: notices }] = await Promise.all([
    supabase.from('employees').select('name, role').eq('auth_user_id', user.id).single(),
    admin.from('notices')
      .select('id, title, is_pinned, created_at, employees(name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Hero Card ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-white px-6 pt-6 pb-8">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/[0.07]" />
        <div className="pointer-events-none absolute -bottom-8 -right-2 h-28 w-28 rounded-full bg-primary/[0.05]" />

        <div className="relative space-y-6">
          {/* Top row: logo + date */}
          <div className="flex items-center justify-between">
            <LogoImage />
            <span className="rounded-full border border-primary/10 bg-white/80 px-3 py-1 text-[11px] font-medium text-primary/70 backdrop-blur-sm">
              {dateStr}
            </span>
          </div>

          {/* Greeting */}
          <div>
            <p className="mb-1.5 text-[10px] font-extrabold tracking-[0.3em] text-primary uppercase">
              SUPERY CREW
            </p>
            <h1 className="text-[26px] font-bold leading-snug text-gray-900">
              안녕하세요,{' '}
              <span className="text-primary">{employee?.name ?? ''}</span>님
            </h1>
            <p className="mt-1 text-sm text-gray-500">오늘도 좋은 하루 되세요.</p>
          </div>

        </div>
      </div>

      {/* ── Reminder Card ─────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white">
        <div className="flex items-center gap-2.5 border-b border-orange-100 bg-orange-50/60 px-5 py-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100">
            <AlarmClock size={13} className="text-orange-500" />
          </div>
          <span className="text-sm font-bold text-orange-900">잊지 않으셨죠?</span>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-orange-400 px-1.5 py-0.5 text-[10px] font-bold text-white">
              출근
            </span>
            <p className="text-sm leading-relaxed text-gray-600">
              출근하시면 가장 먼저 근태등록에서{' '}
              <Link
                href="/attendance"
                className="font-bold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
              >
                출근 버튼
              </Link>
              을 반드시 눌러주세요.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-gray-300 px-1.5 py-0.5 text-[10px] font-bold text-white">
              퇴근
            </span>
            <p className="text-sm leading-relaxed text-gray-600">
              업무 종료 전에 근태등록에서{' '}
              <span className="font-bold text-gray-800">퇴근 버튼</span>
              도 꼭 눌러주셔야 업무시간이 기록됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* ── Notices Card ──────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-primary" />
            <span className="text-sm font-bold text-gray-800">최신 공지사항</span>
          </div>
          <Link
            href="/notices"
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            더보기 <ChevronRight size={13} />
          </Link>
        </div>

        {(notices ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">등록된 공지사항이 없습니다.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {(notices as any[]).map((n, idx) => (
              <Link
                key={n.id}
                href={`/notices/${n.id}`}
                className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50"
              >
                {n.is_pinned ? (
                  <Pin size={12} className="mt-1 shrink-0 text-primary" />
                ) : (
                  <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs text-gray-300">
                    {idx + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm transition-colors group-hover:text-primary ${n.is_pinned ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
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
