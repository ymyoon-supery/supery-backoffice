'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createNotice } from '../actions'
import { Pin } from 'lucide-react'

export default function NewNoticeClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)

  function handleSubmit() {
    if (!title.trim() || !content.trim()) return
    startTransition(async () => {
      const result = await createNotice(title, content, isPinned)
      if (result.error) { toast.error(result.error); return }
      toast.success('공지사항이 등록되었습니다.')
      router.push('/notices')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목을 입력하세요"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">내용</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder="공지 내용을 입력하세요"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>

      {isAdmin && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <Pin size={13} className="text-primary" />
          <span className="text-sm text-gray-700">상단 고정</span>
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-2.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!title.trim() || !content.trim() || isPending}
          className="flex-1 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {isPending ? '등록 중...' : '공지 등록'}
        </button>
      </div>
    </div>
  )
}
