'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, PenLine } from 'lucide-react'
import { confirmWeeklyMeeting } from './actions'
import WeeklyMeetingForm from './WeeklyMeetingForm'

type Department = { id: string; name: string; sort_order: number }
type Meeting = {
  id: string
  department_id: string
  this_week: string | null
  next_week: string | null
  issues: string | null
  is_confirmed: boolean
  confirmed_at: string | null
}

type Props = {
  weekStart: string
  weekLabel: string
  prevWeekStart: string
  nextWeekStart: string
  currentWeekStart: string
  departments: Department[]
  meetings: Meeting[]
  isAdmin: boolean
  myDepartmentId: string | null
}

export default function WeeklyMeetingClient({
  weekStart, weekLabel, prevWeekStart, nextWeekStart, currentWeekStart,
  departments, meetings, isAdmin, myDepartmentId,
}: Props) {
  const router = useRouter()
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [isConfirming, startConfirmTransition] = useTransition()

  const meetingMap = new Map(meetings.map(m => [m.department_id, m]))
  const isConfirmed = meetings.some(m => m.is_confirmed)
  const isCurrentWeek = weekStart === currentWeekStart
  const confirmedMeeting = meetings.find(m => m.is_confirmed && m.confirmed_at)

  function navigate(week: string) {
    router.push(`/approval/weekly-meeting?week=${week}`)
  }

  function handleConfirm() {
    startConfirmTransition(async () => {
      const result = await confirmWeeklyMeeting(weekStart)
      if (result.error) { toast.error(result.error); return }
      toast.success('최종 확인되었습니다.')
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* 주 네비게이션 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(prevWeekStart)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-semibold text-gray-900">{weekLabel} 주간회의</h1>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => navigate(currentWeekStart)}
              className="text-xs text-primary hover:underline mt-0.5"
            >
              이번 주로
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(nextWeekStart)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 팀별 카드 */}
      <div className="space-y-2">
        {departments.map(dept => {
          const meeting = meetingMap.get(dept.id)
          const hasMeeting = !!meeting
          const canEdit = isAdmin || (!isConfirmed && myDepartmentId === dept.id)
          const isEditing = editingDeptId === dept.id

          return (
            <div key={dept.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{dept.name}</span>
                  {hasMeeting ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={11} />
                      입력완료
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Clock size={11} />
                      미입력
                    </span>
                  )}
                </div>
                {canEdit && !isEditing && (
                  <button
                    type="button"
                    onClick={() => setEditingDeptId(dept.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary border border-gray-200 rounded-lg px-2 py-1 transition-colors"
                  >
                    <PenLine size={11} />
                    {hasMeeting ? '수정' : '입력'}
                  </button>
                )}
              </div>

              {/* 내용 표시 */}
              {hasMeeting && !isEditing && (
                <div className="mt-3 space-y-3 text-sm text-gray-700">
                  {meeting.this_week && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">이번 주 진행사항</p>
                      <p className="whitespace-pre-wrap">{meeting.this_week}</p>
                    </div>
                  )}
                  {meeting.next_week && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">다음 주 계획</p>
                      <p className="whitespace-pre-wrap">{meeting.next_week}</p>
                    </div>
                  )}
                  {meeting.issues && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">이슈/공유사항</p>
                      <p className="whitespace-pre-wrap">{meeting.issues}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 인라인 수정 폼 */}
              {isEditing && (
                <WeeklyMeetingForm
                  weekStart={weekStart}
                  department={dept}
                  initialData={meeting ? {
                    thisWeek: meeting.this_week ?? '',
                    nextWeek: meeting.next_week ?? '',
                    issues: meeting.issues ?? '',
                  } : null}
                  onClose={() => setEditingDeptId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* 관리자 최종확인 */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          {isConfirmed && confirmedMeeting ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 size={16} />
              <span>
                관리자 확인 완료 ·{' '}
                {new Date(confirmedMeeting.confirmed_at!).toLocaleString('ko-KR', {
                  month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirming || meetings.length === 0}
              className="w-full py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isConfirming ? '처리 중...' : '최종 확인'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
