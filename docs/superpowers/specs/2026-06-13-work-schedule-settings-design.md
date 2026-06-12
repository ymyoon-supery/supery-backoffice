# Work Schedule Settings Design

**Date:** 2026-06-13  
**Feature:** 근무시간 설정 + 지각/조퇴/점심 자동 반영

---

## Overview

관리자가 회사 전체 출근시간·퇴근시간·점심시간을 설정하고, 그 기준으로 근태현황·52시간 리포트에 지각/조퇴/점심 자동차감이 반영되는 기능.

---

## Requirements

| # | 요구사항 |
|---|---------|
| 1 | 관리자 설정 페이지에서 출근시간·퇴근시간·점심 시작~종료시간 설정 가능 |
| 2 | 전사 단일 설정 (팀/그룹별 설정 없음) |
| 3 | 출근시간보다 늦게 체크인 → 지각(분) |
| 4 | 퇴근시간보다 일찍 체크아웃 → 조퇴(분) |
| 5 | 점심 window(시작~종료)를 근무가 완전히 포함하고 해당 시간대 휴식 기록이 부족하면 점심시간 자동 차감 |
| 6 | 근태현황 일별 뷰: 지각/조퇴 배지 표시 |
| 7 | 근태현황 주별/월별 뷰: 지각/조퇴 있는 날 인디케이터 표시 |
| 8 | 52시간 리포트: 지각 횟수, 조퇴 횟수 컬럼 추가 |

---

## Data Model

### Migration: `031_work_schedule.sql`

`company_settings` 테이블에 4개 컬럼 추가:

```sql
ALTER TABLE company_settings
  ADD COLUMN work_start_time  TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN work_end_time    TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN lunch_start_time TEXT NOT NULL DEFAULT '12:00',
  ADD COLUMN lunch_end_time   TEXT NOT NULL DEFAULT '13:00';
```

형식: `"HH:MM"` (24시간, KST 기준)  
기존 코드가 KST 시간을 `"09:30"` 형태 문자열로 다루고 있으므로 변환 없이 비교 가능.

---

## Business Logic

### 시간 비교 헬퍼

```ts
// "HH:MM" → 자정 기준 분(minutes)
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
```

### 지각 (Late Arrival)

```
checkInMin  = timeToMin(checkIn KST)
startMin    = timeToMin(work_start_time)
lateMin     = Math.max(0, checkInMin - startMin)
```

- `lateMin > 0` 이면 지각, 해당 분수만큼 표시

### 조퇴 (Early Departure)

```
checkOutMin   = timeToMin(checkOut KST)
endMin        = timeToMin(work_end_time)
earlyLeaveMin = Math.max(0, endMin - checkOutMin)
```

- `earlyLeaveMin > 0` 이면 조퇴
- checkOut이 없으면(퇴근 미기록) earlyLeaveMin = 0 (별도 표시 없음)

### 점심 자동 차감

기존 하드코딩 `breakMin < 30 && gross > 240 ? 60 : 0` 로직을 다음으로 교체:

```
lunchMin     = timeToMin(lunch_end) - timeToMin(lunch_start)
spansLunch   = checkInMin <= timeToMin(lunch_start) && checkOutMin >= timeToMin(lunch_end)
lunchDeduct  = (spansLunch && breakMin < lunchMin) ? (lunchMin - breakMin) : 0
workMin      = Math.max(0, gross - breakMin - lunchDeduct)
```

- 근무가 점심 window 전체를 포함하고, 이미 기록된 휴식이 점심시간보다 짧으면 차이만큼 추가 차감
- 점심 window 밖에서 근무 시작/종료하면 차감 없음

### DaySummary 타입 확장

```ts
type DaySummary = {
  checkIn: string | null
  checkOut: string | null
  breakMin: number
  workMin: number
  lateMin: number        // 추가: 0이면 정상
  earlyLeaveMin: number  // 추가: 0이면 정상
}
```

---

## UI Changes

### 설정 페이지 (`GeneralSettingsClient.tsx`)

"근무시간 설정" 카드를 기존 "근태 설정" 카드 위에 삽입:

```
┌─────────────────────────────────────────┐
│ 근무시간 설정                            │
│                                          │
│  출근시간   [09:00]  퇴근시간  [18:00]  │
│  점심 시작  [12:00]  점심 종료 [13:00]  │
│                                          │
│                          [저장]          │
└─────────────────────────────────────────┘
```

- `<input type="time">` 4개
- 저장 버튼 1개 (4개 한 번에 저장)

### 근태현황 — 일별 뷰

출근/퇴근 열에 배지 추가:

| 직원 | 출근 | 퇴근 | 휴식 | 근무시간 |
|------|------|------|------|---------|
| 홍길동 | 09:23 🔴 +23분 | 17:45 🟠 -15분 | — | 7h 52m |
| 김철수 | 09:00 | 18:00 | — | 9h |

- 지각: 빨간 배지 `지각 +N분`
- 조퇴: 주황 배지 `조퇴 -N분`

### 근태현황 — 주별/월별 뷰

각 날짜 셀에 지각/조퇴 인디케이터 dot 추가:

- 지각: 빨간 점 (●)
- 조퇴: 주황 점 (●)
- 일별 근무시간 숫자 아래에 작은 점으로 표시

### 52시간 리포트

테이블에 컬럼 2개 추가:

| 직원 | 팀 | 순 근무시간 | 휴식시간 | 지각 | 조퇴 | 초과 |
|------|----|-----------:|--------:|-----:|-----:|-----:|
| 홍길동 | 개발팀 | 42h 0m | — | 2회 | 1회 | — |

- 지각/조퇴 횟수 집계 (해당 주의 일별 데이터 기반)

---

## Files Changed

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `supabase/migrations/031_work_schedule.sql` | 신규 | 컬럼 4개 추가 |
| `app/(admin)/admin/settings/page.tsx` | 수정 | 4개 필드 fetch |
| `app/(admin)/admin/settings/GeneralSettingsClient.tsx` | 수정 | 근무시간 설정 UI 추가 |
| `app/(admin)/admin/settings/actions.ts` | 수정 | `updateWorkSchedule` 액션 추가 |
| `app/(admin)/admin/attendance/page.tsx` | 수정 | 설정 fetch + `calcDaySummary` 로직 업데이트 |
| `components/admin/AttendanceSummaryView.tsx` | 수정 | 지각/조퇴 배지·인디케이터 표시 |
| `app/(admin)/admin/reports/page.tsx` | 수정 | 지각/조퇴 횟수 컬럼 추가 |

---

## Out of Scope

- 팀/그룹별 근무시간 개별 설정
- 유연근무제 / 탄력적 근무시간
- 지각/조퇴 알림 발송
- 지각/조퇴 기록의 별도 DB 저장 (계산은 런타임에서만)
