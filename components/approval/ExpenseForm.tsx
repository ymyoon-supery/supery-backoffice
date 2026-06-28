'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  submitExpense,
  submitBusinessIncomeExpense,
  submitPrizeExpense,
  type LineItem,
} from '@/app/(dashboard)/approval/expense/actions'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Plus, Trash2, Paperclip, X, FileSpreadsheet } from 'lucide-react'

type ActiveTab = 'EXPENSE' | 'CORPORATE_CARD' | 'TRANSPORTATION' | 'BUSINESS_INCOME' | 'PRIZE'
type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER'

interface Props {
  employeeId: string
  employeeName: string
  employeePosition: string
  departmentName: string
}

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'EXPENSE',         label: '지출결의서' },
  { id: 'CORPORATE_CARD',  label: '법인카드' },
  { id: 'TRANSPORTATION',  label: '교통비' },
  { id: 'BUSINESS_INCOME', label: '사업소득' },
  { id: 'PRIZE',           label: '경품비' },
]

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'TRANSFER', label: '계좌송금' },
  { value: 'CARD', label: '회사카드' },
  { value: 'CASH', label: '현금' },
]

const EVIDENCE_TYPE_OPTIONS = [
  { value: 'TAX_INVOICE',        label: '세금계산서' },
  { value: 'ELECTRONIC_INVOICE', label: '전자계산서(또는 인보이스)' },
  { value: 'BUSINESS_RECEIPT',   label: '사업자지출증빙' },
  { value: 'CORPORATE_CARD',     label: '법인카드영수증' },
  { value: 'PERSONAL_CARD',      label: '개인카드영수증' },
  { value: 'OTHER_RECEIPT',      label: '기타-개별영수증' },
]

const today = format(new Date(), 'yyyy-MM-dd')

// ─── Types ────────────────────────────────────────────────────────────────────

type CardLineItem = {
  cardLastFour: string   // 법인카드 번호 (끝 4자리) — Excel에서 추출
  userName: string       // 이용자명 — Excel에서 추출
  usageDate: string      // 이용일 — Excel에서 추출
  merchantName: string   // 가맹점명 — Excel에서 추출
  amountRaw: string      // 이용금액 — Excel에서 추출
  description: string    // 사용내역 — 수동 입력
  note: string           // 비고 — 수동 입력 (선택)
}

type TransportLineItem = {
  usageDate: string
  amountRaw: string
  description: string
  note: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRWInput(value: string) {
  const n = value.replace(/[^0-9]/g, '')
  return n ? Number(n).toLocaleString('ko-KR') : ''
}

function parseExcelDate(val: unknown): string {
  if (!val) return today
  if (val instanceof Date) return format(val, 'yyyy-MM-dd')
  const s = String(val).trim().replace(/\./g, '-')
  if (/^\d{8}$/.test(s.replace(/-/g, ''))) {
    const d = s.replace(/-/g, '')
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  }
  return s || today
}

function findColIdx(headers: string[], candidates: string[]): number {
  return headers.findIndex(h =>
    candidates.some(c => String(h ?? '').includes(c))
  )
}

async function parseCardExcel(file: File): Promise<CardLineItem[] | null> {
  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
    if (!rows.length) return null

    // 헤더 행 탐색 (최대 5행 이내)
    let headerRowIdx = 0
    let headers: string[] = []
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = (rows[i] as unknown[]).map((v) => String(v ?? ''))
      if (row.some(h => ['이용', '금액', '가맹점', '사용', '카드', '날짜', '일자'].some(k => h.includes(k)))) {
        headers = row
        headerRowIdx = i
        break
      }
    }
    if (!headers.length) return null

    const cardIdx   = findColIdx(headers, ['카드번호', '카드 번호', '법인카드'])
    const userIdx   = findColIdx(headers, ['이용자', '사용자', '카드소지', '회원명', '성명'])
    const dateIdx   = findColIdx(headers, ['이용일', '사용일', '거래일', '승인일', '일자'])
    const merchantIdx = findColIdx(headers, ['가맹점', '상호', '업체명', '거래처'])
    const amountIdx = findColIdx(headers, ['이용금액', '사용금액', '금액', '결제금액', '승인금액'])

    const items: CardLineItem[] = []
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      if (!row || !row.length) continue
      const rawAmt = String(row[amountIdx] ?? '').replace(/[^0-9]/g, '')
      if (!rawAmt && amountIdx >= 0) continue  // 빈 행 스킵

      // 카드번호 끝 4자리 추출
      let cardFour = ''
      if (cardIdx >= 0 && row[cardIdx]) {
        const full = String(row[cardIdx]).replace(/[^0-9]/g, '')
        cardFour = full.slice(-4)
      }

      items.push({
        cardLastFour: cardFour,
        userName: userIdx >= 0 ? String(row[userIdx] ?? '').trim() : '',
        usageDate: dateIdx >= 0 ? parseExcelDate(row[dateIdx]) : today,
        merchantName: merchantIdx >= 0 ? String(row[merchantIdx] ?? '').trim() : '',
        amountRaw: rawAmt ? Number(rawAmt).toLocaleString('ko-KR') : '',
        description: '',
        note: '',
      })
    }
    return items.length > 0 ? items : null
  } catch {
    return null
  }
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {children}
    </label>
  )
}

