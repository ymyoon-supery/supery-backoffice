'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pin, PenLine, Pencil, Trash2, X, Check, ChevronDown, ChevronUp } from 'lucide-react'
import {
  createNotice,
  updateNotice,
  deleteNotice,
  toggleNoticeWriter,
} from '@/app/(dashboard)/notices/actions'

type Notice = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
  author_id: string
  employees: { name: string } | null
}

type Employee = {
  id: string
  name: string
  can_write_notice: boolean
}

interface Props {
  initialNotices: Notice[]
  employees: Employee[]
}

export default function AdminNoticesClient({ initialNotices, employees: initialEmployees }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // form state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)

  // writer section toggle
  const [showWriters, setShowWriters] = useState(false)
  const [employees, setEmployees] = useState(initialEmployees)

  function openCreate() {
    setEditId(null)
    setTitle('')
    setContent('')
    setIsPinned(false)
    setShowForm(true)
  }

  function openEdit(n: Notice) {
    setEditId(n.id)
    setTitle(n.title)
    setContent(n.content)
    setIsPinned(n.is_pinned)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setTitle('')
    setContent('')
    setIsPinned(false)
  }

  function handleSave() {
    if (!title.trim() || !content.trim()) return
    startTransition(async () => {
      const result = editId
        ? await updateNotice(editId, title, content, isPinned)
        : await createNotice(title, content, isPinned)
      if (result.error) { toast.error(result.error); return }
      toast.success(editId ? '공지사항이 수정되었습니다.' : '공지사항이 등록되었습니다.')
      closeForm()
      router.refresh()
    })
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 공지사항을 삭제하시겠습니까?`)) return
    startTransition(async () => {
      const result = await deleteNotice(id)
      if (result.error) { toast.error(result.error); return }
      toast.success('삭제되었습니다.')
      router.refresh()
    })
  }

  function handleToggleWriter(emp: Employee) {
    const next = !emp.can_write_notice
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, can_write_notice: next } : e))
    startTransition(async () => {
      const result = await toggleNoticeWriter(emp.id, next)
      if (result.error) {
        toast.error(result.error)
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, can_write_notice: !next } : e))
      } else {
        toast.success(`${emp.name} 님의 작성 권한을 ${next ? '부여' : '해제'}했습니다.`)
      }
    })
  }

  const notices = initialNotices

  return (
    <div className="space-y-6">
      {/* Create/Edit Form */}
      {showForm ? (
        <div className="bg-white rounded-xl border border-primary/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              {editId ? '공지사항 수정' : '새 공지사항 작성'}
            </h2>
            <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="내용을 입력하세요"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <div className="flex items-center justify-between">
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
            <div className="flex gap-2">
              <button type="button" onClick={closeForm}
                className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button type="button" onClick={handleSave}
                disabled={!title.trim() || !content.trim() || isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors">
                <Check size={13} />
                {isPending ? '저장 중...' : (editId ? '수정 완료' : '등록')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={openCreate}
          className="flex items-center gap-2 text-sm text-white bg-primary px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
          <PenLine size={14} />
          새 공지사항 작성
        </button>
      )}

      {/* Notices list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            공지사항 목록 ({notices.length}건)
          </span>
        </div>
        {notices.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">등록된 공지사항이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium text-left bg-gray-50/30">
                <th className="px-4 py-2.5 w-8 text-center">고정</th>
                <th className="px-4 py-2.5">제목</th>
                <th className="px-4 py-2.5 w-24">작성자</th>
                <th className="px-4 py-2.5 w-28">날짜</th>
                <th className="px-4 py-2.5 w-20 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {notices.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center">
                    {n.is_pinned && <Pin size={13} className="text-primary inline-block" />}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[240px]">
                    {n.title}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{n.employees?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {format(new Date(n.created_at), 'yyyy.MM.dd', { locale: ko })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => openEdit(n)}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => handleDelete(n.id, n.title)}
                        disabled={isPending}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Writer permissions */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWriters(!showWriters)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50/50 transition-colors"
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            공지 작성 권한 관리 ({employees.filter(e => e.can_write_notice).length}명 지정됨)
          </span>
          {showWriters ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </button>

        {showWriters && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {employees.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">직원이 없습니다.</div>
            ) : (
              employees.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-700">{emp.name}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleWriter(emp)}
                    disabled={isPending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      emp.can_write_notice ? 'bg-primary' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      emp.can_write_notice ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
