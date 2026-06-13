'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: '현금', CARD: '회사카드', TRANSFER: '계좌송금',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PendingApprovalsClient({ leaveSteps, expenseSteps, fullApprovedLeaveSteps = [], fullApprovedExpenseSteps = [] }: { leaveSteps: any[]; expenseSteps: any[]; fullApprovedLeaveSteps?: any[]; fullApprovedExpenseSteps?: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          const isExpanded = expandedId === step.id
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{format(new Date(req.created_at), 'MM/dd')}</span>
                  <button onClick={() => setExpandedId(isExpanded ? null : step.id)}
                    className="p-1 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-xs text-gray-400">부여 연차</span>
                      <p className="font-semibold text-gray-900 mt-0.5">
                        {req.employees?.annual_leave_days != null ? `${req.employees.annual_leave_days}일` : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">잔여 연차</span>
                      <p className="font-semibold text-gray-900 mt-0.5">
                        {req.employees?.remaining_leaves != null ? `${req.employees.remaining_leaves}일` : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">유형</span>
                      <p className="font-medium text-gray-900 mt-0.5">{LEAVE_LABELS[req.leave_type] ?? req.leave_type}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">기간</span>
                      <p className="font-medium text-gray-900 mt-0.5">{req.start_date}{req.start_date !== req.end_date ? ` ~ ${req.end_date}` : ''}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">사용 일수</span>
                      <p className="font-medium text-gray-900 mt-0.5">{req.days_used}일</p>
                    </div>
                  </div>
                  {req.reason && (
                    <div>
                      <span className="text-xs text-gray-400">사유</span>
                      <p className="text-gray-700 mt-0.5">{req.reason}</p>
                    </div>
                  )}
                </div>
              )}

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
          const isExpanded = expandedId === step.id
          return (
            <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {rep.employees?.name} — {rep.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {EXPENSE_LABELS[rep.category]} · {Number(rep.amount).toLocaleString()}원 · {rep.expense_date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{format(new Date(rep.created_at), 'MM/dd')}</span>
                  <button onClick={() => setExpandedId(isExpanded ? null : step.id)}
                    className="p-1 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-3 text-sm">
                  <div className="flex flex-wrap items-start gap-6">
                    <div>
                      <span className="text-xs text-gray-400">수취인</span>
                      <p className="font-medium text-gray-900 mt-0.5">{rep.payee ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">결제방식</span>
                      <p className="font-medium text-gray-900 mt-0.5">
                        {rep.payment_method ? PAYMENT_METHOD_LABELS[rep.payment_method] ?? rep.payment_method : '—'}
                      </p>
                    </div>
                    {rep.payment_method === 'TRANSFER' && (
                      <div>
                        <span className="text-xs text-gray-400">계좌</span>
                        <p className="font-medium text-gray-900 mt-0.5">
                          {[rep.bank_name, rep.account_number, rep.account_holder].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-gray-400">지급요청일</span>
                      <p className="font-medium text-gray-900 mt-0.5">{rep.payment_request_date ?? '—'}</p>
                    </div>
                  </div>
                  {rep.line_items && rep.line_items.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-1.5">지출 내역</span>
                      <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                        <thead>
                          <tr className="bg-gray-100 text-gray-500">
                            <th className="px-3 py-2 text-left font-medium">항목</th>
                            <th className="px-3 py-2 text-left font-medium">날짜</th>
                            <th className="px-3 py-2 text-right font-medium">수량</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {rep.line_items.map((li: any, i: number) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-gray-700">{li.item}</td>
                              <td className="px-3 py-2 text-gray-500">{li.date}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{li.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {rep.attachment_urls && rep.attachment_urls.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-1.5">첨부파일</span>
                      <div className="flex flex-wrap gap-2">
                        {rep.attachment_urls.map((url: string, i: number) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer"
                            className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-primary hover:bg-primary/5 transition-colors">
                            파일 {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
