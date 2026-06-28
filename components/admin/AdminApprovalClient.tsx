'use client'

import { Fragment, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AlertCircle, ChevronLeft, ChevronRight, ArrowUpDown, ChevronDown } from 'lucide-react'
import { approveLeave } from '@/app/(dashboard)/approval/leave/actions'
import { approveExpense } from '@/app/(dashboard)/approval/expense/actions'
import { approveHomeLocationRequest, updateExpensePaymentStatus, fullApproveLeave, fullApproveExpense, fullRejectLeave, fullRejectExpense } from '@/app/(admin)/admin/approval/actions'
import type { ApprovalItem } from '@/app/(admin)/admin/approval/page'
import ExpenseDetailSheet from '@/components/admin/ExpenseDetailSheet'
import ExpenseSearchFilter from '@/components/approval/ExpenseSearchFilter'

const STATUS_CFG = {
  PENDING:  { label: '미결재', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: '승인',   cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: '반려',   cls: 'bg-red-100 text-red-600' },
}

const PAYMENT_STATUS_CFG = {
  PENDING_PAYMENT: { label: '지급대기', cls: 'bg-amber-100 text-amber-700' },
  PAID:            { label: '지급완료', cls: 'bg-blue-100 text-blue-700' },
  SETTLED:         { label: '정산완료', cls: 'bg-green-100 text-green-700' },
}

const PAYMENT_STATUS_NEXT: Record<string, Array<{ value: 'PENDING_PAYMENT' | 'PAID' | 'SETTLED'; label: string }>> = {
  PENDING_PAYMENT: [{ value: 'PAID',    label: '지급완료로 변경' }, { value: 'SETTLED', label: '정산완료로 변경' }],
  PAID:            [{ value: 'SETTLED', label: '정산완료로 변경' }, { value: 'PENDING_PAYMENT', label: '지급대기로 변경' }],
  SETTLED:         [{ value: 'PAID',    label: '지급완료로 변경' }, { value: 'PENDING_PAYMENT', label: '지급대기로 변경' }],
}

