'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitLeave } from '@/app/(dashboard)/approval/leave/actions'
import { differenceInCalendarDays, format } from 'date-fns'

type LeaveType = 'ANNUAL' | 'SICK' | 'HALF_DAY' | 'OTHER'

const LEAVE_LABELS: Record<LeaveType, string> = {
  ANNUAL: '연차',
  SICK: '병가',
  HALF_DAY: '반차',
  OTHER: '기타',
}

const DAYS_USED: Record<LeaveType, number | null> = {
  ANNUAL: null,
  SICK: null,
  HALF_DAY: 0.5,
  OTHER: null,
}

export default function LeaveForm({ remainingLeaves }: { remainingLeaves: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [leaveType, setLeaveType] = useState<LeaveType>('ANNUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const computedDays = (() => {
    const fixed = DAYS_USED[leaveType]
    if (fixed !== null) return fixed
    if (!startDate || !endDate) return 0
    const diff = differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1
    return Math.max(diff, 0)
  })()

  const canSubmit =
    startDate &&
    (leaveType === 'HALF_DAY' || endDate) &&
    computedDays > 0 &&
    (leaveType === 'SICK' || leaveType === 'OTHER' || computedDays <= remainingLeaves)

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitLeave({
        leaveType,
        startDate,
        endDate: leaveType === 'HALF_DAY' ? startDate : endDate,
        daysUsed: computedDays,
        reason: reason || null,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('연차 신청이 접수되었습니다.')
      router.push('/approval/inbox')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">잔여 연차</span>
        <span className="font-semibold text-gray-900">{remainingLeaves}일</span>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">휴가 유형</label>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(LEAVE_LABELS) as LeaveType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLeaveType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                leaveType === t
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {LEAVE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {leaveType !== 'HALF_DAY' && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || format(new Date(), 'yyyy-MM-dd')}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
      </div>

      {computedDays > 0 && (
        <p className="text-sm text-gray-600">
          사용 일수: <strong>{computedDays}일</strong>
          {leaveType === 'ANNUAL' && computedDays > remainingLeaves && (
            <span className="text-red-500 ml-2">잔여 연차 초과</span>
          )}
        </p>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">사유 (선택)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          placeholder="휴가 사유를 입력하세요"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {isPending ? '신청 중...' : '연차 신청'}
      </button>
    </div>
  )
}