function ApplicantBox({
  departmentName,
  employeePosition,
  employeeName,
}: {
  departmentName: string
  employeePosition: string
  employeeName: string
}) {
  return (
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
  )
}

function AttachmentSection({
  attachments,
  onAdd,
  onRemove,
  accept = 'image/*,application/pdf',
  label = '파일 첨부 (이미지, PDF)',
}: {
  attachments: File[]
  onAdd: (files: File[]) => void
  onRemove: (idx: number) => void
  accept?: string
  label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onAdd(files)
          e.target.value = ''
        }}
      />
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
            >
              <Paperclip size={13} className="text-gray-400 shrink-0" />
              <span className="flex-1 truncate text-xs text-gray-600">{file.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
              <button type="button" onClick={() => onRemove(idx)} className="text-gray-300 hover:text-red-400 transition-colors">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 text-xs text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-2.5 hover:bg-gray-50 transition-colors w-full"
      >
        <Paperclip size={13} />
        {label}
      </button>
    </div>
  )
}

async function uploadFiles(
  supabase: ReturnType<typeof createClient>,
  employeeId: string,
  files: File[],
): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop()
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const path = `${employeeId}/${safeName}`
    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: false })
    if (error) {
      toast.error(`파일 업로드 실패: ${error.message}`)
      return []
    }
    const { data } = supabase.storage.from('receipts').getPublicUrl(path)
    urls.push(data.publicUrl)
  }
  return urls
}

// ─── Tab 1: 지출결의서 ────────────────────────────────────────────────────────

type ExpenseRow = { item: string; date: string; amountRaw: string; vatType: 'INCLUSIVE' | 'EXCLUSIVE'; note: string }

function calcVat(amountRaw: string, vatType: 'INCLUSIVE' | 'EXCLUSIVE') {
  const raw = Number(amountRaw.replace(/[^0-9]/g, '')) || 0
  if (!raw) return { supply: 0, vat: 0, total: 0 }
  if (vatType === 'EXCLUSIVE') {
    const vat = Math.round(raw * 0.1)
    return { supply: raw, vat, total: raw + vat }
  }
  const supply = Math.round(raw * 100 / 110)
  return { supply, vat: raw - supply, total: raw }
}

function ExpenseTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [evidenceType, setEvidenceType] = useState('')
  const [payee, setPayee] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [paymentRequestDate, setPaymentRequestDate] = useState(today)
  const [settlementDate, setSettlementDate] = useState('')
  const [lineItems, setLineItems] = useState<ExpenseRow[]>([{ item: '', date: today, amountRaw: '', vatType: 'EXCLUSIVE', note: '' }])
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const rowCalcs = lineItems.map(r => calcVat(r.amountRaw, r.vatType))
  const totalSupply = rowCalcs.reduce((s, r) => s + r.supply, 0)
  const totalVat = rowCalcs.reduce((s, r) => s + r.vat, 0)
  const totalAmount = rowCalcs.reduce((s, r) => s + r.total, 0)

  const canSubmit =
    title.trim() &&
    evidenceType &&
    payee.trim() &&
    paymentRequestDate &&
    totalAmount > 0 &&
    (paymentMethod !== 'TRANSFER' || (bankName.trim() && accountNumber.trim() && accountHolder.trim())) &&
    lineItems.every(r => r.item.trim() && r.date) &&
    !uploading

  function updateRow(idx: number, key: string, value: string) {
    setLineItems(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  }

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const items: LineItem[] = lineItems.map((r, idx) => {
        const calc = rowCalcs[idx]
        const vatNote = r.vatType === 'EXCLUSIVE'
          ? `공급가액 ${calc.supply.toLocaleString('ko-KR')}원 + 부가세 ${calc.vat.toLocaleString('ko-KR')}원`
          : `부가세포함 (공급가액 ${calc.supply.toLocaleString('ko-KR')}원)`
        return {
          item: r.item.trim(),
          date: r.date,
          amount: calc.total,
          note: [vatNote, r.note.trim() || null].filter(Boolean).join(' / ') || undefined,
        }
      })

      const result = await submitExpense({
        title: title.trim(),
        payee: payee.trim(),
        paymentMethod,
        bankName: paymentMethod === 'TRANSFER' ? bankName.trim() : null,
        accountNumber: paymentMethod === 'TRANSFER' ? accountNumber.trim() : null,
        accountHolder: paymentMethod === 'TRANSFER' ? accountHolder.trim() : null,
        paymentRequestDate,
        settlementDate: settlementDate || null,
        lineItems: items,
        attachmentUrls,
        taxType: null,
        evidenceType: evidenceType || null,
        category: 'OTHER',
        expenseType: 'EXPENSE',
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('지출결의서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* 제목 */}
      <div className="space-y-1.5">
        <SectionLabel>제목</SectionLabel>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 인스타그램 홍보비 지급"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 증빙 */}
      <div className="space-y-2">
        <SectionLabel>증빙</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EVIDENCE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setEvidenceType(opt.value)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                evidenceType === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 지급처 */}
      <div className="space-y-1.5">
        <SectionLabel>지급처</SectionLabel>
        <input
          type="text"
          value={payee}
          onChange={e => setPayee(e.target.value)}
          placeholder="예: 주식회사 OO"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 지급방식 */}
      <div className="space-y-3">
        <SectionLabel>지급방식</SectionLabel>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {[
              { label: '은행명', value: bankName, onChange: setBankName, placeholder: '국민은행' },
              { label: '계좌번호', value: accountNumber, onChange: setAccountNumber, placeholder: '000-0000-0000' },
              { label: '예금주', value: accountHolder, onChange: setAccountHolder, placeholder: '홍길동' },
            ].map(f => (
              <div key={f.label} className="space-y-1.5">
                <label className="text-xs text-gray-500">{f.label}</label>
                <input
                  type="text"
                  value={f.value}
                  onChange={e => f.onChange(e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 날짜 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <SectionLabel>지급요청일</SectionLabel>
          <input
            type="date"
            value={paymentRequestDate}
            onChange={e => setPaymentRequestDate(e.target.value)}
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
            onChange={e => setSettlementDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* 지출 내역 */}
      <div className="space-y-2">
        <SectionLabel>지출 내역</SectionLabel>
        <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 680 }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[14%] whitespace-nowrap">지출일</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">지출항목</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[16%] whitespace-nowrap">금액(원)</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-[16%]">부가세</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[14%] whitespace-nowrap">합계(원)</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[12%]">비고</th>
                <th className="w-[4%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.map((row, idx) => {
                const calc = rowCalcs[idx]
                return (
                  <tr key={idx}>
                    <td className="px-2 py-1.5">
                      <input type="date" value={row.date} onChange={e => updateRow(idx, 'date', e.target.value)} className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={row.item} onChange={e => updateRow(idx, 'item', e.target.value)} placeholder="항목 입력" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" inputMode="numeric" value={row.amountRaw} onChange={e => updateRow(idx, 'amountRaw', formatKRWInput(e.target.value))} placeholder="0" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1 justify-center">
                        <button type="button" onClick={() => updateRow(idx, 'vatType', 'EXCLUSIVE')}
                          className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${row.vatType === 'EXCLUSIVE' ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                          별도
                        </button>
                        <button type="button" onClick={() => updateRow(idx, 'vatType', 'INCLUSIVE')}
                          className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${row.vatType === 'INCLUSIVE' ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                          포함
                        </button>
                      </div>
                      {calc.vat > 0 && (
                        <p className="text-center text-xs text-gray-400 mt-0.5 tabular-nums">
                          {calc.vat.toLocaleString('ko-KR')}원
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={`text-sm tabular-nums ${calc.total > 0 ? 'font-semibold text-gray-900' : 'text-gray-300'}`}>
                        {calc.total > 0 ? calc.total.toLocaleString('ko-KR') : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={row.note} onChange={e => updateRow(idx, 'note', e.target.value)} placeholder="비고" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {lineItems.length > 1 && (
                        <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50 divide-y divide-gray-100">
              <tr>
                <td colSpan={2} className="px-3 py-1.5 text-xs text-gray-500">공급가액 합계</td>
                <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-gray-600 tabular-nums">
                  {totalSupply > 0 ? totalSupply.toLocaleString('ko-KR') + '원' : '—'}
                </td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={2} className="px-3 py-1.5 text-xs text-gray-500">부가세 합계</td>
                <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-gray-600 tabular-nums">
                  {totalVat > 0 ? totalVat.toLocaleString('ko-KR') + '원' : '—'}
                </td>
                <td colSpan={2} />
              </tr>
              <tr className="border-t border-gray-200">
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-700">최종합계 (부가세포함)</td>
                <td colSpan={3} className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums">
                  {totalAmount > 0 ? totalAmount.toLocaleString('ko-KR') + '원' : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" onClick={() => setLineItems(prev => [...prev, { item: '', date: today, amountRaw: '', vatType: 'EXCLUSIVE', note: '' }])} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
          <Plus size={13} /> 항목 추가
        </button>
      </div>

      {/* 증빙 및 첨부파일 */}
      <div className="space-y-2">
        <SectionLabel>증빙 및 첨부파일</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
        />
      </div>

      {/* 신청인 */}
      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending || uploading}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '지출결의서 제출'}
      </button>
    </div>
  )
}

// ─── Tab 2: 법인카드 사용 내역서 ──────────────────────────────────────────────

function CorporateCardTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [lineItems, setLineItems] = useState<CardLineItem[]>([
    { cardLastFour: '', userName: employeeName, usageDate: today, merchantName: '', amountRaw: '', description: '', note: '' },
  ])
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const excelRef = useRef<HTMLInputElement>(null)

  const totalAmount = lineItems.reduce(
    (sum, r) => sum + (Number(r.amountRaw.replace(/[^0-9]/g, '')) || 0),
    0,
  )

  // 모든 행의 카드 번호 중 첫 번째 유효한 값 (헤더에 표시용)
  const representativeCard = lineItems.find(r => r.cardLastFour)?.cardLastFour ?? ''

  const canSubmit =
    totalAmount > 0 &&
    lineItems.every(r => r.merchantName.trim() && r.usageDate && r.description.trim()) &&
    !uploading &&
    !parsing

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParsing(true)
    const parsed = await parseCardExcel(file)
    setParsing(false)
    if (!parsed || parsed.length === 0) {
      toast.error('엑셀 파일에서 사용 내역을 추출할 수 없습니다. 열 이름을 확인해 주세요.')
      return
    }
    // 기존 수동 입력 내역(description, note)이 있으면 병합
    setLineItems(prev => {
      const manualMap = new Map(prev.map((r, i) => [i, { description: r.description, note: r.note }]))
      return parsed.map((r, i) => ({
        ...r,
        description: manualMap.get(i)?.description ?? '',
        note: manualMap.get(i)?.note ?? '',
      }))
    })
    toast.success(`${parsed.length}건의 사용 내역을 추출했습니다.`)
  }

  function updateItem(idx: number, key: keyof CardLineItem, value: string) {
    setLineItems(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  }

  function addItem() {
    setLineItems(prev => [
      ...prev,
      { cardLastFour: representativeCard, userName: employeeName, usageDate: today, merchantName: '', amountRaw: '', description: '', note: '' },
    ])
  }

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const items: LineItem[] = lineItems.map(r => ({
        item: [r.merchantName.trim(), r.description.trim()].filter(Boolean).join(' — '),
        userName: r.userName.trim() || undefined,
        date: r.usageDate,
        amount: Number(r.amountRaw.replace(/[^0-9]/g, '')) || 0,
        note: r.note.trim() || undefined,
      }))

      const cardDisplay = representativeCard ? `(${representativeCard})` : ''
      const result = await submitExpense({
        title: `법인카드${cardDisplay} 사용내역`,
        payee: `법인카드 ${representativeCard}`.trim(),
        paymentMethod: 'CARD',
        bankName: null,
        accountNumber: null,
        accountHolder: null,
        paymentRequestDate: today,
        settlementDate: null,
        lineItems: items,
        attachmentUrls,
        taxType: null,
        evidenceType: 'CORPORATE_CARD',
        category: 'OTHER',
        expenseType: 'CORPORATE_CARD',
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('법인카드 사용내역서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">

      {/* 엑셀 업로드 안내 */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-start gap-3">
        <FileSpreadsheet size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-700">엑셀 파일로 자동 입력</p>
          <p className="text-xs text-blue-600 mt-0.5">
            법인카드 사용 내역 엑셀 파일을 업로드하면 법인카드 번호·이용자명·이용일·가맹점명·이용금액이 자동으로 입력됩니다.
            사용내역과 비고는 직접 입력해 주세요.
          </p>
        </div>
        <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
        <button
          type="button"
          onClick={() => excelRef.current?.click()}
          disabled={parsing}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet size={13} />
          {parsing ? '추출 중...' : '엑셀 업로드'}
        </button>
      </div>

      {/* 사용 내역 테이블 */}
      <div className="space-y-2">
        <SectionLabel>사용 내역</SectionLabel>
        <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 860 }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {/* Excel 자동 추출 항목 */}
                <th className="px-3 py-2.5 text-center text-xs font-medium text-blue-600 w-[8%] bg-blue-50/60">
                  카드번호<br />(끝4자리)
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-blue-600 w-[9%] bg-blue-50/60">이용자명</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-blue-600 w-[12%] bg-blue-50/60 whitespace-nowrap">이용일</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-blue-600 w-[18%] bg-blue-50/60">가맹점명</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-blue-600 w-[12%] bg-blue-50/60 whitespace-nowrap">이용금액(원)</th>
                {/* 수동 입력 항목 */}
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 border-l-2 border-blue-100">사용내역</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[10%]">
                  비고 <span className="text-gray-400 font-normal">(선택)</span>
                </th>
                <th className="w-[4%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  {/* Excel 자동 추출 항목 — 수정 가능하지만 배경으로 구분 */}
                  <td className="px-2 py-1.5 bg-blue-50/20">
                    <input
                      type="text"
                      value={row.cardLastFour}
                      onChange={e => updateItem(idx, 'cardLastFour', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                      placeholder="1234"
                      maxLength={4}
                      className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-white focus:bg-white text-center font-mono tracking-widest"
                    />
                  </td>
                  <td className="px-2 py-1.5 bg-blue-50/20">
                    <input type="text" value={row.userName} onChange={e => updateItem(idx, 'userName', e.target.value)} placeholder="이름" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-white focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5 bg-blue-50/20">
                    <input type="date" value={row.usageDate} onChange={e => updateItem(idx, 'usageDate', e.target.value)} className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-white focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5 bg-blue-50/20">
                    <input type="text" value={row.merchantName} onChange={e => updateItem(idx, 'merchantName', e.target.value)} placeholder="가맹점명" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-white focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5 bg-blue-50/20">
                    <input type="text" inputMode="numeric" value={row.amountRaw} onChange={e => updateItem(idx, 'amountRaw', formatKRWInput(e.target.value))} placeholder="0" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-white focus:bg-white text-right" />
                  </td>
                  {/* 수동 입력 항목 */}
                  <td className="px-2 py-1.5 border-l-2 border-blue-100">
                    <input type="text" value={row.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="예: 팀 회식" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={row.note} onChange={e => updateItem(idx, 'note', e.target.value)} placeholder="비고" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600">이용합계</td>
                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums">
                  {totalAmount > 0 ? totalAmount.toLocaleString('ko-KR') + '원' : '—'}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
            <Plus size={13} /> 항목 추가
          </button>
          <span className="text-xs text-blue-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-blue-100 border border-blue-200 inline-block" />
            파란 배경 = 엑셀에서 자동 입력되는 항목
          </span>
        </div>
      </div>

      {/* 증빙 첨부 */}
      <div className="space-y-2">
        <SectionLabel>증빙 첨부</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
          accept="image/*,application/pdf,.xlsx,.xls"
          label="파일 첨부 (영수증, PDF, 엑셀)"
        />
      </div>

      {/* 신청인 */}
      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '법인카드 사용내역서 제출'}
      </button>
    </div>
  )
}

// ─── Tab 3: 교통비 사용내역서 ─────────────────────────────────────────────────

function TransportationTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [lineItems, setLineItems] = useState<TransportLineItem[]>([
    { usageDate: today, amountRaw: '', description: '', note: '' },
  ])
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const totalAmount = lineItems.reduce(
    (sum, r) => sum + (Number(r.amountRaw.replace(/[^0-9]/g, '')) || 0),
    0,
  )

  const canSubmit =
    totalAmount > 0 &&
    lineItems.every(r => r.description.trim() && r.usageDate) &&
    !uploading

  function updateItem(idx: number, key: keyof TransportLineItem, value: string) {
    setLineItems(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  }

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const items: LineItem[] = lineItems.map(r => ({
        item: r.description.trim(),
        date: r.usageDate,
        amount: Number(r.amountRaw.replace(/[^0-9]/g, '')) || 0,
        note: r.note.trim() || undefined,
      }))

      const result = await submitExpense({
        title: `교통비 사용내역 — ${employeeName}`,
        payee: employeeName,
        paymentMethod: 'CASH',
        bankName: null,
        accountNumber: null,
        accountHolder: null,
        paymentRequestDate: today,
        settlementDate: null,
        lineItems: items,
        attachmentUrls,
        taxType: null,
        evidenceType: 'OTHER_RECEIPT',
        category: 'OTHER',
        expenseType: 'TRANSPORTATION',
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('교통비 사용내역서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* 신청인 */}
      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      {/* 사용 내역 */}
      <div className="space-y-2">
        <SectionLabel>교통비 사용 내역</SectionLabel>
        <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 420 }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[20%] whitespace-nowrap">이용일</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[20%] whitespace-nowrap">금액(원)</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">사용내역</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[16%]">
                  비고 <span className="text-gray-400 font-normal">(선택)</span>
                </th>
                <th className="w-[4%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-1.5">
                    <input type="date" value={row.usageDate} onChange={e => updateItem(idx, 'usageDate', e.target.value)} className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" inputMode="numeric" value={row.amountRaw} onChange={e => updateItem(idx, 'amountRaw', formatKRWInput(e.target.value))} placeholder="0" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white text-right" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={row.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="예: 강남역 → 판교역 (지하철)" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={row.note} onChange={e => updateItem(idx, 'note', e.target.value)} placeholder="비고" className="w-full text-sm px-2 py-1.5 rounded border border-transparent focus:border-gray-300 focus:outline-none bg-transparent hover:bg-gray-50 focus:bg-white" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td className="px-3 py-2 text-xs font-semibold text-gray-600">합계</td>
                <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums">
                  {totalAmount > 0 ? totalAmount.toLocaleString('ko-KR') + '원' : '—'}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" onClick={() => setLineItems(prev => [...prev, { usageDate: today, amountRaw: '', description: '', note: '' }])} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
          <Plus size={13} /> 항목 추가
        </button>
      </div>

      {/* 증빙 첨부 */}
      <div className="space-y-2">
        <SectionLabel>증빙 첨부</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
          label="파일 첨부 (영수증)"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '교통비 사용내역서 제출'}
      </button>
    </div>
  )
}

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function formatSSN(value: string) {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 13)
  if (digits.length > 6) return `${digits.slice(0, 6)}-${digits.slice(6)}`
  return digits
}

// ─── Tab 4: 사업소득(원천징수) 지급요청서 ─────────────────────────────────────

type BusinessIncomeFields = {
  recipientName: string
  ssn: string
  grossAmountRaw: string
  description: string
  bankName: string
  accountNumber: string
  note: string
}

function BusinessIncomeTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [fields, setFields] = useState<BusinessIncomeFields>({
    recipientName: '',
    ssn: '',
    grossAmountRaw: '',
    description: '',
    bankName: '',
    accountNumber: '',
    note: '',
  })
  const [paymentRequestDate, setPaymentRequestDate] = useState(today)
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  function setField(key: keyof BusinessIncomeFields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  const grossAmount = Number(fields.grossAmountRaw.replace(/[^0-9]/g, '')) || 0
  const withholding = Math.floor(grossAmount * 0.033)
  const netAmount = grossAmount - withholding
  const ssnClean = fields.ssn.replace(/-/g, '')

  const canSubmit =
    fields.recipientName.trim() !== '' &&
    ssnClean.length === 13 &&
    grossAmount > 0 &&
    fields.description.trim() !== '' &&
    fields.bankName.trim() !== '' &&
    fields.accountNumber.trim() !== '' &&
    !uploading

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const result = await submitBusinessIncomeExpense({
        recipientName: fields.recipientName.trim(),
        ssn: ssnClean,
        grossAmount,
        description: fields.description.trim(),
        bankName: fields.bankName.trim(),
        accountNumber: fields.accountNumber.trim(),
        note: fields.note.trim(),
        attachmentUrls,
        paymentRequestDate,
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('사업소득 지급요청서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <SectionLabel>이름</SectionLabel>
          <input
            type="text"
            value={fields.recipientName}
            onChange={e => setField('recipientName', e.target.value)}
            placeholder="홍길동"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>주민번호</SectionLabel>
          <input
            type="text"
            value={fields.ssn}
            onChange={e => setField('ssn', formatSSN(e.target.value))}
            placeholder="000000-0000000"
            maxLength={14}
            autoComplete="off"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wider"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionLabel>지급 금액 (세전)</SectionLabel>
        <input
          type="text"
          inputMode="numeric"
          value={fields.grossAmountRaw}
          onChange={e => setField('grossAmountRaw', formatKRWInput(e.target.value))}
          placeholder="0"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
        />
      </div>

      {grossAmount > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-200">
          <div className="flex justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-500">원천징수액 (3.3%)</span>
            <span className="text-gray-700 tabular-nums">- {withholding.toLocaleString('ko-KR')}원</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-700">실지급액</span>
            <span className="text-base font-bold text-primary tabular-nums">{netAmount.toLocaleString('ko-KR')}원</span>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <SectionLabel>내역</SectionLabel>
        <input
          type="text"
          value={fields.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="예: 2026년 6월 영상 편집 용역"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <SectionLabel>은행</SectionLabel>
          <input
            type="text"
            value={fields.bankName}
            onChange={e => setField('bankName', e.target.value)}
            placeholder="국민은행"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>계좌번호</SectionLabel>
          <input
            type="text"
            value={fields.accountNumber}
            onChange={e => setField('accountNumber', e.target.value)}
            placeholder="000-0000-0000"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionLabel>지급요청일</SectionLabel>
        <input
          type="date"
          value={paymentRequestDate}
          onChange={e => setPaymentRequestDate(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          비고 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={fields.note}
          onChange={e => setField('note', e.target.value)}
          placeholder="기타 참고사항"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>첨부파일</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending || uploading}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '사업소득 지급요청서 제출'}
      </button>
    </div>
  )
}

// ─── Tab 5: 현금성 경품비(기타소득) 지급요청서 ───────────────────────────────

type PrizeFields = {
  recipientName: string
  ssn: string
  prizeAmountRaw: string
  taxPaymentType: 'SELF' | 'COMPANY'
  paymentType: 'GIFT_CARD' | 'CASH'
  giftCardEvidence: 'CORPORATE_CARD' | 'PERSONAL_CARD'
  bankName: string
  accountNumber: string
  note: string
}

function PrizeTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [isOver50k, setIsOver50k] = useState(false)
  const [fields, setFields] = useState<PrizeFields>({
    recipientName: '',
    ssn: '',
    prizeAmountRaw: '',
    taxPaymentType: 'SELF',
    paymentType: 'CASH',
    giftCardEvidence: 'CORPORATE_CARD',
    bankName: '',
    accountNumber: '',
    note: '',
  })
  const [paymentRequestDate, setPaymentRequestDate] = useState(today)
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  function setField(key: keyof PrizeFields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  const prizeAmount = Number(fields.prizeAmountRaw.replace(/[^0-9]/g, '')) || 0
  const taxAmount = isOver50k
    ? fields.taxPaymentType === 'SELF'
      ? Math.floor(prizeAmount * 0.22)
      : Math.floor(prizeAmount * 0.22 / 0.78)
    : 0
  const ssnClean = fields.ssn.replace(/-/g, '')

  const amountExceeds50k = !isOver50k && prizeAmount > 50000

  const canSubmit =
    fields.recipientName.trim() !== '' &&
    prizeAmount > 0 &&
    !amountExceeds50k &&
    (!isOver50k || ssnClean.length === 13) &&
    (fields.paymentType === 'GIFT_CARD' || (fields.bankName.trim() !== '' && fields.accountNumber.trim() !== '')) &&
    !uploading

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const result = await submitPrizeExpense({
        recipientName: fields.recipientName.trim(),
        ssn: isOver50k ? ssnClean : null,
        prizeAmount,
        taxPaymentType: isOver50k ? fields.taxPaymentType : null,
        paymentMethod: fields.paymentType,
        giftCardEvidence: fields.paymentType === 'GIFT_CARD' ? fields.giftCardEvidence : null,
        bankName: fields.paymentType === 'CASH' ? fields.bankName.trim() : null,
        accountNumber: fields.paymentType === 'CASH' ? fields.accountNumber.trim() : null,
        note: fields.note.trim(),
        attachmentUrls,
        paymentRequestDate,
        isOver50k,
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('경품비 지급요청서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* 금액 구분 토글 */}
      <div className="space-y-2">
        <SectionLabel>경품 금액 구분</SectionLabel>
        <div className="flex gap-2">
          {([
            { value: false, label: '5만원 이하' },
            { value: true, label: '5만원 이상 (기타소득 신고)' },
          ] as const).map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setIsOver50k(opt.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isOver50k === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 이름 + 주민번호 */}
      <div className={`grid gap-4 ${isOver50k ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-1.5">
          <SectionLabel>이름</SectionLabel>
          <input
            type="text"
            value={fields.recipientName}
            onChange={e => setField('recipientName', e.target.value)}
            placeholder="홍길동"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {isOver50k && (
          <div className="space-y-1.5">
            <SectionLabel>주민번호</SectionLabel>
            <input
              type="text"
              value={fields.ssn}
              onChange={e => setField('ssn', formatSSN(e.target.value))}
              placeholder="000000-0000000"
              maxLength={14}
              autoComplete="off"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wider"
            />
          </div>
        )}
      </div>

      {/* 경품 금액 */}
      <div className="space-y-1.5">
        <SectionLabel>경품 금액</SectionLabel>
        <input
          type="text"
          inputMode="numeric"
          value={fields.prizeAmountRaw}
          onChange={e => setField('prizeAmountRaw', formatKRWInput(e.target.value))}
          placeholder="0"
          className={`w-full text-sm border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 text-right ${
            amountExceeds50k
              ? 'border-red-400 focus:ring-red-300 bg-red-50'
              : 'border-gray-200 focus:ring-primary/30'
          }`}
        />
        {amountExceeds50k && (
          <p className="text-xs text-red-500">
            5만원 이하 항목입니다. 금액이 초과되었습니다. 위에서 <strong>5만원 이상</strong>을 선택해 주세요.
          </p>
        )}
      </div>

      {/* 제세공과금 (5만원 이상) */}
      {isOver50k && (
        <div className="space-y-3">
          <SectionLabel>제세공과금 방식</SectionLabel>
          <div className="flex gap-2">
            {([
              { value: 'SELF' as const, label: '본인 납부' },
              { value: 'COMPANY' as const, label: '대납 (회사 부담)' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField('taxPaymentType', opt.value)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  fields.taxPaymentType === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {prizeAmount > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-200">
              <div className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-500">
                  제세공과금 ({fields.taxPaymentType === 'SELF' ? '22%' : '역산 22%/78%'})
                </span>
                <span className="text-gray-700 tabular-nums font-semibold">
                  {taxAmount.toLocaleString('ko-KR')}원
                </span>
              </div>
              <div className="px-4 py-2 text-xs text-gray-400">
                {fields.taxPaymentType === 'SELF'
                  ? '수령자가 제세공과금을 별도 자진 납부합니다.'
                  : '회사가 경품금액 외 제세공과금을 추가 납부합니다.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 지급방식 */}
      <div className="space-y-3">
        <SectionLabel>지급방식</SectionLabel>
        <div className="flex gap-2">
          {([
            { value: 'CASH' as const, label: '현금 지급' },
            { value: 'GIFT_CARD' as const, label: '상품권' },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setField('paymentType', opt.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                fields.paymentType === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {fields.paymentType === 'CASH' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">은행</label>
              <input
                type="text"
                value={fields.bankName}
                onChange={e => setField('bankName', e.target.value)}
                placeholder="국민은행"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">계좌번호</label>
              <input
                type="text"
                value={fields.accountNumber}
                onChange={e => setField('accountNumber', e.target.value)}
                placeholder="000-0000-0000"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}

        {fields.paymentType === 'GIFT_CARD' && (
          <div className="space-y-2 pt-1">
            <label className="text-xs text-gray-500">상품권 구매 증빙</label>
            <div className="flex gap-2">
              {([
                { value: 'CORPORATE_CARD' as const, label: '법인카드' },
                { value: 'PERSONAL_CARD' as const, label: '개인카드' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setField('giftCardEvidence', opt.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    fields.giftCardEvidence === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 지급요청일 */}
      <div className="space-y-1.5">
        <SectionLabel>지급요청일</SectionLabel>
        <input
          type="date"
          value={paymentRequestDate}
          onChange={e => setPaymentRequestDate(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 비고 */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          비고 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={fields.note}
          onChange={e => setField('note', e.target.value)}
          placeholder="기타 참고사항"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 첨부파일 */}
      <div className="space-y-2">
        <SectionLabel>첨부파일</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
        />
      </div>

      {/* 신청인 */}
      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending || uploading}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '경품비 지급요청서 제출'}
      </button>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

const TAB_TITLES: Record<ActiveTab, string> = {
  EXPENSE:         '지 출 결 의 서',
  CORPORATE_CARD:  '법인카드 사용 내역서',
  TRANSPORTATION:  '교통비 사용내역서',
  BUSINESS_INCOME: '사업소득(원천징수) 지급요청서',
  PRIZE:           '현금성 경품비(기타소득) 지급요청서',
}

export default function ExpenseForm(props: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ActiveTab>('EXPENSE')

  function onSuccess() {
    router.push('/approval/my')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 문서 제목 */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 text-center">
        <h2 className="text-base font-bold text-gray-800 tracking-widest">{TAB_TITLES[activeTab]}</h2>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((tab, idx) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-primary bg-white'
                : 'text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100'
            } ${idx > 0 ? 'border-l border-gray-200' : ''}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <span
                className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold ${
                  activeTab === tab.id ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {idx + 1}
              </span>
              {tab.label}
            </span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'EXPENSE' && <ExpenseTab {...props} onSuccess={onSuccess} />}
      {activeTab === 'CORPORATE_CARD' && <CorporateCardTab {...props} onSuccess={onSuccess} />}
      {activeTab === 'TRANSPORTATION' && <TransportationTab {...props} onSuccess={onSuccess} />}
      {activeTab === 'BUSINESS_INCOME' && <BusinessIncomeTab {...props} onSuccess={onSuccess} />}
      {activeTab === 'PRIZE' && <PrizeTab {...props} onSuccess={onSuccess} />}
    </div>
  )
}
