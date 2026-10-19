# 주간회의 (Weekly Meeting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀장/관리자가 팀별 주간회의를 입력·확인하는 기능을 신청/결재 메뉴 하단에 추가한다.

**Architecture:** Supabase `weekly_meetings` 테이블에 주별·팀별 1개 레코드를 저장한다. 팀장은 본인 팀 미확인 레코드만 upsert 가능하며, 관리자가 최종확인(`is_confirmed=true`)하면 해당 주 전체가 잠겨 팀장은 수정·신규입력 불가, 관리자만 수정 가능하다. 서버 컴포넌트(page.tsx)가 데이터 로드와 권한 체크를 담당하고, 클라이언트 컴포넌트(WeeklyMeetingClient)가 주 네비게이션과 인라인 폼 상태를 관리한다.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Supabase (PostgreSQL + RLS + RPC), TypeScript, Tailwind CSS, Lucide React, sonner(toast)

## Global Constraints

- KST 기준 날짜: `new Date(Date.now() + 9 * 3600000)`
- 서버 액션: `'use server'`, `createClient()` from `@/lib/supabase/server`
- 캐시 무효화: `revalidatePath('/approval/weekly-meeting')`
- `export const dynamic = 'force-dynamic'` — page.tsx에 필수
- 다음 마이그레이션 번호: **093** (현재 최신: 092_attendance_insert_admin.sql)
- 아이콘: `lucide-react` (기존 Sidebar 임포트 패턴 준수)
- 스타일: `bg-white rounded-xl border border-gray-100 p-4` (프로젝트 기존 패턴)
- toast: `import { toast } from 'sonner'`
- 팀 정렬: `departments.sort_order` ASC, 동순위는 name ASC

---

## Task 1: DB Migration — weekly_meetings 테이블 및 sort_order

**Files:**
- Create: `supabase/migrations/093_weekly_meetings.sql`

**Interfaces:**
- Produces:
  - `weekly_meetings` 테이블 (week_start, department_id, this_week, next_week, issues, submitted_by, is_confirmed, confirmed_by, confirmed_at)
  - `departments.sort_order` 컬럼 (기획1팀=1, 기획2팀=2, 기획3팀=3, 커머스팀=4, 나머지=99)
  - RPC `confirm_weekly_meetings(p_week_start DATE)`
  - RLS: SELECT (팀장|ADMIN), INSERT (본인팀장|ADMIN), UPDATE (미확인+본인팀장|ADMIN)

- [ ] **Step 1: 마이그레이션 파일 생성**

`supabase/migrations/093_weekly_meetings.sql` 전체 내용:

