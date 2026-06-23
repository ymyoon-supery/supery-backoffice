'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { approveLeave } from '@/app/(dashboard)/approval/leave/actions'
import { approveExpense } from '@/app/(dashboard)/approval/expense/actions'
import { approveSupplyAction } from '@/app/(dashboard)/documents/actions'
import { useRouter } from 'next/navigation'
import ExpenseDetailModal from '@/components/approval/ExpenseDetailModal'
import type { ExpenseViewData } from '@/components/approval/ExpenseDetailView'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const EXPENSE_LABELS: Record<string, string> = {
  TRANSPORT: '교통비', MEAL: '식대', ACCOMMODATION: '숙박비', SUPPLIES: '소모품', OTHER: '기타',
}

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품', CONSUMABLE: '소모품', SOFTWARE: '소프트웨어', OTHER: '기타',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PendingApprovalsClient({ leaveSteps, expenseSteps, fullApprovedLeaveSteps = [], fullApprovedExpenseSteps = [], supplySteps = [] }: { leaveSteps: any[]; expenseSteps: any[]; fullApprovedLeaveSteps?: any[]; fullApprovedExpenseSteps?: any[]; supplySteps?: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<{ step: any; viewData: ExpenseViewData } | null>(null)
  const [rejectingSupplyId, setRejectingSupplyId] = useState<string | null>(null)
  const [supplyRejectComment, setSupplyRejectComment] = useState('')

  function handleLeave(requestId: string, approved: boolean, comment?: string) {
    startTransition(async () => {
      const result = await approveLeave(requestId, approved, comment)
      if (result.error) { toast.error(result.error); return }
      toast.success(approved ? '승인되었습니다.' : '반려되었습니다.')
      setRejectingLeaveId(null)
      setRejectReason('')
      router.refresh()
    })
  }

  function handleExpenseApprove(reportId: string) {
    startTransition(async () => {
      const result = await approveExpense(reportId, true)
      if (result.error) { toast.error(result.error); return }
      toast.success('승인되었습니다.')
      setSelectedExpense(null)
      router.refresh()
    })
  }

  function handleExpenseReject(reportId: string, reason?: string) {
    startTransition(async () => {
      const result = await approveExpense(reportId, false, reason)
      if (result.error) { toast.error(result.error); return }
      toast.success('반려되었습니다.')
      setSelectedExpense(null)
      router.refresh()
    })
  }

  function openExpenseDetail(step: any) {
    const rep = step.expense_reports
    if (!rep) return
    const viewData: ExpenseViewData = {
      title: rep.title ?? '',
      taxType: rep.tax_type ?? null,
      evidenceType: rep.evidence_type ?? null,
      payee: rep.payee ?? null,
      paymentMethod: rep.payment_method ?? null,
      bankName: rep.bank_name ?? null,
      accountNumber: rep.account_number ?? null,
      accountHolder: rep.account_holder ?? null,
      paymentRequestDate: rep.payment_request_date ?? null,
      settlementDate: rep.settlement_date ?? null,
      lineItems: rep.line_items ?? [],
      attachmentUrls: rep.attachment_urls ?? [],
      employeeName: rep.employees?.name ?? '—',
      employeePosition: rep.employees?.position ?? null,
      departmentName: rep.employees?.departments?.name ?? null,
      requestDate: rep.created_at,
      status: 'PENDING',
      comment: null,
    }
    setSelectedExpense({ step, viewData })
  }

  function handleSupplyApprove(requestId: string) {
    startTransition(async () => {
      const result = await approveSupplyAction(requestId, true)
      if (result.error) { toast.error(result.error); return }
      toast.success('승인되었습니다.')
      router.refresh()
    })
  }

  function handleSupplyReject(requestId: string) {
    startTransition(async () => {
      const result = await approveSupplyAction(requestId, false, supplyRejectComment || undefined)
      if (result.error) { toast.error(result.error); return }
      toast.success('반려되었습니다.')
      setRejectingSupplyId(null)
      setSupplyRejectComment('')
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

              {rejectingLeaveId === step.id ? (
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
                      onClick={() => { setRejectingLeaveId(null); setRejectReason('') }}
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
                    onClick={() => setRejectingLeaveId(step.id)}
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
            <div
              key={step.id}
              className="bg-white rounded-xl border border-gray-100 p-5 space-y-3 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
              onClick={() => openExpenseDetail(step)}
            >
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
                  <span className="text-xs text-primary font-medium">상세보기</span>
                </div>
              </div>
            </div>
          )
        })}

        {totalPending === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">결재 대기 항목이 없습니다.</div>
        )}
      </div>

      {/* Supply steps */}
      {supplySteps.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-medium text-gray-700">비품/소모품 결재 대기</h2>
          {supplySteps.map((step: any) => {
            const req = step.supply_requests
            if (!req) return null
            const emp = req.employees
            const empLabel = [emp?.departments?.name, emp?.position, emp?.name].filter(Boolean).join(' / ')
            const sortedItems = [...(req.supply_request_items ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            const isRejecting = rejectingSupplyId === req.id

            return (
              <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{empLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(req.created_at), 'MM/dd')} · {sortedItems.length}개 항목
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs table-fixed">
                    <colgroup>
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '28%' }} />
                    </colgroup>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">구분</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">내역</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">예상금액</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortedItems.map((item: any) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-gray-600">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                          <td className="px-3 py-2 text-gray-800 break-words">{item.description}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {item.estimated_amount != null ? `${Number(item.estimated_amount).toLocaleString()}원` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-400 break-words">{item.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isRejecting ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={supplyRejectComment}
                      onChange={e => setSupplyRejectComment(e.target.value)}
                      placeholder="반려 사유 (선택)"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSupplyReject(req.id)}
                        disabled={isPending}
                        className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700"
                      >
                        반려 확인
                      </button>
                      <button
                        onClick={() => { setRejectingSupplyId(null); setSupplyRejectComment('') }}
                        className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSupplyApprove(req.id)}
                      disabled={isPending}
                      className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => setRejectingSupplyId(req.id)}
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
        </div>
      )}

      {/* 전결 처리됨 */}
      {(fullApprovedLeaveSteps.length > 0 || fullApprovedExpenseSteps.length > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-orange-600 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
            관리자 전결 처리됨
          </h2>
          {fullApprovedLeaveSteps.map((step: any) => {
            const req = step.leave_requests
            if (!req) return null
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
            if (!rep) return null
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

      {/* Expense detail modal */}
      {selectedExpense && (
        <ExpenseDetailModal
          data={selectedExpense.viewData}
          onClose={() => setSelectedExpense(null)}
          onApprove={() => handleExpenseApprove(selectedExpense.step.expense_reports?.id)}
          onReject={(reason) => handleExpenseReject(selectedExpense.step.expense_reports?.id, reason)}
          isPending={isPending}
        />
      )}
    </div>
  )
}
