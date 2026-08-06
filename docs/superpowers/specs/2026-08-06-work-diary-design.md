# 업무 다이어리 기능 설계

Date: 2026-08-06

## 개요

개인별 일자별 업무 내용을 마크다운 형식으로 기록·수정·삭제하는 기능.
관리자 및 팀장은 팀원의 다이어리를 일별·주간별로 조회한다(읽기 전용).

---

## 1. DB 스키마

```sql
CREATE TABLE work_diaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  diary_date  DATE NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, diary_date)
);
```

- `(employee_id, diary_date)` UNIQUE → 날짜당 1개 보장
- UPSERT로 신규/수정 단일 처리
- `updated_at` 트리거: 기존 `set_updated_at()` 재사용

### RLS 정책

| 역할 | 권한 |
|------|------|
| 본인(직원) | SELECT / INSERT / UPDATE / DELETE — 본인 행만 |
| ADMIN | SELECT — 전체 |
| 팀장 | SELECT — 같은 부서 팀원 행만 (팀원 0명이면 접근 불가) |

---

## 2. 파일 구조

```
app/(dashboard)/diary/
  page.tsx              서버: 목록 + 검색 파라미터 처리
  [date]/page.tsx       서버: 작성/수정 에디터
  actions.ts            upsertDiary, deleteDiary

app/(admin)/admin/diary/
  page.tsx              서버: 관리자/팀장 조회

components/diary/
  DiaryListClient.tsx   목록 + 날짜/키워드 검색 UI
  DiaryEditorClient.tsx 마크다운 textarea + 미리보기 토글
  DiaryViewerClient.tsx 관리자용 — 직원 선택 + 일별/주간 탭
```

---

## 3. 직원 업무 다이어리 (`/diary`)

### 목록 화면

- 본인 다이어리를 최신순으로 표시 (10개씩 페이지네이션)
- 각 항목: 날짜 / 내용 앞 2줄 미리보기 / 최초작성·최종수정 날짜
- 검색 필터: 날짜 범위(시작~끝) + 키워드(내용 포함 검색)
- 우상단 "새 작성" 버튼 → 오늘 날짜로 `/diary/[오늘]` 이동

### 작성/수정 화면 (`/diary/[date]`)

- 상단: 날짜 표시 (변경 불가)
- 마크다운 `<textarea>` + "미리보기" 토글 버튼
- 미리보기: `marked` 라이브러리로 HTML 렌더링
- 저장 버튼: UPSERT (없으면 INSERT, 있으면 UPDATE)
- 삭제 버튼: confirm 후 삭제 → 목록으로 복귀
- 수정 이력 표시:
  - 최초 작성: `created_at`
  - 최종 수정: `updated_at` (최초 작성 이후 수정된 경우에만 표시)

---

## 4. 관리자/팀장 조회 (`/admin/diary`)

### 접근 권한

- **ADMIN**: 전체 직원 선택 가능
- **팀장**: 본인 부서 팀원만 선택 가능 (팀원 0명이면 메뉴 숨김)
- 읽기 전용 — 수정/삭제 버튼 없음

### 화면 구성

- 상단: 직원 선택 드롭다운
- 조회 탭: **일별** / **주간**
  - **일별**: 날짜 선택 → 해당 날짜 다이어리 마크다운 렌더링
  - **주간**: 주 선택(월~일) → 요일별 카드 7개 나열, 미작성일은 "미작성" 표시

---

## 5. 사이드바 변경

### 직원 메뉴 — 근태 섹션

```
근태
├── 근태등록          /attendance
└── 업무 다이어리     /diary        ← 추가
```

### 관리자 메뉴 — 근태 섹션

```
근태
├── 출퇴근 현황       /admin/employees
├── 근태 현황         /admin/attendance
├── 52시간 리포트     /admin/reports
└── 업무 다이어리     /admin/diary  ← 추가 (팀장: 팀원 있을 때만)
```

팀장 노출 조건: `position === '팀장'` AND 같은 부서에 본인 외 팀원 ≥ 1명
(기존 supply manager 조건 처리 방식과 동일 패턴)

---

## 6. Server Actions

```typescript
// upsertDiary(date: string, content: string) → { error }
// deleteDiary(date: string) → { error }
```

- 인증: `auth.uid()` → employee_id 조회
- upsert: `ON CONFLICT (employee_id, diary_date) DO UPDATE SET content, updated_at`
- revalidatePath: `/diary`

---

## 7. 마이그레이션

- Migration 075: `work_diaries` 테이블 생성 + RLS + `set_updated_at` 트리거

---

## 8. 의존성

- `marked`: 마크다운 → HTML 렌더링 (기존 미사용 시 추가)
- 기존 `set_updated_at()` 트리거 함수 재사용
- 기존 `createClient()`, `revalidatePath()` 패턴 그대로 사용