function getPageNums(cur: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const half = 3
  let start = Math.max(1, cur - half)
  const end = Math.min(total, start + 6)
  start = Math.max(1, end - 6)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

export default function AdminApprovalClient({
  items, total, page, totalPages, tab, type, period, sort, fullApproveItems = [],
  expenseType = '', month = '', dateFrom = '', dateTo = '', keyword = '', employeeName = '',
}: {
  items: ApprovalItem[]
  total: number
  page: number
  totalPages: number
  tab: string
  type: string
  period: string
  sort: string
  fullApproveItems?: ApprovalItem[]
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
  employeeName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isNavPending, startNavTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [paymentDropdownId, setPaymentDropdownId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<ApprovalItem | null>(null)

  useEffect(() => {
    if (!paymentDropdownId) return
    function close() { setPaymentDropdownId(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [paymentDropdownId])

  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = { tab, type, period, sort, page: String(page) }
    if (expenseType)  base.expenseType  = expenseType
    if (month)        base.month        = month
    if (dateFrom)     base.dateFrom     = dateFrom
    if (dateTo)       base.dateTo       = dateTo
    if (keyword)      base.keyword      = keyword
    if (employeeName) base.employeeName = employeeName
    const p = new URLSearchParams({ ...base, ...overrides })
    return `/admin/approval?${p}`
  }
  const nav = (o: Record<string, string>) => startNavTransition(() => router.push(buildUrl(o)))

  function handleApprove(item: ApprovalItem) {
    startTransition(async () => {
      const res = item.kind === 'leave'
        ? await approveLeave(item.requestId, true)
        : item.kind === 'expense'
        ? await approveExpense(item.requestId, true)
        : await approveHomeLocationRequest(item.requestId, true)
      if (res.error) { toast.error(res.error); return }
      toast.success('승인되었습니다.')
      setSelectedExpense(null)
      router.refresh()
    })
  }

  function handlePaymentStatus(item: ApprovalItem, status: 'PENDING_PAYMENT' | 'PAID' | 'SETTLED') {
    setPaymentDropdownId(null)
    startTransition(async () => {
      const res = await updateExpensePaymentStatus(item.requestId, status)
      if (res.error) { toast.error(res.error); return }
      toast.success(`${PAYMENT_STATUS_CFG[status].label}로 변경되었습니다.`)
      router.refresh()
    })
  }

  function handleFullApprove(item: ApprovalItem) {
    startTransition(async () => {
      const res = item.kind === 'leave'
        ? await fullApproveLeave(item.requestId)
        : await fullApproveExpense(item.requestId)
      if (res.error) { toast.error(res.error); return }
      toast.success('전결 처리되었습니다.')
      setSelectedExpense(null)
      router.refresh()
    })
  }

  function handleReject(item: ApprovalItem, reason?: string) {
    startTransition(async () => {
      const res = item.kind === 'leave'
        ? await approveLeave(item.requestId, false, reason)
        : item.kind === 'expense'
        ? await approveExpense(item.requestId, false, reason)
        : await approveHomeLocationRequest(item.requestId, false, reason)
      if (res.error) { toast.error(res.error); return }
      toast.success('반려되었습니다.')
      setRejectingId(null)
      setRejectReason('')
      setSelectedExpense(null)
      router.refresh()
    })
  }

  function handleFullReject(item: ApprovalItem, reason?: string) {
    startTransition(async () => {
      const res = item.kind === 'leave'
        ? await fullRejectLeave(item.requestId, reason)
        : await fullRejectExpense(item.requestId, reason)
      if (res.error) { toast.error(res.error); return }
      toast.success('반려되었습니다.')
      setRejectingId(null)
      setRejectReason('')
      setSelectedExpense(null)
      router.refresh()
    })
  }

  const pageNums = getPageNums(page, totalPages)
  const allItems = [...fullApproveItems, ...items]

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">결재함</h1>
        {tab === 'pending' && total > 0 && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <AlertCircle size={14} />
            미결재 {total}건
          </span>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {[{ k: 'pending', l: '미결재' }, { k: 'done', l: '결재완료' }].map(t => (
          <button key={t.k} onClick={() => nav({ tab: t.k, page: '1' })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t.k ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
          {[['all', '전체'], ['leave', '연차'], ['expense', '지결서'], ['home_location', '재택변경']].map(([k, l]) => (
            <button key={k} onClick={() => nav({ type: k, page: '1' })}
              className={`px-3 py-1.5 transition-colors ${type === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
          {[['all', '전체'], ['day', '일간'], ['week', '주간'], ['month', '월간']].map(([k, l]) => (
            <button key={k} onClick={() => nav({ period: k, page: '1' })}
              className={`px-3 py-1.5 transition-colors ${period === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        <button onClick={() => nav({ sort: sort === 'desc' ? 'asc' : 'desc', page: '1' })}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <ArrowUpDown size={12} />
          {sort === 'desc' ? '최신순' : '오래된순'}
        </button>

        {total > 0 && (
          <span className="ml-auto text-xs text-gray-400">전체 {total}건</span>
        )}
      </div>

      {/* Expense Search Filter */}
      {(type === 'expense' || type === 'all') && (
        <ExpenseSearchFilter
          expenseType={expenseType}
          month={month}
          dateFrom={dateFrom}
          dateTo={dateTo}
          keyword={keyword}
          employeeName={employeeName}
          showAdminFilters
          baseParams={{ tab, type, period, sort }}
        />
      )}

      {/* List container */}
      <div className="relative bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isNavPending && (
          <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              불러오는 중...
            </div>
          </div>
        )}

        {/* ── Mobile card list ── */}
        <div className="md:hidden divide-y divide-gray-50">
          {allItems.map(item => {
            const isFullApprove = item.managerName != null
            const isPendingRow = item.status === 'PENDING' && !isFullApprove
            const cfg = STATUS_CFG[item.status]
            return (
              <Fragment key={`m-${item.stepId}`}>
                <div
                  className={`px-4 py-3 cursor-pointer ${
                    isFullApprove
                      ? 'border-l-[3px] border-l-orange-400 bg-orange-50/30'
                      : isPendingRow
                      ? 'border-l-[3px] border-l-amber-400 bg-amber-50/40'
                      : ''
                  }`}
                  onClick={() => {
                    if (item.kind === 'expense') {
                      setSelectedExpense(item)
                    } else {
                      setExpandedId(expandedId === item.stepId ? null : item.stepId)
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* Left: name + type + detail */}
                    <div className="flex items-start gap-1.5 min-w-0 flex-1">
                      {(isFullApprove || isPendingRow) && (
                        <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${isFullApprove ? 'bg-orange-500' : 'bg-amber-500'}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-medium text-gray-900">{item.employeeName}</span>
                          {item.employeePosition && (
                            <span className="text-xs text-gray-400">{item.employeePosition}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`inline-flex shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            item.kind === 'leave' ? 'bg-blue-50 text-blue-600' :
                            item.kind === 'expense' ? 'bg-violet-50 text-violet-600' :
                            'bg-emerald-50 text-emerald-600'
                          }`}>
                            {item.kind === 'leave' ? `연차 · ${item.typeLabel}` :
                             item.kind === 'expense' ? `지결서 · ${item.typeLabel}` :
                             item.typeLabel}
                          </span>
                          {item.requestDate && (
                            <span className="text-xs text-gray-400 tabular-nums">
                              {format(new Date(item.requestDate), 'MM.dd')}
                            </span>
                          )}
                        </div>
                        {isFullApprove && item.managerName && (
                          <p className="text-xs text-orange-500 mt-0.5">{item.managerName} 결재 대기중</p>
                        )}
                        {item.detail && (
                          <p className="text-xs text-gray-500 mt-1 truncate">{item.detail}</p>
                        )}
                      </div>
                    </div>

                    {/* Right: action buttons or status */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {(isFullApprove || isPendingRow) && item.kind === 'expense' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedExpense(item) }}
                          className="px-2.5 py-1 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg"
                        >
                          상세
                        </button>
                      ) : isFullApprove ? (
                        rejectingId !== item.stepId && (
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); handleFullApprove(item) }} disabled={isPending}
                              className="px-2.5 py-1 text-xs font-medium bg-orange-500 text-white rounded-lg disabled:opacity-50">
                              전결
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setRejectingId(item.stepId); setRejectReason('') }}
                              disabled={isPending}
                              className="px-2.5 py-1 text-xs font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50">
                              반려
                            </button>
                          </div>
                        )
                      ) : isPendingRow ? (
                        rejectingId !== item.stepId && (
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); handleApprove(item) }} disabled={isPending}
                              className="px-2.5 py-1 text-xs font-medium bg-primary text-white rounded-lg disabled:opacity-50">
                              승인
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setRejectingId(item.stepId); setRejectReason('') }}
                              disabled={isPending}
                              className="px-2.5 py-1 text-xs font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50">
                              반려
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          {item.status === 'REJECTED' && item.comment && (
                            <span className="text-xs text-gray-400 max-w-[120px] truncate">{item.comment}</span>
                          )}
                          {item.status === 'APPROVED' && item.kind === 'expense' && item.paymentStatus && (
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setPaymentDropdownId(paymentDropdownId === item.stepId ? null : item.stepId) }}
                                disabled={isPending}
                                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_STATUS_CFG[item.paymentStatus].cls} hover:opacity-80`}
                              >
                                {PAYMENT_STATUS_CFG[item.paymentStatus].label}
                                <ChevronDown size={10} />
                              </button>
                              {paymentDropdownId === item.stepId && (
                                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                                  {PAYMENT_STATUS_NEXT[item.paymentStatus!].map(opt => (
                                    <button key={opt.value} onClick={() => handlePaymentStatus(item, opt.value)}
                                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline expansion (leave only) */}
                {expandedId === item.stepId && item.kind !== 'expense' && item.kind !== 'home_location' && (
                  <div className={`px-4 py-4 ${
                    isFullApprove
                      ? 'bg-orange-50/40 border-l-[3px] border-l-orange-200'
                      : 'bg-gray-50/60 border-l-[3px] border-l-gray-200'
                  }`}>
                    {item.kind === 'leave' && (
                      <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-gray-400 text-xs">부여 연차</span>
                            <p className="font-semibold text-gray-900 mt-0.5">
                              {item.totalLeaves != null ? `${item.totalLeaves}일` : '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">잔여 연차</span>
                            <p className="font-semibold text-gray-900 mt-0.5">
                              {item.remainingLeaves != null ? `${item.remainingLeaves}일` : '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">유형</span>
                            <p className="font-medium text-gray-900 mt-0.5">{item.typeLabel}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">기간</span>
                            <p className="font-medium text-gray-900 mt-0.5">{item.detail.split(' · ').slice(1).join(' · ')}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-xs">사용 일수</span>
                            <p className="font-medium text-gray-900 mt-0.5">{item.detail.split(' · ')[0]}</p>
                          </div>
                        </div>
                        {item.reason && (
                          <div>
                            <span className="text-gray-400 text-xs">사유</span>
                            <p className="text-gray-700 mt-0.5">{item.reason}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Inline reject form */}
                {rejectingId === item.stepId && item.kind !== 'expense' && (
                  <div className="bg-red-50/30 border-l-[3px] border-l-red-300 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (isFullApprove ? handleFullReject(item, rejectReason || undefined) : handleReject(item, rejectReason || undefined))}
                        placeholder="반려 사유 (선택)"
                        autoFocus
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-200"
                      />
                      <button onClick={() => isFullApprove ? handleFullReject(item, rejectReason || undefined) : handleReject(item, rejectReason || undefined)} disabled={isPending}
                        className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
                        반려 확인
                      </button>
                      <button onClick={() => setRejectingId(null)}
                        className="px-3 py-1.5 text-xs text-gray-500">
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </Fragment>
            )
          })}

          {allItems.length === 0 && (
            <div className="px-4 py-14 text-center text-sm text-gray-400">
              {tab === 'pending' ? '미결재 항목이 없습니다.' : '결재 내역이 없습니다.'}
            </div>
          )}
        </div>

        {/* ── Desktop table ── */}
        <table className="hidden md:table w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium text-left bg-gray-50/50">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">유형</th>
              <th className="px-4 py-3">내용</th>
              <th className="px-4 py-3 whitespace-nowrap">신청일시</th>
              <th className="px-4 py-3 text-right">{tab === 'pending' ? '처리' : '상태'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allItems.map(item => {
              const isFullApprove = item.managerName != null
              const isPendingRow = item.status === 'PENDING' && !isFullApprove
              const cfg = STATUS_CFG[item.status]

              return (
                <Fragment key={item.stepId}>
                  <tr
                    className={`cursor-pointer ${
                      isFullApprove
                        ? 'border-l-[3px] border-l-orange-400 bg-orange-50/30 hover:bg-orange-50/60'
                        : isPendingRow
                        ? 'border-l-[3px] border-l-amber-400 bg-amber-50/40 hover:bg-amber-50/70'
                        : 'hover:bg-gray-50/50'
                    }`}
                    onClick={() => {
                      if (item.kind === 'expense') {
                        setSelectedExpense(item)
                      } else {
                        setExpandedId(expandedId === item.stepId ? null : item.stepId)
                      }
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isFullApprove ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                        ) : isPendingRow ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        ) : null}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.employeeName}</p>
                          {item.employeePosition && (
                            <p className="text-xs text-gray-400">{item.employeePosition}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          item.kind === 'leave'
                            ? 'bg-blue-50 text-blue-600'
                            : item.kind === 'expense'
                            ? 'bg-violet-50 text-violet-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {item.kind === 'leave'
                            ? `연차 · ${item.typeLabel}`
                            : item.kind === 'expense'
                            ? `지결서 · ${item.typeLabel}`
                            : item.typeLabel}
                        </span>
                        {isFullApprove && item.managerName && (
                          <p className="text-xs text-orange-500">{item.managerName} 결재 대기중</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 leading-relaxed">
                      {item.detail}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                      {item.requestDate
                        ? format(new Date(item.requestDate), 'yyyy.MM.dd HH:mm')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(isFullApprove || isPendingRow) && item.kind === 'expense' ? (
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedExpense(item) }}
                            className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            상세보기
                          </button>
                        </div>
                      ) : isFullApprove ? (
                        rejectingId !== item.stepId && (
                          <div className="flex gap-1.5 justify-end items-center">
                            <button onClick={(e) => { e.stopPropagation(); handleFullApprove(item) }} disabled={isPending}
                              className="px-3 py-1.5 text-xs font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                              전결
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setRejectingId(item.stepId); setRejectReason('') }}
                              disabled={isPending}
                              className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                              반려
                            </button>
                          </div>
                        )
                      ) : isPendingRow ? (
                        rejectingId !== item.stepId && (
                          <div className="flex gap-1.5 justify-end">
                            <button onClick={(e) => { e.stopPropagation(); handleApprove(item) }} disabled={isPending}
                              className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                              승인
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setRejectingId(item.stepId); setRejectReason('') }}
                              disabled={isPending}
                              className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                              반려
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          {item.status === 'REJECTED' && item.comment && (
                            <span className="text-xs text-gray-400 max-w-[160px] truncate">{item.comment}</span>
                          )}
                          {item.status === 'APPROVED' && item.kind === 'expense' && item.paymentStatus && (
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setPaymentDropdownId(
                                  paymentDropdownId === item.stepId ? null : item.stepId
                                ) }}
                                disabled={isPending}
                                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${PAYMENT_STATUS_CFG[item.paymentStatus].cls} hover:opacity-80`}
                              >
                                {PAYMENT_STATUS_CFG[item.paymentStatus].label}
                                <ChevronDown size={10} />
                              </button>
                              {paymentDropdownId === item.stepId && (
                                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                                  {PAYMENT_STATUS_NEXT[item.paymentStatus!].map(opt => (
                                    <button
                                      key={opt.value}
                                      onClick={() => handlePaymentStatus(item, opt.value)}
                                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline expansion for leave / home_location only */}
                  {expandedId === item.stepId && item.kind !== 'expense' && item.kind !== 'home_location' && (
                    <tr className={isFullApprove
                      ? 'bg-orange-50/40 border-l-[3px] border-l-orange-200'
                      : 'bg-gray-50/60 border-l-[3px] border-l-gray-200'
                    }>
                      <td colSpan={5} className="px-6 py-4">
                        {item.kind === 'leave' && (
                          <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-6">
                              <div>
                                <span className="text-gray-400 text-xs">부여 연차</span>
                                <p className="font-semibold text-gray-900 mt-0.5">
                                  {item.totalLeaves != null ? `${item.totalLeaves}일` : '—'}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs">잔여 연차</span>
                                <p className="font-semibold text-gray-900 mt-0.5">
                                  {item.remainingLeaves != null ? `${item.remainingLeaves}일` : '—'}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs">유형</span>
                                <p className="font-medium text-gray-900 mt-0.5">{item.typeLabel}</p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs">기간</span>
                                <p className="font-medium text-gray-900 mt-0.5">{item.detail.split(' · ').slice(1).join(' · ')}</p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs">사용 일수</span>
                                <p className="font-medium text-gray-900 mt-0.5">{item.detail.split(' · ')[0]}</p>
                              </div>
                            </div>
                            {item.reason && (
                              <div>
                                <span className="text-gray-400 text-xs">사유</span>
                                <p className="text-gray-700 mt-0.5">{item.reason}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* Inline reject form (leave / home_location only) */}
                  {rejectingId === item.stepId && item.kind !== 'expense' && (
                    <tr className="bg-red-50/30 border-l-[3px] border-l-red-300">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (isFullApprove ? handleFullReject(item, rejectReason || undefined) : handleReject(item, rejectReason || undefined))}
                            placeholder="반려 사유 (선택)"
                            autoFocus
                            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-200"
                          />
                          <button onClick={() => isFullApprove ? handleFullReject(item, rejectReason || undefined) : handleReject(item, rejectReason || undefined)} disabled={isPending}
                            className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
                            반려 확인
                          </button>
                          <button onClick={() => setRejectingId(null)}
                            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                            취소
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {allItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-sm text-gray-400">
                  {tab === 'pending' ? '미결재 항목이 없습니다.' : '결재 내역이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{page} / {totalPages} 페이지</p>
          <div className="flex items-center gap-1">
            <button onClick={() => nav({ page: String(Math.max(1, page - 1)) })}
              disabled={page <= 1}
              className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft size={14} />
            </button>
            {pageNums.map(n => (
              <button key={n} onClick={() => nav({ page: String(n) })}
                className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                  n === page
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {n}
              </button>
            ))}
            <button onClick={() => nav({ page: String(Math.min(totalPages, page + 1)) })}
              disabled={page >= totalPages}
              className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Expense detail sheet */}
      {selectedExpense && (
        <ExpenseDetailSheet
          item={selectedExpense}
          tab={tab}
          isPending={isPending}
          onClose={() => setSelectedExpense(null)}
          onApprove={() => handleApprove(selectedExpense)}
          onFullApprove={() => handleFullApprove(selectedExpense)}
          onReject={(reason) => handleReject(selectedExpense, reason)}
          onFullReject={(reason) => handleFullReject(selectedExpense, reason)}
        />
      )}
    </div>
  )
}
