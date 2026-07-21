'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { approveLeave } from '@/app/(dashboard)/approval/leave/actions'
import { approveExpense } from '@/app/(dashboard)/approval/expense/actions'
import { approveSupplyAction } from '@/app/(dashboard)/documents/actions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ExpenseDetailModal from '@/components/approval/ExpenseDetailModal'
import type { ExpenseViewData } from '@/components/approval/ExpenseDetailView'
import ExpenseSearchFilter from '@/components/approval/ExpenseSearchFilter'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: '비품', CONSUMABLE: '소모품', SOFTWARE: '소프트웨어', OTHER: '기타',
}
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: '승인', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려', cls: 'bg-red-50 text-red-600' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingItem = { kind: 'leave' | 'expense' | 'supply'; step: any }
type DoneItemExpenseDetail = {
  title: string; amount: number; expenseType: string | null
  taxType: string | null; evidenceType: string | null; payee: string | null
  paymentMethod: string | null; bankName: string | null; accountNumber: string | null
  accountHolder: string | null; paymentRequestDate: string | null; settlementDate: string | null
  lineItems: unknown[]; attachmentUrls: string[]; employeePosition: string | null
  comment: string | null
}
type DoneItemSupplyItem = {
  id: string; category: string; description: string
  estimated_amount: number | null; note: string | null; sort_order: number
}
type DoneItem = {
  id: string; kind: 'leave' | 'expense' | 'supply'
  employeeName: string; typeLabel: string; detail: string
  requestDate: string; actedAt: string | null
  status: 'APPROVED' | 'REJECTED'; isJeongyeol: boolean
  leaveReason?: string | null
  expenseDetail?: DoneItemExpenseDetail | null
  supplyItems?: DoneItemSupplyItem[] | null
}

interface Props {
  viewTab: string
  type: string
  page: number
  totalPages: number
  pendingItems: PendingItem[]
  doneItems: DoneItem[]
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
  employeeName: string
}

