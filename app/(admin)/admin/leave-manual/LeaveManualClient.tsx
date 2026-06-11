'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { differenceInCalendarDays } from 'date-fns'
import { Pencil, Trash2, X } from 'lucide-react'
import { adminAddLeaveRecord, adminUpdateLeaveRecord, adminDeleteLeaveRecord } from './actions'

type Employee = { id: string; name: string; email: string; annual_leave_days: number; remaining_leaves: number }
type LeaveRecord = {
  id: string; employee_id: string; leave_type: string
  start_date: string; end_date: string; days_used: number; reason: string | null
  is_manual: boolean
}
type LeaveType = 'ANNUAL' | 'HALF_DAY' | 'AM_HALF' | 'PM_HALF' | 'SICK' | 'GROUP' | 'COMP' | 'OTHER'

const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'AM_HALF', 'PM_HALF', 'SICK', 'GROUP', 'COMP', 'OTHER']
const LEAVE_LABELS: Record<LeaveType, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const DEDUCTS = new Set<LeaveType>(['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP'])

function isHalfDay(t: LeaveType) { return t === 'AM_HALF' || t === 'PM_HALF' || t === 'HALF_DAY' }

function calcAuto(leaveType: LeaveType, startDate: string, endDate: string) {
  if (isHalfDay(leaveType)) return 0.5
  if (!startDate || !endDate) return 0
  return Math.max(differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1, 0)
}

