// Pure decision functions for attendance heartbeat processing.
// No DB access — takes preloaded state, returns decisions + debug logs.

import { isWorkday } from '@/lib/holidays'

const WORKING_TYPES = new Set(['CHECK_IN', 'BREAK_END', 'FIELD_END'])
const INACTIVITY_THRESHOLD = 15 * 60    // seconds
const MIN_BREAK_DURATION_SEC = 5 * 60   // seconds
const HALF_DAY_BOUNDARY_MIN = 14 * 60 + 30  // 14:30 KST

// ── Shared types ──────────────────────────────────────────────────────────────

export type AttendanceOrigin = 'agent_auto' | 'browser_auto' | 'cron_auto' | 'manual'

export interface RecordRow {
  id: string
  type: string
  recorded_at: string  // ISO 8601
  note: string
  origin: string
}

export interface InsertDecision {
  action: 'insert'
  type: string
  recorded_at: string
  note: string
  origin: AttendanceOrigin
}

export interface UpdateDecision {
  action: 'update'
  id: string
  recorded_at: string
  note: string
}

export interface DeleteDecision {
  action: 'delete'
  id: string
}

export type Decision = InsertDecision | UpdateDecision | DeleteDecision

export interface DecisionLog {
  block: string
  result: 'triggered' | 'skipped'
  reason: string
}

// ── Agent heartbeat ───────────────────────────────────────────────────────────

export interface AgentHeartbeatCtx {
  kstDate: string              // 'YYYY-MM-DD' KST today
  yesterdayKSTDate: string     // 'YYYY-MM-DD' KST yesterday
  now: Date
  lastHeartbeat: string | null
  lastActivityAt: string | null
  todayRecords: RecordRow[]    // today's records ordered by recorded_at DESC
  yestLastRecord: RecordRow | null
  yestCheckout: RecordRow | null
  leaveTodayType: 'FULL_DAY' | 'AM_HALF' | 'PM_HALF' | null  // 당일 승인된 휴가 종류
}

export interface AgentHeartbeatInput {
  idleSeconds: number
  activityTicks: number | null  // null = old agent (pre-v1.3.12)
  keyCount: number | null       // null = pre-v1.3.13 or hooks failed
  mousePx: number | null        // null = pre-v1.3.13 or hooks failed
  suspendAtStr: string | undefined
  lastActivityBeforeSleep: Date | null
}

