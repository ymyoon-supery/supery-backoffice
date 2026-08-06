'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { marked } from 'marked'
import { Save, Trash2, ArrowLeft, Bold, Italic, Strikethrough, List, ListOrdered, Minus } from 'lucide-react'
import { upsertDiary, deleteDiary } from '@/app/(dashboard)/diary/actions'
import { toast } from 'sonner'

type DiaryData = { content: string; created_at: string; updated_at: string } | null

function ToolbarBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className="px-2 py-1 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {children}
    </button>
  )
}

export default function DiaryEditorClient({ date, initialDiary }: { date: string; initialDiary: DiaryData }) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [content, setContent] = useState(initialDiary?.content ?? '')
  const [isPending, startTransition] = useTransition()

  const dateLabel = format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })
  const isModified = initialDiary && initialDiary.updated_at > initialDiary.created_at

  function applyInline(wrap: string, placeholder: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end)
    const text = selected || placeholder
    const insert = `${wrap}${text}${wrap}`
    const next = content.slice(0, start) + insert + content.slice(end)
    setContent(next)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + wrap.length, start + wrap.length + text.length)
    }, 0)
  }

  function applyLinePrefix(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const pos = el.selectionStart
    const val = content
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1
    const lineEnd = val.indexOf('\n', pos)
    const line = val.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    const cleanLine = line.replace(/^(#{1,3} |[-*] |\d+\. )/, '')
    const newLine = line.startsWith(prefix) ? cleanLine : prefix + cleanLine
    const newVal = val.slice(0, lineStart) + newLine + (lineEnd === -1 ? '' : val.slice(lineEnd))
    setContent(newVal)
    const newCursor = lineStart + newLine.length
    setTimeout(() => { el.focus(); el.setSelectionRange(newCursor, newCursor) }, 0)
  }

  function insertHR() {
    const el = textareaRef.current
    if (!el) return
    const pos = el.selectionStart
    const insert = '\n---\n'
    setContent(content.slice(0, pos) + insert + content.slice(pos))
    setTimeout(() => { el.focus(); el.setSelectionRange(pos + insert.length, pos + insert.length) }, 0)
  }

  function handleSave() {
    if (!content.trim()) { toast.error('내용을 입력해주세요.'); return }
    startTransition(async () => {
      const { error } = await upsertDiary(date, content)
      if (error) { toast.error(error); return }
      toast.success('저장되었습니다.')
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirm('이 날의 다이어리를 삭제하시겠습니까?')) return
    startTransition(async () => {
      const { error } = await deleteDiary(date)
      if (error) { toast.error(error); return }
      toast.success('삭제되었습니다.')
      router.push('/diary')
    })
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <button onClick={() => router.push('/diary')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1">
            <ArrowLeft size={12} />목록으로
          </button>
          <h1 className="text-xl font-bold text-gray-900">{dateLabel}</h1>
          {initialDiary && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              최초 작성: {format(parseISO(initialDiary.created_at), 'yyyy-MM-dd HH:mm')}
              {isModified && <> · 최종 수정: {format(parseISO(initialDiary.updated_at), 'yyyy-MM-dd HH:mm')}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {initialDiary && (
            <button onClick={handleDelete} disabled={isPending}
              className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={14} />삭제
            </button>
          )}
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 text-sm bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-50">
            <Save size={14} />{isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {/* 툴바 */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-white border border-b-0 border-gray-200 rounded-t-lg flex-wrap">
        <ToolbarBtn onClick={() => applyLinePrefix('# ')} title="제목 1">
          <span className="text-xs font-bold">H1</span>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => applyLinePrefix('## ')} title="제목 2">
          <span className="text-xs font-bold">H2</span>
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => applyInline('**', '굵게')} title="굵게">
          <Bold size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => applyInline('*', '기울임')} title="기울임">
          <Italic size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => applyInline('~~', '취소선')} title="취소선">
          <Strikethrough size={14} />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => applyLinePrefix('- ')} title="글머리 목록">
          <List size={14} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => applyLinePrefix('1. ')} title="번호 목록">
          <ListOrdered size={14} />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={insertHR} title="구분선">
          <Minus size={14} />
        </ToolbarBtn>
      </div>

      {/* 에디터 + 실시간 미리보기 */}
      <div className="grid grid-cols-1 md:grid-cols-2 border border-gray-200 rounded-b-lg overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="오늘 업무 내용을 자유롭게 기록하세요."
          className="min-h-[420px] p-4 text-sm resize-none focus:outline-none md:border-r md:border-gray-200 border-b border-gray-200 md:border-b-0"
        />
        <div
          className="min-h-[420px] p-4 bg-gray-50 prose prose-sm max-w-none overflow-auto"
          dangerouslySetInnerHTML={{ __html: marked.parse(content || ' ') as string }}
        />
      </div>
    </div>
  )
}
