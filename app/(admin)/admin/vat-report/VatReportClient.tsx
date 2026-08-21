'use client'

import { useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { fetchVatReportData, VatCategory, VatRecord } from './actions'

// ── Label maps ──────────────────────────────────────────────────────────────

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  TAX_INVOICE: '세금계산서',
  ELECTRONIC_INVOICE: '전자계산서',
  BUSINESS_RECEIPT: '사업자지출증빙',
  CORPORATE_CARD: '법인카드영수증',
  PERSONAL_CARD: '개인카드영수증',
  OTHER_RECEIPT: '기타-개별영수증',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  TRANSFER: '계좌송금',
  CARD: '회사카드',
  CASH: '현금',
}

// ── Tab definitions ─────────────────────────────────────────────────────────

type TabDef = {
  id: VatCategory
  label: string
  group: '지출결의' | '경비정산'
}

const TABS: TabDef[] = [
  { id: 'EXPENSE',        label: '지출결의서',      group: '지출결의' },
  { id: 'BUSINESS_INCOME', label: '사업소득',       group: '지출결의' },
  { id: 'PRIZE',          label: '기타소득',        group: '지출결의' },
  { id: 'CORPORATE_CARD', label: '법인카드',        group: '경비정산' },
  { id: 'TRANSPORTATION', label: '교통비',          group: '경비정산' },
  { id: 'PERSONAL_CARD',  label: '개인카드영수증',  group: '경비정산' },
  { id: 'OTHER_RECEIPT',  label: '기타-개별영수증', group: '경비정산' },
  { id: 'CONDOLENCE',    label: '경조사',          group: '경비정산' },
]

// ── Date helpers ─────────────────────────────────────────────────────────────

function getKstToday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getThisMonth(): { start: string; end: string } {
  const today = getKstToday()
  const ym = today.slice(0, 7)
  const daysInMonth = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
  return { start: `${ym}-01`, end: `${ym}-${String(daysInMonth).padStart(2, '0')}` }
}

