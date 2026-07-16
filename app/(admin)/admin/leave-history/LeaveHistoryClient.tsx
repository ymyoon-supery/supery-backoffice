'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type YearSummary = { year: number; used: number }

type EmployeeSummary = {
  id: string
  name: string
  email: string
  hired_at: string | null
  annual_leave_days: number
  total_used: number
  remaining_leaves: number
  under_one_year: boolean
  by_year: YearSummary[]
}

export default function LeaveHistoryClient({ employees }: { employees: EmployeeSummary[] }) {
  const [tab, setTab] = useState<'all' | 'individual'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  // 데이터에서 연도 목록 추출
  const years = useMemo(() =>
    Array.from(new Set(employees.flatMap(e => e.by_year.map(b => b.year))))
      .sort((a, b) => b - a),
    [employees],
  )

  const selectedEmp = employees.find(e => e.id === selectedId)

  function displayUsed(emp: EmployeeSummary) {
    if (!selectedYear) return emp.total_used
    return emp.by_year.find(b => b.year === selectedYear)?.used ?? 0
  }

  const usedLabel = selectedYear ? `${selectedYear}년 사용` : '총 사용'

  return (
    <div className="space-y-4">
      {/* 연도 필터 */}
      {years.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">연도</span>
          <button
            onClick={() => setSelectedYear(null)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              !selectedYear
                ? 'bg-gray-800 text-white border-gray-800'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            전체
          </button>
          {years.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                selectedYear === y
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {y}년
            </button>
          ))}
        </div>
      )}

      {/* 전체직원 / 개인별 탭 */}
      <div className="flex gap-2">
        {(['all', 'individual'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
              tab === t
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t === 'all' ? '전체 직원' : '개인별'}
          </button>
        ))}
      </div>

      {/* 전체 직원 탭 */}
      {tab === 'all' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {employees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">직원이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 text-left bg-gray-50/60">
                  <th className="px-4 py-3">직원</th>
                  <th className="px-4 py-3">입사일</th>
                  <th className="px-4 py-3 text-right">보유연차</th>
                  <th className="px-4 py-3 text-right">{usedLabel}</th>
                  <th className="px-4 py-3 text-right">잔여</th>
                  {!selectedYear && <th className="px-4 py-3 w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const used = displayUsed(emp)
                  const isExpanded = expandedId === emp.id

                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-gray-50 last:border-0 ${
                        isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'
                      } ${!selectedYear ? 'cursor-pointer' : ''}`}
                      onClick={() => {
                        if (!selectedYear) setExpandedId(isExpanded ? null : emp.id)
                      }}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{emp.name}</span>
                        {emp.under_one_year && (
                          <span className="ml-1.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            1년 미만
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {emp.hired_at ? emp.hired_at.replace(/-/g, '.') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {emp.annual_leave_days}일
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-orange-500">
                        {used}일
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-green-600">
                        {emp.remaining_leaves}일
                      </td>
                      {!selectedYear && (
                        <td className="px-4 py-3 text-gray-300 text-right pr-4">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {/* 연도 선택 시 합계 행 */}
                {selectedYear && (
                  <tr className="bg-gray-50/60 border-t border-gray-100 font-semibold text-gray-700 text-sm">
                    <td className="px-4 py-3" colSpan={3}>합계</td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-600">
                      {Math.round(employees.reduce((s, e) => s + displayUsed(e), 0) * 10) / 10}일
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* 펼침 상세 (전체 연도 모드에서만) */}
          {!selectedYear && expandedId && (() => {
            const emp = employees.find(e => e.id === expandedId)
            if (!emp) return null
            return (
              <div className="px-6 py-3 bg-blue-50/30 border-t border-blue-100/60">
                {emp.by_year.length === 0 ? (
                  <span className="text-xs text-gray-400">사용 내역 없음</span>
                ) : (
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-gray-400">연도별</span>
                    {emp.by_year.map(({ year, used }) => (
                      <span key={year} className="text-xs">
                        <span className="text-gray-400">{year}년</span>
                        <span className="ml-1 font-semibold text-gray-700">{used}일</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* 개인별 탭 */}
      {tab === 'individual' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">직원을 선택하세요</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.email})
                </option>
              ))}
            </select>
          </div>

          {selectedEmp && (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">보유연차</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedEmp.annual_leave_days}
                    <span className="text-sm font-normal text-gray-400 ml-1">일</span>
                  </p>
                  {selectedEmp.under_one_year && (
                    <p className="text-xs text-amber-500 mt-1">입사일 기준 누적</p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">{usedLabel}</p>
                  <p className="text-2xl font-bold text-orange-500">
                    {displayUsed(selectedEmp)}
                    <span className="text-sm font-normal text-gray-400 ml-1">일</span>
                  </p>
                  {selectedEmp.under_one_year && !selectedYear && (
                    <p className="text-xs text-amber-500 mt-1">입사 이후 누적</p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">잔여연차</p>
                  <p className="text-2xl font-bold text-green-500">
                    {selectedEmp.remaining_leaves}
                    <span className="text-sm font-normal text-gray-400 ml-1">일</span>
                  </p>
                </div>
              </div>

              {/* 연도별 사용 현황 */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">연도별 사용 현황</h3>
                  {selectedEmp.hired_at && (
                    <span className="text-xs text-gray-400">
                      입사일: {selectedEmp.hired_at.replace(/-/g, '.')}
                    </span>
                  )}
                </div>
                {selectedEmp.by_year.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">사용 내역이 없습니다.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-50 text-left bg-gray-50/60">
                        <th className="px-4 py-2.5">연도</th>
                        <th className="px-4 py-2.5 text-right">사용연차</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedEmp.by_year.map(({ year, used }) => (
                        <tr
                          key={year}
                          className={`text-gray-700 hover:bg-gray-50/50 ${
                            selectedYear === year ? 'bg-primary/5' : ''
                          }`}
                        >
                          <td className="px-4 py-3 font-medium">
                            {year}년
                            {selectedYear === year && (
                              <span className="ml-2 text-xs text-primary">선택됨</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-orange-500">
                            {used}일
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50/60 font-semibold text-gray-700 border-t border-gray-100">
                        <td className="px-4 py-3">합계</td>
                        <td className="px-4 py-3 text-right tabular-nums">{selectedEmp.total_used}일</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
