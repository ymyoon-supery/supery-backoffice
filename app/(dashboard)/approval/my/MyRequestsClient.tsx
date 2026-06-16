'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import ExpenseDetailModal from '@/components/approval/ExpenseDetailModal'
import type { ExpenseViewData } from '@/components/approval/ExpenseDetailView'
import {
  cancelLeaveRequest,
  cancelExpenseRequest,
  cancelDocumentRequest,
  cancelSupplyRequest,
} from './actions'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING:   { label: '대기',   className: 'bg-yellow-50 text-yellow-700' },
  APPROVED:  { label: '승인',   className: 'bg-green-50 text-green-700' },
  REJECTED:  { label: '반려',   className: 'bg-red-50 text-red-600' },
  COMPLETED: { label: '완료',   className: 'bg-blue-50 text-blue-700' },
}

const DOC_TYPE_LABELS: Record<string, string> = {
  EMPLOYMENT_CERT: '재직증명서',
  WITHHOLDING_RECEIPT: '원천징수영수증',
}

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품',
  CONSUMABLE: '소모품',
  SOFTWARE: '소프트웨어',
  OTHER: '기타',
}

interface LeaveItem {
  id: string
  kind: 'leave'
  leave_type: string
  start_date: string
  end_date: string
  days_used: number
  reason?: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  displayLabel: string
  leave_approval_steps?: Array<{ status: string; comment: string | null }>
}

interface ExpenseItem {
  id: string
  kind: 'expense'
  title: string
  amount: number
  category: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  displayLabel: string
  tax_type?: string | null
  evidence_type?: string | null
  payee?: string | null
  payment_method?: string | null
  bank_name?: string | null
  account_number?: string | null
  account_holder?: string | null
  payment_request_date?: string | null
  settlement_date?: string | null
  line_items?: Array<{ item: string; date: string; amount?: number; note?: string; count?: number }> | null
  attachment_urls?: string[] | null
}

interface DocumentRequest {
  id: string
  doc_type: string
  status: string
  purpose?: string | null
  created_at: string
}

interface SupplyRequestItem {
  id: string
  category: string
  description: string
  estimated_amount: number | null
  note: string | null
  sort_order: number
}

interface SupplyRequest {
  id: string
  status: string
  created_at: string
  supply_request_items: SupplyRequestItem[]
}

type AnyItem = LeaveItem | ExpenseItem

interface Props {
  items: AnyItem[]
  employeeName: string
  employeePosition: string | null
  departmentName: string | null
  documentRequests: DocumentRequest[]
  supplyRequests: SupplyRequest[]
}

export default function MyRequestsClient({
  items,
  employeeName,
  employeePosition,
  departmentName,
  documentRequests,
  supplyRequests,
}: Props) {
  const [selectedExpense, setSelectedExpense] = useState<ExpenseViewData | null>(null)
  const [expandedSupplyId, setExpandedSupplyId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function openExpense(item: ExpenseItem) {
    const viewData: ExpenseViewData = {
      title: item.title,
      taxType: item.tax_type ?? null,
      evidenceType: item.evidence_type ?? null,
      payee: item.payee ?? null,
      paymentMethod: item.payment_method ?? null,
      bankName: item.bank_name ?? null,
      accountNumber: item.account_number ?? null,
      accountHolder: item.account_holder ?? null,
      paymentRequestDate: item.payment_request_date ?? null,
      settlementDate: item.settlement_date ?? null,
      lineItems: item.line_items ?? [],
      attachmentUrls: item.attachment_urls ?? [],
      employeeName,
      employeePosition,
      departmentName,
      requestDate: item.created_at,
      status: item.status,
      comment: null,
    }
    setSelectedExpense(viewData)
  }

  function handleCancel(label: string, action: () => Promise<{ error: string | null }>) {
    if (!confirm(`${label} 신청을 취소하시겠습니까?`)) return
    startTransition(async () => {
      const res = await action()
      if (res.error) { toast.error(res.error); return }
      toast.success('취소되었습니다.')
      router.refresh()
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">내 신청 내역</h1>

      {/* Leave & Expense */}
      <div className="space-y-2">
        {items.length > 0 && (
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">연차 / 지출결의</p>
        )}
        {items.map(item => {
          const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING
          const rejectionReason = item.kind === 'leave' && item.status === 'REJECTED'
            ? item.leave_approval_steps?.find(s => s.status === 'REJECTED')?.comment
            : null

          return (
            <div
              key={item.id}
              className={`bg-white rounded-xl border border-gray-100 px-5 py-4 ${item.kind === 'expense' ? 'cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors' : ''}`}
              onClick={() => item.kind === 'expense' && openExpense(item)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{item.displayLabel}</p>
                  {item.kind === 'leave' ? (
                    <>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.start_date === item.end_date
                          ? item.start_date
                          : `${item.start_date} ~ ${item.end_date}`}
                        <span className="ml-2 text-gray-400">신청일 {format(new Date(item.created_at), 'yyyy.MM.dd')}</span>
                      </p>
                      {item.reason && (
                        <p className="text-xs text-gray-400 mt-0.5">사유: {item.reason}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(item.created_at), 'yyyy.MM.dd')}
                      <span className="ml-2 text-primary">· 클릭하여 상세보기</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                    {status.label}
                  </span>
                  {item.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        handleCancel(
                          item.kind === 'leave' ? item.displayLabel : item.displayLabel,
                          () => item.kind === 'leave'
                            ? cancelLeaveRequest(item.id)
                            : cancelExpenseRequest(item.id),
                        )
                      }}
                      disabled={isPending}
                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
              {rejectionReason && (
                <p className="text-xs text-red-500 mt-2 pl-0.5">반려 사유: {rejectionReason}</p>
              )}
            </div>
          )
        })}
        {items.length === 0 && documentRequests.length === 0 && supplyRequests.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
        )}
      </div>

      {/* Document Requests */}
      {documentRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">서류 신청</p>
          {documentRequests.map(doc => {
            const status = STATUS_LABELS[doc.status] ?? STATUS_LABELS.PENDING
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(doc.created_at), 'yyyy.MM.dd')}
                      {doc.purpose && <span className="ml-2">· {doc.purpose}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    {doc.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleCancel(DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type, () => cancelDocumentRequest(doc.id))}
                        disabled={isPending}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Supply Requests */}
      {supplyRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">비품/소모품 신청</p>
          {supplyRequests.map(req => {
            const status = STATUS_LABELS[req.status] ?? STATUS_LABELS.PENDING
            const isExpanded = expandedSupplyId === req.id
            const sortedItems = [...(req.supply_request_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)

            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setExpandedSupplyId(isExpanded ? null : req.id)}
                  >
                    <p className="text-sm font-medium text-gray-900">
                      비품/소모품 신청 · {sortedItems.length}개 항목
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(req.created_at), 'yyyy.MM.dd')}
                      <span className="ml-2 text-primary">· {isExpanded ? '접기' : '상세보기'}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    {req.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleCancel('비품/소모품 신청', () => cancelSupplyRequest(req.id))}
                        disabled={isPending}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">구분</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">내역</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">예상금액</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedItems.map(item => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-gray-600">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                            <td className="px-3 py-2 text-gray-800">{item.description}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {item.estimated_amount != null ? `${Number(item.estimated_amount).toLocaleString()}원` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-400">{item.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ExpenseDetailModal
        data={selectedExpense}
        onClose={() => setSelectedExpense(null)}
      />
    </div>
  )
}
