'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ApprovalItem } from '@/app/(admin)/admin/approval/page'
import ExpenseDetailView, { type ExpenseViewData } from '@/components/approval/ExpenseDetailView'

interface Props {
  item: ApprovalItem | null
  tab: string
  isPending: boolean
  onClose: () => void
  onApprove: () => void
  onFullApprove: () => void
  onReject: (reason?: string) => void
  onFullReject: (reason?: string) => void
}

export default function ExpenseDetailSheet({
  item, tab, isPending, onClose, onApprove, onFullApprove, onReject, onFullReject,
}: Props) {
  useEffect(() => {
    if (!item) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [!!item])

  useEffect(() => {
    if (!item) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [!!item, onClose])

  if (!item) return null

  const isFullApprove = item.managerName != null
  const canAct = tab === 'pending'

  const viewData: ExpenseViewData = {
    title: item.title ?? item.detail.split(' · ')[0] ?? '',
    taxType: item.taxType ?? null,
    evidenceType: item.evidenceType ?? null,
    payee: item.payee ?? null,
    paymentMethod: item.paymentMethod ?? null,
    bankName: item.bankName ?? null,
    accountNumber: item.accountNumber ?? null,
    accountHolder: item.accountHolder ?? null,
    paymentRequestDate: item.paymentRequestDate ?? null,
    settlementDate: item.settlementDate ?? null,
    lineItems: item.lineItems ?? [],
    attachmentUrls: item.attachmentUrls ?? [],
    employeeName: item.employeeName,
    employeePosition: item.employeePosition ?? null,
    departmentName: item.departmentName ?? null,
    requestDate: item.requestDate,
    status: item.status,
    comment: item.comment ?? null,
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[580px] max-w-full bg-gray-50 z-50 flex flex-col shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 bg-white ${isFullApprove ? 'border-orange-100' : 'border-gray-100'}`}>
          <div>
            <h2 className="font-semibold text-gray-900">지결서 상세</h2>
            <p className="text-xs text-gray-400 mt-0.5">{item.employeeName} · {item.typeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {isFullApprove && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                팀장결재대기
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body — ExpenseDetailView */}
        <div className="flex-1 p-4">
          <ExpenseDetailView
            data={viewData}
            onClose={onClose}
            onApprove={canAct ? (isFullApprove ? onFullApprove : onApprove) : undefined}
            onReject={canAct ? (isFullApprove ? onFullReject : onReject) : undefined}
            isPending={isPending}
          />
        </div>
      </div>
    </>
  )
}
