# Work Schedule Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 전사 출근/퇴근/점심 시간을 설정하고, 근태현황과 52시간 리포트에 지각·조퇴·점심 자동차감이 반영되도록 한다.

**Architecture:** `company_settings`에 4개 TEXT 컬럼을 추가하고, 공유 유틸리티 `lib/attendance/calc.ts`에 `calcDaySummary`를 추출·확장한다. 설정 페이지에서 저장한 시간이 근태현황·52시간 리포트 모두에 반영된다.

**Tech Stack:** Next.js App Router, Supabase, date-fns, TypeScript, Tailwind CSS

---

## File Map

| 파일 | 유형 | 역할 |
|------|------|------|
| `supabase/migrations/031_work_schedule.sql` | 신규 | company_settings에 4개 컬럼 추가 |
| `lib/attendance/calc.ts` | 신규 | 공유 타입 + calcDaySummary (지각/조퇴/점심 로직 포함) |
| `app/(admin)/admin/settings/actions.ts` | 수정 | updateWorkSchedule 액션 추가 |
| `app/(admin)/admin/settings/page.tsx` | 수정 | 4개 필드 fetch 추가 |
| `app/(admin)/admin/settings/GeneralSettingsClient.tsx` | 수정 | 근무시간 설정 UI 카드 추가 |
| `app/(admin)/admin/attendance/page.tsx` | 수정 | calc.ts import, schedule fetch, calcDaySummary 사용 |
| `components/admin/AttendanceSummaryView.tsx` | 수정 | DaySummary import, 지각/조퇴 배지·dot 표시 |
| `app/(admin)/admin/reports/page.tsx` | 수정 | calc.ts import, 지각/조퇴 횟수 컬럼 추가 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/031_work_schedule.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- supabase/migrations/031_work_schedule.sql
ALTER TABLE company_settings
  ADD COLUMN work_start_time  TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN work_end_time    TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN lunch_start_time TEXT NOT NULL DEFAULT '12:00',
  ADD COLUMN lunch_end_time   TEXT NOT NULL DEFAULT '13:00';
```

- [ ] **Step 2: Supabase에 적용**

```bash
npx supabase db push
```

Expected: 오류 없이 완료. `company_settings`에 4개 컬럼 추가됨.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/031_work_schedule.sql
git commit -m "feat: add work schedule columns to company_settings"
```

---

## Task 2: 공유 유틸리티 lib/attendance/calc.ts

기존 `attendance/page.tsx`의 인라인 함수(`toKSTTime`, `toKSTDate`, `calcDaySummary`, `DaySummary`)를 공유 모듈로 추출하고 지각/조퇴 로직을 추가한다.

**Files:**
- Create: `lib/attendance/calc.ts`

- [ ] **Step 1: lib/attendance 디렉터리 생성**

```bash
mkdir -p lib/attendance
```

- [ ] **Step 2: calc.ts 생성**

```ts
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
  const [h, m] = t.split(':').map(Number)
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

  let breakMin = 0
  let breakStart: Date | null = null
  for (const r of sorted) {
    if (r.type === 'BREAK_START') breakStart = new Date(r.recorded_at)
    else if (r.type === 'BREAK_END' && breakStart) {
      breakMin += differenceInMinutes(new Date(r.recorded_at), breakStart)
      breakStart = null
    }
  }

  const checkInKST = toKSTTime(checkIn.recorded_at)
  if (!checkOut) {
    return { checkIn: checkInKST, checkOut: null, breakMin, workMin: 0, lateMin: 0, earlyLeaveMin: 0 }
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

  const lateMin = Math.max(0, checkInMin - startMin)
  const earlyLeaveMin = Math.max(0, endMin - checkOutMin)

  return { checkIn: checkInKST, checkOut: checkOutKST, breakMin, workMin, lateMin, earlyLeaveMin }
}
```

- [ ] **Step 3: 로직 빠른 검증**

```bash
npx tsx -e "
import { timeToMin, calcDaySummary } from './lib/attendance/calc.ts'
const s = { workStartTime: '09:00', workEndTime: '18:00', lunchStartTime: '12:00', lunchEndTime: '13:00' }
// 09:23 출근 -> 지각 23분
const recs1 = [{ type: 'CHECK_IN', recorded_at: '2026-06-13T00:23:00.000Z' }, { type: 'CHECK_OUT', recorded_at: '2026-06-13T09:00:00.000Z' }]
const r1 = calcDaySummary(recs1, s)
console.log('lateMin:', r1.lateMin, '(expected 23)')
// 17:45 퇴근 -> 조퇴 15분
const recs2 = [{ type: 'CHECK_IN', recorded_at: '2026-06-13T00:00:00.000Z' }, { type: 'CHECK_OUT', recorded_at: '2026-06-13T08:45:00.000Z' }]
const r2 = calcDaySummary(recs2, s)
console.log('earlyLeaveMin:', r2.earlyLeaveMin, '(expected 15)')
console.log('PASS')
"
```

