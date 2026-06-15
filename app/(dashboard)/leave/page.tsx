import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcAnnualLeave } from '@/lib/annualLeave'

const DEDUCTS = new Set(['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP'])

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING:  { label: '대기중', className: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { label: '승인',   className: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려',   className: 'bg-red-50 text-red-600' },
}

export default async function LeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, hired_at, annual_leave_days')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const [{ data: records }, { data: usedRows }] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, days_used, reason, status, created_at, leave_approval_steps(comment, status)')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED'])
      .order('start_date', { ascending: false }),
    supabase
      .from('leave_requests')
      .select('days_used')
      .eq('employee_id', employee.id)
      .eq('status', 'APPROVED')
      .in('leave_type', [...DEDUCTS]),
  ])

  const today = new Date()
  const entitlement = employee.hired_at
    ? calcAnnualLeave(new Date(employee.hired_at), today)
    : (employee.annual_leave_days ?? 15)

  const used = Math.round(((usedRows ?? []).reduce((s, r) => s + Number(r.days_used), 0)) * 10) / 10
  const remaining = Math.max(Math.round((entitlement - used) * 10) / 10, 0)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">내 연차</h1>
        <p className="text-sm text-gray-500 mt-1">연차 현황 및 사용 내역을 확인하세요.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([
          { label: '보유 연차', value: entitlement, highlight: false },
          { label: '사용 연차', value: used,        highlight: false },
          { label: '잔여 연차', value: remaining,   highlight: true  },
        ] as const).map(({ label, value, highlight }) => (
          <div key={label} className={`bg-white rounded-xl border p-4 text-center ${highlight ? 'border-primary/30' : 'border-gray-100'}`}>
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${highlight ? 'text-primary' : 'text-gray-900'}`}>
              {value}<span className="text-sm font-normal ml-0.5">일</span>
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-medium text-gray-700">사용 내역 ({(records ?? []).length}건)</h2>
        </div>
        {!records || records.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-50 text-left">
                <th className="px-4 py-2">기간</th>
                <th className="px-4 py-2">유형</th>
                <th className="px-4 py-2 text-right">일수</th>
                <th className="px-4 py-2 text-center">상태</th>
                <th className="px-4 py-2">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(records as any[]).map((r) => {
                const status = STATUS_LABELS[r.status] ?? STATUS_LABELS.PENDING
                const rejectionReason = r.status === 'REJECTED'
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ? (r.leave_approval_steps as any[])?.find((s: any) => s.status === 'REJECTED')?.comment
                  : null
                const dateStr = r.start_date === r.end_date
                  ? r.start_date
                  : `${r.start_date} ~ ${r.end_date}`
                return (
                  <tr key={r.id} className="hover:bg-gray-50/50 text-gray-700">
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-500 whitespace-nowrap">{dateStr}</td>
                    <td className="px-4 py-3">{LEAVE_LABELS[r.leave_type] ?? r.leave_type}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {DEDUCTS.has(r.leave_type) ? r.days_used : 0}일
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {rejectionReason
                        ? <span className="text-red-500">반려: {rejectionReason}</span>
                        : (r.reason || '—')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
