'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { approveLeave } from '@/app/(dashboard)/approval/leave/actions'
import { approveExpense } from '@/app/(dashboard)/approval/expense/actions'
import { useRouter } from 'next/navigation'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const EXPENSE_LABELS: Record<string, string> = {
  TRANSPORT: '교통비', MEAL: '식대', ACCOMMODATION: '숙박비', SUPPLIES: '소모품', OTHER: '기타',
}
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING:  { label: '대기', className: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { label: '승인', className: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려', className: 'bg-red-50 text-red-600' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ApprovalInboxClient({ leaveSteps, expenseSteps, myLeave, myExpense }: any) {
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'mine'>('pending')
  const [isPending, startTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  function handleLeave(requestId: string, approved: boolean, comment?: string) {
    startTransition(async () => {
      const result = await approveLeave(requestId, approved, comment)
      if (result.error) { toast.error(result.error); return }
      toast.success(approved ? '승인되었습니다.' : '반려되었습니다.')
      setRejectingId(null)
      setRejectReason('')
      router.refresh()
    })
  }

  function handleExpense(reportId: string, approved: boolean) {
    startTransition(async () => {
      const result = await approveExpense(reportId, approved)
      if (result.error) { toast.error(result.error); return }
      toast.success(approved ? '승인되었습니다.' : '반려되었습니다.')
      router.refresh()
    })
  }

  const totalPending = (leaveSteps?.length ?? 0) + (expenseSteps?.length ?? 0)

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">결재함</h1>

      <div className="flex gap-1 border-b border-gray-100">
        {(['pending', 'mine'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pending' ? `결재 대기${totalPending > 0 ? ` (${totalPending})` : ''}` : '내 신청 내역'}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="space-y-3">
          {leaveSteps.map((step: any) => {
            const req = step.leave_requests
            return (
              <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {req.employees?.name} — {LEAVE_LABELS[req.leave_type]} {req.days_used}일
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {req.start_date} ~ {req.end_date}
                      {req.reason && <span className="ml-2">· {req.reason}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{format(new Date(req.created_at), 'MM/dd')}</span>
                </div>

                {rejectingId === step.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="반려 사유 (선택)"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLeave(req.id, false, rejectReason || undefined)}
                        disabled={isPending}
                        className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700"
                      >
                        반려 확인
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectReason('') }}
                        className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLeave(req.id, true)}
                      disabled={isPending}
                      className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => setRejectingId(step.id)}
                      disabled={isPending}
                      className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50"
                    >
                      반려
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {expenseSteps.map((step: any) => {
            const rep = step.expense_reports
            return (
              <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {rep.employees?.name} — {rep.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {EXPENSE_LABELS[rep.category]} · {rep.amount.toLocaleString()}원 · {rep.expense_date}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{format(new Date(rep.created_at), 'MM/dd')}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExpense(rep.id, true)}
                    disabled={isPending}
                    className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleExpense(rep.id, false)}
                    disabled={isPending}
                    className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50"
                  >
                    반려
                  </button>
                </div>
              </div>
            )
          })}

          {totalPending === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">결재 대기 항목이 없습니다.</div>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-2">
          {[...myLeave.map((r: any) => ({ ...r, kind: 'leave' })), ...myExpense.map((r: any) => ({ ...r, kind: 'expense' }))]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((item: any) => {
              const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING
              const rejectionReason = item.kind === 'leave' && item.status === 'REJECTED'
                ? (item.leave_approval_steps as any[])?.find((s: any) => s.status === 'REJECTED')?.comment
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
                      <p className="text-xs text-gray-400 mt-0.5">{format(new Date(item.created_at), 'yyyy.MM.dd')}</p>
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
          {myLeave.length === 0 && myExpense.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
          )}
        </div>
      )}
    </div>
  )
}