```sql
-- 1. departments 팀 정렬 순서
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 99;

UPDATE departments SET sort_order = CASE name
  WHEN '기획1팀' THEN 1
  WHEN '기획2팀' THEN 2
  WHEN '기획3팀' THEN 3
  WHEN '커머스팀' THEN 4
  ELSE 99
END;

-- 2. weekly_meetings 테이블
CREATE TABLE weekly_meetings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    DATE        NOT NULL,
  department_id UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  this_week     TEXT,
  next_week     TEXT,
  issues        TEXT,
  submitted_by  UUID        REFERENCES employees(id),
  is_confirmed  BOOLEAN     NOT NULL DEFAULT false,
  confirmed_by  UUID        REFERENCES employees(id),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, department_id)
);

ALTER TABLE weekly_meetings ENABLE ROW LEVEL SECURITY;

-- SELECT: 팀장 또는 관리자만
CREATE POLICY "weekly_meetings_select"
  ON weekly_meetings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid()
        AND is_active = true
        AND (role = 'ADMIN' OR position = '팀장')
    )
  );

-- INSERT: 관리자 또는 본인 팀 팀장 (해당 주 미확인 시)
CREATE POLICY "weekly_meetings_insert"
  ON weekly_meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin() OR (
      department_id = (
        SELECT department_id FROM employees
        WHERE auth_user_id = auth.uid()
          AND position = '팀장'
          AND is_active = true
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM weekly_meetings wm2
        WHERE wm2.week_start = weekly_meetings.week_start
          AND wm2.is_confirmed = true
      )
    )
  );

-- UPDATE: 관리자 또는 미확인 레코드 + 본인 팀 팀장
CREATE POLICY "weekly_meetings_update"
  ON weekly_meetings FOR UPDATE
  TO authenticated
  USING (
    is_admin() OR (
      is_confirmed = false AND
      department_id = (
        SELECT department_id FROM employees
        WHERE auth_user_id = auth.uid()
          AND position = '팀장'
          AND is_active = true
        LIMIT 1
      )
    )
  )
  WITH CHECK (
    is_admin() OR
    department_id = (
      SELECT department_id FROM employees
      WHERE auth_user_id = auth.uid()
        AND position = '팀장'
        AND is_active = true
      LIMIT 1
    )
  );

-- 3. 최종확인 RPC (관리자 전용)
CREATE OR REPLACE FUNCTION confirm_weekly_meetings(p_week_start DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  v_employee_id := get_my_employee_id();
  UPDATE weekly_meetings
  SET
    is_confirmed = true,
    confirmed_by = v_employee_id,
    confirmed_at = now()
  WHERE week_start = p_week_start;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_weekly_meetings(DATE) TO authenticated;
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase Dashboard → SQL Editor에서 위 SQL 실행 (또는 `supabase db push`).

- [ ] **Step 3: 결과 확인**

Supabase Dashboard → Table Editor에서:
1. `departments` 테이블에 `sort_order` 컬럼이 생겼고, 기획1팀=1, 기획2팀=2 등으로 설정됐는지 확인
2. `weekly_meetings` 테이블이 생성됐는지 확인
3. RLS 정책 3개가 활성화됐는지 확인

---

## Task 2: lib/holidays.ts — 공휴일 및 주간 유틸

**Files:**
- Create: `lib/holidays.ts`

**Interfaces:**
- Produces:
  - `getWeekStart(date: Date): Date` — 해당 날짜가 속한 주의 월요일(UTC) 반환
  - `getWeekLabelDate(mondayDate: Date): Date` — 월요일이 공휴일이면 다음 영업일 반환
  - `formatWeekLabel(date: Date): string` — "10월 20일(월)" 형식
  - `toDateString(date: Date): string` — "YYYY-MM-DD" 형식

- [ ] **Step 1: lib/holidays.ts 생성**

```typescript
// 한국 법정 공휴일 2025~2027 (대체공휴일 포함, 매년 갱신 필요)
const HOLIDAYS: string[] = [
  // 2025
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01',
  '2025-05-05', '2025-05-06',
  '2025-05-15',
  '2025-06-06',
  '2025-08-15',
  '2025-10-03',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  '2025-10-09',
  '2025-12-25',
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01', '2026-03-02',
  '2026-05-05',
  '2026-05-24',
  '2026-06-06',
  '2026-08-15', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-10-03', '2026-10-05',
  '2026-10-09',
  '2026-12-25',
  // 2027
  '2027-01-01',
  '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
  '2027-03-01',
  '2027-05-05',
  '2027-05-13',
  '2027-06-06',
  '2027-08-15', '2027-08-16',
  '2027-10-03',
  '2027-10-14', '2027-10-15', '2027-10-16',
  '2027-10-09',
  '2027-12-25',
]

const HOLIDAY_SET = new Set(HOLIDAYS)

/** 주어진 날짜가 속한 주의 월요일(UTC 기준) 반환 */
export function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

/** 월요일이 공휴일이면 화~금 중 첫 번째 평일 반환. 모두 공휴일이면 월요일 원본 반환. */
export function getWeekLabelDate(mondayDate: Date): Date {
  for (let i = 0; i < 5; i++) {
    const d = new Date(mondayDate)
    d.setUTCDate(d.getUTCDate() + i)
    if (!HOLIDAY_SET.has(d.toISOString().slice(0, 10))) return d
  }
  return new Date(mondayDate)
}

/** "10월 20일(월)" 형식 반환 */
export function formatWeekLabel(date: Date): string {
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const names = ['일', '월', '화', '수', '목', '금', '토']
  return `${month}월 ${day}일(${names[date.getUTCDay()]})`
}

/** Date → "YYYY-MM-DD" 문자열 */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```powershell
git add lib/holidays.ts
git commit -m "feat: 한국 공휴일 유틸 및 주간 날짜 계산 함수 추가"
```

---

## Task 3: Server Actions — upsertWeeklyMeeting, confirmWeeklyMeeting

