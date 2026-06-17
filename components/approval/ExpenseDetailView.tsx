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
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comment?: string | null
}

interface Props {
  data: ExpenseViewData
  onClose?: () => void
  onApprove?: () => void
  onReject?: (reason?: string) => void
  isPending?: boolean
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

const STATUS_CFG = {
  PENDING:  { label: '검토중', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: '승인',   cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: '반려',   cls: 'bg-red-100 text-red-600' },
}

function formatKRW(n: number) {
  return n.toLocaleString('ko-KR') + '원'
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

export default function ExpenseDetailView({ data, onApprove, onReject, isPending }: Props) {
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const totalAmount = data.lineItems.reduce((sum, li) => sum + (li.amount ?? 0), 0)
  const statusCfg = STATUS_CFG[data.status]

  const requestDateStr = data.requestDate
    ? new Date(data.requestDate).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—'

  function handlePrint() {
    window.print()
  }

  function handleRejectSubmit() {
    onReject?.(rejectReason || undefined)
    setRejecting(false)
    setRejectReason('')
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { overflow: visible !important; height: auto !important; }
          body > div, main { overflow: visible !important; height: auto !important; max-height: none !important; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; top: 0; left: 0; right: 0; padding: 24px; }
        }
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
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm" style={{ minWidth: 400 }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[16%] whitespace-nowrap">지출일/이용자</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">지출항목</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-[20%] whitespace-nowrap">금액</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-[14%]">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.lineItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-xs text-gray-400">내역 없음</td>
                    </tr>
                  )}
                  {data.lineItems.map((li, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        <span>{li.date}</span>
                        {li.userName && (
                          <span className="block text-gray-400 mt-0.5">{li.userName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{li.item}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                        {li.amount !== undefined
                          ? formatKRW(li.amount)
                          : li.count !== undefined
                          ? `${li.count}건`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{li.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-sm font-semibold text-gray-700">지출합계</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900 tabular-nums">
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
                        승인
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