export function decideAgentHeartbeat(
  ctx: AgentHeartbeatCtx,
  input: AgentHeartbeatInput,
): { decisions: Decision[]; logs: DecisionLog[] } {
  const decisions: Decision[] = []
  const logs: DecisionLog[] = []

  const {
    kstDate, yesterdayKSTDate, now,
    lastHeartbeat, lastActivityAt: employeeLastActivityAt,
    todayRecords, yestLastRecord, yestCheckout,
    leaveTodayType,
  } = ctx
  const { idleSeconds, activityTicks, keyCount, mousePx, suspendAtStr, lastActivityBeforeSleep } = input

  const lastRecord = todayRecords[0] ?? null
  const lastType = lastRecord?.type ?? null

  function hasRecord(type: string, note: string, afterIso: string): boolean {
    return (
      todayRecords.some(r => r.type === type && r.note === note && r.recorded_at >= afterIso) ||
      decisions
        .filter((d): d is InsertDecision => d.action === 'insert')
        .some(d => d.type === type && d.note === note && d.recorded_at >= afterIso)
    )
  }

  function agentInsert(type: string, at: Date, note: string): void {
    decisions.push({ action: 'insert', type, recorded_at: at.toISOString(), note, origin: 'agent_auto' })
  }

  function log(block: string, result: 'triggered' | 'skipped', reason: string): void {
    logs.push({ block, result, reason })
  }

  // ── Block A: idle >= 15min → BREAK_START (당일) or CHECK_OUT (자정 초과) ──
  // 트리거 1 (primary): idleSeconds >= threshold — GetLastInputInfo 기반
  // 트리거 2 (secondary): last_activity_at 갭 >= threshold — spurious HID 이벤트 대응
  //   (무선 마우스 keep-alive 등이 GetLastInputInfo를 리셋해 idle이 threshold에 못 미칠 때)
  //   route.ts에서 mousePx>=50 || keyCount>=1 조건 충족 시에만 last_activity_at을 갱신하므로
  //   spurious 이벤트로 오염되지 않음
  do {
    if (!lastType || !WORKING_TYPES.has(lastType)) {
      log('A', 'skipped', `lastType=${lastType ?? 'none'}`)
      break
    }

    const lastActMs = employeeLastActivityAt ? new Date(employeeLastActivityAt).getTime() : null
    const lastActKSTDate = lastActMs
      ? new Date(lastActMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null
    const lastActGapSec = lastActMs !== null ? (now.getTime() - lastActMs) / 1000 : null

    let absenceStartAt: Date | null = null
    let triggerNote = ''

    if (idleSeconds >= INACTIVITY_THRESHOLD) {
      absenceStartAt = new Date(now.getTime() - idleSeconds * 1000)
      triggerNote = `idle=${idleSeconds}s`
    } else if (
      lastActMs !== null &&
      lastActGapSec !== null &&
      lastActGapSec >= INACTIVITY_THRESHOLD &&
      lastActKSTDate === kstDate
    ) {
      // spurious HID로 인해 idleSeconds가 낮지만 확인된 마지막 활동이 15분+ 전
      absenceStartAt = new Date(lastActMs + INACTIVITY_THRESHOLD * 1000)
      triggerNote = `laGap=${Math.round(lastActGapSec)}s`
    }

    if (!absenceStartAt) {
      log('A', 'skipped', `lastType=${lastType} idle=${idleSeconds}s laGap=${lastActGapSec !== null ? Math.round(lastActGapSec) + 's' : 'null'}`)
      break
    }

    const lastRecordAt = new Date(lastRecord!.recorded_at)
    if (absenceStartAt < lastRecordAt) {
      log('A', 'skipped', `stale: absenceStart < lastRecord(${lastRecordAt.toISOString()}) trigger=${triggerNote}`)
      break
    }
    const breakStartAt = new Date(Math.max(absenceStartAt.getTime(), lastRecordAt.getTime()))
    const breakStartKSTDate = new Date(breakStartAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    if (breakStartKSTDate < kstDate) {
      if (yestCheckout) {
        log('A', 'skipped', `cross-midnight: checkout already exists (${yestCheckout.recorded_at})`)
        break
      }
      agentInsert('CHECK_OUT', breakStartAt, 'PC 절전/잠금 자동 퇴근')
      log('A', 'triggered', `cross-midnight CHECK_OUT at ${breakStartAt.toISOString()} (${triggerNote})`)
    } else {
      const raceWindow = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      if (hasRecord('BREAK_START', 'PC 비활동 자동 휴식', raceWindow)) {
        log('A', 'skipped', `BREAK_START already exists within 30min`)
        break
      }
      agentInsert('BREAK_START', breakStartAt, 'PC 비활동 자동 휴식')
      log('A', 'triggered', `BREAK_START at ${breakStartAt.toISOString()} (${triggerNote})`)
    }
  } while (false)

  // ── Block B: suspend_at 기반 BREAK_START ─────────────────────────────────
  do {
    if (!suspendAtStr || !lastActivityBeforeSleep) {
      log('B', 'skipped', 'no suspend_at')
      break
    }
    if (!lastType || !WORKING_TYPES.has(lastType) || idleSeconds >= INACTIVITY_THRESHOLD) {
      log('B', 'skipped', `guard: lastType=${lastType ?? 'none'} idle=${idleSeconds}s`)
      break
    }
    const sleepDurationSec = (now.getTime() - lastActivityBeforeSleep.getTime()) / 1000
    if (sleepDurationSec < INACTIVITY_THRESHOLD) {
      log('B', 'skipped', `sleep ${Math.round(sleepDurationSec)}s < threshold`)
      break
    }
    const lastRecordAt = new Date(lastRecord!.recorded_at)
    if (lastActivityBeforeSleep < lastRecordAt) {
      log('B', 'skipped', `stale: lastActivityBeforeSleep < lastRecord`)
      break
    }
    const breakStartKSTDate = new Date(lastActivityBeforeSleep.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (breakStartKSTDate !== kstDate) {
      log('B', 'skipped', `cross-day suspend (handled by D)`)
      break
    }
    const raceWindow = new Date(lastActivityBeforeSleep.getTime() - 5 * 60 * 1000).toISOString()
    if (hasRecord('BREAK_START', 'PC 비활동 자동 휴식', raceWindow)) {
      log('B', 'skipped', `BREAK_START already exists near suspend time`)
      break
    }
    agentInsert('BREAK_START', lastActivityBeforeSleep, 'PC 비활동 자동 휴식')
    log('B', 'triggered', `suspend-based BREAK_START at ${lastActivityBeforeSleep.toISOString()}`)
  } while (false)

  // ── Block C: heartbeat gap >= 15min, no suspend_at ───────────────────────
  do {
    if (!lastHeartbeat || suspendAtStr) {
      log('C', 'skipped', suspendAtStr ? 'has suspend_at' : 'no last_heartbeat')
      break
    }
    if (!lastType || !WORKING_TYPES.has(lastType) || idleSeconds >= INACTIVITY_THRESHOLD) {
      log('C', 'skipped', `guard: lastType=${lastType ?? 'none'} idle=${idleSeconds}s`)
      break
    }
    const prevHeartbeat = new Date(lastHeartbeat)
    const gapSeconds = (now.getTime() - prevHeartbeat.getTime()) / 1000
    if (gapSeconds < INACTIVITY_THRESHOLD) {
      log('C', 'skipped', `gap ${Math.round(gapSeconds)}s < threshold`)
      break
    }
    const lastRecordAt = new Date(lastRecord!.recorded_at)
    const breakStartMs = Math.max(prevHeartbeat.getTime(), lastRecordAt.getTime())
    const breakStartAt = new Date(breakStartMs)
    const breakStartKSTDate = new Date(breakStartMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (breakStartKSTDate !== kstDate) {
      log('C', 'skipped', `cross-day gap (handled by D)`)
      break
    }
    const raceWindow = new Date(breakStartMs - 30 * 60 * 1000).toISOString()
    if (hasRecord('BREAK_START', 'PC 비활동 자동 휴식', raceWindow)) {
      log('C', 'skipped', `BREAK_START already exists near gap start`)
      break
    }
    agentInsert('BREAK_START', breakStartAt, 'PC 비활동 자동 휴식')
    log('C', 'triggered', `gap-based BREAK_START at ${breakStartAt.toISOString()} (gap=${Math.round(gapSeconds)}s)`)
    if (idleSeconds < 60) {
      agentInsert('BREAK_END', now, 'PC 활동 감지 자동 업무 복귀')
      log('C', 'triggered', `immediate BREAK_END (idle=${idleSeconds}s already active)`)
    }
  } while (false)

  // ── Block D: 어제 미종료 세션 → CHECK_OUT ───────────────────────────────
  // 오늘 기록이 있어도 실행 — 절전/잠금으로 checkout API가 호출되지 않은 경우
  // last_activity_at + 15분을 퇴근 시각으로 사용. yestCheckout 존재 여부로 중복 방지.
  do {
    if (!yestLastRecord) {
      log('D', 'skipped', 'no yesterday record')
      break
    }
    const yestType = yestLastRecord.type
    const needsCheckout =
      WORKING_TYPES.has(yestType) ||
      yestType === 'FIELD_START' ||
      (yestType === 'BREAK_START' && yestLastRecord.note === 'PC 비활동 자동 휴식')
    if (!needsCheckout) {
      log('D', 'skipped', `yesterday closed (type=${yestType})`)
      break
    }
    if (yestCheckout) {
      // If a stale 'PC 종료 자동 퇴근' exists and we have a later activity time → upgrade it
      if (yestCheckout.note !== 'PC 종료 자동 퇴근') {
        log('D', 'skipped', `yesterday checkout already exists (${yestCheckout.recorded_at})`)
        break
      }
      // Will attempt upgrade below after computing checkoutAt
    }
    const isAutoBreak = yestType === 'BREAK_START' && yestLastRecord.note === 'PC 비활동 자동 휴식'
    let checkoutAt: string | null = null

    if (isAutoBreak) {
      // BREAK_START 시각 = 이미 비활동 감지된 시각 → 그대로 퇴근 시각으로 사용
      checkoutAt = yestLastRecord.recorded_at
    } else {
      // 마지막 실제 활동 시각 후보: lastActivityBeforeSleep vs last_activity_at 중 더 이른 것
      // 이유: lastActivityBeforeSleep은 집에서 활동 후 절전 시 집 시각을 반영할 수 있음.
      // last_activity_at은 idle < 15min인 정규 heartbeat에서만 갱신되어 집에서 idle이 클 경우 미갱신.
      // → 둘 중 더 이른 시각이 실제 업무 마지막 활동 시각에 가까움.
      let lastActivityMs: number | null = null

      if (lastActivityBeforeSleep) {
        const laKSTDate = new Date(lastActivityBeforeSleep.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
        if (laKSTDate === yesterdayKSTDate && lastActivityBeforeSleep > new Date(yestLastRecord.recorded_at)) {
          lastActivityMs = lastActivityBeforeSleep.getTime()
        }
      }
      if (employeeLastActivityAt) {
        const laKSTDate = new Date(new Date(employeeLastActivityAt).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
        if (laKSTDate === yesterdayKSTDate && new Date(employeeLastActivityAt) > new Date(yestLastRecord.recorded_at)) {
          const ms = new Date(employeeLastActivityAt).getTime()
          lastActivityMs = lastActivityMs === null ? ms : Math.min(lastActivityMs, ms)
        }
      }

      if (lastActivityMs !== null) {
        // 마지막 활동 + 15분 = 비활동 감지 임계값 = 실질적 자리 이탈 시각
        // GetLastInputInfo는 잠금 화면 입력까지 시스템 전역으로 계측하므로, 잠금 후 lock screen 입력이
        // last_activity_at을 자정 직전까지 밀어낼 수 있음. + 15분이 다음 날로 넘어가면
        // CHECK_OUT이 오늘 날짜로 삽입되어 "현재 상태: 퇴근" 오표시 버그 발생.
        // → + 15분 결과가 yesterdayKSTDate를 벗어나면 raw lastActivityMs 그대로 사용.
        const candidateMs = lastActivityMs + INACTIVITY_THRESHOLD * 1000
        const candidateKSTDate = new Date(candidateMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
        checkoutAt = candidateKSTDate === yesterdayKSTDate
          ? new Date(candidateMs).toISOString()
          : new Date(lastActivityMs).toISOString()
      } else if (lastHeartbeat) {
        const lhKSTDate = new Date(new Date(lastHeartbeat).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
        if (lhKSTDate === yesterdayKSTDate && new Date(lastHeartbeat) > new Date(yestLastRecord.recorded_at)) {
          const candidateMs = new Date(lastHeartbeat).getTime() + INACTIVITY_THRESHOLD * 1000
          const candidateKSTDate = new Date(candidateMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
          checkoutAt = candidateKSTDate === yesterdayKSTDate
            ? new Date(candidateMs).toISOString()
            : lastHeartbeat
        }
      }
    }
    if (!checkoutAt) {
      log('D', 'skipped', 'could not determine checkout time')
      break
    }
    if (yestCheckout && yestCheckout.note === 'PC 종료 자동 퇴근') {
      if (new Date(checkoutAt) > new Date(yestCheckout.recorded_at)) {
        decisions.push({ action: 'update', id: yestCheckout.id, recorded_at: checkoutAt, note: 'PC 절전/잠금 자동 퇴근' })
        log('D', 'triggered', `upgraded stale checkout ${yestCheckout.recorded_at} → ${checkoutAt}`)
      } else {
        log('D', 'skipped', `stale checkout already at ${yestCheckout.recorded_at}, no later activity`)
      }
      break
    }
    decisions.push({ action: 'insert', type: 'CHECK_OUT', recorded_at: checkoutAt, note: 'PC 절전/잠금 자동 퇴근', origin: 'agent_auto' })
    // BREAK_START를 퇴근 시각으로 흡수할 때 해당 레코드 삭제 — 동일 시각 중복 기록 방지
    if (isAutoBreak) {
      decisions.push({ action: 'delete', id: yestLastRecord.id })
    }
    log('D', 'triggered', `yesterday CHECK_OUT at ${checkoutAt} (yestType=${yestType})`)
  } while (false)

  // ── Block E: BREAK_START + idle < 60s → BREAK_END (업무 복귀) ────────────
  do {
    if (lastType !== 'BREAK_START' || lastRecord?.note !== 'PC 비활동 자동 휴식') {
      log('E', 'skipped', `lastType=${lastType ?? 'none'} note=${lastRecord?.note ?? 'none'}`)
      break
    }
    if (idleSeconds >= 60) {
      log('E', 'skipped', `idle=${idleSeconds}s >= 60s`)
      break
    }
    if (suspendAtStr) {
      log('E', 'skipped', `suspend wake — idle reset by OS, not real activity`)
      break
    }
    // KST 22:00~07:00은 Windows Update / OS 예약작업이 PC를 깨우는 시간대.
    // 이 시간대의 low-idle은 실제 사용자 복귀가 아닐 가능성이 높아 BREAK_END를 삽입하지 않는다.
    const kstHourE = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours()
    if (kstHourE >= 22 || kstHourE < 7) {
      log('E', 'skipped', `KST ${kstHourE}시 — 업무 외 시간대, skip false BREAK_END`)
      break
    }
    const breakDurationSec = (now.getTime() - new Date(lastRecord!.recorded_at).getTime()) / 1000
    if (breakDurationSec < MIN_BREAK_DURATION_SEC) {
      log('E', 'skipped', `break duration ${Math.round(breakDurationSec)}s < min ${MIN_BREAK_DURATION_SEC}s`)
      break
    }
    // v1.3.13+: 실측 키보드/마우스 — 키입력 1개↑ 또는 마우스 이동 50px↑
    // v1.3.12 : activity_ticks >= 2 (60초 4샘플 중 2개↑ idle < 60s)
    // pre-1.3.12: idle < 60s만으로 판단 (KST guard로 보완)
    // v1.3.16+: mouse_px=0 명시 전송 → 첫 분기에서 key>=1 || px>=50만 판단.
    // activity_ticks를 첫 분기에 포함하면 OS 백그라운드(무선 마우스 keep-alive 등)가
    // GetLastInputInfo를 리셋해 ticks>=2 조건이 충족되더라도 false positive가 발생함.
    // (Block F isConfirmedActiveF와 동일한 기준으로 통일)
    // 30분 초과 휴식 오탐 방지:
    //   key+mouse 둘 다 있으면 AND + 200px (future agent with key_count)
    //   mouse만 있으면 200px 단독 (v1.3.17 현재 에이전트 — key_count 미전송)
    //   short break(≤30min)은 기존 로직 유지
    const longBreakE = breakDurationSec > 30 * 60
    const isConfirmedActive =
      keyCount !== null || mousePx !== null
        ? longBreakE
          ? keyCount !== null
            ? (keyCount ?? 0) >= 1 && (mousePx ?? 0) >= 200
            : (mousePx ?? 0) >= 200
          : (keyCount ?? 0) >= 1 || (mousePx ?? 0) >= 50
        : activityTicks !== null
        ? activityTicks >= 2
        : true
    if (!isConfirmedActive) {
      log('E', 'skipped', `key=${keyCount} px=${mousePx} ticks=${activityTicks} — not confirmed active`)
      break
    }
    const raceWindow = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
    if (hasRecord('BREAK_END', 'PC 활동 감지 자동 업무 복귀', raceWindow)) {
      log('E', 'skipped', `BREAK_END already exists within 2min`)
      break
    }
    agentInsert('BREAK_END', now, 'PC 활동 감지 자동 업무 복귀')
    log('E', 'triggered', `BREAK_END at ${now.toISOString()} (idle=${idleSeconds}s key=${keyCount} px=${mousePx} ticks=${activityTicks})`)
  } while (false)

  // ── Block F: PC 종료 자동 퇴근 후 에이전트 재활성 → CHECK_IN ─────────────────
  do {
    if (lastType !== 'CHECK_OUT' || lastRecord?.note !== 'PC 종료 자동 퇴근') {
      log('F', 'skipped', `lastType=${lastType ?? 'none'} note="${lastRecord?.note ?? 'none'}"`)
      break
    }
    if (idleSeconds >= INACTIVITY_THRESHOLD) {
      log('F', 'skipped', `idle=${idleSeconds}s >= threshold`)
      break
    }
    const kstHourF = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours()
    if (kstHourF < 7 || kstHourF >= 22) {
      log('F', 'skipped', `KST ${kstHourF}시 — 업무 외 시간대`)
      break
    }
    if (!isWorkday(kstDate)) {
      log('F', 'skipped', `non-workday: ${kstDate}`)
      break
    }
    if (leaveTodayType !== null) {
      const kstNowF = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      const kstMinF = kstHourF * 60 + kstNowF.getUTCMinutes()
      const blocked =
        leaveTodayType === 'FULL_DAY' ||
        (leaveTodayType === 'AM_HALF' && kstMinF < HALF_DAY_BOUNDARY_MIN) ||
        (leaveTodayType === 'PM_HALF' && kstMinF >= HALF_DAY_BOUNDARY_MIN)
      if (blocked) {
        log('F', 'skipped', `leave=${leaveTodayType} kstMin=${kstMinF}`)
        break
      }
    }
    const isConfirmedActiveF =
      keyCount !== null || mousePx !== null
        ? (keyCount ?? 0) >= 1 || (mousePx ?? 0) >= 50
        : activityTicks !== null
        ? activityTicks >= 2
        : true
    if (!isConfirmedActiveF) {
      log('F', 'skipped', `key=${keyCount} px=${mousePx} ticks=${activityTicks} — not confirmed active`)
      break
    }
    const checkInAt = new Date(now.getTime() - idleSeconds * 1000)
    const checkInKSTDate = new Date(checkInAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (checkInKSTDate !== kstDate) {
      log('F', 'skipped', `checkIn date ${checkInKSTDate} !== today ${kstDate}`)
      break
    }
    const raceWindowF = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    if (hasRecord('CHECK_IN', 'PC 재시작 자동 출근', raceWindowF)) {
      log('F', 'skipped', `CHECK_IN already exists within 5min`)
      break
    }
    agentInsert('CHECK_IN', checkInAt, 'PC 재시작 자동 출근')
    log('F', 'triggered', `auto re-checkin at ${checkInAt.toISOString()} after PC 종료 자동 퇴근`)
  } while (false)

  // ── Block G: 어제 퇴근 후 오늘 출근 기록 없는 상태에서 활동 감지 → CHECK_IN ──
  // Block F는 당일 'PC 종료 자동 퇴근' 재시작만 처리.
  // cron / Block D 자동 퇴근(다른 note) 이후 다음 날 첫 활동을 잡지 못하는 사각지대 해소.
  do {
    if (lastType !== null) {
      log('G', 'skipped', `today has records (lastType=${lastType})`)
      break
    }
    if (!yestCheckout) {
      log('G', 'skipped', 'no yesterday checkout')
      break
    }
    // idle < 60s: 실제 사람이 막 활동 시작한 신호. Block E와 동일한 임계값으로 false positive 억제.
    if (idleSeconds >= 60) {
      log('G', 'skipped', `idle=${idleSeconds}s >= 60s`)
      break
    }
    if (suspendAtStr) {
      log('G', 'skipped', 'suspend wake — not real work start')
      break
    }
    const kstHourG = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours()
    if (kstHourG < 7 || kstHourG >= 22) {
      log('G', 'skipped', `KST ${kstHourG}시 — 업무 외 시간대`)
      break
    }
    if (!isWorkday(kstDate)) {
      log('G', 'skipped', `non-workday: ${kstDate}`)
      break
    }
    if (leaveTodayType !== null) {
      const kstNowG = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      const kstMinG = kstHourG * 60 + kstNowG.getUTCMinutes()
      const blocked =
        leaveTodayType === 'FULL_DAY' ||
        (leaveTodayType === 'AM_HALF' && kstMinG < HALF_DAY_BOUNDARY_MIN) ||
        (leaveTodayType === 'PM_HALF' && kstMinG >= HALF_DAY_BOUNDARY_MIN)
      if (blocked) {
        log('G', 'skipped', `leave=${leaveTodayType} kstMin=${kstMinG}`)
        break
      }
    }
    const isConfirmedActiveG =
      keyCount !== null || mousePx !== null
        ? (keyCount ?? 0) >= 1 || (mousePx ?? 0) >= 50
        : activityTicks !== null
        ? activityTicks >= 2
        : true
    if (!isConfirmedActiveG) {
      log('G', 'skipped', `key=${keyCount} px=${mousePx} ticks=${activityTicks} — not confirmed active`)
      break
    }
    const checkInAt = new Date(now.getTime() - idleSeconds * 1000)
    const checkInKSTDate = new Date(checkInAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (checkInKSTDate !== kstDate) {
      log('G', 'skipped', `checkIn date ${checkInKSTDate} !== today ${kstDate}`)
      break
    }
    const raceWindowG = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    if (hasRecord('CHECK_IN', 'PC 활동 감지 자동 출근', raceWindowG)) {
      log('G', 'skipped', `CHECK_IN already exists within 5min`)
      break
    }
    agentInsert('CHECK_IN', checkInAt, 'PC 활동 감지 자동 출근')
    log('G', 'triggered', `auto CHECK_IN at ${checkInAt.toISOString()} (yest=${yestCheckout.note} idle=${idleSeconds}s key=${keyCount} px=${mousePx})`)
  } while (false)

  return { decisions, logs }
}

// ── Browser heartbeat ─────────────────────────────────────────────────────────

export interface BrowserHeartbeatCtx {
  kstDate: string
  now: Date
  lastHeartbeat: string | null
  lastRecord: RecordRow | null
  inactivityMs: number         // from company_settings.inactivity_minutes * 60 * 1000
  agentIsActive: boolean       // true when PC agent sent a heartbeat in last 5 min
}

export function decideBrowserHeartbeat(
  ctx: BrowserHeartbeatCtx,
): { decisions: Decision[]; logs: DecisionLog[] } {
  const decisions: Decision[] = []
  const logs: DecisionLog[] = []

  const { now, lastHeartbeat, lastRecord, inactivityMs, agentIsActive } = ctx

  const lastType = lastRecord?.type ?? null

  // When PC agent is active, let it handle break detection (more accurate idle data)
  if (agentIsActive) {
    logs.push({ block: 'browser', result: 'skipped', reason: 'PC agent active — skipping browser break detection' })
    return { decisions, logs }
  }

  if (!lastHeartbeat || !lastType || !WORKING_TYPES.has(lastType)) {
    logs.push({ block: 'browser', result: 'skipped', reason: `no heartbeat or lastType=${lastType ?? 'none'}` })
    return { decisions, logs }
  }

  const lastHeartbeatMs = new Date(lastHeartbeat).getTime()
  const lastRecordMs = new Date(lastRecord!.recorded_at).getTime()
  const lastActiveMs = Math.max(lastHeartbeatMs, lastRecordMs)
  const inactiveMs = now.getTime() - lastActiveMs

  if (inactiveMs <= inactivityMs) {
    logs.push({ block: 'browser', result: 'skipped', reason: `inactive ${Math.round(inactiveMs / 1000)}s <= threshold ${Math.round(inactivityMs / 1000)}s` })
    return { decisions, logs }
  }

  const breakStartTime = new Date(lastActiveMs + inactivityMs)
  decisions.push({ action: 'insert', type: 'BREAK_START', recorded_at: breakStartTime.toISOString(), note: '자동 휴식 (비활동 감지)', origin: 'browser_auto' })
  decisions.push({ action: 'insert', type: 'BREAK_END', recorded_at: now.toISOString(), note: '자동 업무 복귀', origin: 'browser_auto' })
  logs.push({ block: 'browser', result: 'triggered', reason: `inactive ${Math.round(inactiveMs / 1000)}s > threshold — BREAK_START at ${breakStartTime.toISOString()}` })

  return { decisions, logs }
}
