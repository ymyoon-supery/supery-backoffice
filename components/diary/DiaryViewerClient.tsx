'use client'

import { useRouter } from 'next/navigation'
import { format, parseISO, addDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

type Employee = { id: string; name: string; department_name: string | null }
type DiaryRow = { diary_date: string; content: string; created_at: string; updated_at: string } | null
type WeekRow = { diary_date: string; content: string | null }

type Props = {
  basePath: string
  employees: Employee[]
  selectedEmployeeId: string
  tab: 'daily' | 'weekly'
  date: string
  weekStart: string
  diary: DiaryRow
  weekDiaries: WeekRow[]
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function DiaryViewerClient({
  basePath, employees, selectedEmployeeId, tab, date, weekStart, diary, weekDiaries,
}: Props) {
  const router = useRouter()

  function nav(overrides: Record<string, string>) {
    const p = new URLSearchParams({ employeeId: selectedEmployeeId, tab, date, weekStart, ...overrides })
    router.push(`${basePath}?${p.toString()}`)
  }

  const prevWeek = format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd')
  const nextWeek = format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(parseISO(weekStart), i))

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">업무 다이어리 조회</h1>
      </div>

      {/* 직원 선택 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-600 whitespace-nowrap font-medium">직원 선택</span>
        <select
          value={selectedEmployeeId}
          onChange={e => nav({ employeeId: e.target.value })}
          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
        >
          {employees.map(e => (
            <option key={e.id} value={e.id}>
              {e.name}{e.department_name ? ` (${e.department_name})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 탭 */}
      <div className="flex mb-4 border border-gray-200 rounded-lg overflow-hidden bg-white w-fit">
        {(['daily', 'weekly'] as const).map(t => (
          <button key={t} onClick={() => nav({ tab: t })}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}>
            {t === 'daily' ? '일별' : '주간'}
          </button>
        ))}
      </div>

      {tab === 'daily' ? (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="date" value={date}
              onChange={e => nav({ date: e.target.value })}
              className="text-sm border border-gray-200 rounded px-2 py-1.5"
            />
            {date && (
              <span className="text-sm text-gray-500">
                {format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
              </span>
            )}
          </div>

          {diary ? (
            <div>
              <div className="text-[11px] text-gray-400 mb-2">
                최초 작성: {format(parseISO(diary.created_at), 'yyyy-MM-dd HH:mm')}
                {diary.updated_at > diary.created_at && (
                  <> · 최종 수정: {format(parseISO(diary.updated_at), 'yyyy-MM-dd HH:mm')}</>
                )}
              </div>
              <div
                className="bg-white rounded-lg border border-gray-200 p-5 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: diary.content }}
              />
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
              <BookOpen size={32} className="mx-auto mb-2 text-gray-200" />
              {date ? '해당 날짜에 작성된 다이어리가 없습니다.' : '날짜를 선택하세요.'}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => nav({ weekStart: prevWeek, tab: 'weekly' })}
              className="p-1.5 rounded hover:bg-gray-100">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {format(parseISO(weekStart), 'yyyy년 M월 d일', { locale: ko })}
              {' ~ '}
              {format(addDays(parseISO(weekStart), 6), 'M월 d일 (일)', { locale: ko })}
            </span>
            <button onClick={() => nav({ weekStart: nextWeek, tab: 'weekly' })}
              className="p-1.5 rounded hover:bg-gray-100">
              <ChevronRight size={16} />
            </button>
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
                    <p className="text-xs text-gray-600 line-clamp-4">
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
    </div>
  )
}
