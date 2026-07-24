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

  const checkIns = sorted.filter(r => r.type === 'CHECK_IN')
  const checkOuts = sorted.filter(r => r.type === 'CHECK_OUT')

  if (checkIns.length === 0) {
    return { checkIn: null, checkOut: null, breakMin: 0, workMin: 0, lateMin: 0, earlyLeaveMin: 0 }
  }

  const firstCheckIn = checkIns[0]
  const lastCheckOut = checkOuts.length > 0 ? checkOuts[checkOuts.length - 1] : null
  const checkInKST = toKSTTime(firstCheckIn.recorded_at)

  if (!lastCheckOut) {
    return { checkIn: checkInKST, checkOut: null, breakMin: 0, workMin: 0, lateMin: 0, earlyLeaveMin: 0 }
  }

  // Pair each CHECK_IN with the first CHECK_OUT that follows it.
  // Supports mid-day leave-and-return: (in0→out0), (in1→out1), …
  const sessions: { start: Date; end: Date }[] = []
  let outIdx = 0
  for (const ci of checkIns) {
    const inDate = new Date(ci.recorded_at)
    while (outIdx < checkOuts.length && new Date(checkOuts[outIdx].recorded_at) <= inDate) outIdx++
    if (outIdx < checkOuts.length) {
      sessions.push({ start: inDate, end: new Date(checkOuts[outIdx].recorded_at) })
      outIdx++
    }
  }

  if (sessions.length === 0) {
    return { checkIn: checkInKST, checkOut: null, breakMin: 0, workMin: 0, lateMin: 0, earlyLeaveMin: 0 }
  }

  // If the last CHECK_IN is after the last CHECK_OUT, there is an open (ongoing) session.
  // Do not report a checkout time or early-leave penalty while the employee is still in.
  const hasOpenSession =
    new Date(checkIns[checkIns.length - 1].recorded_at) >
    new Date(lastCheckOut.recorded_at)

  // Sum gross time and breaks across all completed sessions
  let totalGross = 0
  let totalBreakMin = 0

  for (const session of sessions) {
    totalGross += differenceInMinutes(session.end, session.start)

    const sessionRecs = sorted.filter(r =>
      new Date(r.recorded_at) >= session.start &&
      new Date(r.recorded_at) <= session.end
    )
    let breakStart: Date | null = null
    for (const r of sessionRecs) {
      if (r.type === 'BREAK_START') breakStart = new Date(r.recorded_at)
      else if (r.type === 'BREAK_END' && breakStart) {
        totalBreakMin += differenceInMinutes(new Date(r.recorded_at), breakStart)
        breakStart = null
      }
    }
  }

  const checkInMin = timeToMin(checkInKST)
  const startMin = timeToMin(schedule.workStartTime)
  const lateMin = Math.max(0, checkInMin - startMin)

  if (hasOpenSession) {
    // Still working: show accumulated work so far, no checkout time, no early-leave
    const workMin = Math.max(0, totalGross - totalBreakMin)
    return { checkIn: checkInKST, checkOut: null, breakMin: totalBreakMin, workMin, lateMin, earlyLeaveMin: 0 }
  }

  const checkOutKST = toKSTTime(lastCheckOut.recorded_at)
  const checkOutMin = timeToMin(checkOutKST)
  const lunchStartMin = timeToMin(schedule.lunchStartTime)
  const lunchEndMin = timeToMin(schedule.lunchEndTime)
  const lunchDurationMin = lunchEndMin - lunchStartMin
  const endMin = timeToMin(schedule.workEndTime)

  // Lunch deduction: apply once if the overall work span covers the full lunch window
  const spansLunch = checkInMin <= lunchStartMin && checkOutMin >= lunchEndMin
  const lunchDeduct = spansLunch && totalBreakMin < lunchDurationMin ? lunchDurationMin - totalBreakMin : 0
  const workMin = Math.max(0, totalGross - totalBreakMin - lunchDeduct)

  // Note: minute-of-day comparison assumes same-day shifts (no midnight crossing)
  const earlyLeaveMin = Math.max(0, endMin - checkOutMin)

  return { checkIn: checkInKST, checkOut: checkOutKST, breakMin: totalBreakMin, workMin, lateMin, earlyLeaveMin }
}
