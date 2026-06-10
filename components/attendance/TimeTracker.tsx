'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Clock, Coffee, MapPin, LogOut } from 'lucide-react'
import GPSCheckIn from './GPSCheckIn'
import { cn } from '@/lib/utils'
import { recordAttendance } from '@/app/(dashboard)/attendance/actions'

type WorkState = 'BEFORE_WORK' | 'WORKING' | 'BREAK' | 'FIELD' | 'DONE'
type GeoData = { location: string; latitude: number; longitude: number }
type AttendanceType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END' | 'FIELD_START' | 'FIELD_END'

const STATE_LABEL: Record<WorkState, string> = {
  BEFORE_WORK: '업무 전',
  WORKING: '업무 중',
  BREAK: '휴식 중',
  FIELD: '외근 중',
  DONE: '퇴근',
}

const INACTIVITY_MS = 15 * 60 * 1000

export default function TimeTracker({ initialState }: { initialState?: WorkState }) {
  const [state, setState] = useState<WorkState>(initialState ?? 'BEFORE_WORK')
  const [geoData, setGeoData] = useState<GeoData | null>(null)
  const [showGPS, setShowGPS] = useState(false)
  const [pendingNext, setPendingNext] = useState<WorkState | null>(null)
  const [isAutoBreak, setIsAutoBreak] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  const isAutoBreakRef = useRef(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { isAutoBreakRef.current = isAutoBreak }, [isAutoBreak])

  // Heartbeat every 5 min while working
  useEffect(() => {
    if (state !== 'WORKING' && state !== 'FIELD') return
    const send = () => fetch('/api/attendance/heartbeat', { method: 'POST' })
    send()
    const id = setInterval(send, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [state])

  const resumeFromAutoBreak = useCallback(() => {
    if (!isAutoBreakRef.current) return
    setIsAutoBreak(false)
    isAutoBreakRef.current = false
    startTransition(async () => {
      await recordAttendance({
        type: 'BREAK_END',
        location: null,
        latitude: null,
        longitude: null,
        isField: false,
        note: '자동 업무 복귀',
      })
      setState('WORKING')
      toast.success('업무 복귀 처리되었습니다.')
    })
  }, [startTransition])

  const triggerAutoBreak = useCallback(() => {
    if (stateRef.current !== 'WORKING' && stateRef.current !== 'FIELD') return
    startTransition(async () => {
      const result = await recordAttendance({
        type: 'BREAK_START',
        location: null,
        latitude: null,
        longitude: null,
        isField: false,
        note: '자동 휴식 (15분 비활동)',
      })
      if (!result?.error) {
        setState('BREAK')
        setIsAutoBreak(true)
        isAutoBreakRef.current = true
      }
    })
  }, [startTransition])

  const handleActivity = useCallback(() => {
    if (isAutoBreakRef.current) {
      resumeFromAutoBreak()
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    if (stateRef.current === 'WORKING' || stateRef.current === 'FIELD') {
      timerRef.current = setTimeout(triggerAutoBreak, INACTIVITY_MS)
    }
  }, [resumeFromAutoBreak, triggerAutoBreak])

  useEffect(() => {
    const active = state === 'WORKING' || state === 'FIELD'
    if (!active && !isAutoBreak) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const
    events.forEach(e => document.addEventListener(e, handleActivity, { passive: true }))
    if (active) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(triggerAutoBreak, INACTIVITY_MS)
    }
    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state, isAutoBreak, handleActivity, triggerAutoBreak])

  function requestTransition(next: WorkState) {
    if (next === 'FIELD' && !geoData) {
      setPendingNext(next)
      setShowGPS(true)
      return
    }
    commitTransition(next, geoData)
  }

  function onGeoConfirmed(geo: GeoData) {
    setGeoData(geo)
    setShowGPS(false)
    if (pendingNext) {
      commitTransition(pendingNext, geo)
      setPendingNext(null)
    }
  }

  function commitTransition(next: WorkState, geo: GeoData | null) {
    const current = stateRef.current
    let type: AttendanceType
    let note: string | null = null

    if (next === 'WORKING') {
      if (current === 'BEFORE_WORK') { type = 'CHECK_IN' }
      else if (current === 'BREAK') { type = 'BREAK_END'; note = '업무 복귀' }
      else if (current === 'FIELD') { type = 'FIELD_END'; note = '외근 복귀' }
      else { type = 'CHECK_IN' }
    } else if (next === 'BREAK') {
      type = 'BREAK_START'; note = '휴식'
    } else if (next === 'FIELD') {
      type = 'FIELD_START'; note = '외근'
    } else if (next === 'DONE') {
      type = 'CHECK_OUT'
    } else {
      type = 'CHECK_IN'
    }

    startTransition(async () => {
      const result = await recordAttendance({
        type,
        location: geo?.location ?? null,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        isField: next === 'FIELD',
        note,
      })
      if (result?.error) {
        toast.error(result.error)
        return
      }
      setState(next)
      setGeoData(null)
      if (isAutoBreak && next === 'WORKING') {
        setIsAutoBreak(false)
        isAutoBreakRef.current = false
      }
      toast.success(`${STATE_LABEL[next]} 기록 완료`)
    })
  }

  return (
    <>
      {isAutoBreak && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-yellow-100 flex items-center justify-center mx-auto">
              <Coffee size={26} className="text-yellow-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">자동 휴식 처리됨</h3>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                15분 이상 활동이 없어 자동으로<br />휴식 처리되었습니다.
              </p>
            </div>
            <p className="text-xs text-gray-400">
              마우스 또는 키보드 활동이 감지되면 자동으로 업무 복귀됩니다.
            </p>
            <button
              onClick={resumeFromAutoBreak}
              disabled={isPending}
              className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              지금 업무 복귀
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">현재 상태</p>
            <p className="text-lg font-semibold text-gray-900 mt-0.5">
              {STATE_LABEL[state]}
            </p>
          </div>
          <div
            className={cn(
              'w-3 h-3 rounded-full',
              state === 'WORKING' && 'bg-green-400',
              state === 'BREAK' && 'bg-yellow-400',
              state === 'FIELD' && 'bg-blue-400',
              state === 'DONE' && 'bg-gray-300',
              state === 'BEFORE_WORK' && 'bg-gray-200',
            )}
          />
        </div>

        {showGPS && (
          <div className="border border-dashed border-gray-200 rounded-lg p-4 space-y-2">
            <p className="text-xs text-gray-500">외근 위치를 확인해주세요.</p>
            <GPSCheckIn onLocation={onGeoConfirmed} disabled={isPending} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {state === 'BEFORE_WORK' && (
            <ActionButton
              icon={<Clock size={15} />}
              label="출근"
              onClick={() => requestTransition('WORKING')}
              disabled={isPending}
              variant="primary"
            />
          )}
          {state === 'WORKING' && (
            <>
              <ActionButton
                icon={<Coffee size={15} />}
                label="휴식 시작"
                onClick={() => requestTransition('BREAK')}
                disabled={isPending}
              />
              <ActionButton
                icon={<MapPin size={15} />}
                label="외근 시작"
                onClick={() => requestTransition('FIELD')}
                disabled={isPending}
              />
              <ActionButton
                icon={<LogOut size={15} />}
                label="퇴근"
                onClick={() => requestTransition('DONE')}
                disabled={isPending}
                variant="destructive"
              />
            </>
          )}
          {(state === 'BREAK' || state === 'FIELD') && (
            <ActionButton
              icon={<Clock size={15} />}
              label="업무 복귀"
              onClick={() => requestTransition('WORKING')}
              disabled={isPending}
              variant="primary"
            />
          )}
        </div>
      </div>
    </>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled: boolean
  variant?: 'default' | 'primary' | 'destructive'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary/90',
        variant === 'destructive' && 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
        variant === 'default' && 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-100',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
