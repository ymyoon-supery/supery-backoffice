'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { correctAttendance } from '@/app/(admin)/attendance/actions'
import { Pencil } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AttendanceEditor({ records, employees }: { records: any[]; employees: any[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState('')
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

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-left text-xs text-gray-400 font-medium">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">유형</th>
              <th className="px-4 py-3">시간</th>
              <th className="px-4 py-3">위치</th>
              <th className="px-4 py-3">비고</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-gray-900">{r.employees?.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.type === 'CHECK_IN' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {r.type === 'CHECK_IN' ? '출근' : '퇴근'}
                    {r.is_field && ' (외근)'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700 tabular-nums">
                  {format(new Date(r.recorded_at), 'MM/dd HH:mm')}
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
                      <button
                        onClick={() => handleSave(r.id)}
                        disabled={isPending}
                        className="text-xs text-primary font-medium disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-xs text-gray-400"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-500">{r.note ?? '—'}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editing !== r.id && (
                    <button
                      onClick={() => startEdit(r.id, r.note)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </td>
              </tr>
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
