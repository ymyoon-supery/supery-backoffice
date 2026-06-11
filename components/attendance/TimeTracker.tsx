'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Clock, MapPin, LogOut, Building2, Home, Car } from 'lucide-react'
import { cn } from '@/lib/utils'
import { recordAttendance, checkOfficeIp, registerHomeLocation } from '@/app/(dashboard)/attendance/actions'

type WorkState = 'BEFORE_WORK' | 'WORKING' | 'BREAK' | 'FIELD' | 'DONE'
type AttendanceType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END' | 'FIELD_START' | 'FIELD_END'

const STATE_LABEL: Record<WorkState, string> = {
  BEFORE_WORK: '업무 전',
  WORKING: '업무 중',
  BREAK: '휴식 중',
  FIELD: '외근 중',
  DONE: '퇴근',
}

const INACTIVITY_MS = 15 * 60 * 1000
const ALL_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const
// click/touchstart excluded for FIELD: prevents conflict with manual 업무복귀 button
const FIELD_EVENTS = ['mousemove', 'keydown', 'scroll'] as const

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000,
    })
  )
}

export default function TimeTracker({
  initialState,
  autoBreakMode = 'frontend',
  homeLocation = null,
  remoteRadiusM = 500,
}: {
  initialState?: WorkState
  autoBreakMode?: 'frontend' | 'server'
  homeLocation?: { lat: number; lng: number } | null
  remoteRadiusM?: number
}) {
  const [state, setState] = useState<WorkState>(initialState ?? 'BEFORE_WORK')
  const [showCheckInOptions, setShowCheckInOptions] = useState(false)
  const [showFieldForm, setShowFieldForm] = useState(false)
  const [fieldNote, setFieldNote] = useState('')
  const [fieldIsCheckIn, setFieldIsCheckIn] = useState(false)
  const [isAutoBreak, setIsAutoBreak] = useState(false)
  const [officeIpWarning, setOfficeIpWarning] = useState<{ currentIp: string } | null>(null)
  const [remoteGpsState, setRemoteGpsState] = useState<{
    step: 'warning' | 'input'
    distanceM: number
    coords: { lat: number; lng: number }
  } | null>(null)
  const [newLocationName, setNewLocationName] = useState('')
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  const isAutoBreakRef = useRef(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { isAutoBreakRef.current = isAutoBreak }, [isAutoBreak])

  // Heartbeat every 5 min while working or on field
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
        location: null, latitude: null, longitude: null,
        isField: false, note: '자동 업무 복귀',
      })
      setState('WORKING')
      toast.success('업무 복귀 처리되었습니다.')
    })
  }, [startTransition])

  const resumeFromField = useCallback(() => {
    if (stateRef.current !== 'FIELD') return
    stateRef.current = 'WORKING'
    startTransition(async () => {
      const result = await recordAttendance({
        type: 'FIELD_END',
        location: null, latitude: null, longitude: null,
        isField: false, note: '외근 복귀 (자동 감지)',
      })
      if (!result?.error) {
        setState('WORKING')
        toast.success('외근에서 복귀되었습니다.')
      } else {
        stateRef.current = 'FIELD'
        setState('FIELD')
        toast.error(result.error)
      }
    })
  }, [startTransition])

  const triggerAutoBreak = useCallback(() => {
    if (stateRef.current !== 'WORKING') return
    startTransition(async () => {
      const result = await recordAttendance({
        type: 'BREAK_START',
        location: null, latitude: null, longitude: null,
        isField: false, note: '자동 휴식 (15분 비활동)',
      })
      if (!result?.error) {
        setState('BREAK')
        setIsAutoBreak(true)
        isAutoBreakRef.current = true
      }
    })
  }, [startTransition])

  const handleActivity = useCallback(() => {
    if (isAutoBreakRef.current) { resumeFromAutoBreak(); return }
    if (stateRef.current === 'FIELD') { resumeFromField(); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    if (stateRef.current === 'WORKING') {
      timerRef.current = setTimeout(triggerAutoBreak, INACTIVITY_MS)
    }
  }, [resumeFromAutoBreak, resumeFromField, triggerAutoBreak])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (autoBreakMode === 'server') return

    if (isAutoBreak) {
      ALL_EVENTS.forEach(e => document.addEventListener(e, handleActivity, { passive: true }))
      return () => ALL_EVENTS.forEach(e => document.removeEventListener(e, handleActivity))
    }
    if (state === 'FIELD') {
      FIELD_EVENTS.forEach(e => document.addEventListener(e, handleActivity, { passive: true }))
      return () => FIELD_EVENTS.forEach(e => document.removeEventListener(e, handleActivity))
    }
    if (state === 'WORKING') {
      ALL_EVENTS.forEach(e => document.addEventListener(e, handleActivity, { passive: true }))
      timerRef.current = setTimeout(triggerAutoBreak, INACTIVITY_MS)
      return () => {
        ALL_EVENTS.forEach(e => document.removeEventListener(e, handleActivity))
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }
  }, [state, isAutoBreak, handleActivity, triggerAutoBreak])

  function doOfficeCheckIn() {
    setOfficeIpWarning(null)
    startTransition(async () => {
      const result = await recordAttendance({
        type: 'CHECK_IN',
        location: null, latitude: null, longitude: null,
        isField: false, note: null,
      })
      if (result?.error) { toast.error(result.error); return }
      setState('WORKING')
      toast.success('출근 기록 완료')
    })
  }

  function doRemoteCheckIn(opts?: {
    locationName: string
    distanceM: number
    coords: { lat: number; lng: number }
  }) {
    setRemoteGpsState(null)
    setNewLocationName('')
    startTransition(async () => {
      if (opts) {
        await registerHomeLocation(opts.coords.lat, opts.coords.lng)
      }
      const result = await recordAttendance({
        type: 'CHECK_IN',
        location: opts?.locationName ?? null,
        latitude: opts?.coords.lat ?? null,
        longitude: opts?.coords.lng ?? null,
        isField: false,
        note: opts
          ? `재택 변경 (이전 위치에서 ${opts.distanceM}m)`
          : '재택',
      })
      if (result?.error) { toast.error(result.error); return }
      setState('WORKING')
      toast.success('출근 기록 완료')
    })
  }

  function handleCheckIn(location: 'OFFICE' | 'REMOTE' | 'FIELD') {
    setShowCheckInOptions(false)
    if (location === 'FIELD') {
      setFieldNote('')
      setFieldIsCheckIn(true)
      setShowFieldForm(true)
      return
    }
    if (location === 'OFFICE') {
      startTransition(async () => {
        const { match, currentIp } = await checkOfficeIp()
        if (!match) {
          setOfficeIpWarning({ currentIp })
          return
        }
        doOfficeCheckIn()
      })
      return
    }
    // REMOTE — GPS 검증
    if (!homeLocation) {
      toast.error('재택근무지를 먼저 등록해주세요. (아래 재택근무지 카드에서 등록)')
      return
    }
    startTransition(async () => {
      if (!navigator.geolocation) {
        toast.error('이 브라우저는 위치 서비스를 지원하지 않습니다.')
        return
      }
      let position: GeolocationPosition
      try {
        position = await getCurrentPosition()
      } catch {
        toast.error('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.')
        return
      }
      const distanceM = haversineM(
        position.coords.latitude, position.coords.longitude,
        homeLocation.lat, homeLocation.lng,
      )
      if (remoteRadiusM > 0 && distanceM > remoteRadiusM) {
        setRemoteGpsState({
          step: 'warning',
          distanceM: Math.round(distanceM),
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
        })
        return
      }
      doRemoteCheckIn()
    })
  }

  function handleFieldStart() {
    setFieldNote('')
    setFieldIsCheckIn(false)
    setShowFieldForm(true)
  }

  function confirmField() {
    setShowFieldForm(false)
    const note = fieldNote.trim() || '외근'
    startTransition(async () => {
      const result = await recordAttendance({
        type: fieldIsCheckIn ? 'CHECK_IN' : 'FIELD_START',
        location: null, latitude: null, longitude: null,
        isField: true,
        note: fieldIsCheckIn ? `외근 - ${note}` : note,
      })
      if (result?.error) { toast.error(result.error); return }
      setState('FIELD')
      setFieldNote('')
      toast.success('외근 중 기록 완료')
    })
  }

  function commitTransition(next: WorkState) {
    const current = stateRef.current
    let type: AttendanceType
    let note: string | null = null

    if (next === 'WORKING') {
      if (current === 'BREAK') { type = 'BREAK_END'; note = '업무 복귀' }
      else if (current === 'FIELD') { type = 'FIELD_END'; note = '외근 복귀' }
      else { type = 'CHECK_IN' }
    } else if (next === 'DONE') {
      type = 'CHECK_OUT'
    } else {
      type = 'CHECK_IN'
    }

    startTransition(async () => {
      const result = await recordAttendance({
        type, location: null, latitude: null, longitude: null,
        isField: false, note,
      })
      if (result?.error) { toast.error(result.error); return }
      setState(next)
      if (isAutoBreak && next === 'WORKING') {
        setIsAutoBreak(false)
        isAutoBreakRef.current = false
      }
      toast.success(`${STATE_LABEL[next]} 기록 완료`)
    })
  }

  return (
    <>
      {remoteGpsState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
              <Home size={26} className="text-orange-500" />
            </div>

            {remoteGpsState.step === 'warning' ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">등록된 재택근무지가 아닙니다</h3>
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                    현재 위치가 등록된 재택근무지와<br />
                    <span className="font-semibold text-orange-500">{remoteGpsState.distanceM}m</span> 떨어져 있습니다.<br />
                    재택근무지를 변경 등록하시겠습니까?
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setRemoteGpsState(s => s && { ...s, step: 'input' })}
                    disabled={isPending}
                    className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    변경 등록
                  </button>
                  <button
                    onClick={() => setRemoteGpsState(null)}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">새 재택근무지 등록</h3>
                  <p className="text-sm text-gray-500 mt-1">현재 위치의 장소명을 입력해주세요.</p>
                </div>
                <input
                  type="text"
                  value={newLocationName}
                  onChange={e => setNewLocationName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newLocationName.trim()) {
                      doRemoteCheckIn({
                        locationName: newLocationName.trim(),
                        distanceM: remoteGpsState.distanceM,
                        coords: remoteGpsState.coords,
                      })
                    }
                  }}
                  placeholder="예: 스타벅스 강남점, 부모님 댁"
                  autoFocus
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 text-center"
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      if (!newLocationName.trim()) { toast.error('장소명을 입력해주세요.'); return }
                      doRemoteCheckIn({
                        locationName: newLocationName.trim(),
                        distanceM: remoteGpsState.distanceM,
                        coords: remoteGpsState.coords,
                      })
                    }}
                    disabled={isPending || !newLocationName.trim()}
                    className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? '저장 중...' : '확인 및 저장'}
                  </button>
                  <button
                    onClick={() => setRemoteGpsState(s => s && { ...s, step: 'warning' })}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
                  >
                    뒤로
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {officeIpWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
              <MapPin size={26} className="text-orange-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">출근 위치 확인</h3>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                현재 네트워크가 등록된 사무실 IP와<br />다릅니다.
              </p>
              <p className="mt-2 text-xs font-mono bg-gray-50 rounded-lg px-3 py-2 text-gray-600">
                현재 IP: {officeIpWarning.currentIp || '확인 불가'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={doOfficeCheckIn}
                disabled={isPending}
                className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                그래도 사무실 출근
              </button>
              <button
                onClick={() => setOfficeIpWarning(null)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {isAutoBreak && autoBreakMode === 'frontend' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-yellow-100 flex items-center justify-center mx-auto">
              <Clock size={26} className="text-yellow-600" />
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
            <p className="text-lg font-semibold text-gray-900 mt-0.5">{STATE_LABEL[state]}</p>
          </div>
          <div className={cn(
            'w-3 h-3 rounded-full',
            state === 'WORKING' && 'bg-green-400',
            state === 'BREAK' && 'bg-yellow-400',
            state === 'FIELD' && 'bg-blue-400',
            state === 'DONE' && 'bg-gray-300',
            state === 'BEFORE_WORK' && 'bg-gray-200',
          )} />
        </div>

        {/* Check-in location options */}
        {showCheckInOptions && (
          <div className="border border-dashed border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-xs text-gray-500">근무 형태를 선택해주세요.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleCheckIn('OFFICE')}
                disabled={isPending}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/5 text-gray-700 hover:text-primary transition-colors disabled:opacity-50"
              >
                <Building2 size={18} />
                <span className="text-xs font-medium">회사</span>
              </button>
              <button
                onClick={() => handleCheckIn('REMOTE')}
                disabled={isPending}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/5 text-gray-700 hover:text-primary transition-colors disabled:opacity-50"
              >
                <Home size={18} />
                <span className="text-xs font-medium">재택</span>
              </button>
              <button
                onClick={() => handleCheckIn('FIELD')}
                disabled={isPending}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                <Car size={18} />
                <span className="text-xs font-medium">외근</span>
              </button>
            </div>
            <button
              onClick={() => setShowCheckInOptions(false)}
              className="text-xs text-gray-400 hover:text-gray-600 w-full text-center"
            >
              취소
            </button>
          </div>
        )}

        {/* Field note form */}
        {showFieldForm && (
          <div className="border border-dashed border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
            <p className="text-xs text-gray-500">외근 사유를 입력해주세요.</p>
            <input
              type="text"
              value={fieldNote}
              onChange={(e) => setFieldNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmField()}
              placeholder="예: 거래처 미팅, 현장 방문"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={confirmField}
                disabled={isPending}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {fieldIsCheckIn ? '외근 출근' : '외근 시작'}
              </button>
              <button
                onClick={() => { setShowFieldForm(false); setFieldIsCheckIn(false) }}
                className="px-4 text-sm text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {state === 'BEFORE_WORK' && !showCheckInOptions && !showFieldForm && (
            <ActionButton icon={<Clock size={15} />} label="출근"
              onClick={() => setShowCheckInOptions(true)} disabled={isPending} variant="primary" />
          )}
          {state === 'WORKING' && (
            <>
              <ActionButton icon={<MapPin size={15} />} label="외근 시작"
                onClick={handleFieldStart} disabled={isPending} />
              <ActionButton icon={<LogOut size={15} />} label="퇴근"
                onClick={() => commitTransition('DONE')} disabled={isPending} variant="destructive" />
            </>
          )}
          {(state === 'BREAK' || state === 'FIELD') && (
            <ActionButton icon={<Clock size={15} />} label="업무 복귀"
              onClick={() => commitTransition('WORKING')} disabled={isPending} variant="primary" />
          )}
        </div>
      </div>
    </>
  )
}

function ActionButton({ icon, label, onClick, disabled, variant = 'default' }: {
  icon: React.ReactNode; label: string; onClick: () => void
  disabled: boolean; variant?: 'default' | 'primary' | 'destructive'
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary/90',
        variant === 'destructive' && 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
        variant === 'default' && 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-100',
      )}>
      {icon}{label}
    </button>
  )
}
