'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import ExpenseDetailModal from '@/components/approval/ExpenseDetailModal'
import type { ExpenseViewData } from '@/components/approval/ExpenseDetailView'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING:  { label: '대기', className: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { label: '승인', className: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려', className: 'bg-red-50 text-red-600' },
}

interface LeaveItem {
  id: string
  kind: 'leave'
  leave_type: string
  start_date: string
  end_date: string
  days_used: number
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

type AnyItem = LeaveItem | ExpenseItem

interface Props {
  items: AnyItem[]
  employeeName: string
  employeePosition: string | null
  departmentName: string | null
}

export default function MyRequestsClient({ items, employeeName, employeePosition, departmentName }: Props) {
  const [selectedExpense, setSelectedExpense] = useState<ExpenseViewData | null>(null)

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

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">내 신청 내역</h1>
      <div className="space-y-2">
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.displayLabel}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(item.created_at), 'yyyy.MM.dd')}
                    {item.kind === 'expense' && (
                      <span className="ml-2 text-primary">· 클릭하여 상세보기</span>
                    )}
                  </p>
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
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
        )}
      </div>

      <ExpenseDetailModal
        data={selectedExpense}
        onClose={() => setSelectedExpense(null)}
      />
    </div>
  )
}
