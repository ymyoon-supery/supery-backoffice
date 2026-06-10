'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { differenceInCalendarDays } from 'date-fns'
import { adminAddLeaveRecord } from './actions'

type Employee = { id: string; name: string; email: string; remaining_leaves: number }
type LeaveType = 'ANNUAL' | 'HALF_DAY' | 'SICK' | 'COMP' | 'OTHER'

const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'HALF_DAY', 'SICK', 'COMP', 'OTHER']
const LEAVE_LABELS: Record<LeaveType, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', SICK: '병가(무급)', COMP: '보상휴가', OTHER: '기타',
}
const DEDUCTS = new Set<LeaveType>(['ANNUAL', 'HALF_DAY'])

type RecentEntry = { name: string; type: string; start: string; end: string; days: number }

export default function LeaveManualClient({ employees }: { employees: Employee[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [employeeId, setEmployeeId] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType>('ANNUAL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [daysOverride, setDaysOverride] = useState('')
  const [reason, setReason] = useState('')
  const [recent, setRecent] = useState<RecentEntry[]>([])

  const selectedEmp = employees.find(e => e.id === employeeId)

  const autoDays = (() => {
    if (leaveType === 'HALF_DAY') return 0.5
    if (!startDate || !endDate) return 0
    return Math.max(differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1, 0)
  })()

  const computedDays = daysOverride !== '' ? (parseFloat(daysOverride) || 0) : autoDays

  const newRemaining = selectedEmp
    ? Math.max(Number(selectedEmp.remaining_leaves) - computedDays, 0)
    : null

  const canSubmit =
    !!employeeId && !!startDate &&
    (leaveType === 'HALF_DAY' || !!endDate) &&
    computedDays > 0 &&
    (leaveType !== 'OTHER' || reason.trim().length > 0)

  function handleSubmit() {
    startTransition(async () => {
      const result = await adminAddLeaveRecord({
        employeeId,
        leaveType,
        startDate,
        endDate: leaveType === 'HALF_DAY' ? startDate : endDate,
        daysUsed: computedDays,
        reason: reason || null,
      })
      if (result.error) { toast.error(result.error); return }

      setRecent(prev => [{
        name: selectedEmp?.name ?? '',
        type: LEAVE_LABELS[leaveType],
        start: startDate,
        end: leaveType === 'HALF_DAY' ? startDate : endDate,
        days: computedDays,
      }, ...prev.slice(0, 9)])

      setStartDate(''); setEndDate(''); setDaysOverride(''); setReason('')
      toast.success('연차 내역이 등록됐습니다.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        {/* 직원 선택 */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">직원</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
            <option value="">직원을 선택하세요</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.email}) — 잔여 {emp.remaining_leaves}일
              </option>
            ))}
          </select>
        </div>

        {/* 휴가 유형 */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">휴가 유형</label>
          <div className="flex gap-2 flex-wrap">
            {LEAVE_TYPES.map(t => (
              <button key={t} type="button"
                onClick={() => { setLeaveType(t); setDaysOverride('') }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  leaveType === t ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {LEAVE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* 날짜 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">시작일</label>
            <input type="date" value={startDate}
              onChange={e => { setStartDate(e.target.value); setDaysOverride('') }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {leaveType !== 'HALF_DAY' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">종료일</label>
              <input type="date" value={endDate} min={startDate}
                onChange={e => { setEndDate(e.target.value); setDaysOverride('') }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}
        </div>

        {/* 사용 일수 */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">사용 일수</label>
          <input type="number" step="0.5" min="0.5"
            value={daysOverride !== '' ? daysOverride : (autoDays > 0 ? autoDays : '')}
            onChange={e => setDaysOverride(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="자동 계산 (직접 수정 가능)" />
          {DEDUCTS.has(leaveType) && selectedEmp && computedDays > 0 && (
            <p className="text-xs text-gray-400">
              잔여 연차 차감: {selectedEmp.remaining_leaves}일 → {newRemaining}일
            </p>
          )}
        </div>

        {/* 사유 */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            {leaveType === 'OTHER' ? '기타 내용 *' : '사유 (선택)'}
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            placeholder={leaveType === 'OTHER' ? '기타 내용을 입력하세요 (필수)' : '사유를 입력하세요'} />
        </div>

        <button type="button" onClick={handleSubmit} disabled={!canSubmit || isPending}
          className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors">
          {isPending ? '등록 중...' : '연차 내역 등록'}
        </button>
      </div>

      {/* 이번 세션 등록 내역 */}
      {recent.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-medium text-gray-700">이번 세션 등록 내역</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-50 text-left">
                <th className="px-4 py-2">직원</th>
                <th className="px-4 py-2">유형</th>
                <th className="px-4 py-2">기간</th>
                <th className="px-4 py-2 text-right">일수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.map((r, i) => (
                <tr key={i} className="text-gray-700">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-gray-500">{r.type}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {r.start}{r.start !== r.end ? ` ~ ${r.end}` : ''}
                  </td>
                  <td className="px-4 py-2 text-right">{r.days}일</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
