'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Clock, Coffee, MapPin, LogOut } from 'lucide-react'
import GPSCheckIn from './GPSCheckIn'
import { cn } from '@/lib/utils'
import { recordAttendance } from '@/app/(dashboard)/attendance/actions'

type WorkState = 'BEFORE_WORK' | 'WORKING' | 'BREAK' | 'FIELD' | 'DONE'

type GeoData = { location: string; latitude: number; longitude: number }

const STATE_LABEL: Record<WorkState, string> = {
  BEFORE_WORK: '업무 전',
  WORKING: '업무 중',
  BREAK: '휴식 중',
  FIELD: '외근 중',
  DONE: '퇴근',
}

const INACTIVITY_MS = 20 * 60 * 1000

export default function TimeTracker({ initialState }: { initialState?: WorkState }) {
  const [state, setState] = useState<WorkState>(initialState ?? 'BEFORE_WORK')
  const [geoData, setGeoData] = useState<GeoData | null>(null)
  const [showGPS, setShowGPS] = useState(false)
  const [pendingNext, setPendingNext] = useState<WorkState | null>(null)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)

  useEffect(() => { stateRef.current = state }, [state])

  const triggerAutoBreak = useCallback(() => {
    if (stateRef.current !== 'WORKING' && stateRef.current !== 'FIELD') return
    startTransition(async () => {
      const result = await recordAttendance({
        type: 'CHECK_IN',
        location: null,
        latitude: null,
        longitude: null,
        isField: false,
        note: '자동 휴식 (20분 비활동)',
      })
      if (!result?.error) {
        setState('BREAK')
        toast.info('20분 동안 활동이 없어 자동으로 휴식 처리되었습니다.')
      }
    })
  }, [startTransition])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (stateRef.current === 'WORKING' || stateRef.current === 'FIELD') {
      timerRef.current = setTimeout(triggerAutoBreak, INACTIVITY_MS)
    }
  }, [triggerAutoBreak])

  useEffect(() => {
    if (state !== 'WORKING' && state !== 'FIELD') {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const
    events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => document.removeEventListener(e, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state, resetTimer])

  function requestTransition(next: WorkState) {
    if ((next === 'BREAK' || next === 'FIELD') && !geoData) {
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
    const typeMap: Partial<Record<WorkState, 'CHECK_IN' | 'CHECK_OUT'>> = {
      WORKING: 'CHECK_IN',
      DONE: 'CHECK_OUT',
    }
    const type = typeMap[next]

    startTransition(async () => {
      const result = await recordAttendance({
        type: type ?? 'CHECK_IN',
        location: geo?.location ?? null,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        isField: next === 'FIELD',
        note: next === 'BREAK' ? '휴식' : next === 'FIELD' ? '외근' : null,
      })
      if (result?.error) {
        toast.error(result.error)
        return
      }
      setState(next)
      setGeoData(null)
      toast.success(`${STATE_LABEL[next]} 기록 완료`)
    })
  }

  return (
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
          <p className="text-xs text-gray-500">
            {pendingNext === 'FIELD' ? '외근 위치를 확인해주세요.' : '휴식 위치를 확인해주세요.'}
          </p>
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
