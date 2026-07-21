'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import ExpenseDetailModal from '@/components/approval/ExpenseDetailModal'
import type { ExpenseViewData } from '@/components/approval/ExpenseDetailView'
import ExpenseSearchFilter from '@/components/approval/ExpenseSearchFilter'
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
  CANCELLED: { label: '취소',   className: 'bg-gray-100 text-gray-400' },
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

const STATUS_SORT: Record<string, number> = {
  REJECTED: 0, PENDING: 1, APPROVED: 2, COMPLETED: 2, CANCELLED: 3,
}

type StatusFilter = 'all' | 'rejected' | 'pending' | 'done'
type AlertCounts = { rejected: number; pending: number }

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all',      label: '전체' },
  { id: 'rejected', label: '반려' },
  { id: 'pending',  label: '대기' },
  { id: 'done',     label: '승인·완료' },
]

function sortByStatusDate<T extends { status: string; created_at: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const diff = (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99)
    return diff !== 0 ? diff : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
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
  pendingApproverLabel?: string | null
}

interface ExpenseItem {
  id: string
  kind: 'expense'
  title: string
  amount: number
  category: string
  expense_type?: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
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
  line_items?: Array<{ item: string; date: string; amount?: number; note?: string; count?: number; userName?: string }> | null
  attachment_urls?: string[] | null
  expense_approval_steps?: Array<{ status: string; comment?: string | null }> | null
  pendingApproverLabel?: string | null
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
  pendingApproverLabel?: string | null
}

type AnyItem = LeaveItem | ExpenseItem
type Tab = 'all' | 'leave' | 'expense' | 'document' | 'supply'

interface Props {
  items: AnyItem[]
  employeeName: string
  employeePosition: string | null
  departmentName: string | null
  documentRequests: DocumentRequest[]
  supplyRequests: SupplyRequest[]
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
  catTab: string
  catPage: number
  leaveTotalPages: number
  expenseTotalPages: number
  documentTotalPages: number
  supplyTotalPages: number
  statusFilter: string
  leaveAlerts: AlertCounts
  expenseAlerts: AlertCounts
  documentAlerts: AlertCounts
  supplyAlerts: AlertCounts
}

