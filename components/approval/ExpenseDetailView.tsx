'use client'

import { Printer } from 'lucide-react'

export interface ExpenseViewData {
  title: string
  taxType: string | null
  evidenceType: string | null
  payee: string | null
  paymentMethod: string | null
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  paymentRequestDate: string | null
  settlementDate: string | null
  lineItems: Array<{ item: string; date: string; amount?: number; note?: string; count?: number; userName?: string }>
  attachmentUrls: string[]
  employeeName: string
  employeePosition?: string | null
  departmentName?: string | null
  requestDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'
  expenseType?: string | null
  comment?: string | null
}

interface Props {
  data: ExpenseViewData
  onClose?: () => void
  onApprove?: () => void
  onReject?: (reason?: string) => void
  isPending?: boolean
  approveLabel?: string
}

const TAX_TYPE_LABELS: Record<string, string> = {
  TAXABLE: '과세',
  EXEMPT: '면세 (면세사업자 또는 해외 인보이스)',
  WITHHOLDING_BUSINESS: '원천징수 (사업소득)',
  WITHHOLDING_OTHER_WITH: '원천징수 (기타소득 - 제세공과금 포함)',
  WITHHOLDING_OTHER_WITHOUT: '원천징수 (기타소득 - 제세공과금 불포함)',
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  TAX_INVOICE: '세금계산서 (또는 인보이스)',
  BUSINESS_RECEIPT: '사업자 지출증빙',
  CORPORATE_CARD: '법인카드',
  PERSONAL_CARD: '개인카드',
  OTHER_RECEIPT: '기타 - 개별 영수증',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: '현금',
  CARD: '회사카드',
  TRANSFER: '계좌송금',
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: '검토중', cls: 'bg-amber-100 text-amber-700' },
  APPROVED:  { label: '승인',   cls: 'bg-green-100 text-green-700' },
  REJECTED:  { label: '반려',   cls: 'bg-red-100 text-red-600' },
  CANCELLED: { label: '취소',   cls: 'bg-gray-100 text-gray-500' },
  COMPLETED: { label: '완료',   cls: 'bg-blue-100 text-blue-700' },
}
const PERSONAL_EXPENSE_TYPES = ['CORPORATE_CARD', 'TRANSPORTATION']

