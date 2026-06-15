'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import ExpenseDetailView, { type ExpenseViewData } from '@/components/approval/ExpenseDetailView'

interface Props {
  data: ExpenseViewData | null
  onClose: () => void
  onApprove?: () => void
  onReject?: (reason?: string) => void
  isPending?: boolean
}

export default function ExpenseDetailModal({ data, onClose, onApprove, onReject, isPending }: Props) {
  useEffect(() => {
    if (!data) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [!!data])

  useEffect(() => {
    if (!data) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [!!data, onClose])

  if (!data) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto no-print">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-2xl my-8 mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          aria-label="닫기"
        >
          <X size={16} />
        </button>

        <ExpenseDetailView
          data={data}
          onClose={onClose}
          onApprove={onApprove}
          onReject={onReject}
          isPending={isPending}
        />
      </div>
    </div>
  )
}
