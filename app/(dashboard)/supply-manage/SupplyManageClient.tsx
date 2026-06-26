'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { approveSupplyAction } from '@/app/(dashboard)/documents/actions'

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품', CONSUMABLE: '소모품', SOFTWARE: '소프트웨어', OTHER: '기타',
}

const SUPPLY_STATUS: Record<string, { label: string; className: string }> = {
  PENDING:   { label: '대기중',   className: 'bg-amber-50 text-amber-700' },
  APPROVED:  { label: '승인완료', className: 'bg-green-50 text-green-700' },
  REJECTED:  { label: '반려',     className: 'bg-red-50 text-red-600' },
  COMPLETED: { label: '처리완료', className: 'bg-blue-50 text-blue-700' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SupplyManageClient({ supplyRequests, currentEmployeeId }: { supplyRequests: any[]; currentEmployeeId: string }) {
  const [isPending, startTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const router = useRouter()

  function handleApprove(requestId: string) {
    startTransition(async () => {
      const res = await approveSupplyAction(requestId, true)
      if (res.error) { toast.error(res.error); return }
      toast.success('승인되었습니다.')
      router.refresh()
    })
  }

  function handleReject(requestId: string) {
    startTransition(async () => {
      const res = await approveSupplyAction(requestId, false, rejectComment || undefined)
      if (res.error) { toast.error(res.error); return }
      toast.success('반려되었습니다.')
      setRejectingId(null)
      setRejectComment('')
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const myStep = (req.supply_approval_steps ?? []).find((s: any) => s.approver_id === currentEmployeeId && s.status === 'PENDING')
            const canAct = !!myStep
            const isRejecting = rejectingId === req.id
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

                {canAct && (
                  isRejecting ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={rejectComment}
                        onChange={e => setRejectComment(e.target.value)}
                        placeholder="반려 사유 (선택)"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleReject(req.id)} disabled={isPending}
                          className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700">
                          반려 확인
                        </button>
                        <button type="button" onClick={() => { setRejectingId(null); setRejectComment('') }}
                          className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleApprove(req.id)} disabled={isPending}
                        className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90">
                        승인
                      </button>
                      <button type="button" onClick={() => setRejectingId(req.id)} disabled={isPending}
                        className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50">
                        반려
                      </button>
                    </div>
                  )
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