function formatKRW(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

function parseVatFromNote(note: string | undefined, total: number | undefined) {
  const t = total ?? 0
  let supply = t, vat = 0, vatLabel: string | null = null, userNote = note ?? ''

  if (note) {
    const parts = note.split(' / ')
    const vatPart = parts[0]
    const rest = parts.slice(1).join(' / ')

    const excMatch = vatPart.match(/공급가액\s+([\d,]+)원\s*\+\s*부가세\s+([\d,]+)원/)
    if (excMatch) {
      supply = Number(excMatch[1].replace(/,/g, ''))
      vat    = Number(excMatch[2].replace(/,/g, ''))
      vatLabel = '별도'
      userNote = rest
    } else {
      const incMatch = vatPart.match(/부가세포함\s*\(공급가액\s+([\d,]+)원\)/)
      if (incMatch) {
        supply   = Number(incMatch[1].replace(/,/g, ''))
        vat      = t - supply
        vatLabel = '포함'
        userNote = rest
      }
      // else: no VAT pattern — userNote stays as full note
    }
  }

  // 금액이 있는데 VAT 정보가 없으면 부가세 포함으로 기본 처리
  if (vatLabel === null && t > 0) {
    supply   = Math.round(t * 100 / 110)
    vat      = t - supply
    vatLabel = '포함'
  }

  return { supply, vat, total: t, vatLabel, userNote }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-gray-200">
      <td className="px-4 py-2.5 text-xs font-medium text-gray-500 bg-gray-50 w-20 md:w-[130px] whitespace-nowrap border-r border-gray-200">
        {label}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-900">{value || '—'}</td>
    </tr>
  )
}

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ExpenseDetailView({ data, onApprove, onReject, isPending, approveLabel = '승인' }: Props) {
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const router = useRouter()

  const resubmitUrl = data.expenseType && PERSONAL_EXPENSE_TYPES.includes(data.expenseType)
    ? '/approval/personal/new'
    : '/approval/expense/new'

  const rowVats = data.lineItems.map(li => parseVatFromNote(li.note, li.amount))
  const totalSupply = rowVats.reduce((s, r) => s + r.supply, 0)
  const totalVat    = rowVats.reduce((s, r) => s + r.vat, 0)
  const totalAmount = rowVats.reduce((s, r) => s + r.total, 0)
  const hasVat = rowVats.some(r => r.vatLabel !== null)
  const statusCfg = STATUS_CFG[data.status] ?? { label: data.status, cls: 'bg-gray-100 text-gray-500' }

  const requestDateStr = data.requestDate
    ? new Date(data.requestDate).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—'

  function handlePrint() {
    const el = document.querySelector('.print-area') as HTMLElement | null
    if (!el) { window.print(); return }

    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map(l => l.outerHTML).join('\n')

    const w = window.open('', '_blank')
    if (!w) { window.print(); return }

    w.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  ${links}
  <style>body { background: white; padding: 24px; } .no-print { display: none !important; }</style>
</head><body>
  ${el.innerHTML}
  <script>window.addEventListener('load', function() { setTimeout(function() { window.print(); window.close(); }, 300); });<\/script>
</body></html>`)
    w.document.close()
  }

  function handleRejectSubmit() {
    onReject?.(rejectReason || undefined)
    setRejecting(false)
    setRejectReason('')
  }

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
      `}</style>

      <div className="print-area">
        {/* Document header */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 md:px-6 py-4 md:py-5 text-center relative">
            <h2 className="text-lg font-bold text-gray-900 tracking-[0.4em]">지  출  결  의  서</h2>
            <div className="flex items-center justify-center gap-2 mt-2 md:mt-0 md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 no-print">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-100 transition-colors"
              >
                <Printer size={13} />
                인쇄
              </button>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-5">
            {/* Basic info table */}
            <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
              <tbody>
                <Row label="제목" value={data.title} />
                <Row label="구분 (세목)" value={data.taxType ? TAX_TYPE_LABELS[data.taxType] ?? data.taxType : null} />
                <Row label="증빙" value={data.evidenceType ? EVIDENCE_TYPE_LABELS[data.evidenceType] ?? data.evidenceType : null} />
                <Row label="지급처" value={data.payee} />
                <Row
                  label="지급방식"
                  value={data.paymentMethod ? PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod : null}
                />
                {data.paymentMethod === 'TRANSFER' && (
                  <Row
                    label="계좌정보"
                    value={[data.bankName, data.accountNumber, data.accountHolder].filter(Boolean).join(' · ') || null}
                  />
                )}
                <Row label="지급요청일" value={data.paymentRequestDate} />
                <Row label="정산(예정)일" value={data.settlementDate} />
                <Row label="신청일" value={requestDateStr} />
              </tbody>
            </table>
            </div>

            {/* Line items table */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">지출 내역</p>
              <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm" style={{ minWidth: hasVat ? 560 : 400 }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[15%] whitespace-nowrap">지출일/이용자</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">지출항목</th>
                    {hasVat && <>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[14%] whitespace-nowrap">공급가액</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[14%] whitespace-nowrap">부가세</th>
                    </>}
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[16%] whitespace-nowrap">{hasVat ? '합계' : '금액'}</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[12%]">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.lineItems.length === 0 && (
                    <tr>
                      <td colSpan={hasVat ? 6 : 4} className="px-4 py-4 text-center text-xs text-gray-400">내역 없음</td>
                    </tr>
                  )}
                  {data.lineItems.map((li, i) => {
                    const v = rowVats[i]
                    return (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          <span>{li.date}</span>
                          {li.userName && <span className="block text-gray-400 mt-0.5">{li.userName}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">
                          <span>{li.item}</span>
                          {v.vatLabel && (
                            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded font-medium ${v.vatLabel === '별도' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                              부가세 {v.vatLabel}
                            </span>
                          )}
                        </td>
                        {hasVat && <>
                          <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums whitespace-nowrap text-xs">
                            {v.vatLabel ? formatKRW(v.supply) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums whitespace-nowrap text-xs">
                            {v.vatLabel ? formatKRW(v.vat) : '—'}
                          </td>
                        </>}
                        <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                          {li.amount !== undefined
                            ? formatKRW(v.total)
                            : li.count !== undefined
                            ? `${li.count}건`
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{v.userNote || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  {hasVat && <>
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-xs text-gray-500">공급가액 합계</td>
                      <td className="px-4 py-2 text-right text-xs text-gray-700 tabular-nums whitespace-nowrap">{formatKRW(totalSupply)}</td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500 tabular-nums whitespace-nowrap">{formatKRW(totalVat)}</td>
                      <td colSpan={2} />
                    </tr>
                  </>}
                  <tr>
                    <td colSpan={hasVat ? 4 : 2} className="px-4 py-2.5 text-sm font-semibold text-gray-700 whitespace-nowrap">
                      {hasVat ? '최종합계 (부가세 포함)' : '지출합계'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatKRW(totalAmount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>

            {/* Attachments */}
            {data.attachmentUrls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">증빙파일</p>
                <div className="flex flex-wrap gap-2">
                  {data.attachmentUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-primary hover:bg-primary/5 transition-colors no-print"
                    >
                      파일 {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Applicant table */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">신청인</p>
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center">부서명</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center border-l border-gray-200">직급</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 text-center border-l border-gray-200">성명</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">{data.departmentName || '—'}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700 border-l border-gray-100">{data.employeePosition || '—'}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border-l border-gray-100">{data.employeeName}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Rejection comment (if rejected) */}
            {data.status === 'REJECTED' && data.comment && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-xs font-medium text-red-600 mb-1">반려 사유</p>
                <p className="text-sm text-red-700">{data.comment}</p>
              </div>
            )}

            {/* 재신청 (직원용 — onApprove/onReject 없을 때만) */}
            {!onApprove && !onReject && (data.status === 'REJECTED' || data.status === 'PENDING') && (
              <div className="pt-3 border-t border-gray-100 no-print">
                <p className="text-xs text-gray-400 mb-2">
                  {data.status === 'REJECTED'
                    ? '반려된 신청입니다. 내용을 확인한 후 재신청할 수 있습니다.'
                    : '결재 대기 중인 신청입니다. 신규 신청은 아래 버튼을 이용하세요.'}
                </p>
                <button
                  type="button"
                  onClick={() => router.push(resubmitUrl)}
                  className="w-full py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  재신청하기
                </button>
              </div>
            )}

            {/* Approve / reject action bar */}
            {(onApprove || onReject) && (
              <div className="pt-2 border-t border-gray-100 no-print">
                {rejecting ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRejectSubmit()}
                      placeholder="반려 사유 (선택)"
                      autoFocus
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleRejectSubmit}
                        disabled={isPending}
                        className="flex-1 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        반려 확인
                      </button>
                      <button
                        onClick={() => { setRejecting(false); setRejectReason('') }}
                        className="flex-1 py-2.5 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {onReject && (
                      <button
                        onClick={() => setRejecting(true)}
                        disabled={isPending}
                        className="flex-1 py-2.5 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        반려
                      </button>
                    )}
                    {onApprove && (
                      <button
                        onClick={onApprove}
                        disabled={isPending}
                        className="flex-1 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {approveLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
