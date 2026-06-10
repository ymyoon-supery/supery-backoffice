'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Send, Trash2, FileText, CheckCircle, X } from 'lucide-react'
import { generateNotice, updateNoticeContent, markNoticeSent, deleteNotice } from './actions'
import { legalSchedule } from '@/lib/annualLeave'

type Employee = {
  id: string; name: string; email: string; department_id: string | null
  annual_leave_days: number; remaining_leaves: number; hired_at: string | null
}
type Notice = {
  id: string; employee_id: string; fiscal_year: number
  notice_type: 'FIRST' | 'SECOND'; remaining_days: number
  content: string; status: 'DRAFT' | 'SENT'; sent_at: string | null
}
type Team = { id: string; name: string; group_id: string | null }
type Group = { id: string; name: string }

export default function LeavePromotionClient({
  employees, notices: initNotices, teams, groups, year,
}: {
  employees: Employee[]; notices: Notice[]; teams: Team[]; groups: Group[]; year: number
}) {
  const router = useRouter()
  const [notices, setNotices] = useState<Notice[]>(initNotices)
  const [reviewing, setReviewing] = useState<{ notice: Notice; content: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const sched = legalSchedule(year)

  function noticeOf(empId: string, type: 'FIRST' | 'SECOND') {
    return notices.find(n => n.employee_id === empId && n.notice_type === type) ?? null
  }

  function teamName(deptId: string | null) {
    if (!deptId) return null
    const team = teams.find(t => t.id === deptId)
    if (!team) return null
    const group = groups.find(g => g.id === team.group_id)
    return group ? `${group.name} / ${team.name}` : team.name
  }

  function handleGenerate(emp: Employee, type: 'FIRST' | 'SECOND') {
    startTransition(async () => {
      const result = await generateNotice(emp.id, emp.name, type, year, emp.remaining_leaves)
      if (result.error) { toast.error(result.error); return }
      const n = result.notice as Notice
      setNotices(prev => {
        const filtered = prev.filter(x => !(x.employee_id === emp.id && x.notice_type === type))
        return [...filtered, n]
      })
      toast.success('초안이 생성됐습니다.')
      setReviewing({ notice: n, content: n.content })
    })
  }

  function handleReview(notice: Notice) {
    setReviewing({ notice, content: notice.content })
  }

  function handleSend() {
    if (!reviewing) return
    startTransition(async () => {
      const saveResult = await updateNoticeContent(reviewing.notice.id, reviewing.content)
      if (saveResult.error) { toast.error(saveResult.error); return }

      const sendResult = await markNoticeSent(reviewing.notice.id)
      if (sendResult.error) { toast.error(sendResult.error); return }

      const updated: Notice = { ...reviewing.notice, content: reviewing.content, status: 'SENT', sent_at: new Date().toISOString() }
      setNotices(prev => prev.map(n => n.id === updated.id ? updated : n))
      toast.success('발송 완료로 처리됐습니다.')
      setReviewing(null)
    })
  }

  function handleSaveDraft() {
    if (!reviewing) return
    startTransition(async () => {
      const result = await updateNoticeContent(reviewing.notice.id, reviewing.content)
      if (result.error) { toast.error(result.error); return }
      setNotices(prev => prev.map(n => n.id === reviewing.notice.id ? { ...n, content: reviewing.content } : n))
      toast.success('저장됐습니다.')
      setReviewing(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('초안을 삭제하시겠습니까?')) return
    startTransition(async () => {
      const result = await deleteNotice(id)
      if (result.error) { toast.error(result.error); return }
      setNotices(prev => prev.filter(n => n.id !== id))
      toast.success('삭제됐습니다.')
    })
  }

  const prevYear = year - 1
  const nextYear = year + 1
  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">연차사용촉진 관리</h1>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => router.push(`/admin/leave-promotion?year=${prevYear}`)}
            className="px-2 py-1 rounded hover:bg-gray-100 text-gray-500">‹</button>
          <span className="px-3 py-1 font-semibold text-gray-800">{year}년</span>
          <button onClick={() => router.push(`/admin/leave-promotion?year=${nextYear}`)}
            disabled={nextYear > currentYear + 1}
            className="px-2 py-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30">›</button>
        </div>
      </div>

      {/* 법정 일정 안내 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold text-blue-800 mb-1">근로기준법 제61조 연차사용촉진 법정 일정 ({year}년)</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <span>① 1차 통보 (잔여연차 서면 안내): <strong>{sched.firstNoticeBy}까지</strong></span>
          <span>② 직원 사용계획 제출: <strong>{sched.planSubmitBy}까지</strong></span>
          <span>③ 2차 통보 (사용시기 지정): <strong>{sched.secondNoticeBy}까지</strong></span>
          <span>④ 연차 사용기간 만료: <strong>{sched.yearEnd}</strong></span>
        </div>
      </div>

      {/* 직원 목록 */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3 text-right">연차(잔여/부여)</th>
              <th className="px-4 py-3 text-center">1차 공지</th>
              <th className="px-4 py-3 text-center">2차 공지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {employees.map(emp => {
              const first = noticeOf(emp.id, 'FIRST')
              const second = noticeOf(emp.id, 'SECOND')
              return (
                <tr key={emp.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{emp.name}</div>
                    <div className="text-xs text-gray-400">{emp.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{teamName(emp.department_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium tabular-nums ${emp.remaining_leaves <= 5 ? 'text-red-600' : 'text-gray-700'}`}>
                      {emp.remaining_leaves}
                    </span>
                    <span className="text-xs text-gray-400">/{emp.annual_leave_days}일</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <NoticeCell
                      notice={first}
                      onGenerate={() => handleGenerate(emp, 'FIRST')}
                      onReview={() => first && handleReview(first)}
                      onDelete={() => first && handleDelete(first.id)}
                      isPending={isPending}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <NoticeCell
                      notice={second}
                      onGenerate={() => handleGenerate(emp, 'SECOND')}
                      onReview={() => second && handleReview(second)}
                      onDelete={() => second && handleDelete(second.id)}
                      isPending={isPending}
                    />
                  </td>
                </tr>
              )
            })}
            {employees.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">등록된 직원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 공지 검토 모달 */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">
                  공지 {reviewing.notice.notice_type === 'FIRST' ? '1차' : '2차'} 검토
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">내용을 확인·수정 후 발송 완료 처리하세요.</p>
              </div>
              <button onClick={() => setReviewing(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {reviewing.notice.status === 'SENT' ? (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-lg p-4">
                  {reviewing.content}
                </pre>
              ) : (
                <textarea
                  value={reviewing.content}
                  onChange={e => setReviewing(r => r ? { ...r, content: e.target.value } : r)}
                  rows={20}
                  className="w-full text-sm font-mono border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none leading-relaxed"
                />
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              {reviewing.notice.status === 'SENT' ? (
                <div className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle size={15} />
                  발송완료 ({reviewing.notice.sent_at?.slice(0, 10)})
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSaveDraft} disabled={isPending}
                    className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                    저장
                  </button>
                  <button onClick={handleSend} disabled={isPending}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
                    <Send size={13} /> 발송 완료 처리
                  </button>
                </div>
              )}
              <button onClick={() => setReviewing(null)} className="text-sm text-gray-400 hover:text-gray-600">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoticeCell({
  notice, onGenerate, onReview, onDelete, isPending,
}: {
  notice: Notice | null
  onGenerate: () => void
  onReview: () => void
  onDelete: () => void
  isPending: boolean
}) {
  if (!notice) {
    return (
      <button onClick={onGenerate} disabled={isPending}
        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-primary hover:text-primary disabled:opacity-50 transition-colors">
        공지 생성
      </button>
    )
  }

  if (notice.status === 'SENT') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <CheckCircle size={11} /> 발송완료
        </span>
        <button onClick={onReview} className="text-xs text-gray-400 hover:text-gray-600 underline">
          내용 보기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">초안</span>
      <div className="flex gap-1.5">
        <button onClick={onReview} disabled={isPending}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
          <FileText size={11} /> 검토/발송
        </button>
        <button onClick={onDelete} disabled={isPending}
          className="text-xs text-gray-300 hover:text-red-400 disabled:opacity-50">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}
