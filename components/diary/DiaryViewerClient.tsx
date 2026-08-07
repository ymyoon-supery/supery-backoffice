'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, addDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BookOpen, Search, X, Users } from 'lucide-react'

type Employee = { id: string; name: string; department_name: string | null }

type DailyDiary = {
  employee_id: string
  employee_name: string
  department_name: string | null
  content: string
  created_at: string
  updated_at: string
}

type WeekRow = { diary_date: string; content: string | null }

type SearchRow = {
  diary_date: string
  content: string
  created_at: string
  employee_name: string
  department_name: string | null
}

type Props = {
  basePath: string
  employees: Employee[]
  tab: 'daily' | 'weekly'
  // 일별
  date: string
  dailyDiaries: DailyDiary[]
  noEntryEmployees: Employee[]
  // 주간
  selectedEmployeeId: string
  weekStart: string
  weekDiaries: WeekRow[]
  // 검색
  keyword: string
  searchResults: SearchRow[]
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function DiaryViewerClient({
  basePath, employees, tab,
  date, dailyDiaries, noEntryEmployees,
  selectedEmployeeId, weekStart, weekDiaries,
  keyword: initKeyword, searchResults,
}: Props) {
  const router = useRouter()
  const [keyword, setKeyword] = useState(initKeyword)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function nav(overrides: Record<string, string>) {
    const base: Record<string, string> = {
      tab, date, weekStart, selectedEmployeeId,
    }
    if (initKeyword) base.keyword = initKeyword
    const p = new URLSearchParams({ ...base, ...overrides })
    if (!overrides.keyword && !initKeyword) p.delete('keyword')
    if (overrides.keyword === '') p.delete('keyword')
    router.push(`${basePath}?${p.toString()}`)
  }

  function handleSearch() {
    nav({ keyword: keyword.trim() })
    setExpandedIds(new Set())
  }

  function handleClearSearch() {
    setKeyword('')
    nav({ keyword: '' })
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const prevDay = format(addDays(parseISO(date), -1), 'yyyy-MM-dd')
  const nextDay = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
  const prevWeek = format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd')
  const nextWeek = format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(parseISO(weekStart), i))
  const isSearchMode = initKeyword.trim().length > 0

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">업무 다이어리 조회</h1>

      {/* 검색 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex items-center gap-2">
        <Search size={14} className="text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="전체 직원 내용 검색…"
          className="flex-1 text-sm focus:outline-none"
        />
        {keyword && (
          <button onClick={handleClearSearch} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
        <button onClick={handleSearch}
          className="text-xs bg-primary text-white px-3 py-1 rounded hover:bg-primary/90">
          검색
        </button>
      </div>

      {isSearchMode ? (
        /* 검색 결과 */
        <div>
          <p className="text-xs text-gray-500 mb-3">
            <span className="font-medium text-gray-700">&quot;{initKeyword}&quot;</span> 검색 결과 {searchResults.length}건
          </p>
          {searchResults.length === 0 ? (
            <Empty text="검색 결과가 없습니다." />
          ) : (
            <div className="space-y-3">
              {searchResults.map((r, i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{r.employee_name}</span>
                      {r.department_name && <span className="ml-1.5 text-xs text-gray-400">({r.department_name})</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {format(parseISO(r.diary_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                    </span>
                  </div>
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: r.content }} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 탭 */}
          <div className="flex mb-4 border border-gray-200 rounded-lg overflow-hidden bg-white w-fit">
            {(['daily', 'weekly'] as const).map(t => (
              <button key={t} onClick={() => nav({ tab: t })}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {t === 'daily' ? '일별 (전체 직원)' : '주간 (개인)'}
              </button>
            ))}
          </div>

          {tab === 'daily' ? (
            /* ── 일별: 전체 직원 ── */
            <div>
              {/* 날짜 네비게이션 */}
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => nav({ date: prevDay, tab: 'daily' })}
                  className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft size={16} /></button>
                <div className="flex items-center gap-2">
                  <input type="date" value={date}
                    onChange={e => nav({ date: e.target.value, tab: 'daily' })}
                    className="text-sm border border-gray-200 rounded px-2 py-1.5" />
                  <span className="text-sm font-medium text-gray-700">
                    {format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
                  </span>
                </div>
                <button onClick={() => nav({ date: nextDay, tab: 'daily' })}
                  className="p-1.5 rounded hover:bg-gray-100"><ChevronRight size={16} /></button>
              </div>

              {/* 작성 현황 요약 */}
              <div className="flex items-center gap-3 mb-3 text-sm">
                <span className="text-gray-500">
                  작성 <span className="font-semibold text-primary">{dailyDiaries.length}</span>명
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">
                  미작성 <span className="font-semibold text-gray-400">{noEntryEmployees.length}</span>명
                </span>
                {noEntryEmployees.length > 0 && (
                  <span className="text-xs text-gray-400">
                    ({noEntryEmployees.map(e => e.name).join(', ')})
                  </span>
                )}
              </div>

              {dailyDiaries.length === 0 ? (
                <Empty text="이 날짜에 작성된 다이어리가 없습니다." />
              ) : (
                <div className="space-y-2">
                  {dailyDiaries.map(d => {
                    const expanded = expandedIds.has(d.employee_id)
                    const isModified = d.updated_at > d.created_at
                    return (
                      <div key={d.employee_id}
                        className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        {/* 카드 헤더 — 항상 표시 */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(d.employee_id)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-primary">{d.employee_name[0]}</span>
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-gray-900">{d.employee_name}</span>
                              {d.department_name && (
                                <span className="ml-1.5 text-xs text-gray-400">({d.department_name})</span>
                              )}
                              {!expanded && (
                                <p className="text-xs text-gray-400 truncate mt-0.5 max-w-md">
                                  {stripHtml(d.content).slice(0, 80)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className="text-[10px] text-gray-400">
                              {format(parseISO(d.created_at), 'HH:mm')}
                              {isModified && ' (수정됨)'}
                            </span>
                            {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          </div>
                        </button>
                        {/* 펼쳐진 내용 */}
                        {expanded && (
                          <div className="px-4 pb-4 border-t border-gray-100">
                            <div className="text-[11px] text-gray-400 mt-2 mb-3">
                              최초 작성: {format(parseISO(d.created_at), 'yyyy-MM-dd HH:mm')}
                              {isModified && <> · 최종 수정: {format(parseISO(d.updated_at), 'yyyy-MM-dd HH:mm')}</>}
                            </div>
                            <div className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: d.content }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ── 주간: 개인 ── */
            <div>
              {/* 직원 선택 */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex items-center gap-3">
                <Users size={14} className="text-gray-400 flex-shrink-0" />
                <select
                  value={selectedEmployeeId}
                  onChange={e => nav({ selectedEmployeeId: e.target.value, tab: 'weekly' })}
                  className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.department_name ? ` (${e.department_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 주간 네비게이션 */}
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => nav({ weekStart: prevWeek, tab: 'weekly' })}
                  className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft size={16} /></button>
                <span className="text-sm font-medium text-gray-700">
                  {format(parseISO(weekStart), 'yyyy년 M월 d일', { locale: ko })}
                  {' ~ '}
                  {format(addDays(parseISO(weekStart), 6), 'M월 d일 (일)', { locale: ko })}
                </span>
                <button onClick={() => nav({ weekStart: nextWeek, tab: 'weekly' })}
                  className="p-1.5 rounded hover:bg-gray-100"><ChevronRight size={16} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const dayStr = format(day, 'yyyy-MM-dd')
                  const entry = weekDiaries.find(d => d.diary_date === dayStr)
                  const isWeekend = i >= 5
                  return (
                    <div key={dayStr}
                      className={`bg-white rounded-lg border p-3 min-h-[120px] ${isWeekend ? 'border-gray-100' : 'border-gray-200'}`}>
                      <div className={`text-xs font-semibold mb-2 ${isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>
                        {format(day, 'M/d (EEE)', { locale: ko })}
                      </div>
                      {entry?.content ? (
                        <p className="text-xs text-gray-600 line-clamp-5">
                          {stripHtml(entry.content)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-300 italic">미작성</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-lg border border-dashed border-gray-200 p-12 text-center text-gray-400 text-sm">
      <BookOpen size={32} className="mx-auto mb-2 text-gray-200" />
      {text}
    </div>
  )
}