**Files:**
- Create: `app/(dashboard)/approval/weekly-meeting/actions.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `revalidatePath` from `next/cache`
- Produces:
  - `upsertWeeklyMeeting(input: UpsertInput): Promise<{ error: string | null }>`
  - `confirmWeeklyMeeting(weekStart: string): Promise<{ error: string | null }>`

- [ ] **Step 1: 디렉토리 생성 및 actions.ts 작성**

`app/(dashboard)/approval/weekly-meeting/actions.ts` 전체 내용:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type UpsertWeeklyMeetingInput = {
  weekStart: string
  departmentId: string
  thisWeek: string
  nextWeek: string
  issues: string
}

export async function upsertWeeklyMeeting(input: UpsertWeeklyMeetingInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, position, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) return { error: '직원 정보를 찾을 수 없습니다.' }

  const isAdmin = employee.role === 'ADMIN'
  const isTeamLead = employee.position === '팀장'

  if (!isAdmin && !isTeamLead) return { error: '권한이 없습니다.' }
  if (!isAdmin && employee.department_id !== input.departmentId)
    return { error: '본인 팀의 주간회의만 수정할 수 있습니다.' }

  // 팀장: 해당 주에 이미 관리자가 확인했으면 차단
  if (!isAdmin) {
    const { data: confirmed } = await supabase
      .from('weekly_meetings')
      .select('id')
      .eq('week_start', input.weekStart)
      .eq('is_confirmed', true)
      .limit(1)
    if (confirmed && confirmed.length > 0)
      return { error: '관리자가 최종확인한 주간회의는 수정할 수 없습니다.' }
  }

  const { error } = await supabase
    .from('weekly_meetings')
    .upsert(
      {
        week_start: input.weekStart,
        department_id: input.departmentId,
        this_week: input.thisWeek,
        next_week: input.nextWeek,
        issues: input.issues,
        submitted_by: employee.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'week_start,department_id' },
    )

  if (error) return { error: error.message }

  revalidatePath('/approval/weekly-meeting')
  return { error: null }
}

export async function confirmWeeklyMeeting(weekStart: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.rpc('confirm_weekly_meetings', {
    p_week_start: weekStart,
  })

  if (error) return { error: error.message }

  revalidatePath('/approval/weekly-meeting')
  return { error: null }
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```powershell
git add "app/(dashboard)/approval/weekly-meeting/actions.ts"
git commit -m "feat: 주간회의 서버 액션 추가 (upsert, confirm)"
```

---

## Task 4: WeeklyMeetingForm.tsx — 인라인 입력 폼

**Files:**
- Create: `app/(dashboard)/approval/weekly-meeting/WeeklyMeetingForm.tsx`

**Interfaces:**
- Consumes: `upsertWeeklyMeeting` from `./actions`
- Props:
  ```typescript
  {
    weekStart: string
    department: { id: string; name: string }
    initialData: { thisWeek: string; nextWeek: string; issues: string } | null
    onClose: () => void
  }
  ```

- [ ] **Step 1: WeeklyMeetingForm.tsx 작성**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertWeeklyMeeting } from './actions'

type Props = {
  weekStart: string
  department: { id: string; name: string }
  initialData: { thisWeek: string; nextWeek: string; issues: string } | null
  onClose: () => void
}

export default function WeeklyMeetingForm({ weekStart, department, initialData, onClose }: Props) {
  const [thisWeek, setThisWeek] = useState(initialData?.thisWeek ?? '')
  const [nextWeek, setNextWeek] = useState(initialData?.nextWeek ?? '')
  const [issues, setIssues] = useState(initialData?.issues ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      const result = await upsertWeeklyMeeting({
        weekStart,
        departmentId: department.id,
        thisWeek,
        nextWeek,
        issues,
      })
      if (result.error) { toast.error(result.error); return }
      toast.success('저장되었습니다.')
      onClose()
    })
  }

  const textareaClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-primary/50'

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">이번 주 진행사항</label>
        <textarea
          value={thisWeek}
          onChange={e => setThisWeek(e.target.value)}
          rows={3}
          placeholder="이번 주 팀 진행사항을 입력하세요"
          className={textareaClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">다음 주 계획</label>
        <textarea
          value={nextWeek}
          onChange={e => setNextWeek(e.target.value)}
          rows={3}
          placeholder="다음 주 팀 계획을 입력하세요"
          className={textareaClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">
          이슈/공유사항{' '}
          <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <textarea
          value={issues}
          onChange={e => setIssues(e.target.value)}
          rows={2}
          placeholder="이슈 또는 공유사항이 있으면 입력하세요"
          className={textareaClass}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || (!thisWeek.trim() && !nextWeek.trim())}
          className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```powershell
