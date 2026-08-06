'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarDays, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'

type Diary = {
  id: string
  diary_date: string
  content: string
  created_at: string
  updated_at: string
}

type Props = {
  diaries: Diary[]
  total: number
  page: number
  from: string
  to: string
  keyword: string
}

export default function DiaryListClient({ diaries, total, page, from: initFrom, to: initTo, keyword: initKeyword }: Props) {
  const router = useRouter()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [from, setFrom] = useState(initFrom)
  const [to, setTo] = useState(initTo)
  const [keyword, setKeyword] = useState(initKeyword)
  const pageSize = 10
  const totalPages = Math.ceil(total / pageSize)

  function buildParams(overrides: Record<string, string> = {}) {
    const p = new URLSearchParams()
    const vals = { from, to, keyword, ...overrides }
    if (vals.from) p.set('from', vals.from)
    if (vals.to) p.set('to', vals.to)
    if (vals.keyword) p.set('keyword', vals.keyword)
    if (overrides.page) p.set('page', overrides.page)
    return p.toString()
  }

  function search() {
    router.push('/diary?' + buildParams({ page: '1' }))
  }

  function reset() {
    setFrom(''); setTo(''); setKeyword('')
    router.push('/diary')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">업무 다이어리</h1>
        <Link
          href={`/diary/${today}`}
          className="flex items-center gap-1.5 bg-primary text-white text-sm px-3 py-1.5 rounded-md hover:bg-primary/90"
        >
          <Plus size={14} />새 작성
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">날짜</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1" />
            <span className="text-gray-400 text-sm">~</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1" />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <span className="text-xs text-gray-500 whitespace-nowrap">키워드</span>
            <input
              type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="내용 검색..." onKeyDown={e => e.key === 'Enter' && search()}
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={search}
            className="flex items-center gap-1 bg-primary text-white text-xs px-3 py-1.5 rounded hover:bg-primary/90">
            <Search size={12} />검색
          </button>
          <button onClick={reset}
            className="text-xs text-gray-500 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">
            초기화
          </button>
        </div>
      </div>

      {diaries.length === 0 ? (
        <div className="text-center text-gray-400 py-16 text-sm bg-white rounded-lg border border-gray-200">
          작성된 다이어리가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {diaries.map(d => {
            const lines = d.content.split('\n').filter(Boolean).slice(0, 2).join('\n')
            const isModified = d.updated_at > d.created_at
            return (
              <Link key={d.id} href={`/diary/${d.diary_date}`}
                className="block bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-primary" />
                    {format(parseISO(d.diary_date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    작성 {format(parseISO(d.created_at), 'MM-dd HH:mm')}
                    {isModified && ` · 수정 ${format(parseISO(d.updated_at), 'MM-dd HH:mm')}`}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap">{lines}</p>
              </Link>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button onClick={() => router.push('/diary?' + buildParams({ page: String(page - 1) }))}
            disabled={page <= 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => router.push('/diary?' + buildParams({ page: String(p) }))}
              className={`px-3 py-1 rounded text-sm ${p === page ? 'bg-primary text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
              {p}
            </button>
          ))}
          <button onClick={() => router.push('/diary?' + buildParams({ page: String(page + 1) }))}
            disabled={page >= totalPages}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
