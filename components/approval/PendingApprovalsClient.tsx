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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PendingApprovalsClient({ leaveSteps, expenseSteps, fullApprovedLeaveSteps = [], fullApprovedExpenseSteps = [] }: { leaveSteps: any[]; expenseSteps: any[]; fullApprovedLeaveSteps?: any[]; fullApprovedExpenseSteps?: any[] }) {
  const router = useRouter()
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

  const totalPending = leaveSteps.length + expenseSteps.length

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">결재 대기</h1>

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

      {/* 전결 처리됨 */}
      {(fullApprovedLeaveSteps.length > 0 || fullApprovedExpenseSteps.length > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-orange-600 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
            관리자 전결 처리됨
          </h2>
          {fullApprovedLeaveSteps.map((step: any) => {
            const req = step.leave_requests
            return (
              <div key={step.id} className="bg-orange-50 rounded-xl border border-orange-200 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {req.employees?.name} — {LEAVE_LABELS[req.leave_type]} {req.days_used}일
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {req.start_date} ~ {req.end_date}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">전결</span>
                  <p className="text-xs text-gray-400 mt-1">{step.acted_at ? format(new Date(step.acted_at), 'MM/dd HH:mm') : ''}</p>
                </div>
              </div>
            )
          })}
          {fullApprovedExpenseSteps.map((step: any) => {
            const rep = step.expense_reports
            return (
              <div key={step.id} className="bg-orange-50 rounded-xl border border-orange-200 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {rep.employees?.name} — {rep.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {EXPENSE_LABELS[rep.category]} · {Number(rep.amount).toLocaleString()}원
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">전결</span>
                  <p className="text-xs text-gray-400 mt-1">{step.acted_at ? format(new Date(step.acted_at), 'MM/dd HH:mm') : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