git add "app/(dashboard)/approval/weekly-meeting/WeeklyMeetingForm.tsx"
git commit -m "feat: 주간회의 인라인 입력 폼 컴포넌트 추가"
```

---

## Task 5: WeeklyMeetingClient.tsx — 주 네비게이션 및 팀 카드

**Files:**
- Create: `app/(dashboard)/approval/weekly-meeting/WeeklyMeetingClient.tsx`

**Interfaces:**
- Consumes:
  - `WeeklyMeetingForm` from `./WeeklyMeetingForm`
  - `confirmWeeklyMeeting` from `./actions`
  - `toDateString` from `@/lib/holidays`
- Props:
  ```typescript
  {
    weekStart: string        // "YYYY-MM-DD" 해당 주 월요일
    weekLabel: string        // "10월 20일(월)"
    prevWeekStart: string    // "YYYY-MM-DD"
    nextWeekStart: string    // "YYYY-MM-DD"
    currentWeekStart: string // 오늘 기준 이번 주 월요일
    departments: Array<{ id: string; name: string; sort_order: number }>
    meetings: Array<{
      id: string
      department_id: string
      this_week: string | null
      next_week: string | null
      issues: string | null
      is_confirmed: boolean
      confirmed_at: string | null
    }>
    isAdmin: boolean
    myDepartmentId: string | null
  }
  ```

- [ ] **Step 1: WeeklyMeetingClient.tsx 작성**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, CheckCircle2, Clock, PenLine,
} from 'lucide-react'
import { confirmWeeklyMeeting } from './actions'
import WeeklyMeetingForm from './WeeklyMeetingForm'

type Department = { id: string; name: string; sort_order: number }
type Meeting = {
  id: string
  department_id: string
  this_week: string | null
  next_week: string | null
  issues: string | null
  is_confirmed: boolean
  confirmed_at: string | null
}

type Props = {
  weekStart: string
  weekLabel: string
  prevWeekStart: string
  nextWeekStart: string
  currentWeekStart: string
  departments: Department[]
  meetings: Meeting[]
  isAdmin: boolean
  myDepartmentId: string | null
}

export default function WeeklyMeetingClient({
  weekStart, weekLabel, prevWeekStart, nextWeekStart, currentWeekStart,
  departments, meetings, isAdmin, myDepartmentId,
}: Props) {
  const router = useRouter()
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [isConfirming, startConfirmTransition] = useTransition()

  const meetingMap = new Map(meetings.map(m => [m.department_id, m]))
  const isConfirmed = meetings.some(m => m.is_confirmed)
  const isCurrentWeek = weekStart === currentWeekStart
  const confirmedMeeting = meetings.find(m => m.is_confirmed && m.confirmed_at)

  function navigate(week: string) {
    router.push(`/approval/weekly-meeting?week=${week}`)
  }

  function handleConfirm() {
    startConfirmTransition(async () => {
      const result = await confirmWeeklyMeeting(weekStart)
      if (result.error) { toast.error(result.error); return }
      toast.success('최종 확인되었습니다.')
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* 주 네비게이션 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(prevWeekStart)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-semibold text-gray-900">{weekLabel} 주간회의</h1>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => navigate(currentWeekStart)}
              className="text-xs text-primary hover:underline mt-0.5"
            >
              이번 주로
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(nextWeekStart)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 팀별 카드 */}
      <div className="space-y-2">
        {departments.map(dept => {
          const meeting = meetingMap.get(dept.id)
          const hasMeeting = !!meeting
          const canEdit = isAdmin || (!isConfirmed && myDepartmentId === dept.id)
          const isEditing = editingDeptId === dept.id

          return (
            <div key={dept.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{dept.name}</span>
                  {hasMeeting ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={11} />
                      입력완료
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Clock size={11} />
                      미입력
                    </span>
                  )}
                </div>
                {canEdit && !isEditing && (
                  <button
                    type="button"
                    onClick={() => setEditingDeptId(dept.id)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary border border-gray-200 rounded-lg px-2 py-1 transition-colors"
                  >
                    <PenLine size={11} />
                    {hasMeeting ? '수정' : '입력'}
                  </button>
                )}
              </div>

              {/* 내용 표시 */}
              {hasMeeting && !isEditing && (
                <div className="mt-3 space-y-3 text-sm text-gray-700">
                  {meeting.this_week && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">이번 주 진행사항</p>
                      <p className="whitespace-pre-wrap">{meeting.this_week}</p>
                    </div>
                  )}
                  {meeting.next_week && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">다음 주 계획</p>
                      <p className="whitespace-pre-wrap">{meeting.next_week}</p>
                    </div>
                  )}
                  {meeting.issues && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">이슈/공유사항</p>
                      <p className="whitespace-pre-wrap">{meeting.issues}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 인라인 수정 폼 */}
              {isEditing && (
                <WeeklyMeetingForm
                  weekStart={weekStart}
                  department={dept}
                  initialData={meeting ? {
                    thisWeek: meeting.this_week ?? '',
                    nextWeek: meeting.next_week ?? '',
                    issues: meeting.issues ?? '',
                  } : null}
                  onClose={() => setEditingDeptId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* 관리자 최종확인 */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          {isConfirmed && confirmedMeeting ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 size={16} />
              <span>
                관리자 확인 완료 ·{' '}
                {new Date(confirmedMeeting.confirmed_at!).toLocaleString('ko-KR', {
                  month: 'numeric', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirming || meetings.length === 0}
              className="w-full py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isConfirming ? '처리 중...' : '최종 확인'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```powershell
