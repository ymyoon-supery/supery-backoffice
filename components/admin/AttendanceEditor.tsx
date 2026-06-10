'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { correctAttendance, resolveAnomaly } from '@/app/(admin)/admin/attendance/actions'
import { Pencil, AlertTriangle } from 'lucide-react'

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

// Always format in KST regardless of server/client timezone
function formatKST(dateStr: string) {
  const d = new Date(dateStr)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return format(kst, 'MM/dd HH:mm')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AttendanceEditor({ records, employees }: { records: any[]; employees: any[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolveTime, setResolveTime] = useState('')
  const [resolveNote, setResolveNote] = useState('')
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

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-left text-xs text-gray-400 font-medium">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">유형</th>
              <th className="px-4 py-3">시간 (KST)</th>
              <th className="px-4 py-3">위치</th>
              <th className="px-4 py-3">비고</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map((r) => (
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
            ))}
            {records.length === 0 && (
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