export default function PendingApprovalsClient({
  viewTab, type, page, totalPages,
  pendingItems, doneItems,
  expenseType, month, dateFrom, dateTo, keyword, employeeName,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedExpense, setSelectedExpense] = useState<{ step: any; viewData: ExpenseViewData } | null>(null)
  const [rejectingSupplyId, setRejectingSupplyId] = useState<string | null>(null)
  const [supplyRejectComment, setSupplyRejectComment] = useState('')
  const [selectedDoneExpense, setSelectedDoneExpense] = useState<ExpenseViewData | null>(null)
  const [expandedDoneId, setExpandedDoneId] = useState<string | null>(null)

  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = { viewTab, type, page: String(page) }
    if (expenseType)  base.expenseType  = expenseType
    if (month)        base.month        = month
    if (dateFrom)     base.dateFrom     = dateFrom
    if (dateTo)       base.dateTo       = dateTo
    if (keyword)      base.keyword      = keyword
    if (employeeName) base.employeeName = employeeName
    const merged = { ...base, ...overrides }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) { if (v) p.set(k, v) }
    return `/approval/pending?${p.toString()}`
  }

  function handleLeave(requestId: string, approved: boolean, comment?: string) {
    startTransition(async () => {
      const result = await approveLeave(requestId, approved, comment)
      if (result.error) { toast.error(result.error); return }
      toast.success(approved ? '승인되었습니다.' : '반려되었습니다.')
      setRejectingLeaveId(null); setRejectReason('')
      router.refresh()
    })
  }

  function handleExpenseApprove(reportId: string) {
    startTransition(async () => {
      const result = await approveExpense(reportId, true)
      if (result.error) { toast.error(result.error); return }
      toast.success('승인되었습니다.')
      setSelectedExpense(null); router.refresh()
    })
  }

  function handleExpenseReject(reportId: string, reason?: string) {
    startTransition(async () => {
      const result = await approveExpense(reportId, false, reason)
      if (result.error) { toast.error(result.error); return }
      toast.success('반려되었습니다.')
      setSelectedExpense(null); router.refresh()
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openExpenseDetail(step: any) {
    const rep = step.expense_reports
    if (!rep) return
    const viewData: ExpenseViewData = {
      title: rep.title ?? '',
      taxType: rep.tax_type ?? null,
      evidenceType: rep.evidence_type ?? null,
      payee: rep.payee ?? null,
      paymentMethod: rep.payment_method ?? null,
      bankName: rep.bank_name ?? null,
      accountNumber: rep.account_number ?? null,
      accountHolder: rep.account_holder ?? null,
      paymentRequestDate: rep.payment_request_date ?? null,
      settlementDate: rep.settlement_date ?? null,
      lineItems: rep.line_items ?? [],
      attachmentUrls: rep.attachment_urls ?? [],
      employeeName: rep.employees?.name ?? '—',
      employeePosition: rep.employees?.position ?? null,
      departmentName: rep.employees?.departments?.name ?? null,
      requestDate: rep.created_at,
      status: 'PENDING',
      comment: null,
    }
    setSelectedExpense({ step, viewData })
  }

  function handleSupplyApprove(requestId: string) {
    startTransition(async () => {
      const result = await approveSupplyAction(requestId, true)
      if (result.error) { toast.error(result.error); return }
      toast.success('승인되었습니다.'); router.refresh()
    })
  }

  function handleSupplyReject(requestId: string) {
    startTransition(async () => {
      const result = await approveSupplyAction(requestId, false, supplyRejectComment || undefined)
      if (result.error) { toast.error(result.error); return }
      toast.success('반려되었습니다.')
      setRejectingSupplyId(null); setSupplyRejectComment('')
      router.refresh()
    })
  }

  const VIEW_TABS = [
    { id: 'pending', label: '미결재' },
    { id: 'done',    label: '결재완료' },
  ]
  const TYPE_TABS = [
    { id: 'all',     label: '전체' },
    { id: 'leave',   label: '연차' },
    { id: 'expense', label: '지출결의' },
    { id: 'supply',  label: '비품' },
  ]

  const showFilter = type === 'expense' || type === 'all'

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">결재 관리</h1>

      {/* 미결재 / 결재완료 tabs */}
      <div className="flex gap-1">
        {VIEW_TABS.map(t => (
          <Link
            key={t.id}
            href={buildUrl({ viewTab: t.id, page: '1' })}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Type sub-tabs */}
      <div className="flex gap-1 flex-wrap">
        {TYPE_TABS.map(t => (
          <Link
            key={t.id}
            href={buildUrl({ type: t.id, page: '1' })}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              type === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Expense search filter */}
      {showFilter && (
        <ExpenseSearchFilter
          expenseType={expenseType}
          month={month}
          dateFrom={dateFrom}
          dateTo={dateTo}
          keyword={keyword}
          employeeName={employeeName}
          showAdminFilters={true}
          showAllTypes={type === 'all'}
          baseParams={{ viewTab, type }}
        />
      )}

      {/* Pending items */}
      {viewTab === 'pending' && (
        <div className="space-y-3">
          {pendingItems.map(item => {
            if (item.kind === 'leave') {
              const step = item.step
              const req = step.leave_requests
              const isExpanded = expandedId === step.id
              return (
                <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {req.employees?.name} — {LEAVE_LABELS[req.leave_type]} {req.days_used}일
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {req.start_date} ~ {req.end_date}
                        {req.reason && <span className="ml-2">· {req.reason}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{format(new Date(req.created_at), 'MM/dd')}</span>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : step.id)}
                        className="p-1 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2 text-sm">
                      <div className="flex items-center gap-6 flex-wrap">
                        <div>
                          <span className="text-xs text-gray-400">부여 연차</span>
                          <p className="font-semibold text-gray-900 mt-0.5">
                            {req.employees?.annual_leave_days != null ? `${req.employees.annual_leave_days}일` : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-400">잔여 연차</span>
                          <p className="font-semibold text-gray-900 mt-0.5">
                            {req.employees?.remaining_leaves != null ? `${req.employees.remaining_leaves}일` : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-400">유형</span>
                          <p className="font-medium text-gray-900 mt-0.5">{LEAVE_LABELS[req.leave_type] ?? req.leave_type}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-400">기간</span>
                          <p className="font-medium text-gray-900 mt-0.5">{req.start_date}{req.start_date !== req.end_date ? ` ~ ${req.end_date}` : ''}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-400">사용 일수</span>
                          <p className="font-medium text-gray-900 mt-0.5">{req.days_used}일</p>
                        </div>
                      </div>
                      {req.reason && (
                        <div>
                          <span className="text-xs text-gray-400">사유</span>
                          <p className="text-gray-700 mt-0.5">{req.reason}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {rejectingLeaveId === step.id ? (
                    <div className="space-y-2">
                      <input
                        type="text" value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="반려 사유 (선택)"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleLeave(req.id, false, rejectReason || undefined)} disabled={isPending} className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700">반려 확인</button>
                        <button onClick={() => { setRejectingLeaveId(null); setRejectReason('') }} className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => handleLeave(req.id, true)} disabled={isPending} className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90">승인</button>
                      <button onClick={() => setRejectingLeaveId(step.id)} disabled={isPending} className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50">반려</button>
                    </div>
                  )}
                </div>
              )
            }

            if (item.kind === 'expense') {
              const step = item.step
              const rep = step.expense_reports
              return (
                <div
                  key={step.id}
                  className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  onClick={() => openExpenseDetail(step)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{rep.employees?.name} — {rep.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{Number(rep.amount).toLocaleString()}원 · {format(new Date(rep.created_at), 'MM/dd')}</p>
                    </div>
                    <span className="text-xs text-primary font-medium shrink-0">상세보기</span>
                  </div>
                </div>
              )
            }

            if (item.kind === 'supply') {
              const step = item.step
              const req = step.supply_requests
              if (!req) return null
              const emp = req.employees
              const empLabel = [emp?.position, emp?.name].filter(Boolean).join(' / ')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sortedItems = [...(req.supply_request_items ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
              const isRejecting = rejectingSupplyId === req.id
              return (
                <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{empLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(req.created_at), 'MM/dd')} · {sortedItems.length}개 항목</p>
                  </div>

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
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {sortedItems.map((si: any) => (
                          <tr key={si.id}>
                            <td className="px-3 py-2 text-gray-600">{CATEGORY_LABELS[si.category] ?? si.category}</td>
                            <td className="px-3 py-2 text-gray-800 break-words">{si.description}</td>
                            <td className="px-3 py-2 text-gray-600">{si.estimated_amount != null ? `${Number(si.estimated_amount).toLocaleString()}원` : '—'}</td>
                            <td className="px-3 py-2 text-gray-400 break-words">{si.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {isRejecting ? (
                    <div className="space-y-2">
                      <input type="text" value={supplyRejectComment} onChange={e => setSupplyRejectComment(e.target.value)} placeholder="반려 사유 (선택)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200" autoFocus />
                      <div className="flex gap-2">
                        <button onClick={() => handleSupplyReject(req.id)} disabled={isPending} className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700">반려 확인</button>
                        <button onClick={() => { setRejectingSupplyId(null); setSupplyRejectComment('') }} className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => handleSupplyApprove(req.id)} disabled={isPending} className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90">승인</button>
                      <button onClick={() => setRejectingSupplyId(req.id)} disabled={isPending} className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50">반려</button>
                    </div>
                  )}
                </div>
              )
            }
            return null
          })}
          {pendingItems.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">결재 대기 항목이 없습니다.</div>
          )}
        </div>
      )}

      {/* Done items */}
      {viewTab === 'done' && (
        <div className="space-y-2">
          {doneItems.map(item => {
            const cfg = STATUS_CFG[item.status]
            const isExpanded = expandedDoneId === item.id
            const hasDetail = item.kind === 'expense' ? !!item.expenseDetail : true
            const sortedSupplyItems = [...(item.supplyItems ?? [])].sort((a, b) => a.sort_order - b.sort_order)

            function handleDoneClick() {
              if (item.kind === 'expense' && item.expenseDetail) {
                const d = item.expenseDetail
                setSelectedDoneExpense({
                  id: item.id,
                  title: d.title,
                  taxType: d.taxType,
                  evidenceType: d.evidenceType,
                  payee: d.payee,
                  paymentMethod: d.paymentMethod,
                  bankName: d.bankName,
                  accountNumber: d.accountNumber,
                  accountHolder: d.accountHolder,
                  paymentRequestDate: d.paymentRequestDate,
                  settlementDate: d.settlementDate,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  lineItems: d.lineItems as any[],
                  attachmentUrls: d.attachmentUrls,
                  employeeName: item.employeeName,
                  employeePosition: d.employeePosition,
                  departmentName: null,
                  requestDate: item.requestDate,
                  status: item.status,
                  expenseType: d.expenseType,
                  comment: d.comment,
                })
              } else if (item.kind === 'leave' || item.kind === 'supply') {
                setExpandedDoneId(isExpanded ? null : item.id)
              }
            }

            return (
              <div
                key={item.id}
                className={`rounded-xl border px-5 py-4 space-y-3 ${
                  item.isJeongyeol ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'
                } ${hasDetail ? 'cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors' : ''}`}
                onClick={handleDoneClick}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700">{item.employeeName} — {item.typeLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.detail}
                      {(item.kind === 'leave' || item.kind === 'supply') && hasDetail && (
                        <span className="ml-2 text-primary">· {isExpanded ? '접기' : '상세보기'}</span>
                      )}
                      {item.kind === 'expense' && (
                        <span className="ml-2 text-primary">· 클릭하여 상세보기</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.isJeongyeol
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">전결</span>
                      : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg?.cls}`}>{cfg?.label}</span>
                    }
                    <p className="text-xs text-gray-400 mt-1">
                      {item.actedAt ? format(new Date(item.actedAt), 'MM/dd HH:mm') : ''}
                    </p>
                  </div>
                </div>

                {/* Leave detail */}
                {isExpanded && item.kind === 'leave' && (
                  <div className="pt-1 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                    <p><span className="text-gray-400">기간</span> {item.detail}</p>
                    {item.leaveReason && <p><span className="text-gray-400">사유</span> {item.leaveReason}</p>}
                  </div>
                )}

                {/* Supply detail */}
                {isExpanded && item.kind === 'supply' && sortedSupplyItems.length > 0 && (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs table-fixed">
                      <colgroup>
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '38%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '26%' }} />
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
                        {sortedSupplyItems.map(si => (
                          <tr key={si.id}>
                            <td className="px-3 py-2 text-gray-600">{CATEGORY_LABELS[si.category] ?? si.category}</td>
                            <td className="px-3 py-2 text-gray-800 break-words">{si.description}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {si.estimated_amount != null ? `${Number(si.estimated_amount).toLocaleString()}원` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-400 break-words">{si.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
          {doneItems.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">결재 내역이 없습니다.</div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => router.push(buildUrl({ page: String(page - 1) }))}
            disabled={page <= 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            이전
          </button>
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          <button
            onClick={() => router.push(buildUrl({ page: String(page + 1) }))}
            disabled={page >= totalPages}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      )}

      {selectedExpense && (
        <ExpenseDetailModal
          data={selectedExpense.viewData}
          onClose={() => setSelectedExpense(null)}
          onApprove={() => handleExpenseApprove(selectedExpense.step.expense_reports?.id)}
          onReject={(reason) => handleExpenseReject(selectedExpense.step.expense_reports?.id, reason)}
          isPending={isPending}
        />
      )}

      {selectedDoneExpense && (
        <ExpenseDetailModal
          data={selectedDoneExpense}
          onClose={() => setSelectedDoneExpense(null)}
        />
      )}
    </div>
  )
}