git add "app/(dashboard)/approval/weekly-meeting/WeeklyMeetingClient.tsx"
git commit -m "feat: 주간회의 메인 클라이언트 컴포넌트 추가"
```

---

## Task 6: page.tsx — 서버 컴포넌트

**Files:**
- Create: `app/(dashboard)/approval/weekly-meeting/page.tsx`

**Interfaces:**
- Consumes:
  - `getWeekStart`, `getWeekLabelDate`, `formatWeekLabel`, `toDateString` from `@/lib/holidays`
  - `WeeklyMeetingClient` from `./WeeklyMeetingClient`
  - `createClient` from `@/lib/supabase/server`
- Produces: 페이지 렌더링 (팀장/ADMIN만 접근, 그 외 `/approval/my` 리다이렉트)

- [ ] **Step 1: page.tsx 작성**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getWeekStart, getWeekLabelDate, formatWeekLabel, toDateString,
} from '@/lib/holidays'
import WeeklyMeetingClient from './WeeklyMeetingClient'

export const dynamic = 'force-dynamic'

export default async function WeeklyMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, position, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const isAdmin = employee.role === 'ADMIN'
  const isTeamLead = employee.position === '팀장'
  if (!isAdmin && !isTeamLead) redirect('/approval/my')

  const today = new Date(Date.now() + 9 * 3600000)
  const currentMonday = getWeekStart(today)
  const currentWeekStart = toDateString(currentMonday)

  const params = await searchParams
  const weekDate = params.week
    ? (() => { const d = new Date(params.week! + 'T00:00:00Z'); return isNaN(d.getTime()) ? currentMonday : d })()
    : currentMonday
  const weekStart = toDateString(getWeekStart(weekDate))

  const labelDate = getWeekLabelDate(new Date(weekStart + 'T00:00:00Z'))
  const weekLabel = formatWeekLabel(labelDate)

  const prevDate = new Date(weekStart + 'T00:00:00Z')
  prevDate.setUTCDate(prevDate.getUTCDate() - 7)

  const nextDate = new Date(weekStart + 'T00:00:00Z')
  nextDate.setUTCDate(nextDate.getUTCDate() + 7)

  const [{ data: departments }, { data: meetings }] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name, sort_order')
      .order('sort_order')
      .order('name'),
    supabase
      .from('weekly_meetings')
      .select('id, department_id, this_week, next_week, issues, is_confirmed, confirmed_at')
      .eq('week_start', weekStart),
  ])

  return (
    <WeeklyMeetingClient
      weekStart={weekStart}
      weekLabel={weekLabel}
      prevWeekStart={toDateString(prevDate)}
      nextWeekStart={toDateString(nextDate)}
      currentWeekStart={currentWeekStart}
      departments={departments ?? []}
      meetings={meetings ?? []}
      isAdmin={isAdmin}
      myDepartmentId={employee.department_id ?? null}
    />
  )
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```powershell
git add "app/(dashboard)/approval/weekly-meeting/page.tsx"
git commit -m "feat: 주간회의 서버 페이지 컴포넌트 추가"
```

---

## Task 7: Sidebar 업데이트 — 주간회의 메뉴 항목 추가

**Files:**
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: 기존 `isTeamLead`, `isAdmin` 상태 변수 (이미 정의됨)
- Produces: 신청/결재 그룹 맨 아래에 `주간회의` 메뉴 항목 추가 (팀장 또는 ADMIN에게만 표시)

- [ ] **Step 1: Sidebar.tsx 임포트에 Users 아이콘 추가**

파일 상단 lucide-react 임포트에 `Users` 추가 (이미 있으면 생략):

```typescript
import {
  Clock, FileText, BarChart2, Users, ClipboardList, Home,
  Bell, FilePlus, CalendarDays, Settings, Megaphone, Inbox,
  Receipt, Package, Loader2, X, BookOpen, FileBarChart, Monitor,
  CreditCard, Activity,
} from 'lucide-react'
```

(`Users`는 이미 임포트되어 있음 — 확인 후 중복 추가 금지)

- [ ] **Step 2: employeeNavGroups의 신청/결재 그룹에 주간회의 항목 추가**

기존 `신청/결재` 그룹 코드를 다음으로 교체:

```typescript
{
  label: '신청/결재',
  items: [
    { href: '/approval/expense/new', label: '지출결의', icon: FileText, exact: true },
    { href: '/approval/personal/new', label: '경비정산', icon: FileText, exact: true },
    { href: '/documents', label: '서류/비품 신청', icon: Package, exact: false },
    { href: '/approval/my', label: '내 신청 내역', icon: Inbox, exact: false },
    ...((isTeamLead || isSupplyManager) && !isAdmin
      ? [{ href: '/approval/pending', label: '결재 관리', icon: ClipboardList, exact: false, badge: pendingCount }]
      : []),
    ...(isTeamLead || isAdmin
      ? [{ href: '/approval/weekly-meeting', label: '주간회의', icon: Users, exact: false }]
      : []),
  ],
},
```

- [ ] **Step 3: 빌드 확인**

```powershell
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋 및 푸시**

