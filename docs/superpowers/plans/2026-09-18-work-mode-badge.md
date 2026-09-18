# Work Mode Badge 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 근태 현황 일별 뷰에서 직원별 출근 유형(사무실/재택/외근)과 현재 외근 상태(외근중) 배지를 직원 이름 셀에 표시한다.

**Architecture:** `components/admin/AttendanceSummaryView.tsx` 단일 파일에 `getWorkMode` 순수 함수와 배지 상수를 추가한다. `rawRecords` prop이 이미 `is_field`와 `note`를 포함하므로 DB/API 변경 없이 구현한다.

**Tech Stack:** React (TypeScript), Tailwind CSS, `toKSTDate` from `@/lib/attendance/calc`

## Global Constraints

- 일별 뷰(`view === 'day'`)만 변경, 주별/월별 뷰 수정 금지
- DB 쿼리, API 엔드포인트, migration 변경 없음
- 배지 스타일은 기존 뱃지 패턴(`text-xs px-1.5 py-0.5 rounded`) 유지
- TypeScript strict 모드 통과 필수: `npx tsc --noEmit 2>&1 | head -20`

---

### Task 1: `getWorkMode` 헬퍼 + 배지 상수 추가

**Files:**
- Modify: `components/admin/AttendanceSummaryView.tsx`

**Interfaces:**
- Produces:
  ```typescript
  type WorkModeResult = {
    checkInType: 'office' | 'remote' | 'field' | null
    isCurrentlyField: boolean
  }
  function getWorkMode(empId: string, date: string, rawRecords: any[]): WorkModeResult
  
  const WORK_MODE_LABEL: Record<'office' | 'remote' | 'field', string>
  const WORK_MODE_STYLE: Record<'office' | 'remote' | 'field', string>
  ```

- [ ] **Step 1: `toKSTDate` import 추가**

  `components/admin/AttendanceSummaryView.tsx` 상단 import를 다음으로 교체한다.

  ```typescript
  // 변경 전
  import type { DaySummary } from '@/lib/attendance/calc'
  
  // 변경 후
  import type { DaySummary } from '@/lib/attendance/calc'
  import { toKSTDate } from '@/lib/attendance/calc'
  ```

- [ ] **Step 2: 배지 상수 추가**

  파일 내 `LEAVE_ABBR` 상수 아래에 추가한다.

  ```typescript
  const WORK_MODE_LABEL: Record<'office' | 'remote' | 'field', string> = {
    office: '사무실',
    remote: '재택',
    field: '외근',
  }
  const WORK_MODE_STYLE: Record<'office' | 'remote' | 'field', string> = {
    office: 'bg-blue-50 text-blue-600',
    remote: 'bg-purple-50 text-purple-600',
    field: 'bg-orange-50 text-orange-600',
  }
  ```

- [ ] **Step 3: `getWorkMode` 헬퍼 함수 추가**

  `WORK_MODE_STYLE` 바로 아래에 추가한다.

  ```typescript
  function getWorkMode(empId: string, date: string, rawRecords: any[]): {
    checkInType: 'office' | 'remote' | 'field' | null
    isCurrentlyField: boolean
  } {
    const dayRecs = rawRecords
      .filter((r) => r.employee_id === empId && toKSTDate(r.recorded_at) === date)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
  
    const checkIn = dayRecs.find((r) => r.type === 'CHECK_IN')
    if (!checkIn) return { checkInType: null, isCurrentlyField: false }
  
    const checkInType: 'office' | 'remote' | 'field' =
      checkIn.is_field ? 'field'
      : (checkIn.note ?? '').startsWith('재택') ? 'remote'
      : 'office'
  
    const lastRec = dayRecs[dayRecs.length - 1]
    const isCurrentlyField = lastRec?.type === 'FIELD_START'
  
    return { checkInType, isCurrentlyField }
  }
  ```

- [ ] **Step 4: TypeScript 타입 체크**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  기대 출력: 오류 없음 (또는 기존 오류만)

- [ ] **Step 5: 커밋**

  ```bash
  git add components/admin/AttendanceSummaryView.tsx
  git commit -m "feat: 근태 일별 뷰 근무 위치 배지 - getWorkMode 헬퍼 추가"
  ```

---

### Task 2: 일별 뷰 직원 이름 셀에 배지 렌더링

**Files:**
- Modify: `components/admin/AttendanceSummaryView.tsx` (일별 뷰 `<tbody>` 부분)

**Interfaces:**
- Consumes:
  ```typescript
  // Task 1에서 정의됨
  getWorkMode(empId: string, date: string, rawRecords: any[]): {
    checkInType: 'office' | 'remote' | 'field' | null
    isCurrentlyField: boolean
  }
  WORK_MODE_LABEL: Record<'office' | 'remote' | 'field', string>
  WORK_MODE_STYLE: Record<'office' | 'remote' | 'field', string>
  ```

- [ ] **Step 1: 일별 뷰 직원 이름 셀 수정**

  `AttendanceSummaryView.tsx`의 일별 뷰(`view === 'day'`) `<tbody>` 내 직원 이름 셀을 찾는다. 현재:

  ```tsx
  <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
  ```

  다음으로 교체한다:

  ```tsx
  <td className="px-4 py-3">
    {(() => {
      const wm = getWorkMode(emp.id, dates[0], rawRecords)
      return (
        <>
          <span className="font-medium text-gray-900">{emp.name}</span>
          {(wm.checkInType || wm.isCurrentlyField) && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {wm.checkInType && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${WORK_MODE_STYLE[wm.checkInType]}`}>
                  {WORK_MODE_LABEL[wm.checkInType]}
                </span>
              )}
              {wm.isCurrentlyField && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">
                  외근중
                </span>
              )}
            </div>
          )}
        </>
      )
    })()}
  </td>
  ```

- [ ] **Step 2: TypeScript 타입 체크**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  기대 출력: 오류 없음 (또는 기존 오류만)

- [ ] **Step 3: 로컬 서버에서 시각 확인**

  브라우저에서 `/admin/attendance` (일별 뷰) 접속 후 확인:
  - 사무실 출근 직원 → 이름 아래 파란 `사무실` 배지
  - 재택 출근 직원 → 이름 아래 보라 `재택` 배지
  - 외근 직접 출근 직원 → 이름 아래 주황 `외근` 배지
  - 현재 FIELD_START 상태 직원 → 출근 유형 배지 + 노란 `외근중` 배지
  - 미출근 직원 → 배지 없음
  - 주별/월별 뷰로 전환 시 → 배지 미표시, 기존 UI 그대로

- [ ] **Step 4: 커밋 + 푸시**

  ```bash
  git add components/admin/AttendanceSummaryView.tsx
  git commit -m "feat: 근태 일별 뷰 직원 근무 위치 배지 표시 (사무실/재택/외근/외근중)"
  git push origin main
  ```