export default function MyRequestsClient({
  items,
  employeeName,
  employeePosition,
  departmentName,
  documentRequests,
  supplyRequests,
  expenseType,
  month,
  dateFrom,
  dateTo,
  keyword,
  catTab,
  catPage,
  leaveTotalPages,
  expenseTotalPages,
  documentTotalPages,
  supplyTotalPages,
  statusFilter: statusFilterProp,
  leaveAlerts,
  expenseAlerts,
  documentAlerts,
  supplyAlerts,
}: Props) {
  const [selectedExpense, setSelectedExpense] = useState<ExpenseViewData | null>(null)
  const [expandedSupplyId, setExpandedSupplyId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const validTabs: Tab[] = ['all', 'leave', 'expense', 'document', 'supply']
  const activeTab: Tab = validTabs.includes(catTab as Tab) && catTab !== 'all'
    ? catTab as Tab
    : (expenseType || month || dateFrom || dateTo || keyword) ? 'expense' : 'all'

  const statusFilter = (statusFilterProp as StatusFilter) ?? 'all'

  const sortedItems     = sortByStatusDate(items)
  const sortedDocuments = sortByStatusDate(documentRequests)
  const sortedSupply    = sortByStatusDate(supplyRequests)

  const leaveItems   = sortedItems.filter(i => i.kind === 'leave')
  const expenseItems = sortedItems.filter(i => i.kind === 'expense') as ExpenseItem[]

  const tabAlerts: Record<Tab, AlertCounts> = {
    all:      { rejected: leaveAlerts.rejected + expenseAlerts.rejected + documentAlerts.rejected + supplyAlerts.rejected,
                pending:  leaveAlerts.pending  + expenseAlerts.pending  + documentAlerts.pending  + supplyAlerts.pending },
    leave:    leaveAlerts,
    expense:  expenseAlerts,
    document: documentAlerts,
    supply:   supplyAlerts,
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all',      label: '전체' },
    { id: 'leave',    label: '연차' },
    { id: 'expense',  label: '지출결의' },
    { id: 'document', label: '서류신청' },
    { id: 'supply',   label: '비품신청' },
  ]

  function buildTabUrl(tab: Tab, page = 1) {
    const p = new URLSearchParams()
    p.set('catTab', tab)
    p.set('catPage', String(page))
    if (statusFilter !== 'all') p.set('statusFilter', statusFilter)
    if (expenseType) p.set('expenseType', expenseType)
    if (month) p.set('month', month)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) p.set('dateTo', dateTo)
    if (keyword) p.set('keyword', keyword)
    return `/approval/my?${p.toString()}`
  }

  function buildStatusUrl(filter: StatusFilter) {
    const p = new URLSearchParams()
    p.set('catTab', activeTab)
    p.set('catPage', '1')
    if (filter !== 'all') p.set('statusFilter', filter)
    if (expenseType) p.set('expenseType', expenseType)
    if (month) p.set('month', month)
    if (dateFrom) p.set('dateFrom', dateFrom)
    if (dateTo) p.set('dateTo', dateTo)
    if (keyword) p.set('keyword', keyword)
    return `/approval/my?${p.toString()}`
  }

  const showLeave    = activeTab === 'all' || activeTab === 'leave'
  const showExpense  = activeTab === 'all' || activeTab === 'expense'
  const showDocument = activeTab === 'all' || activeTab === 'document'
  const showSupply   = activeTab === 'all' || activeTab === 'supply'

  const visibleItems = activeTab === 'all'
    ? sortedItems
    : activeTab === 'leave'   ? leaveItems
    : activeTab === 'expense' ? expenseItems as AnyItem[]
    : []

  function openExpense(item: ExpenseItem) {
    const rejectedStep = item.expense_approval_steps?.find(s => s.status === 'REJECTED')
    const viewData: ExpenseViewData = {
      id: item.id,
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
      expenseType: item.expense_type ?? null,
      comment: rejectedStep?.comment ?? null,
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
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">내 신청 내역</h1>

      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => {
          const isActive = activeTab === t.id
          const alerts = tabAlerts[t.id]
          return (
            <Link
              key={t.id}
              href={buildTabUrl(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {t.label}
              {alerts.rejected > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'
                }`}>
                  반려 {alerts.rejected}
                </span>
              )}
              {alerts.pending > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-600'
                }`}>
                  대기 {alerts.pending}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Status filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map(f => {
          const isActive = statusFilter === f.id
          return (
            <Link
              key={f.id}
              href={buildStatusUrl(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? f.id === 'rejected' ? 'bg-red-500 text-white'
                    : f.id === 'pending' ? 'bg-amber-500 text-white'
                    : f.id === 'done'    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-white'
                  : f.id === 'rejected' ? 'bg-red-50 text-red-500 hover:bg-red-100'
                    : f.id === 'pending' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                    : f.id === 'done'    ? 'bg-green-50 text-green-600 hover:bg-green-100'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {/* Expense Search Filter */}
      {activeTab === 'expense' && (
        <ExpenseSearchFilter
          expenseType={expenseType}
          month={month}
          dateFrom={dateFrom}
          dateTo={dateTo}
          keyword={keyword}
        />
      )}

      {/* Leave & Expense */}
      <div className="space-y-2">
        {visibleItems.length > 0 && activeTab === 'all' && (
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">연차 / 지출결의</p>
        )}
        {visibleItems.map(item => {
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
                  {item.pendingApproverLabel && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      {item.pendingApproverLabel}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                    {status.label}
                  </span>
                  {item.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        handleCancel(
                          item.displayLabel,
                          () => item.kind === 'leave'
                            ? cancelLeaveRequest(item.id)
                            : cancelExpenseRequest(item.id),
                        )
                      }}
                      disabled={isPending}
                      className="text-xs px-2 py-1 rounded-full border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
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
        {visibleItems.length === 0 && !showDocument && !showSupply && (
          <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
        )}
        {visibleItems.length === 0 && (activeTab === 'leave' || activeTab === 'expense') && (
          <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
        )}
        {activeTab === 'leave' && leaveTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            {catPage > 1 ? <Link href={buildTabUrl('leave', catPage - 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">이전</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">이전</span>}
            <span className="text-xs text-gray-500">{catPage} / {leaveTotalPages}</span>
            {catPage < leaveTotalPages ? <Link href={buildTabUrl('leave', catPage + 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">다음</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">다음</span>}
          </div>
        )}
        {activeTab === 'expense' && expenseTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            {catPage > 1 ? <Link href={buildTabUrl('expense', catPage - 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">이전</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">이전</span>}
            <span className="text-xs text-gray-500">{catPage} / {expenseTotalPages}</span>
            {catPage < expenseTotalPages ? <Link href={buildTabUrl('expense', catPage + 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">다음</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">다음</span>}
          </div>
        )}
      </div>

      {/* Document Requests */}
      {showDocument && sortedDocuments.length > 0 && (
        <div className="space-y-2">
          {activeTab === 'all' && <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">서류 신청</p>}
          {sortedDocuments.map(doc => {
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    {doc.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleCancel(DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type, () => cancelDocumentRequest(doc.id))}
                        disabled={isPending}
                        className="text-xs px-2 py-1 rounded-full border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
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

      {showDocument && sortedDocuments.length === 0 && activeTab === 'document' && (
        <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
      )}
      {activeTab === 'document' && documentTotalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {catPage > 1 ? <Link href={buildTabUrl('document', catPage - 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">이전</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">이전</span>}
          <span className="text-xs text-gray-500">{catPage} / {documentTotalPages}</span>
          {catPage < documentTotalPages ? <Link href={buildTabUrl('document', catPage + 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">다음</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">다음</span>}
        </div>
      )}

      {showSupply && sortedSupply.length === 0 && activeTab === 'supply' && (
        <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
      )}
      {activeTab === 'supply' && supplyTotalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {catPage > 1 ? <Link href={buildTabUrl('supply', catPage - 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">이전</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">이전</span>}
          <span className="text-xs text-gray-500">{catPage} / {supplyTotalPages}</span>
          {catPage < supplyTotalPages ? <Link href={buildTabUrl('supply', catPage + 1)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">다음</Link> : <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 opacity-40 cursor-not-allowed">다음</span>}
        </div>
      )}

      {/* Supply Requests */}
      {showSupply && sortedSupply.length > 0 && (
        <div className="space-y-2">
          {activeTab === 'all' && <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">비품/소모품 신청</p>}
          {sortedSupply.map(req => {
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
                    {req.pendingApproverLabel && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        {req.pendingApproverLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    {req.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleCancel('비품/소모품 신청', () => cancelSupplyRequest(req.id))}
                        disabled={isPending}
                        className="text-xs px-2 py-1 rounded-full border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs table-fixed">
                      <colgroup>
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '28%' }} />
                      </colgroup>
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
                            <td className="px-3 py-2 text-gray-800 break-words">{item.description}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {item.estimated_amount != null ? `${Number(item.estimated_amount).toLocaleString()}원` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-400 break-words">{item.note ?? '—'}</td>
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