function LeaveFields({
  leaveType, setLeaveType, startDate, setStartDate, endDate, setEndDate,
  daysOverride, setDaysOverride, reason, setReason, annualLeaveDays, remainingLeaves,
}: {
  leaveType: LeaveType; setLeaveType: (t: LeaveType) => void
  startDate: string; setStartDate: (v: string) => void
  endDate: string; setEndDate: (v: string) => void
  daysOverride: string; setDaysOverride: (v: string) => void
  reason: string; setReason: (v: string) => void
  annualLeaveDays?: number
  remainingLeaves?: number
}) {
  const auto = calcAuto(leaveType, startDate, endDate)
  const days = daysOverride !== '' ? (parseFloat(daysOverride) || 0) : auto
  const newRemaining = remainingLeaves !== undefined && DEDUCTS.has(leaveType) && days > 0
    ? Math.max(remainingLeaves - days, 0) : null

  return (
    <>
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">시작일</label>
          <input type="date" value={startDate}
            onChange={e => { setStartDate(e.target.value); setDaysOverride('') }}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {!isHalfDay(leaveType) && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">종료일</label>
            <input type="date" value={endDate} min={startDate}
              onChange={e => { setEndDate(e.target.value); setDaysOverride('') }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">사용 일수</label>
        <input type="number" step="0.5" min="0.5"
          value={daysOverride !== '' ? daysOverride : (auto > 0 ? auto : '')}
          onChange={e => setDaysOverride(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="자동 계산 (직접 수정 가능)" />
        {(annualLeaveDays !== undefined || newRemaining !== null) && (
          <p className="text-xs text-gray-400">
            {annualLeaveDays !== undefined && `보유 ${annualLeaveDays}일`}
            {annualLeaveDays !== undefined && remainingLeaves !== undefined && ' / '}
            {remainingLeaves !== undefined && `잔여 ${remainingLeaves}일`}
            {newRemaining !== null && ` → ${newRemaining}일`}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">
          {leaveType === 'OTHER' ? '기타 내용 *' : '사유 (선택)'}
        </label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          placeholder={leaveType === 'OTHER' ? '기타 내용을 입력하세요 (필수)' : '사유를 입력하세요'} />
      </div>
    </>
  )
}

export default function LeaveManualClient({ employees, leaveRecords: init }: {
  employees: Employee[]
  leaveRecords: LeaveRecord[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [records, setRecords] = useState<LeaveRecord[]>(init)

  useEffect(() => { setRecords(init) }, [init])

  // 등록 폼
  const [empId, setEmpId] = useState('')
  const [type, setType] = useState<LeaveType>('ANNUAL')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [daysOv, setDaysOv] = useState('')
  const [reason, setReason] = useState('')

  // 수정 모달
  const [filterEmpId, setFilterEmpId] = useState('')
  const [editing, setEditing] = useState<LeaveRecord | null>(null)
  const [eType, setEType] = useState<LeaveType>('ANNUAL')
  const [eStart, setEStart] = useState('')
  const [eEnd, setEEnd] = useState('')
  const [eDaysOv, setEDaysOv] = useState('')
  const [eReason, setEReason] = useState('')

  const selectedEmp = employees.find(e => e.id === empId)
  const days = daysOv !== '' ? (parseFloat(daysOv) || 0) : calcAuto(type, start, end)
  const eDays = eDaysOv !== '' ? (parseFloat(eDaysOv) || 0) : calcAuto(eType, eStart, eEnd)

  const canAdd = !!empId && !!start && (isHalfDay(type) || !!end) && days > 0
    && (type !== 'OTHER' || reason.trim().length > 0)
  const canEdit = !!eStart && (isHalfDay(eType) || !!eEnd) && eDays > 0
    && (eType !== 'OTHER' || eReason.trim().length > 0)

  function openEdit(r: LeaveRecord) {
    setEditing(r)
    setEType((r.leave_type as LeaveType) || 'ANNUAL')
    setEStart(r.start_date); setEEnd(r.end_date)
    setEDaysOv(String(r.days_used)); setEReason(r.reason || '')
  }

  function handleAdd() {
    startTransition(async () => {
      const res = await adminAddLeaveRecord({
        employeeId: empId, leaveType: type,
        startDate: start, endDate: isHalfDay(type) ? start : end,
        daysUsed: days, reason: reason || null,
      })
      if (res.error) { toast.error(res.error); return }
      setStart(''); setEnd(''); setDaysOv(''); setReason('')
      toast.success('등록됐습니다.')
      router.refresh()
    })
  }

  function handleEdit() {
    if (!editing) return
    startTransition(async () => {
      const res = await adminUpdateLeaveRecord(editing.id, {
        employeeId: editing.employee_id, leaveType: eType,
        startDate: eStart, endDate: isHalfDay(eType) ? eStart : eEnd,
        daysUsed: eDays, reason: eReason || null,
      })
      if (res.error) { toast.error(res.error); return }
      setRecords(prev => prev.map(r => r.id === editing.id
        ? { ...r, leave_type: eType, start_date: eStart, end_date: isHalfDay(eType) ? eStart : eEnd, days_used: eDays, reason: eReason || null }
        : r))
      toast.success('수정됐습니다.')
      setEditing(null)
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('이 연차 내역을 삭제하시겠습니까?\n차감된 연차는 자동으로 복원됩니다.')) return
    startTransition(async () => {
      const res = await adminDeleteLeaveRecord(id)
      if (res.error) { toast.error(res.error); return }
      setRecords(prev => prev.filter(r => r.id !== id))
      toast.success('삭제됐습니다.')
      router.refresh()
    })
  }

  const empName = (r: LeaveRecord) =>
    employees.find(e => e.id === r.employee_id)?.name ?? r.employee_id.slice(0, 8)

  const filtered = filterEmpId ? records.filter(r => r.employee_id === filterEmpId) : records

  return (
    <div className="space-y-6">
      {/* 등록 폼 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">직원</label>
          <select value={empId} onChange={e => setEmpId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
            <option value="">직원을 선택하세요</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.email}) — 보유 {e.annual_leave_days}일 / 잔여 {e.remaining_leaves}일
              </option>
            ))}
          </select>
        </div>

        <LeaveFields
          leaveType={type} setLeaveType={setType}
          startDate={start} setStartDate={setStart}
          endDate={end} setEndDate={setEnd}
          daysOverride={daysOv} setDaysOverride={setDaysOv}
          reason={reason} setReason={setReason}
          annualLeaveDays={selectedEmp?.annual_leave_days}
          remainingLeaves={selectedEmp?.remaining_leaves}
        />

        <button type="button" onClick={handleAdd} disabled={!canAdd || isPending}
          className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors">
          {isPending ? '등록 중...' : '연차 내역 등록'}
        </button>
      </div>

      {/* 전체 연차 내역 목록 */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-gray-700 shrink-0">
            연차 내역 ({filtered.length}건)
          </h2>
          <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white max-w-xs w-full">
            <option value="">전체 직원</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-50 text-left">
                <th className="px-4 py-2">직원</th>
                <th className="px-4 py-2">유형</th>
                <th className="px-4 py-2">기간</th>
                <th className="px-4 py-2 text-right">일수</th>
                <th className="px-4 py-2 text-center">구분</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <tr key={r.id} className="text-gray-700 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium">{empName(r)}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {LEAVE_LABELS[r.leave_type as LeaveType] ?? r.leave_type}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {DEDUCTS.has(r.leave_type as LeaveType) ? r.days_used : 0}일
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      r.is_manual
                        ? 'bg-blue-50 text-blue-500'
                        : 'bg-gray-50 text-gray-400'
                    }`}>
                      {r.is_manual ? '수동' : '결재'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(r)} disabled={isPending}
                        className="text-gray-300 hover:text-blue-500 disabled:opacity-40 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={isPending}
                        className="text-gray-300 hover:text-red-400 disabled:opacity-40 transition-colors">
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

      {/* 수정 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">연차 내역 수정</h2>
                <p className="text-xs text-gray-400 mt-0.5">{empName(editing)}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <LeaveFields
                leaveType={eType} setLeaveType={setEType}
                startDate={eStart} setStartDate={setEStart}
                endDate={eEnd} setEndDate={setEEnd}
                daysOverride={eDaysOv} setDaysOverride={setEDaysOv}
                reason={eReason} setReason={setEReason}
              />
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleEdit} disabled={!canEdit || isPending}
                className="flex-1 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-40 hover:bg-primary/90">
                {isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
