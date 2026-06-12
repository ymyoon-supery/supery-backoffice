// lib/attendance/calc.ts
import { differenceInMinutes } from 'date-fns'

export type WorkSchedule = {
  workStartTime: string   // "HH:MM" KST
  workEndTime: string     // "HH:MM" KST
  lunchStartTime: string  // "HH:MM" KST
  lunchEndTime: string    // "HH:MM" KST
}

export type DaySummary = {
  checkIn: string | null
  checkOut: string | null
  breakMin: number
  workMin: number
  lateMin: number        // 0이면 정상 출근
  earlyLeaveMin: number  // 0이면 정상 퇴근
}

export function timeToMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) throw new Error(`Invalid time: "${t}"`)
  return h * 60 + m
}

export function toKSTTime(utcStr: string): string {
  const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function toKSTDate(utcStr: string): string {
  return new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function calcDaySummary(
  recs: { type: string; recorded_at: string }[],
  schedule: WorkSchedule,
): DaySummary {
  const sorted = [...recs].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  )
  const checkIn = sorted.find(r => r.type === 'CHECK_IN')
  const checkOut = [...sorted].reverse().find(r => r.type === 'CHECK_OUT')
  if (!checkIn) {
    return { checkIn: null, checkOut: null, breakMin: 0, workMin: 0, lateMin: 0, earlyLeaveMin: 0 }
  }

  const checkInKST = toKSTTime(checkIn.recorded_at)
  if (!checkOut) {
    return { checkIn: checkInKST, checkOut: null, breakMin: 0, workMin: 0, lateMin: 0, earlyLeaveMin: 0 }
  }

  const shiftRecs = sorted.filter(r =>
    new Date(r.recorded_at) >= new Date(checkIn.recorded_at) &&
    new Date(r.recorded_at) <= new Date(checkOut.recorded_at)
  )

  let breakMin = 0
  let breakStart: Date | null = null
  for (const r of shiftRecs) {
    if (r.type === 'BREAK_START') breakStart = new Date(r.recorded_at)
    else if (r.type === 'BREAK_END' && breakStart) {
      breakMin += differenceInMinutes(new Date(r.recorded_at), breakStart)
      breakStart = null
    }
  }

  const checkOutKST = toKSTTime(checkOut.recorded_at)
  const gross = differenceInMinutes(new Date(checkOut.recorded_at), new Date(checkIn.recorded_at))

  const checkInMin = timeToMin(checkInKST)
  const checkOutMin = timeToMin(checkOutKST)
  const lunchStartMin = timeToMin(schedule.lunchStartTime)
  const lunchEndMin = timeToMin(schedule.lunchEndTime)
  const lunchDurationMin = lunchEndMin - lunchStartMin
  const startMin = timeToMin(schedule.workStartTime)
  const endMin = timeToMin(schedule.workEndTime)

  // 점심 자동 차감: 근무가 점심 window를 완전히 포함하고 기록된 휴식이 부족하면 차이만큼 차감
  const spansLunch = checkInMin <= lunchStartMin && checkOutMin >= lunchEndMin
  const lunchDeduct = spansLunch && breakMin < lunchDurationMin ? lunchDurationMin - breakMin : 0
  const workMin = Math.max(0, gross - breakMin - lunchDeduct)

  // Note: minute-of-day comparison assumes same-day shifts (no midnight crossing)
  const lateMin = Math.max(0, checkInMin - startMin)
  const earlyLeaveMin = Math.max(0, endMin - checkOutMin)

  return { checkIn: checkInKST, checkOut: checkOutKST, breakMin, workMin, lateMin, earlyLeaveMin }
}
