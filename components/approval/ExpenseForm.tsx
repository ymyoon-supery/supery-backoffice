'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitExpense } from '@/app/(dashboard)/approval/expense/actions'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Upload, X } from 'lucide-react'

const CATEGORIES = [
  { value: 'TRANSPORT', label: '교통비' },
  { value: 'MEAL', label: '식대' },
  { value: 'ACCOMMODATION', label: '숙박비' },
  { value: 'SUPPLIES', label: '소모품' },
  { value: 'OTHER', label: '기타' },
]

export default function ExpenseForm({ employeeId }: { employeeId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('MEAL')
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [description, setDescription] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSubmit = title.trim() && Number(amount) > 0 && expenseDate && !uploading

  async function uploadReceipt(file: File): Promise<string | null> {
    const supabase = createClient()
    const timestamp = Date.now()
    const path = `${employeeId}/${timestamp}_${file.name}`
    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, file, { upsert: false })
    if (error) {
      toast.error('영수증 업로드 실패: ' + error.message)
      return null
    }
    const { data } = supabase.storage.from('receipts').getPublicUrl(path)
    return data.publicUrl
  }

  function handleSubmit() {
    startTransition(async () => {
      let receiptUrl: string | null = null
      if (receiptFile) {
        setUploading(true)
        receiptUrl = await uploadReceipt(receiptFile)
        setUploading(false)
        if (!receiptUrl) return
      }

      const result = await submitExpense({
        title: title.trim(),
        amount: Number(amount),
        category,
        expenseDate,
        receiptUrl,
        description: description.trim() || null,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('지출결의서가 제출되었습니다.')
      router.push('/approval/inbox')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 팀 회식비"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">금액 (원)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            placeholder="0"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">지출일</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">분류</label>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                category === value
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">영수증 첨부</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
        />
        {receiptFile ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2">
            <span className="flex-1 truncate">{receiptFile.name}</span>
            <button
              type="button"
              onClick={() => setReceiptFile(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors w-full"
          >
            <Upload size={16} />
            영수증 사진 첨부 (선택)
          </button>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">설명 (선택)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          placeholder="지출 내역을 간략히 기재해주세요"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {isPending || uploading ? '제출 중...' : '지출결의서 제출'}
      </button>
    </div>
  )
}
