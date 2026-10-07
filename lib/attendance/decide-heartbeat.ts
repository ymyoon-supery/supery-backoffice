// Pure decision functions for attendance heartbeat processing.
// No DB access — takes preloaded state, returns decisions + debug logs.

const WORKING_TYPES = new Set(['CHECK_IN', 'BREAK_END', 'FIELD_END'])
const INACTIVITY_THRESHOLD = 15 * 60    // seconds
const MIN_BREAK_DURATION_SEC = 5 * 60   // seconds

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

export type Decision = InsertDecision | UpdateDecision

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
}

export interface AgentHeartbeatInput {
  idleSeconds: number
  activityTicks: number | null  // null = old agent (pre-v1.3.12)
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
  } = ctx
  const { idleSeconds, activityTicks, suspendAtStr, lastActivityBeforeSleep } = input

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
  do {
    if (!lastType || !WORKING_TYPES.has(lastType) || idleSeconds < INACTIVITY_THRESHOLD) {
      log('A', 'skipped', `lastType=${lastType ?? 'none'} idle=${idleSeconds}s`)
      break
    }
    const idleStartAt = new Date(now.getTime() - idleSeconds * 1000)
    const lastRecordAt = new Date(lastRecord!.recorded_at)
    if (idleStartAt < lastRecordAt) {
      log('A', 'skipped', `stale heartbeat: idleStart < lastRecord(${lastRecordAt.toISOString()})`)
      break
    }
    const breakStartAt = new Date(Math.max(idleStartAt.getTime(), lastRecordAt.getTime()))
    const breakStartKSTDate = new Date(breakStartAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    if (breakStartKSTDate < kstDate) {
      if (yestCheckout) {
        log('A', 'skipped', `cross-midnight: checkout already exists (${yestCheckout.recorded_at})`)
        break
      }
      agentInsert('CHECK_OUT', breakStartAt, 'PC 절전/잠금 자동 퇴근')
      log('A', 'triggered', `cross-midnight CHECK_OUT at ${breakStartAt.toISOString()}`)
    } else {
      const raceWindow = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      if (hasRecord('BREAK_START', 'PC 비활동 자동 휴식', raceWindow)) {
        log('A', 'skipped', `BREAK_START already exists within 30min`)
        break
      }
      agentInsert('BREAK_START', breakStartAt, 'PC 비활동 자동 휴식')
      log('A', 'triggered', `BREAK_START at ${breakStartAt.toISOString()} (idle=${idleSeconds}s)`)
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

  // ── Block D: 오늘 기록 없음 + 어제 미종료 세션 → CHECK_OUT ───────────────
  do {
    if (todayRecords.length > 0) {
      log('D', 'skipped', `today has ${todayRecords.length} records`)
      break
    }
    if (!yestLastRecord) {
      log('D', 'skipped', 'no yesterday record')
      break
    }
    const yestType = yestLastRecord.type
    const needsCheckout =
      WORKING_TYPES.has(yestType) ||
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

    if (lastActivityBeforeSleep) {
      const laKSTDate = new Date(lastActivityBeforeSleep.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (laKSTDate === yesterdayKSTDate && (isAutoBreak || lastActivityBeforeSleep > new Date(yestLastRecord.recorded_at))) {
        checkoutAt = lastActivityBeforeSleep.toISOString()
      }
    }
    if (!checkoutAt) {
      if (isAutoBreak) {
        checkoutAt = yestLastRecord.recorded_at
      } else {
        if (employeeLastActivityAt) {
          const laKSTDate = new Date(new Date(employeeLastActivityAt).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
          if (laKSTDate === yesterdayKSTDate && new Date(employeeLastActivityAt) > new Date(yestLastRecord.recorded_at)) {
            checkoutAt = employeeLastActivityAt
          }
        }
        if (!checkoutAt && lastHeartbeat) {
          const lhKSTDate = new Date(new Date(lastHeartbeat).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
          if (lhKSTDate === yesterdayKSTDate && new Date(lastHeartbeat) > new Date(yestLastRecord.recorded_at)) {
            checkoutAt = lastHeartbeat
          }
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
    // v1.3.12+: activity_ticks >= 2 to confirm real activity (not Windows event resetting idle timer)
    // Old agent: idle < 60s is sufficient (last_activity_at unavailable during breaks)
    const isConfirmedActive = activityTicks !== null ? activityTicks >= 2 : true
    if (!isConfirmedActive) {
      log('E', 'skipped', `activityTicks=${activityTicks} < 2 (possible false positive)`)
      break
    }
    const raceWindow = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
    if (hasRecord('BREAK_END', 'PC 활동 감지 자동 업무 복귀', raceWindow)) {
      log('E', 'skipped', `BREAK_END already exists within 2min`)
      break
    }
    agentInsert('BREAK_END', now, 'PC 활동 감지 자동 업무 복귀')
    log('E', 'triggered', `BREAK_END at ${now.toISOString()} (idle=${idleSeconds}s ticks=${activityTicks})`)
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
