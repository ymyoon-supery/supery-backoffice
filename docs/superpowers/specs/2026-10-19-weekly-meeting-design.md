# 주간회의 기능 설계

**날짜:** 2026-10-19  
**작성자:** 윤영민

---

## 1. 개요

팀장이 매주 본인 팀의 주간회의 내용을 입력하고, 관리자가 전 팀 취합본을 최종 확인하는 기능.  
신청/결재 메뉴 하단에 "주간회의" 메뉴 항목으로 추가되며, 팀장과 관리자만 접근 가능.

---

## 2. 데이터베이스

### 2-1. weekly_meetings 테이블 신규 생성

```sql
CREATE TABLE weekly_meetings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      DATE NOT NULL,
  department_id   UUID NOT NULL REFERENCES departments(id),
  this_week       TEXT,
  next_week       TEXT,
  issues          TEXT,
  submitted_by    UUID REFERENCES employees(id),
  is_confirmed    BOOLEAN NOT NULL DEFAULT false,
  confirmed_by    UUID REFERENCES employees(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, department_id)
);
```

- `week_start`: 해당 주 월요일 날짜. 월요일이 공휴일이면 다음 영업일.
- `UNIQUE(week_start, department_id)`: 팀당 주 1개 레코드.

### 2-2. departments 테이블 sort_order 컬럼 추가

```sql
ALTER TABLE departments ADD COLUMN sort_order INT NOT NULL DEFAULT 99;
```

기획1팀=1, 기획2팀=2, 기획3팀=3, 커머스팀=4, 나머지=99.  
관리자가 설정 화면에서 팀 순서를 변경할 수 있도록 추후 확장 가능.

### 2-3. RLS 정책

- **SELECT**: 팀장(`position='팀장'`) 또는 ADMIN만 조회 가능
- **INSERT/UPDATE**: 팀장은 본인 `department_id` + `is_confirmed=false`인 레코드만. ADMIN은 전체.
- **최종확인 RPC**: ADMIN만 호출 가능 (DB 레벨 검증)

---

## 3. 공휴일 처리

`lib/holidays.ts`에 연도별 한국 법정 공휴일 배열 관리.

```ts
// 해당 주의 회의 라벨 날짜 계산
// 월요일부터 순서대로 체크, 공휴일이면 다음 날로 이동
function getWeekLabelDate(mondayDate: Date): Date
```

대체공휴일 포함. 최대 금요일까지만 탐색 (금요일도 공휴일이면 월요일 원본 날짜 사용 — 극단적 케이스).

---

## 4. 화면 구조

### 4-1. 접근 경로

`/approval/weekly-meeting` — 팀장(`position='팀장'`) 또는 ADMIN만 접근. 그 외 `/approval/my` 리다이렉트.

### 4-2. 레이아웃

```
[← 이전 주]  10월 20일(월) 주간회의  [다음 주 →]

┌─────────────────────────────────────────────┐
│ 기획1팀   ✅ 입력완료              [수정]   │
│  이번 주: ...                               │
│  다음 주: ...                               │
│  이슈:    ...                               │
├─────────────────────────────────────────────┤
│ 기획2팀   ⏳ 미입력                         │
├─────────────────────────────────────────────┤
│ 기획3팀   ✅ 입력완료   [본인팀·수정]       │
│  이번 주: ...                               │
│  ...                                        │
├─────────────────────────────────────────────┤
│ 커머스팀  ⏳ 미입력                         │
└─────────────────────────────────────────────┘

[관리자만] [최종 확인] 버튼
  → 확인 후: "✅ 관리자 확인 완료 · 10/20 14:30"
  → 확인 후 팀장의 [수정] 버튼 사라짐
```

### 4-3. 수정 버튼 노출 조건

| 사용자 | is_confirmed=false | is_confirmed=true |
|--------|-------------------|-------------------|
| 팀장(본인 팀) | [수정] 표시 | 숨김 |
| 팀장(타 팀) | 숨김 | 숨김 |
| ADMIN | [수정] 표시 | [수정] 표시 |

### 4-4. 입력/수정 모달

슬라이드 또는 인라인 폼:
- 이번 주 진행사항 (textarea)
- 다음 주 계획 (textarea)
- 이슈/공유사항 (textarea, optional)
- [저장] / [취소]

---

## 5. 파일 구조

```
app/(dashboard)/approval/weekly-meeting/
├─ page.tsx                   서버 컴포넌트 — 권한 체크, 초기 데이터 로드
├─ WeeklyMeetingClient.tsx    클라이언트 — 주 네비, 카드 목록, 상태 표시
├─ WeeklyMeetingForm.tsx      입력/수정 모달 폼
└─ actions.ts                 upsertWeeklyMeeting, confirmWeeklyMeeting

lib/holidays.ts               한국 공휴일 배열 + getWeekLabelDate()

supabase/migrations/
└─ 089_weekly_meetings.sql    테이블, RLS, RPC
```

사이드바 `components/layout/Sidebar.tsx` — 신청/결재 그룹 맨 아래에 주간회의 항목 추가 (팀장 또는 ADMIN일 때만 표시).

---

## 6. 서버 액션

### upsertWeeklyMeeting
- 입력: `{ weekStart, departmentId, thisWeek, nextWeek, issues }`
- 권한: 팀장(본인 팀, is_confirmed=false) 또는 ADMIN
- 동작: `weekly_meetings` upsert, `submitted_by` = 현재 사용자, `updated_at` 갱신

### confirmWeeklyMeeting
- 입력: `{ weekStart }`
- 권한: ADMIN만
- 동작: 해당 `week_start`의 모든 레코드 `is_confirmed=true`, `confirmed_by`, `confirmed_at` 세팅

---

## 7. 주 네비게이션

- 기본: 현재 주 (이번 주 월요일 기준)
- URL 파라미터 `?week=2026-10-19` 로 특정 주 조회
- "다음 주" 버튼: 미래 주는 최대 현재 주 +1주까지만 허용
- 과거 주는 제한 없이 조회 가능

---

## 8. 비기능 요구사항

- 공휴일 데이터는 `lib/holidays.ts` 정적 배열로 관리 (2025~2027년 포함)
- 팀 순서는 `departments.sort_order` 기준, 동일 sort_order는 팀 이름 알파벳 순
- 모바일 대응: 기존 프로젝트 반응형 패턴 동일 적용