```powershell
git add components/layout/Sidebar.tsx
git commit -m "feat: 사이드바 신청/결재 그룹에 주간회의 메뉴 추가"
git push origin main
```

---

## Self-Review

**Spec coverage 체크:**
- ✅ 신청/결재 메뉴 하단 주간회의 추가 → Task 7
- ✅ 팀장 본인 팀 입력/수정 → Task 1(RLS) + Task 3(actions)
- ✅ 해당 주 월요일 날짜 라벨 (공휴일→다음 영업일) → Task 2
- ✅ 팀별 취합 뷰, sort_order 정렬 → Task 1 + Task 5 + Task 6
- ✅ 팀 순서 기획1/2/3팀→커머스팀→기타 → Task 1 (sort_order)
- ✅ 관리자 최종확인 버튼 → Task 5
- ✅ 확인 후 팀장 수정 잠금 → Task 1(RLS INSERT) + Task 3(서버사이드 체크)
- ✅ 확인 후 관리자만 수정 가능 → Task 1(RLS UPDATE `is_admin()`)
- ✅ 입력/미입력 상태 표시 → Task 5
- ✅ 3개 섹션 구조 (이번 주/다음 주/이슈) → Task 4

**타입 일관성 체크:**
- `upsertWeeklyMeeting` 입력 타입: `{ weekStart, departmentId, thisWeek, nextWeek, issues }` → Task 3 정의, Task 4에서 동일하게 호출 ✅
- `confirmWeeklyMeeting(weekStart: string)` → Task 3 정의, Task 5에서 동일하게 호출 ✅
- `Department`, `Meeting` 타입: Task 5에서 정의, Task 6의 props가 Supabase 쿼리 결과와 일치 ✅
- `toDateString(date: Date): string` → Task 2 정의, Task 6에서 사용 ✅