Expected: `lateMin: 23 (expected 23)`, `earlyLeaveMin: 15 (expected 15)`, `PASS`

- [ ] **Step 4: 커밋**

```bash
git add lib/attendance/calc.ts
git commit -m "feat: extract calcDaySummary to shared utility with late/early leave logic"
```

---

## Task 3: 설정 — Action + Page + UI

**Files:**
- Modify: `app/(admin)/admin/settings/actions.ts`
- Modify: `app/(admin)/admin/settings/page.tsx`
- Modify: `app/(admin)/admin/settings/GeneralSettingsClient.tsx`

- [ ] **Step 1: updateWorkSchedule 액션 추가 (`actions.ts` 끝에 추가)**

```ts
// app/(admin)/admin/settings/actions.ts 끝에 추가

export async function updateWorkSchedule(
  workStartTime: string,
  workEndTime: string,
  lunchStartTime: string,
  lunchEndTime: string,
) {
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/
  if (![workStartTime, workEndTime, lunchStartTime, lunchEndTime].every(t => timeRe.test(t))) {
    return { error: '올바른 시간 형식이 아닙니다. (예: 09:00)' }
  }

  const admin = await getAdminClient()
  if (!admin) return { error: 'Unauthorized' }

  const { error } = await admin
    .from('company_settings')
    .update({
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      lunch_start_time: lunchStartTime,
      lunch_end_time: lunchEndTime,
      updated_at: new Date().toISOString(),
    })
    .not('id', 'is', null)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}
```

- [ ] **Step 2: settings page.tsx에서 4개 필드 fetch 추가**

`app/(admin)/admin/settings/page.tsx` 전체를 다음으로 교체:

```ts
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import GeneralSettingsClient from './GeneralSettingsClient'

export default async function AdminSettingsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await admin
    .from('company_settings')
    .select('inactivity_minutes, office_ips, auto_break_mode, remote_radius_m, work_start_time, work_end_time, lunch_start_time, lunch_end_time')
    .single()

  const hdrs = await headers()
  const currentIp =
    hdrs.get('x-forwarded-for')?.split(',')[0].trim() ??
    hdrs.get('x-real-ip') ??
    ''

  return (
    <GeneralSettingsClient
      inactivityMinutes={data?.inactivity_minutes ?? 15}
      officeIps={data?.office_ips ?? []}
      currentIp={currentIp}
      autoBreakMode={(data?.auto_break_mode ?? 'frontend') as 'frontend' | 'server'}
      remoteRadiusM={data?.remote_radius_m ?? 500}
      workStartTime={data?.work_start_time ?? '09:00'}
      workEndTime={data?.work_end_time ?? '18:00'}
      lunchStartTime={data?.lunch_start_time ?? '12:00'}
      lunchEndTime={data?.lunch_end_time ?? '13:00'}
    />
  )
}
```

- [ ] **Step 3: GeneralSettingsClient.tsx 업데이트**

`app/(admin)/admin/settings/GeneralSettingsClient.tsx` 전체를 다음으로 교체:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, Wifi } from 'lucide-react'
import { updateInactivityMinutes, updateAutoBreakMode, updateRemoteRadius, addOfficeIp, removeOfficeIp, updateWorkSchedule } from './actions'

const INACTIVITY_OPTIONS = [
  { value: 10, label: '10분' },
  { value: 15, label: '15분 (기본)' },
  { value: 20, label: '20분' },
  { value: 30, label: '30분' },
]

const RADIUS_OPTIONS = [
  { value: 0,    label: '제한 없음' },
  { value: 100,  label: '100m' },
  { value: 200,  label: '200m' },
  { value: 300,  label: '300m' },
  { value: 500,  label: '500m (기본)' },
  { value: 1000, label: '1km' },
  { value: 2000, label: '2km' },
]

