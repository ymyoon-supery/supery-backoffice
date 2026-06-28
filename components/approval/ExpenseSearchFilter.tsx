'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef } from 'react'

const EXPENSE_TYPE_OPTIONS = [
  { value: '', label: '전체 유형' },
  { value: 'EXPENSE', label: '지출결의서' },
  { value: 'CORPORATE_CARD', label: '법인카드' },
  { value: 'TRANSPORTATION', label: '교통비' },
  { value: 'BUSINESS_INCOME', label: '사업소득' },
  { value: 'PRIZE', label: '경품비' },
]

interface Props {
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
  employeeName?: string
  showAdminFilters?: boolean
  baseParams?: Record<string, string>
}

export default function ExpenseSearchFilter({
  expenseType, month, dateFrom, dateTo, keyword,
  employeeName = '', showAdminFilters = false, baseParams = {},
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buildUrl(overrides: Record<string, string>) {
    const merged = { ...baseParams, expenseType, month, dateFrom, dateTo, keyword, employeeName, ...overrides }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v)
    }
    return `${pathname}?${p.toString()}`
  }

  function nav(overrides: Record<string, string>) {
    router.push(buildUrl({ ...overrides, page: '1' }))
  }

  function debounceNav(overrides: Record<string, string>) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => nav(overrides), 300)
  }

  function handleMonthChange(value: string) {
    nav({ month: value, dateFrom: '', dateTo: '' })
  }

  function handleDateChange(field: 'dateFrom' | 'dateTo', value: string) {
    nav({ [field]: value, month: '' })
  }

  const hasFilters = !!(expenseType || month || dateFrom || dateTo || keyword || employeeName)

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={expenseType}
          onChange={e => nav({ expenseType: e.target.value })}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {EXPENSE_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="month"
          value={month}
          onChange={e => handleMonthChange(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <input
          type="date"
          value={dateFrom}
          onChange={e => handleDateChange('dateFrom', e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-gray-300 text-xs">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => handleDateChange('dateTo', e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          defaultValue={keyword}
          key={keyword}
          onChange={e => debounceNav({ keyword: e.target.value })}
          placeholder="지출항목 검색"
          className="flex-1 min-w-[140px] text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {showAdminFilters && (
          <input
            type="text"
            defaultValue={employeeName}
            key={`emp-${employeeName}`}
            onChange={e => debounceNav({ employeeName: e.target.value })}
            placeholder="신청인 검색"
            className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}

        {hasFilters && (
          <button
            onClick={() => nav({ expenseType: '', month: '', dateFrom: '', dateTo: '', keyword: '', employeeName: '' })}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  )
}
