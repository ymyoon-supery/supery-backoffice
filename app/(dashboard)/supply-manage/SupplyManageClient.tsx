'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { completeSupplyAction } from './actions'

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품', CONSUMABLE: '소모품', SOFTWARE: '소프트웨어', OTHER: '기타',
}

const SUPPLY_STATUS: Record<string, { label: string; className: string }> = {
  PENDING:   { label: '결재대기', className: 'bg-amber-50 text-amber-700' },
  APPROVED:  { label: '결재완료', className: 'bg-green-50 text-green-700' },
  REJECTED:  { label: '반려',     className: 'bg-red-50 text-red-600' },
  COMPLETED: { label: '처리완료', className: 'bg-blue-50 text-blue-700' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SupplyManageClient({ supplyRequests }: { supplyRequests: any[] }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

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

      <div className="space-y-3">
        {supplyRequests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-12 text-center text-sm text-gray-400">
            비품/소모품 신청 내역이 없습니다.
          </div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supplyRequests.map((req: any) => {
            const emp = req.employees
            const empLabel = [emp?.position, emp?.name].filter(Boolean).join(' ')
            const statusInfo = SUPPLY_STATUS[req.status] ?? SUPPLY_STATUS.PENDING
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
    </div>
  )
}
