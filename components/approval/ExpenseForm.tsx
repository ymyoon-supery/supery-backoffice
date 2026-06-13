'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitExpense, type LineItem } from '@/app/(dashboard)/approval/expense/actions'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Plus, Trash2, Paperclip, X } from 'lucide-react'

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER'

interface Props {
  employeeId: string
  employeeName: string
  employeePosition: string
  departmentName: string
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'TRANSFER', label: '계좌송금' },
  { value: 'CARD', label: '회사카드' },
  { value: 'CASH', label: '현금' },
]

const today = format(new Date(), 'yyyy-MM-dd')

function formatKRW(value: string) {
  const n = value.replace(/[^0-9]/g, '')
  return n ? Number(n).toLocaleString('ko-KR') : ''
}

export default function ExpenseForm({ employeeId, employeeName, employeePosition, departmentName }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [payee, setPayee] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [paymentRequestDate, setPaymentRequestDate] = useState(today)
  const [settlementDate, setSettlementDate] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { item: '', date: today, count: 1 },
  ])
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const amount = Number(amountRaw.replace(/[^0-9]/g, ''))

  const canSubmit =
    title.trim() &&
    amount > 0 &&
    payee.trim() &&
    paymentRequestDate &&
    (paymentMethod !== 'TRANSFER' || (bankName.trim() && accountNumber.trim() && accountHolder.trim())) &&
    lineItems.every(r => r.item.trim() && r.date) &&
    !uploading

  function addLineItem() {
    setLineItems(prev => [...prev, { item: '', date: today, count: 1 }])
  }

  function removeLineItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLineItem<K extends keyof LineItem>(idx: number, key: K, value: LineItem[K]) {
    setLineItems(prev => prev.map((row, i) => i === idx ? { ...row, [key]: value } : row))
  }

  function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) setAttachments(prev => [...prev, ...files])
    e.target.value = ''
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  async function uploadFiles(files: File[]): Promise<string[]> {
    const supabase = createClient()
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const safeName = `${Date.now()}.${ext}`
      const path = `${employeeId}/${safeName}`
      const { error } = await supabase.storage
        .from('receipts')
        .upload(path, file, { upsert: false })
      if (error) {
        toast.error(`파일 업로드 실패: ${error.message}`)
        return []
      }
      const { data } = supabase.storage.from('receipts').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        attachmentUrls = await uploadFiles(attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const result = await submitExpense({
        title: title.trim(),
        amount,
        payee: payee.trim(),
        paymentMethod,
        bankName: paymentMethod === 'TRANSFER' ? bankName.trim() : null,
        accountNumber: paymentMethod === 'TRANSFER' ? accountNumber.trim() : null,
        accountHolder: paymentMethod === 'TRANSFER' ? accountHolder.trim() : null,
        paymentRequestDate,
        settlementDate: settlementDate || null,
        lineItems: lineItems.map(r => ({ ...r, count: Number(r.count) })),
        attachmentUrls,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('지출결의서가 제출되었습니다.')
      router.push('/approval/my')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 text-center">
        <h2 className="text-base font-bold text-gray-800 tracking-widest">지 출 결 의 서</h2>
      </div>

      <div className="p-6 space-y-6">

        {/* 제목 */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 팀 회식비 정산"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* 지출금액 + 지급처 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지출금액</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={amountRaw}
                onChange={(e) => setAmountRaw(formatKRW(e.target.value))}
                placeholder="0"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지급처</label>
            <input
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="예: 주식회사 OO"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* 지급방식 */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지급방식</label>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPaymentMethod(value)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  paymentMethod === value
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {paymentMethod === 'TRANSFER' && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">은행명</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="국민은행"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">계좌번호</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="000-0000-0000"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">예금주</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="홍길동"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}
        </div>

        {/* 지급요청일 + 정산(예정)일 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지급요청일</label>
            <input
              type="date"
              value={paymentRequestDate}
              onChange={(e) => setPaymentRequestDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              정산(예정)일 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              type="date"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* 지출 내역 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지출 내역</label>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">지출항목</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[140px]">지출일</th>
                  <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-[90px]">입금건수</th>
                  <th className="w-[40px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.item}
                        onChange={(e) => updateLineItem(idx, 'item', e.target.value)}
                        placeholder="항목 입력"
                        className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateLineItem(idx, 'date', e.target.value)}
                        className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={1}
                        value={row.count}
                        onChange={(e) => updateLineItem(idx, 'count', Number(e.target.value))}
                        className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white text-center"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addLineItem}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus size={13} />
            항목 추가
          </button>
        </div>

        {/* 증빙 및 첨부파일 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">증빙 및 첨부파일</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileAdd}
          />
          {attachments.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                >
                  <Paperclip size={13} className="text-gray-400 shrink-0" />
                  <span className="flex-1 truncate text-xs">{file.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {(file.size / 1024).toFixed(0)}KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-xs text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors w-full"
          >
            <Paperclip size={13} />
            파일 첨부 (이미지, PDF)
          </button>
        </div>

        {/* 신청인 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">신청인</label>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center">부서명</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center border-l border-gray-200">직급</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center border-l border-gray-200">성명</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 text-center text-sm text-gray-700">{departmentName || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-700 border-l border-gray-100">{employeePosition || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border-l border-gray-100">{employeeName}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending || uploading}
          className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '지출결의서 제출'}
        </button>
      </div>
    </div>
  )
}