function getLastMonth(): { start: string; end: string } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth() // 0-indexed, so this is last month's index when we subtract
  const lastMonthDate = new Date(Date.UTC(year, month - 1, 1))
  const ym = lastMonthDate.toISOString().slice(0, 7)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${ym}-01`, end: `${ym}-${String(daysInMonth).padStart(2, '0')}` }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return format(new Date(iso), 'yyyy-MM-dd') } catch { return iso }
}

function fmtAmt(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toLocaleString('ko-KR')
}

// ── Excel builders ───────────────────────────────────────────────────────────

function buildExcelRows(category: VatCategory, records: VatRecord[]): { headers: string[]; rows: (string | number)[][] } {
  switch (category) {
    case 'EXPENSE': {
      const headers = ['신청일', '문서번호', '신청자', '부서', '제목', '증빙유형', '금액', '지급대상', '지급방식', '지급요청일']
      const rows = records.map(r => [
        fmtDate(r.created_at),
        r.doc_number ?? '',
        r.employees?.name ?? '',
        r.employees?.dept_name ?? '',
        r.title ?? '',
        r.evidence_type ? (EVIDENCE_TYPE_LABELS[r.evidence_type] ?? r.evidence_type) : '',
        r.amount ?? 0,
        r.payee ?? '',
        r.payment_method ? (PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method) : '',
        fmtDate(r.payment_request_date),
      ])
      return { headers, rows }
    }
    case 'BUSINESS_INCOME':
    case 'PRIZE': {
      const headers = ['신청일', '문서번호', '신청자', '부서', '지급대상', '금액', '지급요청일']
      const rows = records.map(r => [
        fmtDate(r.created_at),
        r.doc_number ?? '',
        r.employees?.name ?? '',
        r.employees?.dept_name ?? '',
        r.payee ?? '',
        r.amount ?? 0,
        fmtDate(r.payment_request_date),
      ])
      return { headers, rows }
    }
    case 'CORPORATE_CARD': {
      const headers = ['사용일', '신청자', '부서', '이용자명', '가맹점명', '금액', '비고']
      const rows: (string | number)[][] = []
      for (const r of records) {
        const items = r.line_items ?? []
        if (items.length === 0) {
          rows.push([
            fmtDate(r.created_at),
            r.employees?.name ?? '',
            r.employees?.dept_name ?? '',
            '', '', r.amount ?? 0, '',
          ])
        } else {
          for (const li of items) {
            rows.push([
              fmtDate(li.date),
              r.employees?.name ?? '',
              r.employees?.dept_name ?? '',
              li.userName ?? '',
              li.item ?? '',
              li.amount ?? 0,
              li.note ?? '',
            ])
          }
        }
      }
      return { headers, rows }
    }
    case 'TRANSPORTATION': {
      const headers = ['사용일', '신청자', '부서', '항목', '금액', '비고']
      const rows: (string | number)[][] = []
      for (const r of records) {
        const items = r.line_items ?? []
        if (items.length === 0) {
          rows.push([
            fmtDate(r.created_at),
            r.employees?.name ?? '',
            r.employees?.dept_name ?? '',
            '', r.amount ?? 0, '',
          ])
        } else {
          for (const li of items) {
            rows.push([
              fmtDate(li.date),
              r.employees?.name ?? '',
              r.employees?.dept_name ?? '',
              li.item ?? '',
              li.amount ?? 0,
              li.note ?? '',
            ])
          }
        }
      }
      return { headers, rows }
    }
    case 'PERSONAL_CARD': {
      const headers = ['신청일', '문서번호', '신청자', '부서', '제목', '카드사', '금액', '지급대상', '지급요청일']
      const rows = records.map(r => [
        fmtDate(r.created_at),
        r.doc_number ?? '',
        r.employees?.name ?? '',
        r.employees?.dept_name ?? '',
        r.title ?? '',
        r.card_company ?? '',
        r.amount ?? 0,
        r.payee ?? '',
        fmtDate(r.payment_request_date),
      ])
      return { headers, rows }
    }
    case 'OTHER_RECEIPT': {
      const headers = ['신청일', '문서번호', '신청자', '부서', '제목', '금액', '지급대상', '지급요청일']
      const rows = records.map(r => [
        fmtDate(r.created_at),
        r.doc_number ?? '',
        r.employees?.name ?? '',
        r.employees?.dept_name ?? '',
        r.title ?? '',
        r.amount ?? 0,
        r.payee ?? '',
        fmtDate(r.payment_request_date),
      ])
      return { headers, rows }
    }
    case 'CONDOLENCE': {
      const headers = ['신청일', '문서번호', '신청자', '부서', '제목', '지급대상', '금액', '지급방식', '지급요청일', '비고']
      const rows = records.map(r => {
        const note = r.line_items?.[0]?.note ?? ''
        return [
          fmtDate(r.created_at),
          r.doc_number ?? '',
          r.employees?.name ?? '',
          r.employees?.dept_name ?? '',
          r.title ?? '',
          r.payee ?? '',
          r.amount ?? 0,
          r.payment_method ? (PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method) : '',
          fmtDate(r.payment_request_date),
          note,
        ]
      })
      return { headers, rows }
    }
  }
}

// ── Screen table columns ─────────────────────────────────────────────────────

function renderTableRows(category: VatCategory, records: VatRecord[]) {
  switch (category) {
    case 'EXPENSE':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '제목', '증빙유형', '금액', '지급대상'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[200px] truncate">{r.title ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                  {r.evidence_type ? (EVIDENCE_TYPE_LABELS[r.evidence_type] ?? r.evidence_type) : '—'}
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.payee ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </>
      )
    case 'BUSINESS_INCOME':
    case 'PRIZE':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '지급대상', '금액', '지급요청일'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">{r.payee ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.payment_request_date) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </>
      )
    case 'CORPORATE_CARD':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '금액', '내역수'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                  {r.line_items?.length ? `${r.line_items.length}건` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </>
      )
    case 'TRANSPORTATION':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '금액', '내역수'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                  {r.line_items?.length ? `${r.line_items.length}건` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </>
      )
    case 'PERSONAL_CARD':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '제목', '카드사', '금액', '지급대상'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[200px] truncate">{r.title ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.card_company ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.payee ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </>
      )
    case 'OTHER_RECEIPT':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '제목', '금액', '지급대상'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[200px] truncate">{r.title ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.payee ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </>
      )
    case 'CONDOLENCE':
      return (
        <>
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['신청일', '문서번호', '신청자', '부서', '제목', '지급대상', '금액', '지급방식', '지급요청일', '비고'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.doc_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 whitespace-nowrap">{r.employees?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.employees?.dept_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[180px] truncate">{r.title ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.payee ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-800 text-right whitespace-nowrap">{fmtAmt(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                  {r.payment_method ? (PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method) : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.payment_request_date) || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate">{r.line_items?.[0]?.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </>
      )
  }
}

// ── Compute totals ───────────────────────────────────────────────────────────

function computeTotals(category: VatCategory, records: VatRecord[]): { count: number; amount: number } {
  if (category === 'CORPORATE_CARD' || category === 'TRANSPORTATION') {
    let count = 0
    let amount = 0
    for (const r of records) {
      const items = r.line_items ?? []
      if (items.length > 0) {
        count += items.length
        amount += items.reduce((s, li) => s + (li.amount ?? 0), 0)
      } else {
        count += 1
        amount += r.amount ?? 0
      }
    }
    return { count, amount }
  }
  return {
    count: records.length,
    amount: records.reduce((s, r) => s + (r.amount ?? 0), 0),
  }
}

// ── Main component ───────────────────────────────────────────────────────────

type DateMode = '이번달' | '지난달' | '직접입력'

export default function VatReportClient() {
  const thisMonth = getThisMonth()
  const lastMonth = getLastMonth()

  const [activeTab, setActiveTab] = useState<VatCategory>('EXPENSE')
  const [dateMode, setDateMode] = useState<DateMode>('이번달')
  const [customStart, setCustomStart] = useState(thisMonth.start)
  const [customEnd, setCustomEnd] = useState(thisMonth.end)
  const [data, setData] = useState<VatRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Resolved date range
  function getDateRange(): { startDate: string; endDate: string } {
    if (dateMode === '이번달') return { startDate: thisMonth.start, endDate: thisMonth.end }
    if (dateMode === '지난달') return { startDate: lastMonth.start, endDate: lastMonth.end }
    return { startDate: customStart, endDate: customEnd }
  }

  function handleFetch() {
    const { startDate, endDate } = getDateRange()
    setError(null)
    setData(null)
    startTransition(async () => {
      const result = await fetchVatReportData({ category: activeTab, startDate, endDate })
      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data ?? [])
      }
    })
  }

  function handleTabChange(tab: VatCategory) {
    setActiveTab(tab)
    setData(null)
    setError(null)
  }

  function handleExcelDownload() {
    if (!data || data.length === 0) return
    const tabDef = TABS.find(t => t.id === activeTab)!
    const { startDate, endDate } = getDateRange()
    const { headers, rows } = buildExcelRows(activeTab, data)

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tabDef.label)
    const fileName = `부가세신고_${tabDef.label}_${startDate}_${endDate}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const groups: Array<{ label: '지출결의' | '경비정산'; tabs: TabDef[] }> = [
    { label: '지출결의', tabs: TABS.filter(t => t.group === '지출결의') },
    { label: '경비정산', tabs: TABS.filter(t => t.group === '경비정산') },
  ]

  const totals = data ? computeTotals(activeTab, data) : null

  return (
    <div className="space-y-5">
      {/* Date range filter */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">기간</span>
          <div className="flex gap-1">
            {(['이번달', '지난달', '직접입력'] as DateMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setDateMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  dateMode === m
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {dateMode === '직접입력' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          {dateMode !== '직접입력' && (
            <span className="text-xs text-gray-400">
              {dateMode === '이번달' ? `${thisMonth.start} ~ ${thisMonth.end}` : `${lastMonth.start} ~ ${lastMonth.end}`}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.tabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTabChange(t.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    activeTab === t.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleFetch}
            disabled={isPending}
            className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? '조회중...' : '조회'}
          </button>
          {data && data.length > 0 && (
            <button
              type="button"
              onClick={handleExcelDownload}
              className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              엑셀 다운로드
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {isPending && (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-sm text-gray-400">데이터를 불러오는 중...</p>
        </div>
      )}

      {!isPending && data !== null && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {data.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">해당 기간에 데이터가 없습니다.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {renderTableRows(activeTab, data)}
                </table>
              </div>

              {totals && (
                <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50/60">
                  <span className="text-xs text-gray-500">
                    총 <span className="font-semibold text-gray-700">{totals.count.toLocaleString('ko-KR')}</span>건
                  </span>
                  <span className="text-sm font-semibold text-gray-800">
                    {totals.amount.toLocaleString('ko-KR')}원
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
