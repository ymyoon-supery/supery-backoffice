'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitLeave } from '@/app/(dashboard)/approval/leave/actions'
import { differenceInCalendarDays, format } from 'date-fns'

type LeaveType = 'ANNUAL' | 'HALF_DAY' | 'AM_HALF' | 'PM_HALF' | 'SICK' | 'GROUP' | 'COMP' | 'OTHER'

const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'AM_HALF', 'PM_HALF', 'SICK', 'GROUP', 'COMP', 'OTHER']

const LEAVE_LABELS: Record<LeaveType, string> = {
  ANNUAL: '연차',
  HALF_DAY: '반차',
  AM_HALF: '오전반차',
  PM_HALF: '오후반차',
  SICK: '병가(무급)',
  GROUP: '공동연차',
  COMP: '보상휴가',
  OTHER: '기타',
}

const FIXED_DAYS: Partial<Record<LeaveType, number>> = {
  HALF_DAY: 0.5, AM_HALF: 0.5, PM_HALF: 0.5,
}

const DEDUCTS_LEAVE = new Set<LeaveType>(['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP'])


export default function LeaveForm({ remainingLeaves, annualLeaveDays }: { remainingLeaves: number; annualLeaveDays: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [leaveType, setLeaveType] = useState<LeaveType>('ANNUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const computedDays = (() => {
    const fixed = FIXED_DAYS[leaveType]
    if (fixed !== undefined) return fixed
    if (!startDate || !endDate) return 0
    return Math.max(differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1, 0)
  })()

  const exceedsBalance = DEDUCTS_LEAVE.has(leaveType) && computedDays > remainingLeaves

  const isHalfDay = leaveType === 'AM_HALF' || leaveType === 'PM_HALF' || leaveType === 'HALF_DAY'

  const canSubmit =
    !!startDate &&
    (isHalfDay || !!endDate) &&
    computedDays > 0 &&
    !exceedsBalance &&
    (leaveType !== 'OTHER' || reason.trim().length > 0)

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitLeave({
        leaveType,
        startDate,
        endDate: isHalfDay ? startDate : endDate,
        daysUsed: computedDays,
        reason: reason || null,
      })
      if (result.error) { toast.error(result.error); return }
      toast.success('연차 신청이 접수되었습니다.')
      router.push('/approval/my')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-4 py-3">
        <div className="text-center flex-1">
          <p className="text-xs text-gray-400 mb-0.5">보유 연차</p>
          <p className="text-base font-semibold text-gray-900">{annualLeaveDays}일</p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center flex-1">
          <p className="text-xs text-gray-400 mb-0.5">잔여 연차</p>
          <p className={`text-base font-semibold ${remainingLeaves <= 0 ? 'text-red-500' : 'text-primary'}`}>{remainingLeaves}일</p>
        </div>
      </div>

      {/* 휴가 유형 */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">휴가 유형</label>
        <div className="flex gap-2 flex-wrap">
          {LEAVE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setLeaveType(t); setReason('') }}
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

      {/* 병가 경고 */}
      {leaveType === 'SICK' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          병가(무급)는 급여가 지급되지 않습니다.
          {remainingLeaves > 0 ? (
            <>
              {' '}잔여 연차({remainingLeaves}일)를 먼저 사용하시는 것을 권장합니다.{' '}
              <button
                type="button"
                onClick={() => setLeaveType('ANNUAL')}
                className="underline font-medium hover:text-amber-900"
              >
                연차로 변경
              </button>
            </>
          ) : (
            ' 잔여 연차가 없어 병가(무급)으로 처리됩니다.'
          )}
        </div>
      )}

      {/* 날짜 */}
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
        {!isHalfDay && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              종료일
            </label>
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
          {exceedsBalance && (
            <span className="text-red-500 ml-2">잔여 연차 초과</span>
          )}
        </p>
      )}

      {/* 사유 / 기타 내용 */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">
          {leaveType === 'OTHER' ? '기타 내용 *' : '사유 (선택)'}
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          placeholder={leaveType === 'OTHER' ? '기타 휴가 내용을 입력하세요 (필수)' : '휴가 사유를 입력하세요'}
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
