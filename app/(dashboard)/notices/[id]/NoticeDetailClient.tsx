'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pin, Pencil, Trash2, X, Check } from 'lucide-react'
import { updateNotice, deleteNotice } from '../actions'

interface Props {
  notice: {
    id: string
    title: string
    content: string
    isPinned: boolean
    createdAt: string
    authorName: string
  }
  canEdit: boolean
  isAdmin: boolean
}

export default function NoticeDetailClient({ notice, canEdit, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editMode, setEditMode] = useState(false)
  const [title, setTitle] = useState(notice.title)
  const [content, setContent] = useState(notice.content)
  const [isPinned, setIsPinned] = useState(notice.isPinned)

  function handleSave() {
    if (!title.trim() || !content.trim()) return
    startTransition(async () => {
      const result = await updateNotice(notice.id, title, content, isPinned)
      if (result.error) { toast.error(result.error); return }
      toast.success('공지사항이 수정되었습니다.')
      setEditMode(false)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirm('공지사항을 삭제하시겠습니까?')) return
    startTransition(async () => {
      const result = await deleteNotice(notice.id)
      if (result.error) { toast.error(result.error); return }
      toast.success('삭제되었습니다.')
      router.push('/notices')
    })
  }

  function handleCancel() {
    setTitle(notice.title)
    setContent(notice.content)
    setIsPinned(notice.isPinned)
    setEditMode(false)
  }

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push('/notices')}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← 목록으로
      </button>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          {editMode ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-lg font-semibold text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : (
            <div className="flex items-start gap-2">
              {isPinned && <Pin size={15} className="text-primary mt-1 shrink-0" />}
              <h1 className="text-lg font-semibold text-gray-900">{notice.title}</h1>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              {notice.authorName} · {format(new Date(notice.createdAt), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
            </p>
            {canEdit && !editMode && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={12} /> 수정
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={12} /> 삭제
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {editMode ? (
            <div className="space-y-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              {isAdmin && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X size={13} /> 취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!title.trim() || !content.trim() || isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  <Check size={13} /> {isPending ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {notice.content}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
