'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { correctAttendance, resolveAnomaly, insertAttendanceRecord, deleteAttendanceRecord } from '@/app/(admin)/admin/attendance/actions'
import { Pencil, AlertTriangle, Trash2, Plus } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = {
  CHECK_IN: '출근',
  CHECK_OUT: '퇴근',
  BREAK_START: '휴식 시작',
  BREAK_END: '업무 복귀',
  FIELD_START: '외근 시작',
  FIELD_END: '외근 복귀',
}

const TYPE_COLOR: Record<string, string> = {
  CHECK_IN: 'bg-green-50 text-green-700',
  CHECK_OUT: 'bg-gray-100 text-gray-600',
  BREAK_START: 'bg-yellow-50 text-yellow-700',
  BREAK_END: 'bg-green-50 text-green-600',
  FIELD_START: 'bg-blue-50 text-blue-700',
  FIELD_END: 'bg-blue-50 text-blue-600',
}

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}

// Always format in KST regardless of server/client timezone
// Uses UTC getters after +9h shift to avoid local timezone double-application
function formatKST(dateStr: string) {
  const kst = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000)
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mi = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AttendanceEditor({ records, employees, leaveRecords }: { records: any[]; employees: any[]; leaveRecords: any[] }) {
  const empNameMap = Object.fromEntries(employees.map((e: any) => [e.id, e.name]))

  const merged = [
    ...records.map((r: any) => ({ ...r, _kind: 'attendance' as const, _sortKey: r.recorded_at })),
    ...leaveRecords.map((r: any) => ({ ...r, _kind: 'leave' as const, _sortKey: `${r.start_date}T09:00:00+09:00` })),
  ].sort((a, b) => {
    if (a.is_anomaly && !b.is_anomaly) return -1
    if (!a.is_anomaly && b.is_anomaly) return 1
    return new Date(b._sortKey).getTime() - new Date(a._sortKey).getTime()
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolveTime, setResolveTime] = useState('')
  const [resolveNote, setResolveNote] = useState('')
  const [showInsert, setShowInsert] = useState(false)
  const [insertEmpId, setInsertEmpId] = useState(employees[0]?.id ?? '')
  const [insertType, setInsertType] = useState('CHECK_IN')
  const [insertTime, setInsertTime] = useState('')
  const [insertNote, setInsertNote] = useState('')
  const [isPending, startTransition] = useTransition()

  function startEdit(id: string, currentNote: string) {
    setEditing(id)
    setNote(currentNote ?? '')
  }

  function handleSave(recordId: string) {
    startTransition(async () => {
      const result = await correctAttendance(recordId, note)
      if (result.error) { toast.error(result.error); return }
      toast.success('수정되었습니다.')
      setEditing(null)
    })
  }

  function startResolve(id: string, recordedAt: string) {
    setResolvingId(id)
    const d = new Date(recordedAt)
    // Convert UTC to KST for datetime-local input
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    setResolveTime(kst.toISOString().slice(0, 16))
    setResolveNote('')
  }

  function handleResolve(recordId: string) {
    if (!resolveTime) { toast.error('퇴근 시간을 입력해주세요.'); return }
    startTransition(async () => {
      // resolveTime is KST datetime-local, convert back to UTC ISO
      const kstDate = new Date(resolveTime)
      const utcDate = new Date(kstDate.getTime() - 9 * 60 * 60 * 1000)
      const result = await resolveAnomaly(recordId, utcDate.toISOString(), resolveNote)
      if (result.error) { toast.error(result.error); return }
      toast.success('근태 이상이 처리되었습니다.')
      setResolvingId(null)
    })
  }

  function handleDelete(recordId: string) {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return
    startTransition(async () => {
      const result = await deleteAttendanceRecord(recordId)
      if (result.error) { toast.error(result.error); return }
      toast.success('삭제되었습니다.')
    })
  }

  function handleInsert() {
    if (!insertEmpId || !insertTime) { toast.error('직원과 시간을 입력해주세요.'); return }
    startTransition(async () => {
      const result = await insertAttendanceRecord(insertEmpId, insertType, insertTime, insertNote)
      if (result.error) { toast.error(result.error); return }
      toast.success('기록이 추가되었습니다.')
      setShowInsert(false)
      setInsertNote('')
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="text-xs text-gray-400">상세 기록</span>
        <button
          onClick={() => setShowInsert(v => !v)}
          className="flex items-center gap-1 text-xs text-primary font-medium hover:text-primary/80"
        >
          <Plus size={13} /> 기록 추가
        </button>
      </div>
      {showInsert && (
        <div className="px-4 py-3 bg-blue-50/40 border-b border-blue-100 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">직원</label>
            <select value={insertEmpId} onChange={e => setInsertEmpId(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">유형</label>
            <select value={insertType} onChange={e => setInsertType(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">시간 (KST)</label>
            <input type="datetime-local" value={insertTime} onChange={e => setInsertTime(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs text-gray-500">메모 (선택)</label>
            <input type="text" value={insertNote} onChange={e => setInsertNote(e.target.value)}
              placeholder="관리자 수동 입력"
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleInsert} disabled={isPending}
              className="text-xs bg-primary text-white rounded px-3 py-1.5 font-medium hover:bg-primary/90 disabled:opacity-50">
              추가
            </button>
            <button onClick={() => setShowInsert(false)} className="text-xs text-gray-500 hover:text-gray-700">취소</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-left text-xs text-gray-400 font-medium">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">유형</th>
              <th className="px-4 py-3">시간 (KST)</th>
              <th className="px-4 py-3">위치</th>
              <th className="px-4 py-3">비고</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {merged.map((r) => {
              if (r._kind === 'leave') {
                const dateStr = r.start_date === r.end_date
                  ? r.start_date.slice(5).replace('-', '/')
                  : `${r.start_date.slice(5).replace('-', '/')}~${r.end_date.slice(5).replace('-', '/')}`
                return (
                  <tr key={`leave-${r.id}`} className="bg-amber-50/40 hover:bg-amber-50/60">
                    <td className="px-4 py-3 text-gray-900">{empNameMap[r.employee_id] ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {LEAVE_LABELS[r.leave_type] ?? r.leave_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 tabular-nums">{dateStr}</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3 text-gray-500">{r.reason ?? '—'}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                )
              }

              return (
                <>
                  <tr
                    key={r.id}
                    className={r.is_anomaly ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50/50'}
                  >
                    <td className="px-4 py-3 text-gray-900">{r.employees?.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLOR[r.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[r.type] ?? r.type}
                      </span>
                      {r.is_anomaly && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                          <AlertTriangle size={11} />이상
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 tabular-nums">
                      {formatKST(r.recorded_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{r.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      {editing === r.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30 w-40"
                          />
                          <button onClick={() => handleSave(r.id)} disabled={isPending}
                            className="text-xs text-primary font-medium disabled:opacity-50">저장</button>
                          <button onClick={() => setEditing(null)} className="text-xs text-gray-400">취소</button>
                        </div>
                      ) : (
                        <span className={r.is_anomaly ? 'text-red-500' : 'text-gray-500'}>{r.note ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.is_anomaly ? (
                          resolvingId !== r.id && (
                            <button
                              onClick={() => startResolve(r.id, r.recorded_at)}
                              className="text-xs text-red-600 font-medium hover:text-red-800 border border-red-200 rounded px-2 py-0.5"
                            >
                              처리
                            </button>
                          )
                        ) : (
                          editing !== r.id && (
                            <button onClick={() => startEdit(r.id, r.note)} className="text-gray-400 hover:text-gray-600">
                              <Pencil size={14} />
                            </button>
                          )
                        )}
                        {resolvingId !== r.id && editing !== r.id && (
                          <button onClick={() => handleDelete(r.id)} disabled={isPending} className="text-gray-300 hover:text-red-500 disabled:opacity-50">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {resolvingId === r.id && (
                    <tr key={`${r.id}-resolve`} className="bg-red-50/40">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">실제 퇴근 시간 (KST)</label>
                            <input
                              type="datetime-local"
                              value={resolveTime}
                              onChange={(e) => setResolveTime(e.target.value)}
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <label className="text-xs text-gray-500">메모</label>
                            <input
                              type="text"
                              value={resolveNote}
                              onChange={(e) => setResolveNote(e.target.value)}
                              placeholder="사유 또는 메모 (선택)"
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleResolve(r.id)} disabled={isPending}
                              className="text-xs bg-red-600 text-white rounded px-3 py-1.5 font-medium hover:bg-red-700 disabled:opacity-50">
                              확인 완료
                            </button>
                            <button onClick={() => setResolvingId(null)} className="text-xs text-gray-500 hover:text-gray-700">취소</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {merged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
