'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { marked } from 'marked'
import { Eye, EyeOff, Save, Trash2, ArrowLeft } from 'lucide-react'
import { upsertDiary, deleteDiary } from '@/app/(dashboard)/diary/actions'
import { toast } from 'sonner'

type DiaryData = {
  content: string
  created_at: string
  updated_at: string
} | null

export default function DiaryEditorClient({ date, initialDiary }: { date: string; initialDiary: DiaryData }) {
  const router = useRouter()
  const [content, setContent] = useState(initialDiary?.content ?? '')
  const [preview, setPreview] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dateLabel = format(parseISO(date), 'yyyy년 M월 d일 (EEEE)', { locale: ko })
  const isModified = initialDiary && initialDiary.updated_at > initialDiary.created_at

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
              {isModified && (
                <> · 최종 수정: {format(parseISO(initialDiary.updated_at), 'yyyy-MM-dd HH:mm')}</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setPreview(v => !v)}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50">
            {preview ? <EyeOff size={14} /> : <Eye size={14} />}
            {preview ? '편집' : '미리보기'}
          </button>
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

      {preview ? (
        <div
          className="bg-white rounded-lg border border-gray-200 p-5 min-h-[400px] prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }}
        />
      ) : (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={'# 오늘의 업무\n\n- 작업 내용을 마크다운 형식으로 입력하세요.'}
          className="w-full min-h-[400px] bg-white rounded-lg border border-gray-200 p-5 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      )}
      <p className="text-[10px] text-gray-400 mt-2">마크다운 형식을 지원합니다. 미리보기로 결과를 확인하세요.</p>
    </div>
  )
}
