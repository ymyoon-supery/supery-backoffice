'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

type EmployeeStatus = {
  id: string
  name: string
  email: string
  avatar_url: string | null
  lastRecord: { type: string; recorded_at: string; is_field: boolean } | null
}

export default function StatusBoard({ initial }: { initial: EmployeeStatus[] }) {
  const [statuses, setStatuses] = useState<EmployeeStatus[]>(initial)

  useEffect(() => {
    const supabase = createClient()
    const today = format(new Date(), 'yyyy-MM-dd')

    const channel = supabase
      .channel('status-board')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records',
          filter: `recorded_at=gte.${today}T00:00:00+09:00`,
        },
        async (payload) => {
          const newRecord = payload.new as {
            employee_id: string
            type: string
            recorded_at: string
            is_field: boolean
          }
          setStatuses((prev) =>
            prev.map((s) =>
              s.id === newRecord.employee_id
                ? {
                    ...s,
                    lastRecord: {
                      type: newRecord.type,
                      recorded_at: newRecord.recorded_at,
                      is_field: newRecord.is_field,
                    },
                  }
                : s,
            ),
          )
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function getStatusLabel(s: EmployeeStatus) {
    if (!s.lastRecord) return { label: '미출근', className: 'bg-gray-100 text-gray-500' }
    if (s.lastRecord.type === 'CHECK_OUT') return { label: '퇴근', className: 'bg-gray-100 text-gray-500' }
    if (s.lastRecord.is_field) return { label: '외근', className: 'bg-blue-50 text-blue-700' }
    return { label: '근무중', className: 'bg-green-50 text-green-700' }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {statuses.map((s) => {
        const { label, className } = getStatusLabel(s)
        return (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-center gap-2">
              {s.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.avatar_url} alt={s.name} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                  {s.name[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>
                {label}
              </span>
              {s.lastRecord && (
                <span className="text-xs text-gray-400">
                  {format(new Date(s.lastRecord.recorded_at), 'HH:mm')}
                </span>
              )}
            </div>
          </div>
        )
      })}
      {statuses.length === 0 && (
        <div className="col-span-4 py-10 text-center text-sm text-gray-400">
          직원 정보가 없습니다.
        </div>
      )}
    </div>
  )
}
