'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { completeSupplyAction } from './actions'

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품', CONSUMABLE: '소모품', SOFTWARE: '소프트웨어', OTHER: '기타',
}

const SUPPLY_STATUS: Record<string, { label: string; className: string }> = {
  PENDING:   { label: '결재대기',  className: 'bg-amber-50 text-amber-700' },
  APPROVED:  { label: '결재완료',  className: 'bg-green-50 text-green-700' },
  REJECTED:  { label: '반려',      className: 'bg-red-50 text-red-600' },
  COMPLETED: { label: '처리완료',  className: 'bg-blue-50 text-blue-700' },
  CANCELLED: { label: '취소',      className: 'bg-gray-100 text-gray-400' },
}

type StatusFilter = 'all' | 'REJECTED' | 'PENDING' | 'APPROVED' | 'COMPLETED' | 'CANCELLED'

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all',       label: '전체' },
  { id: 'REJECTED',  label: '반려' },
  { id: 'PENDING',   label: '결재대기' },
  { id: 'APPROVED',  label: '결재완료' },
  { id: 'COMPLETED', label: '처리완료' },
  { id: 'CANCELLED', label: '취소' },
]

function getPendingClassName(label: string) {
  if (label === '내 결재 필요') return 'bg-blue-50 text-blue-700'
  if (label.startsWith('관리자')) return 'bg-purple-50 text-purple-700'
  return 'bg-amber-50 text-amber-700'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SupplyManageClient({ supplyRequests }: { supplyRequests: any[] }) {
  const [isPending, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const router = useRouter()

  const counts: Record<StatusFilter, number> = {
    all: supplyRequests.length,
    REJECTED:  supplyRequests.filter(r => r.status === 'REJECTED').length,
    PENDING:   supplyRequests.filter(r => r.status === 'PENDING').length,
    APPROVED:  supplyRequests.filter(r => r.status === 'APPROVED').length,
    COMPLETED: supplyRequests.filter(r => r.status === 'COMPLETED').length,
    CANCELLED: supplyRequests.filter(r => r.status === 'CANCELLED').length,
  }

  const filtered = statusFilter === 'all'
    ? supplyRequests
    : supplyRequests.filter(r => r.status === statusFilter)

  function handleComplete(requestId: string) {
    if (!confirm('처리 완료로 변경하시겠습니까?')) return
    startTransition(async () => {
      const res = await completeSupplyAction(requestId)
      if (res.error) { toast.error(res.error); return }
      toast.success('처리 완료되었습니다.')
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">비품/소모품 관리</h1>

      {/* Status filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.filter(t => t.id === 'all' || counts[t.id] > 0).map(t => {
          const isActive = statusFilter === t.id
          return (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                isActive
                  ? t.id === 'REJECTED'  ? 'bg-red-500 text-white'
                  : t.id === 'PENDING'   ? 'bg-amber-500 text-white'
                  : t.id === 'APPROVED'  ? 'bg-green-600 text-white'
                  : t.id === 'COMPLETED' ? 'bg-blue-600 text-white'
                  : t.id === 'CANCELLED' ? 'bg-gray-500 text-white'
                  : 'bg-gray-700 text-white'
                  : t.id === 'REJECTED'  ? 'bg-red-50 text-red-500 hover:bg-red-100'
                  : t.id === 'PENDING'   ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                  : t.id === 'APPROVED'  ? 'bg-green-50 text-green-600 hover:bg-green-100'
                  : t.id === 'COMPLETED' ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  : t.id === 'CANCELLED' ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t.label}
              {t.id !== 'all' && <span className="ml-1 opacity-70">{counts[t.id]}</span>}
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
            비품/소모품 신청 내역이 없습니다.
          </div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filtered.map((req: any) => {
            const emp = req.employees
            const empLabel = [emp?.position, emp?.name].filter(Boolean).join(' ')
            const pendingLabel: string | null = req.pendingApproverLabel ?? null
            const statusInfo = req.status === 'PENDING' && pendingLabel
              ? { label: pendingLabel, className: getPendingClassName(pendingLabel) }
              : (SUPPLY_STATUS[req.status] ?? SUPPLY_STATUS.PENDING)
            const canComplete = req.status === 'APPROVED'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sortedItems = [...(req.supply_request_items ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{empLabel || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(req.created_at), 'yyyy.MM.dd HH:mm')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
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
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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

                {req.status === 'REJECTED' && req.rejectionComment && (
                  <p className="text-xs text-red-500">
                    <span className="text-red-400">반려사유</span> {req.rejectionComment}
                  </p>
                )}

                {canComplete && (
                  <button
                    type="button"
                    onClick={() => handleComplete(req.id)}
                    disabled={isPending}
                    className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
                  >
                    처리 완료
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
      {supplyRequests.length >= 100 && (
        <p className="text-xs text-center text-gray-400">최근 100건만 표시됩니다.</p>
      )}
    </div>
  )
}
