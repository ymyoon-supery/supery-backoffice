'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AlertCircle, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { approveLeave } from '@/app/(dashboard)/approval/leave/actions'
import { approveExpense } from '@/app/(dashboard)/approval/expense/actions'
import { approveHomeLocationRequest } from '@/app/(admin)/admin/approval/actions'
import type { ApprovalItem } from '@/app/(admin)/admin/approval/page'

const STATUS_CFG = {
  PENDING:  { label: '미결재', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: '승인',   cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: '반려',   cls: 'bg-red-100 text-red-600' },
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
  items, total, page, totalPages, tab, type, period, sort,
}: {
  items: ApprovalItem[]
  total: number
  page: number
  totalPages: number
  tab: string
  type: string
  period: string
  sort: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams({ tab, type, period, sort, page: String(page), ...overrides })
    return `/admin/approval?${p}`
  }
  const nav = (o: Record<string, string>) => router.push(buildUrl(o))

  function handleApprove(item: ApprovalItem) {
    startTransition(async () => {
      const res = item.kind === 'leave'
        ? await approveLeave(item.requestId, true)
        : item.kind === 'expense'
        ? await approveExpense(item.requestId, true)
        : await approveHomeLocationRequest(item.requestId, true)
      if (res.error) { toast.error(res.error); return }
      toast.success('승인되었습니다.')
      router.refresh()
    })
  }

  function handleReject(item: ApprovalItem) {
    startTransition(async () => {
      const res = item.kind === 'leave'
        ? await approveLeave(item.requestId, false, rejectReason || undefined)
        : item.kind === 'expense'
        ? await approveExpense(item.requestId, false, rejectReason || undefined)
        : await approveHomeLocationRequest(item.requestId, false, rejectReason || undefined)
      if (res.error) { toast.error(res.error); return }
      toast.success('반려되었습니다.')
      setRejectingId(null)
      setRejectReason('')
      router.refresh()
    })
  }

  const pageNums = getPageNums(page, totalPages)

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
        {/* Type */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
          {[['all', '전체'], ['leave', '연차'], ['expense', '지결서'], ['home_location', '재택변경']].map(([k, l]) => (
            <button key={k} onClick={() => nav({ type: k, page: '1' })}
              className={`px-3 py-1.5 transition-colors ${type === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Period */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
          {[['all', '전체'], ['day', '일간'], ['week', '주간'], ['month', '월간']].map(([k, l]) => (
            <button key={k} onClick={() => nav({ period: k, page: '1' })}
              className={`px-3 py-1.5 transition-colors ${period === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Sort */}
        <button onClick={() => nav({ sort: sort === 'desc' ? 'asc' : 'desc', page: '1' })}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <ArrowUpDown size={12} />
          {sort === 'desc' ? '최신순' : '오래된순'}
        </button>

        {total > 0 && (
          <span className="ml-auto text-xs text-gray-400">전체 {total}건</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium text-left bg-gray-50/50">
              <th className="px-4 py-3 w-[130px]">직원</th>
              <th className="px-4 py-3 w-[150px]">유형</th>
              <th className="px-4 py-3">내용</th>
              <th className="px-4 py-3 w-[120px] whitespace-nowrap">신청일시</th>
              <th className="px-4 py-3 w-[140px] text-right">{tab === 'pending' ? '처리' : '상태'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => {
              const isPendingRow = item.status === 'PENDING'
              const cfg = STATUS_CFG[item.status]

              return (
                <Fragment key={item.stepId}>
                  <tr className={
                    isPendingRow
                      ? 'border-l-[3px] border-l-amber-400 bg-amber-50/40 hover:bg-amber-50/70'
                      : 'hover:bg-gray-50/50'
                  }>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isPendingRow && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 mb-px align-middle" />
                      )}
                      {item.employeeName}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
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
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 truncate">
                      {item.detail}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                      {item.requestDate
                        ? format(new Date(item.requestDate), 'yyyy.MM.dd HH:mm')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPendingRow ? (
                        rejectingId !== item.stepId && (
                          <div className="flex gap-1.5 justify-end">
                            <button onClick={() => handleApprove(item)} disabled={isPending}
                              className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                              승인
                            </button>
                            <button onClick={() => { setRejectingId(item.stepId); setRejectReason('') }}
                              disabled={isPending}
                              className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                              반려
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          {item.status === 'REJECTED' && item.comment && (
                            <span className="text-xs text-gray-400 max-w-[160px] truncate">{item.comment}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline reject form */}
                  {rejectingId === item.stepId && (
                    <tr className="bg-red-50/30 border-l-[3px] border-l-red-300">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleReject(item)}
                            placeholder="반려 사유 (선택)"
                            autoFocus
                            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-200"
                          />
                          <button onClick={() => handleReject(item)} disabled={isPending}
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

            {items.length === 0 && (
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
    </div>
  )
}
