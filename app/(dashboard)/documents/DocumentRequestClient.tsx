'use client'

import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { submitDocumentRequest, submitSupplyRequest } from './actions'

type Tab = 'EMPLOYMENT_CERT' | 'WITHHOLDING_RECEIPT' | 'SUPPLY'

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품',
  CONSUMABLE: '소모품',
  SOFTWARE: '소프트웨어',
  OTHER: '기타',
}

interface SupplyItem {
  category: 'EQUIPMENT' | 'CONSUMABLE' | 'SOFTWARE' | 'OTHER'
  description: string
  estimatedAmount: string
  note: string
}

function emptyItem(): SupplyItem {
  return { category: 'EQUIPMENT', description: '', estimatedAmount: '', note: '' }
}

function formatKRWInput(value: string) {
  const n = value.replace(/[^0-9]/g, '')
  return n ? Number(n).toLocaleString('ko-KR') : ''
}

interface Props {
  employeeId: string
  employeeName: string
  employeePosition: string | null
  departmentName: string | null
}

export default function DocumentRequestClient({
  employeeId: _employeeId,
  employeeName,
  employeePosition,
  departmentName,
}: Props) {
  const [tab, setTab] = useState<Tab>('EMPLOYMENT_CERT')
  const [items, setItems] = useState<SupplyItem[]>([emptyItem()])
  const [isPending, startTransition] = useTransition()
  const [employmentPurpose, setEmploymentPurpose] = useState('')
  const [withholdingPurpose, setWithholdingPurpose] = useState('')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'EMPLOYMENT_CERT', label: '재직증명서' },
    { key: 'WITHHOLDING_RECEIPT', label: '원천징수영수증' },
    { key: 'SUPPLY', label: '비품/소모품 신청' },
  ]

  function handleDocSubmit(docType: 'EMPLOYMENT_CERT' | 'WITHHOLDING_RECEIPT', purpose: string) {
    const label = docType === 'EMPLOYMENT_CERT' ? '재직증명서' : '원천징수영수증'
    if (!purpose.trim()) { toast.error('서류 용도를 입력해주세요.'); return }
    if (!confirm(`${label} 발급을 관리자에게 신청하시겠습니까?`)) return
    startTransition(async () => {
      const res = await submitDocumentRequest({ docType, purpose: purpose.trim() })
      if (res.error) { toast.error(res.error); return }
      toast.success('신청이 접수되었습니다.')
      if (docType === 'EMPLOYMENT_CERT') setEmploymentPurpose('')
      else setWithholdingPurpose('')
    })
  }

  function updateItem(index: number, field: keyof SupplyItem, value: string) {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it))
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function handleSupplySubmit() {
    const valid = items.every(it => it.description.trim())
    if (!valid) { toast.error('내역을 모두 입력해주세요.'); return }
    if (!confirm('비품/소모품 신청을 관리자에게 제출하시겠습니까?')) return

    startTransition(async () => {
      const res = await submitSupplyRequest({
        items: items.map(it => ({
          category: it.category,
          description: it.description.trim(),
          estimatedAmount: it.estimatedAmount ? parseInt(it.estimatedAmount.replace(/,/g, ''), 10) : null,
          note: it.note.trim() || null,
        })),
      })
      if (res.error) { toast.error(res.error); return }
      toast.success('비품/소모품 신청이 접수되었습니다.')
      setItems([emptyItem()])
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">서류 및 비품 신청</h1>

      {/* Tab selector */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 재직증명서 */}
      {tab === 'EMPLOYMENT_CERT' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">재직증명서 발급 신청</p>
            <p className="text-xs text-gray-400 mt-1">
              재직증명서 발급을 신청합니다. 관리자 확인 후 처리됩니다.
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
            <p className="text-xs text-gray-500">신청인 정보</p>
            <p className="text-sm text-gray-800">
              {[departmentName, employeePosition, employeeName].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">서류 용도 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={employmentPurpose}
              onChange={e => setEmploymentPurpose(e.target.value)}
              placeholder="예: 은행 제출용, 임대차 계약용"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            onClick={() => handleDocSubmit('EMPLOYMENT_CERT', employmentPurpose)}
            disabled={isPending}
            className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? '신청 중...' : '신청 접수'}
          </button>
        </div>
      )}

      {/* 원천징수영수증 */}
      {tab === 'WITHHOLDING_RECEIPT' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">원천징수영수증 발급 신청</p>
            <p className="text-xs text-gray-400 mt-1">
              원천징수영수증 발급을 신청합니다. 관리자 확인 후 처리됩니다.
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
            <p className="text-xs text-gray-500">신청인 정보</p>
            <p className="text-sm text-gray-800">
              {[departmentName, employeePosition, employeeName].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">서류 용도 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={withholdingPurpose}
              onChange={e => setWithholdingPurpose(e.target.value)}
              placeholder="예: 연말정산용, 대출 신청용"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            onClick={() => handleDocSubmit('WITHHOLDING_RECEIPT', withholdingPurpose)}
            disabled={isPending}
            className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? '신청 중...' : '신청 접수'}
          </button>
        </div>
      )}

      {/* 비품/소모품 신청 */}
      {tab === 'SUPPLY' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <p className="text-sm font-medium text-gray-900">비품/소모품 신청</p>

          {/* Items table */}
          <div className="grid grid-cols-[120px_1fr_110px_1fr_32px] gap-x-2 gap-y-2 items-center">
            {/* Header */}
            <span className="text-xs text-gray-400">구분</span>
            <span className="text-xs text-gray-400">내역 *</span>
            <span className="text-xs text-gray-400">예상금액</span>
            <span className="text-xs text-gray-400">비고</span>
            <span />
            {/* Rows */}
            {items.map((item, idx) => (
              <Fragment key={idx}>
                <select
                  value={item.category}
                  onChange={e => updateItem(idx, 'category', e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 self-start"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={item.description}
                  onChange={e => updateItem(idx, 'description', e.target.value)}
                  placeholder="내역 입력"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 self-start"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={item.estimatedAmount}
                  onChange={e => updateItem(idx, 'estimatedAmount', formatKRWInput(e.target.value))}
                  placeholder="0"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 text-right self-start"
                />
                <input
                  type="text"
                  value={item.note}
                  onChange={e => updateItem(idx, 'note', e.target.value)}
                  placeholder="비고"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 self-start"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="text-gray-300 hover:text-red-400 disabled:opacity-30 transition-colors self-start pt-2"
                >
                  <Trash2 size={14} />
                </button>
              </Fragment>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus size={14} />
            항목 추가
          </button>

          {/* Applicant info */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-2">신청인</p>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-sm text-gray-800">
                {[departmentName, employeePosition, employeeName].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSupplySubmit}
            disabled={isPending}
            className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? '신청 중...' : '신청서 제출'}
          </button>
        </div>
      )}
    </div>
  )
}