export default function GeneralSettingsClient({
  inactivityMinutes,
  officeIps,
  currentIp,
  autoBreakMode,
  remoteRadiusM,
  workStartTime,
  workEndTime,
  lunchStartTime,
  lunchEndTime,
}: {
  inactivityMinutes: number
  officeIps: string[]
  currentIp: string
  autoBreakMode: 'frontend' | 'server'
  remoteRadiusM: number
  workStartTime: string
  workEndTime: string
  lunchStartTime: string
  lunchEndTime: string
}) {
  const [minutes, setMinutes] = useState(inactivityMinutes)
  const [breakMode, setBreakMode] = useState<'frontend' | 'server'>(autoBreakMode)
  const [radiusM, setRadiusM] = useState(remoteRadiusM)
  const [ips, setIps] = useState<string[]>(officeIps)
  const [newIp, setNewIp] = useState('')
  const [startTime, setStartTime] = useState(workStartTime)
  const [endTime, setEndTime] = useState(workEndTime)
  const [lunchStart, setLunchStart] = useState(lunchStartTime)
  const [lunchEnd, setLunchEnd] = useState(lunchEndTime)
  const [isPending, startTransition] = useTransition()

  function handleSaveInactivity() {
    startTransition(async () => {
      const res = await updateInactivityMinutes(minutes)
      if (res.error) { toast.error(res.error); return }
      toast.success('저장되었습니다.')
    })
  }

  function handleBreakModeChange(mode: 'frontend' | 'server') {
    setBreakMode(mode)
    startTransition(async () => {
      const res = await updateAutoBreakMode(mode)
      if (res.error) { toast.error(res.error); return }
      toast.success('저장되었습니다.')
    })
  }

  function handleRadiusChange(r: number) {
    setRadiusM(r)
    startTransition(async () => {
      const res = await updateRemoteRadius(r)
      if (res.error) { toast.error(res.error); return }
      toast.success('저장되었습니다.')
    })
  }

  function handleAddIp(ip: string) {
    if (!ip.trim()) return
    startTransition(async () => {
      const res = await addOfficeIp(ip)
      if (res.error) { toast.error(res.error); return }
      setIps(prev => [...prev, ip.trim()])
      setNewIp('')
      toast.success(`${ip.trim()} 등록되었습니다.`)
    })
  }

  function handleRemoveIp(ip: string) {
    startTransition(async () => {
      const res = await removeOfficeIp(ip)
      if (res.error) { toast.error(res.error); return }
      setIps(prev => prev.filter(x => x !== ip))
      toast.success(`${ip} 삭제되었습니다.`)
    })
  }

  function handleSaveSchedule() {
    startTransition(async () => {
      const res = await updateWorkSchedule(startTime, endTime, lunchStart, lunchEnd)
      if (res.error) { toast.error(res.error); return }
      toast.success('근무시간이 저장되었습니다.')
    })
  }

  const currentIpAlreadyAdded = currentIp && ips.includes(currentIp)

  return (
    <div className="max-w-lg space-y-6">

      {/* 근무시간 설정 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">근무시간 설정</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">출근시간</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">퇴근시간</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">점심 시작</label>
            <input
              type="time"
              value={lunchStart}
              onChange={e => setLunchStart(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">점심 종료</label>
            <input
              type="time"
              value={lunchEnd}
              onChange={e => setLunchEnd(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          점심시간은 해당 시간대에 휴식 기록이 없을 경우 자동으로 차감됩니다.
        </p>
        <button
          type="button"
          onClick={handleSaveSchedule}
          disabled={isPending}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 근태 설정 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">근태 설정</h2>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">자리비움 자동 감지 시간</label>
          <div className="flex gap-2 flex-wrap">
            {INACTIVITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMinutes(opt.value)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  minutes === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            마지막 활동으로부터 설정된 시간 이상 비활동 시 자동으로 휴식이 기록됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveInactivity}
          disabled={isPending || minutes === inactivityMinutes}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>

        <div className="border-t border-gray-100 pt-4 space-y-2">
          <label className="text-sm text-gray-600">자동 휴식 감지 방식</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleBreakModeChange('frontend')}
              disabled={isPending}
              className={`flex-1 px-4 py-3 text-sm rounded-lg border transition-colors text-left space-y-0.5 ${
                breakMode === 'frontend'
                  ? 'bg-primary/5 border-primary text-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">프론트엔드</div>
              <div className="text-xs opacity-70">직원 화면에 휴식 알림 표시</div>
            </button>
            <button
              type="button"
              onClick={() => handleBreakModeChange('server')}
              disabled={isPending}
              className={`flex-1 px-4 py-3 text-sm rounded-lg border transition-colors text-left space-y-0.5 ${
                breakMode === 'server'
                  ? 'bg-primary/5 border-primary text-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">서버 사이드</div>
              <div className="text-xs opacity-70">Hidden 자동 기록</div>
            </button>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-2">
          <label className="text-sm text-gray-600">재택근무 인정 거리 (반경)</label>
          <div className="flex gap-2 flex-wrap">
            {RADIUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleRadiusChange(opt.value)}
                disabled={isPending}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  radiusM === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {radiusM === 0
              ? 'GPS 위치 제한 없이 재택 출근이 허용됩니다.'
              : `등록된 재택근무지 반경 ${radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`} 이내에서만 재택 출근이 인정됩니다.`}
          </p>
        </div>
      </div>

      {/* 사무실 IP 관리 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">사무실 IP 관리</h2>
        <p className="text-xs text-gray-400">
          등록된 IP에서 출근 시 사무실 근무로 인정됩니다. 여러 IP를 등록할 수 있습니다.
        </p>

        {currentIp && (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Wifi size={14} className="text-gray-400" />
              <span>현재 접속 IP</span>
              <span className="font-mono font-medium text-gray-800">{currentIp}</span>
            </div>
            {currentIpAlreadyAdded ? (
              <span className="text-xs text-green-600 font-medium">등록됨</span>
            ) : (
              <button
                type="button"
                onClick={() => handleAddIp(currentIp)}
                disabled={isPending}
                className="text-xs px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                추가
              </button>
            )}
          </div>
        )}

        {ips.length > 0 ? (
          <ul className="space-y-1.5">
            {ips.map(ip => (
              <li key={ip} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 bg-gray-50/50">
                <span className="font-mono text-sm text-gray-700">{ip}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveIp(ip)}
                  disabled={isPending}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 text-center py-3">등록된 사무실 IP가 없습니다.</p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddIp(newIp)}
            placeholder="IP 직접 입력 (예: 123.456.789.0)"
            className="flex-1 text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={() => handleAddIp(newIp)}
            disabled={isPending || !newIp.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
      </div>

      {/* Google Drive */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Google Drive</h2>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">보고서 저장 폴더 ID</label>
          <input
            type="text"
            placeholder="Google Drive 폴더 ID"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-gray-400">Drive URL에서 /folders/ 뒤의 ID를 입력하세요.</p>
        </div>
      </div>

      {/* Google Chat */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Google Chat</h2>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Webhook URL</label>
          <input
            type="url"
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-gray-400">결재 승인/반려 시 알림을 받을 Webhook URL을 입력하세요.</p>
        </div>
      </div>

    </div>
  )
}
```

- [ ] **Step 4: 커밋**

```bash
git add app/\(admin\)/admin/settings/actions.ts app/\(admin\)/admin/settings/page.tsx app/\(admin\)/admin/settings/GeneralSettingsClient.tsx
git commit -m "feat: add work schedule settings UI and updateWorkSchedule action"
```

- [ ] **Step 5: 브라우저 수동 검증**

`/admin/settings` 접속 → 최상단에 "근무시간 설정" 카드 확인 → 시간 변경 후 저장 → "근무시간이 저장되었습니다." 토스트 확인.

---

## Task 4: 근태현황 페이지 업데이트

**Files:**
- Modify: `app/(admin)/admin/attendance/page.tsx`

- [ ] **Step 1: attendance/page.tsx 전체 교체**

```ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  parseISO, eachDayOfInterval,
} from 'date-fns'
import AttendanceSummaryView from '@/components/admin/AttendanceSummaryView'
import { calcDaySummary, toKSTDate, WorkSchedule } from '@/lib/attendance/calc'

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; empId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const view = (['day', 'week', 'month'].includes(params.view ?? '') ? params.view : 'week') as 'day' | 'week' | 'month'
  const baseDate = params.date ? parseISO(params.date) : new Date()
  const selectedEmpId = params.empId ?? ''

  let rangeStart: Date, rangeEnd: Date
  if (view === 'day') {
    rangeStart = rangeEnd = baseDate
  } else if (view === 'week') {
    rangeStart = startOfWeek(baseDate, { weekStartsOn: 1 })
    rangeEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  } else {
    rangeStart = startOfMonth(baseDate)
    rangeEnd = endOfMonth(baseDate)
  }

  const fromStr = format(rangeStart, 'yyyy-MM-dd')
  const toStr = format(rangeEnd, 'yyyy-MM-dd')

  const [{ data: records }, { data: employees }, { data: leaveRecords }, { data: settingsData }] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('id, type, recorded_at, location, is_field, note, is_anomaly, employee_id, employees(id, name, email, department_id)')
      .gte('recorded_at', `${fromStr}T00:00:00+09:00`)
      .lte('recorded_at', `${toStr}T23:59:59+09:00`)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('employees')
      .select('id, name, email, department_id')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, reason')
      .eq('status', 'APPROVED')
      .gte('end_date', fromStr)
      .lte('start_date', toStr),
    supabase
      .from('company_settings')
      .select('work_start_time, work_end_time, lunch_start_time, lunch_end_time')
      .single(),
  ])

  const schedule: WorkSchedule = {
    workStartTime: settingsData?.work_start_time ?? '09:00',
    workEndTime: settingsData?.work_end_time ?? '18:00',
    lunchStartTime: settingsData?.lunch_start_time ?? '12:00',
    lunchEndTime: settingsData?.lunch_end_time ?? '13:00',
  }

  const dates = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(d => format(d, 'yyyy-MM-dd'))

  const byEmpDate = new Map<string, { type: string; recorded_at: string }[]>()
  for (const r of records ?? []) {
    const key = `${r.employee_id}:${toKSTDate(r.recorded_at)}`
    const list = byEmpDate.get(key) ?? []
    list.push(r)
    byEmpDate.set(key, list)
  }

  const empSummaries = new Map<string, { id: string; name: string; days: Record<string, ReturnType<typeof calcDaySummary>> }>()
  for (const emp of employees ?? []) {
    empSummaries.set(emp.id, { id: emp.id, name: emp.name, days: {} })
  }
  for (const [key, recs] of byEmpDate) {
    const [empId, date] = key.split(':')
    const entry = empSummaries.get(empId)
    if (entry) entry.days[date] = calcDaySummary(recs, schedule)
  }

  const allSummaries = Array.from(empSummaries.values())
  const displaySummaries = selectedEmpId
    ? allSummaries.filter(e => e.id === selectedEmpId)
    : allSummaries.filter(e => Object.keys(e.days).length > 0)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">근태 현황</h1>
      <AttendanceSummaryView
        view={view}
        baseDate={format(baseDate, 'yyyy-MM-dd')}
        dates={dates}
        employees={displaySummaries}
        allEmployees={(employees ?? []).map(e => ({ id: e.id, name: e.name }))}
        selectedEmpId={selectedEmpId}
        leaveRecords={leaveRecords ?? []}
        rawRecords={records ?? []}
        allEmployeesForEditor={employees ?? []}
      />
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(admin\)/admin/attendance/page.tsx
git commit -m "feat: use shared calcDaySummary with work schedule in attendance page"
```

---

## Task 5: AttendanceSummaryView — 지각/조퇴 배지 및 인디케이터

**Files:**
- Modify: `components/admin/AttendanceSummaryView.tsx`

- [ ] **Step 1: AttendanceSummaryView.tsx 전체 교체**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, parseISO, addDays, addWeeks, addMonths,
  startOfWeek, endOfWeek, getDay,
} from 'date-fns'
import AttendanceEditor from './AttendanceEditor'
import type { DaySummary } from '@/lib/attendance/calc'

type EmpSummary = {
  id: string
  name: string
  days: Record<string, DaySummary>
}

const LEAVE_ABBR: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전', PM_HALF: '오후',
  SICK: '병가', GROUP: '공동', COMP: '보상', OTHER: '기타',
}
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function fmtWork(min: number): string {
  if (min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function workColor(min: number): string {
  if (min >= 600) return 'text-red-600 font-semibold'
  if (min >= 540) return 'text-amber-600'
  return 'text-gray-700'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AttendanceSummaryView({
  view, baseDate, dates, employees, allEmployees, selectedEmpId,
  leaveRecords, rawRecords, allEmployeesForEditor,
}: {
  view: 'day' | 'week' | 'month'
  baseDate: string
  dates: string[]
  employees: EmpSummary[]
  allEmployees: { id: string; name: string }[]
  selectedEmpId: string
  leaveRecords: any[]
  rawRecords: any[]
  allEmployeesForEditor: any[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'summary' | 'detail'>('summary')
  const base = parseISO(baseDate)

  function push(v: string, d: string, emp: string) {
    const p = new URLSearchParams({ view: v, date: d })
    if (emp) p.set('empId', emp)
    router.push(`/admin/attendance?${p}`)
  }

  const prev = () => {
    const nb = view === 'day' ? addDays(base, -1) : view === 'week' ? addWeeks(base, -1) : addMonths(base, -1)
    push(view, format(nb, 'yyyy-MM-dd'), selectedEmpId)
  }
  const next = () => {
    const nb = view === 'day' ? addDays(base, 1) : view === 'week' ? addWeeks(base, 1) : addMonths(base, 1)
    push(view, format(nb, 'yyyy-MM-dd'), selectedEmpId)
  }

  const periodLabel = () => {
    if (view === 'day') return `${format(base, 'yyyy.MM.dd')} (${DAY_KO[getDay(base)]})`
    if (view === 'week') {
      const ws = startOfWeek(base, { weekStartsOn: 1 })
      const we = endOfWeek(base, { weekStartsOn: 1 })
      return `${format(ws, 'yyyy.MM.dd')} ~ ${format(we, 'MM.dd')}`
    }
    return format(base, 'yyyy년 MM월')
  }

  function getLeave(empId: string, date: string) {
    return leaveRecords.find((lr: any) =>
      lr.employee_id === empId && lr.start_date <= date && lr.end_date >= date
    )
  }

  const weekGroups: string[][] = []
  if (view === 'month') {
    let current: string[] = []
    for (const d of dates) {
      if (getDay(parseISO(d)) === 1 && current.length > 0) {
        weekGroups.push(current)
        current = []
      }
      current.push(d)
    }
    if (current.length > 0) weekGroups.push(current)
  }

  const weekLabel = (wDates: string[]) =>
    `${wDates[0].slice(5).replace('-', '/')}~${wDates[wDates.length - 1].slice(5).replace('-', '/')}`

  const colCount = view === 'day' ? 5 : view === 'week' ? dates.length + 2 : weekGroups.length + 2

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {(['day', 'week', 'month'] as const).map(v => (
            <button key={v} onClick={() => push(v, baseDate, selectedEmpId)}
              className={`px-3 py-1.5 transition-colors ${view === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {v === 'day' ? '일별' : v === 'week' ? '주별' : '월별'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">‹</button>
          <span className="text-sm font-medium text-gray-700 min-w-[168px] text-center">{periodLabel()}</span>
          <button onClick={next} className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">›</button>
        </div>

        <select value={selectedEmpId} onChange={e => push(view, baseDate, e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="">전체 직원</option>
          {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {(['summary', 'detail'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'summary' ? '근무 집계' : '상세 기록'}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          {/* Day view */}
          {view === 'day' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-3">직원</th>
                  <th className="px-4 py-3">출근</th>
                  <th className="px-4 py-3">퇴근</th>
                  <th className="px-4 py-3 text-right">휴식</th>
                  <th className="px-4 py-3 text-right">근무시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const ds = emp.days[dates[0]]
                  const leave = getLeave(emp.id, dates[0])
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      {leave && !ds ? (
                        <>
                          <td colSpan={3} className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{LEAVE_ABBR[leave.leave_type] ?? leave.leave_type}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">—</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 tabular-nums text-gray-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{ds?.checkIn ?? <span className="text-gray-300">—</span>}</span>
                              {ds?.lateMin > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 whitespace-nowrap">
                                  지각 +{ds.lateMin}분
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-gray-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{ds?.checkOut ?? <span className="text-gray-300">—</span>}</span>
                              {ds?.earlyLeaveMin > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-500 whitespace-nowrap">
                                  조퇴 -{ds.earlyLeaveMin}분
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-400 text-xs">{ds?.breakMin ? fmtWork(ds.breakMin) : '—'}</td>
                          <td className={`px-4 py-3 text-right tabular-nums ${ds ? workColor(ds.workMin) : 'text-gray-300'}`}>
                            {ds ? fmtWork(ds.workMin) : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Week view */}
          {view === 'week' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-3 sticky left-0 bg-white z-10">직원</th>
                  {dates.map(d => (
                    <th key={d} className="px-3 py-3 text-center min-w-[64px]">
                      <span className={getDay(parseISO(d)) === 0 || getDay(parseISO(d)) === 6 ? 'text-blue-400' : ''}>
                        {DAY_KO[getDay(parseISO(d))]}
                      </span>
                      <br />
                      <span className="text-gray-300 font-normal">{d.slice(5).replace('-', '/')}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const total = Object.values(emp.days).reduce((s, ds) => s + ds.workMin, 0)
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white z-10">{emp.name}</td>
                      {dates.map(d => {
                        const ds = emp.days[d]
                        const leave = getLeave(emp.id, d)
                        return (
                          <td key={d} className="px-2 py-3 text-center">
                            {ds ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`text-xs tabular-nums ${workColor(ds.workMin)}`}>{fmtWork(ds.workMin)}</span>
                                {(ds.lateMin > 0 || ds.earlyLeaveMin > 0) && (
                                  <div className="flex gap-0.5">
                                    {ds.lateMin > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={`지각 ${ds.lateMin}분`} />}
                                    {ds.earlyLeaveMin > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" title={`조퇴 ${ds.earlyLeaveMin}분`} />}
                                  </div>
                                )}
                              </div>
                            ) : leave ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 whitespace-nowrap">
                                {LEAVE_ABBR[leave.leave_type] ?? '휴가'}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-200">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className={`px-4 py-3 text-right tabular-nums font-medium text-sm ${total >= 52 * 60 ? 'text-red-600' : total > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                        {fmtWork(total)}
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Month view */}
          {view === 'month' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-3">직원</th>
                  {weekGroups.map(wg => (
                    <th key={wg[0]} className="px-3 py-3 text-center whitespace-nowrap">{weekLabel(wg)}</th>
                  ))}
                  <th className="px-4 py-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const total = Object.values(emp.days).reduce((s, ds) => s + ds.workMin, 0)
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      {weekGroups.map(wg => {
                        const weekMin = wg.reduce((s, d) => s + (emp.days[d]?.workMin ?? 0), 0)
                        const hasLate = wg.some(d => (emp.days[d]?.lateMin ?? 0) > 0)
                        const hasEarly = wg.some(d => (emp.days[d]?.earlyLeaveMin ?? 0) > 0)
                        return (
                          <td key={wg[0]} className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`tabular-nums text-xs ${weekMin >= 52 * 60 ? 'text-red-600 font-semibold' : weekMin > 0 ? 'text-gray-700' : 'text-gray-200'}`}>
                                {weekMin > 0 ? fmtWork(weekMin) : '—'}
                              </span>
                              {(hasLate || hasEarly) && (
                                <div className="flex gap-0.5">
                                  {hasLate && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="지각 있음" />}
                                  {hasEarly && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" title="조퇴 있음" />}
                                </div>
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${total > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                        {fmtWork(total)}
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'detail' && (
        <AttendanceEditor
          records={rawRecords}
          employees={allEmployeesForEditor}
          leaveRecords={leaveRecords}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/admin/AttendanceSummaryView.tsx
git commit -m "feat: show late/early leave badges and indicators in attendance view"
```

- [ ] **Step 3: 브라우저 수동 검증**

`/admin/attendance?view=day` → 지각/조퇴가 있는 직원 행에서:
- 출근 시간 옆 빨간 "지각 +N분" 배지 확인
- 퇴근 시간 옆 주황 "조퇴 -N분" 배지 확인

`?view=week` → 해당 날짜 셀 아래 빨간/주황 dot 확인

---

## Task 6: 52시간 리포트 — 지각/조퇴 횟수 컬럼

**Files:**
- Modify: `app/(admin)/admin/reports/page.tsx`

- [ ] **Step 1: reports/page.tsx 전체 교체**

```ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, startOfWeek, endOfWeek, parseISO, addWeeks } from 'date-fns'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { calcDaySummary, toKSTDate, WorkSchedule } from '@/lib/attendance/calc'

function fmtHM(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; group?: string; weekStart?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const selectedTeam = params.team ?? ''
  const selectedGroup = params.group ?? ''

  const weekStartDate = params.weekStart
    ? parseISO(params.weekStart)
    : startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekStart = format(weekStartDate, 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(weekStartDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const prevWeek = format(addWeeks(weekStartDate, -1), 'yyyy-MM-dd')
  const nextWeek = format(addWeeks(weekStartDate, 1), 'yyyy-MM-dd')

  const [{ data: groups }, { data: allTeams }, { data: records }, { data: settingsData }] = await Promise.all([
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
    supabase
      .from('attendance_records')
      .select('employee_id, type, recorded_at, employees(id, name, email, department_id)')
      .gte('recorded_at', `${weekStart}T00:00:00+09:00`)
      .lte('recorded_at', `${weekEnd}T23:59:59+09:00`)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('company_settings')
      .select('work_start_time, work_end_time, lunch_start_time, lunch_end_time')
      .single(),
  ])

  const schedule: WorkSchedule = {
    workStartTime: settingsData?.work_start_time ?? '09:00',
    workEndTime: settingsData?.work_end_time ?? '18:00',
    lunchStartTime: settingsData?.lunch_start_time ?? '12:00',
    lunchEndTime: settingsData?.lunch_end_time ?? '13:00',
  }

  const teams = selectedGroup
    ? (allTeams ?? []).filter(t => t.group_id === selectedGroup)
    : (allTeams ?? [])

  type RecordRow = NonNullable<typeof records>[number]

  const hoursMap = new Map<string, {
    name: string
    email: string
    teamId: string | null
    workMinutes: number
    breakMinutes: number
    lateCount: number
    earlyLeaveCount: number
  }>()

  for (const r of records ?? []) {
    const emp = r.employees as unknown as { id: string; name: string; email: string; department_id: string | null } | null
    if (!emp) continue
    if (selectedTeam && emp.department_id !== selectedTeam) continue
    if (selectedGroup && !teams.some(t => t.id === emp.department_id)) continue
    if (!hoursMap.has(r.employee_id)) {
      hoursMap.set(r.employee_id, { name: emp.name, email: emp.email, teamId: emp.department_id, workMinutes: 0, breakMinutes: 0, lateCount: 0, earlyLeaveCount: 0 })
    }
  }

  const byEmployeeDay = new Map<string, RecordRow[]>()
  for (const r of records ?? []) {
    const emp = r.employees as unknown as { id: string; name: string; email: string; department_id: string | null } | null
    if (!emp) continue
    if (selectedTeam && emp.department_id !== selectedTeam) continue
    if (selectedGroup && !teams.some(t => t.id === emp.department_id)) continue
    const kstDate = toKSTDate(r.recorded_at)
    const key = `${r.employee_id}:${kstDate}`
    const list = byEmployeeDay.get(key) ?? []
    list.push(r)
    byEmployeeDay.set(key, list)
  }

  for (const [key, recs] of byEmployeeDay) {
    const empId = key.split(':')[0]
    const entry = hoursMap.get(empId)
    if (!entry) continue
    const ds = calcDaySummary(recs, schedule)
    entry.workMinutes += ds.workMin
    entry.breakMinutes += ds.breakMin
    if (ds.lateMin > 0) entry.lateCount += 1
    if (ds.earlyLeaveMin > 0) entry.earlyLeaveCount += 1
  }

  const sorted = Array.from(hoursMap.entries())
    .filter(([, v]) => v.workMinutes > 0)
    .sort((a, b) => b[1].workMinutes - a[1].workMinutes)

  const overLimit = sorted.filter(([, v]) => v.workMinutes > 52 * 60)

  function buildUrl(team: string, group: string, ws = weekStart) {
    const p = new URLSearchParams({ weekStart: ws })
    if (team) p.set('team', team)
    if (group) p.set('group', group)
    return `/admin/reports?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">52시간 리포트</h1>
        <Link
          href={`/api/reports/excel?from=${weekStart}&to=${weekEnd}${selectedTeam ? `&team=${selectedTeam}` : ''}`}
          className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={15} /> Excel 다운로드
        </Link>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Link href={buildUrl(selectedTeam, selectedGroup, prevWeek)}
          className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">
          ‹
        </Link>
        <span className="text-sm font-medium text-gray-700">{weekStart} ~ {weekEnd}</span>
        <Link href={buildUrl(selectedTeam, selectedGroup, nextWeek)}
          className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">
          ›
        </Link>
      </div>

      {/* Group / Team filter */}
      <div className="flex flex-wrap gap-2">
        <Link href={buildUrl('', '')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!selectedGroup && !selectedTeam ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-primary hover:text-primary'}`}>
          전체
        </Link>
        {(groups ?? []).map(g => (
          <Link key={g.id} href={buildUrl('', g.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedGroup === g.id && !selectedTeam ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-primary hover:text-primary'}`}>
            {g.name}
          </Link>
        ))}
        {selectedGroup && teams.map(t => (
          <Link key={t.id} href={buildUrl(t.id, selectedGroup)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedTeam === t.id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}>
            {t.name}
          </Link>
        ))}
      </div>

      {overLimit.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          이번 주 52시간 초과 직원 <strong>{overLimit.length}명</strong>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3 text-right">순 근무시간</th>
              <th className="px-4 py-3 text-right">휴식시간</th>
              <th className="px-4 py-3 text-right">지각</th>
              <th className="px-4 py-3 text-right">조퇴</th>
              <th className="px-4 py-3 text-right">초과</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map(([empId, v]) => {
              const over = v.workMinutes - 52 * 60
              const team = allTeams?.find(t => t.id === v.teamId)
              return (
                <tr key={empId} className={over > 0 ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{team?.name ?? '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${over > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {fmtHM(v.workMinutes)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                    {v.breakMinutes > 0 ? fmtHM(v.breakMinutes) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {v.lateCount > 0
                      ? <span className="text-red-500">{v.lateCount}회</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {v.earlyLeaveCount > 0
                      ? <span className="text-orange-500">{v.earlyLeaveCount}회</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {over > 0
                      ? <span className="text-red-500">+{fmtHM(over)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  해당 주간 근무 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/\(admin\)/admin/reports/page.tsx
git commit -m "feat: add late/early leave counts to 52-hour report"
```

- [ ] **Step 3: 브라우저 수동 검증**

`/admin/reports` → 테이블에 "지각"·"조퇴" 컬럼 표시 확인. 해당 주에 지각/조퇴 기록이 있는 직원의 경우 빨간/주황 N회 표시 확인.

---

## 최종 TypeScript 빌드 확인

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 오류 없이 완료.
