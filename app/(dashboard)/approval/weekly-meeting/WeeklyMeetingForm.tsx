'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertWeeklyMeeting } from './actions'

type Props = {
  weekStart: string
  department: { id: string; name: string }
  initialData: { thisWeek: string; nextWeek: string; issues: string } | null
  onClose: () => void
}

export default function WeeklyMeetingForm({ weekStart, department, initialData, onClose }: Props) {
  const [thisWeek, setThisWeek] = useState(initialData?.thisWeek ?? '')
  const [nextWeek, setNextWeek] = useState(initialData?.nextWeek ?? '')
  const [issues, setIssues] = useState(initialData?.issues ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      const result = await upsertWeeklyMeeting({
        weekStart,
        departmentId: department.id,
        thisWeek,
        nextWeek,
        issues,
      })
      if (result.error) { toast.error(result.error); return }
      toast.success('저장되었습니다.')
      onClose()
    })
  }

  const textareaClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-primary/50'

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">이번 주 진행사항</label>
        <textarea
          value={thisWeek}
          onChange={e => setThisWeek(e.target.value)}
          rows={3}
          placeholder="이번 주 팀 진행사항을 입력하세요"
          className={textareaClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">다음 주 계획</label>
        <textarea
          value={nextWeek}
          onChange={e => setNextWeek(e.target.value)}
          rows={3}
          placeholder="다음 주 팀 계획을 입력하세요"
          className={textareaClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">
          이슈/공유사항{' '}
          <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <textarea
          value={issues}
          onChange={e => setIssues(e.target.value)}
          rows={2}
          placeholder="이슈 또는 공유사항이 있으면 입력하세요"
          className={textareaClass}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || (!thisWeek.trim() && !nextWeek.trim())}
          className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
