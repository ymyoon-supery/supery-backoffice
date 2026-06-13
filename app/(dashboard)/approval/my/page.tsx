import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING:  { label: '대기', className: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { label: '승인', className: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려', className: 'bg-red-50 text-red-600' },
}

export default async function MyRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const [{ data: myLeave }, { data: myExpense }] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, days_used, status, created_at, leave_approval_steps(comment, status)')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('expense_reports')
      .select('id, title, amount, category, status, created_at')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items = [
    ...(myLeave ?? []).map(r => ({ ...r, kind: 'leave' as const })),
    ...(myExpense ?? []).map(r => ({ ...r, kind: 'expense' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">내 신청 내역</h1>
      <div className="space-y-2">
        {items.map(item => {
          const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING
          const rejectionReason = item.kind === 'leave' && item.status === 'REJECTED'
            ? (item.leave_approval_steps as { status: string; comment: string | null }[])
                ?.find(s => s.status === 'REJECTED')?.comment
            : null
          return (
            <div key={item.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.kind === 'leave'
                      ? `${LEAVE_LABELS[item.leave_type]} ${item.days_used}일`
                      : `${item.title} — ${item.amount?.toLocaleString()}원`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(item.created_at), 'yyyy.MM.dd')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              {rejectionReason && (
                <p className="text-xs text-red-500 mt-2 pl-0.5">반려 사유: {rejectionReason}</p>
              )}
            </div>
          )
        })}
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
        )}
      </div>
    </div>
  )
}
