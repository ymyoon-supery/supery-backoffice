export type HeartbeatSample = {
  ts: string
  idle: number
  mouse_px: number | null
  key_count: number | null
  activity_ticks: number | null
}

export type SuspiciousFlag = {
  type: 'MOUSE_JIGGLER' | 'IMPOSSIBLE_HOURS' | 'UNIFORM_MOUSE'
  label: string
  detail: string
  severity: 'high' | 'medium'
  samples: { ts: string; mouse_px: number | null; key_count: number | null; idle: number }[]
}

const KST_MS = 9 * 60 * 60 * 1000

function kstHour(ts: string): number {
  return new Date(new Date(ts).getTime() + KST_MS).getUTCHours()
}

function kstHHMM(ts: string): string {
  const d = new Date(new Date(ts).getTime() + KST_MS)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function detectSuspiciousActivity(samples: HeartbeatSample[]): SuspiciousFlag[] {
  const flags: SuspiciousFlag[] = []
  const sorted = [...samples].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  // v1.3.13+부터 key_count 전송. null이면 구형 에이전트 → 탐지 불가
  const withKeys = sorted.filter(s => s.key_count !== null)

  // ── 탐지 1: MOUSE_JIGGLER ──────────────────────────────────────
  // 연속 N회 이상: mouse_px >= 50, key_count = 0, idle < 900, 업무 시간(07~22시 KST)
  // 실제 업무 중 마우스를 안 쓰고 키보드만 쓰는 경우도 있으므로 threshold는 6회(10분)
  if (withKeys.length > 0) {
    let streak: HeartbeatSample[] = []
    let worst: HeartbeatSample[] = []
    for (const s of withKeys) {
      const h = kstHour(s.ts)
      const isWork = h >= 7 && h < 22
      const isMouseOnly = (s.mouse_px ?? 0) >= 50 && (s.key_count ?? 0) === 0 && s.idle < 900 && isWork
      if (isMouseOnly) {
        streak.push(s)
        if (streak.length > worst.length) worst = [...streak]
      } else {
        streak = []
      }
    }
    if (worst.length >= 6) {
      flags.push({
        type: 'MOUSE_JIGGLER',
        label: '마우스만 활성 (키보드 없음)',
        detail: `${worst.length}분 연속 마우스 이동만 감지 (${kstHHMM(worst[0].ts)}~${kstHHMM(worst[worst.length - 1].ts)}) — 키보드 입력 0`,
        severity: worst.length >= 15 ? 'high' : 'medium',
        samples: worst.map(s => ({ ts: s.ts, mouse_px: s.mouse_px, key_count: s.key_count, idle: s.idle })),
      })
    }
  }

  // ── 탐지 2: IMPOSSIBLE_HOURS ──────────────────────────────────
  // 새벽 00:00~06:00 KST에 idle < 60 (실제 입력 감지)
  // Windows Update / OS 예약작업은 보통 90분 이내에 완료됨 → 90분 미만은 오탐으로 제외
  const night = sorted.filter(s => kstHour(s.ts) < 6 && s.idle < 60)
  if (night.length >= 2) {
    const nightDurationMin =
      (new Date(night.at(-1)!.ts).getTime() - new Date(night[0].ts).getTime()) / 60000
    if (nightDurationMin >= 90) {
      flags.push({
        type: 'IMPOSSIBLE_HOURS',
        label: '새벽 시간대 활성',
        detail: `00:00~06:00 KST 구간 ${night.length}회 활성 감지 · ${kstHHMM(night[0].ts)}~${kstHHMM(night.at(-1)!.ts)} (${Math.round(nightDurationMin)}분)`,
        severity: 'high',
        samples: night.map(s => ({ ts: s.ts, mouse_px: s.mouse_px, key_count: s.key_count, idle: s.idle })),
      })
    }
  }

  // ── 탐지 3: UNIFORM_MOUSE ─────────────────────────────────────
  // 활성 heartbeat에서 mouse_px의 변동계수(CV) < 15%
  // 실제 마우스는 이동 거리가 불규칙 → CV가 낮으면 고정 픽셀 반복(자동화 의심)
  const activeMouse = withKeys.filter(s => (s.mouse_px ?? 0) >= 50 && s.idle < 900)
  if (activeMouse.length >= 12) {
    const vals = activeMouse.map(s => s.mouse_px as number)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const stddev = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    const cv = mean > 0 ? stddev / mean : 1
    if (cv < 0.15 && mean < 500) {
      flags.push({
        type: 'UNIFORM_MOUSE',
        label: '마우스 이동량 균일',
        detail: `활성 ${activeMouse.length}회 평균 ${Math.round(mean)}px · 변동계수 ${(cv * 100).toFixed(1)}% (정상은 보통 40%+)`,
        severity: 'medium',
        samples: activeMouse.slice(0, 10).map(s => ({ ts: s.ts, mouse_px: s.mouse_px, key_count: s.key_count, idle: s.idle })),
      })
    }
  }

  return flags
}
