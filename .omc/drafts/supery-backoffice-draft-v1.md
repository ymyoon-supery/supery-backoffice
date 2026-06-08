# WorkSync 백오피스 구현 계획 (Draft v1)

**상태**: DRAFT — Architect/Critic 검토 대기  
**스펙 출처**: `.omc/specs/deep-interview-supery-backoffice.md`  
**최종 모호성**: 14.5% (PASSED)

---

## RALPLAN-DR Summary (Short Mode)

### Principles
1. **직원 중심 모바일 UX** — 타임 트래커·GPS 체크인은 모바일 브라우저 우선 설계, 터치 타겟 44px 이상
2. **Google Workspace 연장, 중복 금지** — Calendar·Drive·Chat을 대체하지 않고 결재 이벤트의 자동화 허브로 활용
3. **노무 데이터 무결성** — 근태 기록 수정 시 반드시 수정 이력(audit trail)을 남기고 원본 데이터를 보존
4. **역할 기반 접근 제어(RBAC)** — Supabase RLS로 EMPLOYEE/MANAGER/ADMIN 권한을 DB 레벨에서 격리
5. **점진적 확장 가능 설계** — MVP 이후 Looker Studio·법인카드 API 연동을 위해 API Route는 서비스 레이어로 분리

### Decision Drivers
1. **Google API 신뢰성** — Directory/Calendar/Drive 연동은 단일 장애점(SPOF)이 될 수 있어 실패 시 graceful fallback 설계가 필요
2. **Supabase RLS 복잡도** — 다중 역할(직원/팀장/관리자)과 다중 테넌트(회사별 조직도) 데이터 격리를 RLS만으로 처리할지 App 레이어 보완이 필요한지
3. **모바일 GPS 브라우저 호환성** — HTML5 Geolocation은 HTTPS 필수, iOS Safari 권한 재요청 UX 처리 필요

### Viable Options

#### Option A: Next.js Server Components 중심 (RSC + Server Actions)
**Approach:** 데이터 페칭을 Server Component에서 처리, 뮤테이션은 Server Action으로 처리  
**Pros:**
- API 키·Supabase 서비스 롤 키가 클라이언트에 노출되지 않음
- 자동 캐싱·ISR로 관리자 대시보드 성능 우수
- 번들 크기 최소화  

**Cons:**
- 실시간 근태 현황(Supabase Realtime)은 Client Component 필요해 혼용 복잡도 증가
- GPS 체크인처럼 클라이언트 Web API 사용 화면은 Client Component 강제

#### Option B: Next.js + TanStack Query + API Routes
**Approach:** 클라이언트에서 TanStack Query로 Supabase API Route 호출  
**Pros:**
- Optimistic updates로 근태 입력 UX 즉각 반응
- 개발팀 친숙도 높은 패턴
- Realtime 구독과 일관된 클라이언트 상태 관리  

**Cons:**
- 번들 크기 증가 (~50KB)
- 민감 데이터(급여·개인정보) API Route 보안 추가 필요

**권장**: **Option A** — Google API 키 보안과 관리자 리포트 캐싱이 핵심 요건이므로 Server Components 중심 채택. 실시간 현황판만 Client Component + Supabase Realtime으로 혼용.

---

## Requirements Summary

| 구분 | 내용 |
|------|------|
| 프로젝트 | WorkSync — 통합 근태 관리 + 전자결재 통합 포털 |
| 사용자 | 전직원(EMPLOYEE/MANAGER) + 관리자(ADMIN) |
| 스택 | Next.js 15 (App Router) + Supabase + Vercel |
| 인증 | Google OAuth via Supabase Auth |
| Google API | Directory, Calendar, Drive, Chat Webhook |
| GPS | HTML5 Geolocation + 역지오코딩 (Kakao Maps API 또는 Google Geocoding) |
| 배포 | Vercel (Frontend + API Routes) + Supabase Cloud |

---

## Acceptance Criteria

### 인증 & 조직
- [ ] Google Workspace 계정으로 로그인하면 Supabase Auth 세션이 생성되고, Google Directory API에서 해당 사용자의 직급·부서·부서장 정보가 자동으로 employees 테이블에 채워진다
- [ ] Daily Batch (Vercel Cron, 매일 02:00 KST)가 Google Directory API를 호출하여 신규 입사/퇴사/부서 이동을 organizations·employees 테이블에 반영한다
- [ ] 3단 결재선(담당→팀장→대표)이 Directory API 데이터로 자동 생성되어 approval_lines 테이블에 저장된다

### 근태 (직원)
- [ ] [출근] 클릭 시 서버 타임스탬프(UTC)가 attendance_records에 type=CHECK_IN으로 저장된다
- [ ] 출근→휴식 전환 시 `수행 중인 태스크` 텍스트 입력 모달이 강제 노출되며, 미입력 시 전환 불가
- [ ] 모바일에서 [현장 직출] 클릭 시 Geolocation API가 위경도를 캡처하고, 역지오코딩된 주소명이 attendance_records.gps_address에 저장된다
- [ ] GPS 권한 거부 또는 위치 취득 실패 시 에러 메시지와 함께 수동 위치 입력 폼이 제공된다

### 전자결재 (직원)
- [ ] 연차 신청 시 잔여 휴가 일수(employees.remaining_leaves)가 실시간 검증되어 초과 신청이 차단된다
- [ ] 지출결의서에서 모바일 카메라(input[capture=environment])로 영수증을 촬영하여 Supabase Storage에 업로드할 수 있다
- [ ] 내 결재 신청 목록에서 각 건의 결재 단계(1단계/2단계/3단계 완료)와 상태(진행중/승인/반려)를 확인할 수 있다

### 전자결재 (관리자/팀장)
- [ ] 대표 최종 승인 시 employees.remaining_leaves가 차감되고, Google Calendar API로 `[오후반차] 홍길동` 형식의 이벤트가 사내 팀 캘린더에 Insert된다
- [ ] 지출결의서 최종 승인 시 서버에서 PDF가 생성되고, PDF + 영수증 이미지가 Google Drive 지정 폴더(Admin 설정값)에 자동 업로드된다
- [ ] 결재 상신·승인·반려 이벤트 발생 시 Google Chat Webhook POST 요청이 3초 이내에 전송된다

### 관리자 전용
- [ ] 관리자가 특정 직원의 근태 기록을 수정하면 attendance_corrections 테이블에 (수정자, 수정 전 값, 수정 후 값, 수정 시각)이 저장된다
- [ ] `/admin/reports` 페이지에서 주간 52시간 초과 직원 목록이 테이블로 표시되고, Excel(.xlsx) 다운로드 버튼이 작동한다
- [ ] 전사 실시간 현황판에서 각 직원의 상태(업무중/휴식중/외근중/휴가중/퇴근)가 Supabase Realtime으로 실시간 갱신된다
- [ ] 관리자는 결재 양식(연차/지출) 템플릿을 수정하고 Google Drive 저장 경로를 설정할 수 있다

---

## Database Schema

### 핵심 테이블

```sql
-- employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  position TEXT,
  role TEXT CHECK (role IN ('EMPLOYEE','MANAGER','ADMIN')) DEFAULT 'EMPLOYEE',
  manager_id UUID REFERENCES employees(id),
  remaining_leaves NUMERIC(4,1) DEFAULT 15,
  google_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- attendance_records
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  type TEXT CHECK (type IN ('CHECK_IN','BREAK_START','BREAK_END','FIELD_OUT','FIELD_IN','CHECK_OUT')),
  recorded_at TIMESTAMPTZ NOT NULL,
  task_description TEXT,
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  gps_address TEXT,
  is_field BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- attendance_corrections (audit trail)
CREATE TABLE attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES attendance_records(id),
  corrected_by UUID REFERENCES employees(id),
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  corrected_at TIMESTAMPTZ DEFAULT NOW()
);

-- leave_requests
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  leave_type TEXT CHECK (leave_type IN ('ANNUAL','HALF_AM','HALF_PM')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  google_calendar_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- expense_reports
CREATE TABLE expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,0),
  description TEXT,
  receipt_paths TEXT[],
  drive_file_id TEXT,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- approval_lines
CREATE TABLE approval_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  request_type TEXT CHECK (request_type IN ('LEAVE','EXPENSE')),
  steps JSONB NOT NULL  -- [{order:1, approver_id:uuid}, ...]
);

-- approval_steps
CREATE TABLE approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  request_type TEXT CHECK (request_type IN ('LEAVE','EXPENSE')),
  approver_id UUID REFERENCES employees(id),
  step_order INT NOT NULL,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  comment TEXT,
  decided_at TIMESTAMPTZ
);
```

---

## Implementation Steps

### Phase 1: 프로젝트 기초 설정 (예상: 1일)

**1.1 Next.js 프로젝트 초기화**
```
파일: package.json, tsconfig.json, tailwind.config.ts
- npx create-next-app@latest . --typescript --tailwind --app
- npx shadcn@latest init
- npm install @supabase/supabase-js @supabase/ssr
```

**1.2 Supabase 클라이언트 설정**
```
파일: lib/supabase/client.ts  — 브라우저용 createBrowserClient
파일: lib/supabase/server.ts  — 서버용 createServerClient (cookies)
파일: middleware.ts           — 세션 갱신 미들웨어
파일: .env.local              — SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

**1.3 환경변수 정의**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_SERVICE_ACCOUNT_KEY (JSON, base64)
GOOGLE_CALENDAR_ID
GOOGLE_DRIVE_FOLDER_ID
GOOGLE_CHAT_WEBHOOK_URL
KAKAO_REST_API_KEY (역지오코딩)
```

---

### Phase 2: 데이터베이스 스키마 & RLS (예상: 1일)

**2.1 마이그레이션 파일 작성**
```
파일: supabase/migrations/001_initial_schema.sql — 위 DDL 전체
파일: supabase/migrations/002_rls_policies.sql
```

**2.2 RLS 정책 핵심**
```sql
-- 직원: 자신의 레코드만 SELECT/INSERT
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_own" ON attendance_records
  USING (employee_id = auth.uid());

-- 관리자: 전체 SELECT, UPDATE
CREATE POLICY "admin_all" ON attendance_records
  USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'ADMIN'));

-- 팀장: 소속 팀원 SELECT
CREATE POLICY "manager_team" ON attendance_records
  USING (EXISTS (
    SELECT 1 FROM employees e WHERE e.id = employee_id AND e.manager_id = auth.uid()
  ));
```

---

### Phase 3: 인증 & Google Directory 동기화 (예상: 1.5일)

**3.1 Google OAuth 설정**
```
파일: app/(auth)/login/page.tsx
  - "Google로 로그인" 버튼 → supabase.auth.signInWithOAuth({ provider: 'google', scopes: 'https://www.googleapis.com/auth/directory.readonly' })
파일: app/api/auth/callback/route.ts
  - OAuth 콜백 처리 + 첫 로그인 시 employees 레코드 생성
```

**3.2 Directory API Batch Sync**
```
파일: lib/google/directory.ts
  - Google Admin SDK를 이용한 users.list() 호출
  - OU → organizations 테이블 upsert
  - users → employees 테이블 upsert (role 유지)

파일: app/api/google/directory-sync/route.ts
  - GET 요청 핸들러 (Vercel Cron 트리거)
  - Authorization: Bearer ${CRON_SECRET} 검증

파일: vercel.json (또는 vercel.ts)
  - crons: [{ path: '/api/google/directory-sync', schedule: '0 17 * * *' }]  // 매일 02:00 KST
```

---

### Phase 4: 근태 관리 (예상: 2.5일)

**4.1 타임 트래커 UI**
```
파일: app/(dashboard)/attendance/page.tsx
  - 현재 상태 표시 (출근전/업무중/휴식중/외근중/퇴근)
  - 오늘 타임라인 뷰 (시간 블록 + 태스크 라벨)
  - 주간 누적 근무 시간 위젯

파일: components/attendance/TimeTracker.tsx
  - 상태 버튼 (출근/휴식시작/휴식종료/퇴근)
  - 세션 전환 시 TaskInputModal 강제 노출
  - Server Action으로 attendance_records INSERT
```

**4.2 GPS 현장 직출퇴**
```
파일: components/attendance/GPSCheckIn.tsx
  - navigator.geolocation.getCurrentPosition() 호출
  - 위경도 → Kakao Maps API 역지오코딩 → 주소명
  - HTTPS 필수 (Vercel 자동 HTTPS), iOS Safari 권한 재요청 처리
  - 권한 거부 시 ManualLocationInput 폴백 컴포넌트

파일: lib/utils/geocoding.ts
  - Kakao REST API 역지오코딩 헬퍼 함수
```

---

### Phase 5: 전자결재 (예상: 3일)

**5.1 결재 신청 폼**
```
파일: app/(dashboard)/approval/leave/new/page.tsx
  - 연차 유형 선택 (연차/오전반차/오후반차)
  - 잔여 일수 실시간 표시 + 초과 시 Submit 비활성화
  - Server Action → leave_requests INSERT + approval_steps 초기화

파일: app/(dashboard)/approval/expense/new/page.tsx
  - 지출 항목, 금액, 설명 입력
  - 영수증 첨부: <input type="file" capture="environment" accept="image/*">
  - Supabase Storage 업로드 후 receipt_paths[] 저장
```

**5.2 결재 워크플로우**
```
파일: app/(dashboard)/approval/inbox/page.tsx
  - 내가 결재해야 할 건 목록 (approval_steps WHERE approver_id = me AND status = PENDING)
  - 모바일 최적화 승인/반려 카드 UI

파일: app/api/approval/[id]/route.ts
  - PATCH: 승인/반려 처리
  - 3단계 완료 시 Google API 트리거 (Calendar/Drive)
  - Chat Webhook 알림 발송
```

---

### Phase 6: Google Workspace 자동화 (예상: 1.5일)

**6.1 Calendar API — 연차 자동 등록**
```
파일: lib/google/calendar.ts
  - google.calendar('v3').events.insert()
  - 이벤트명: `[${leaveTypeLabel}] ${employeeName}`
  - 캘린더: GOOGLE_CALENDAR_ID (회사 공유 캘린더)
  - 실패 시 DB 플래그만 남기고 결재는 완료 처리 (non-blocking)
```

**6.2 Drive API — 지출결의서 아카이빙**
```
파일: lib/google/drive.ts
  - PDFKit으로 지출결의서 PDF 생성
  - drive.files.create()로 GOOGLE_DRIVE_FOLDER_ID 아래 업로드
  - expense_reports.drive_file_id 업데이트
```

**6.3 Chat Webhook — 알림**
```
파일: lib/google/chat.ts
  - fetch(GOOGLE_CHAT_WEBHOOK_URL, { method: 'POST', body: JSON.stringify({ text: message }) })
  - 이벤트 유형별 메시지 포맷 (신청/승인/반려/52시간 경보)
```

---

### Phase 7: 관리자 기능 (예상: 2일)

**7.1 근태 기록 수정**
```
파일: app/(admin)/attendance/page.tsx
  - 직원별 월간 근태 캘린더 뷰
  - 특정 레코드 클릭 → AttendanceEditModal

파일: components/admin/AttendanceEditor.tsx
  - 수정 폼 + 사유 입력 필수
  - Server Action: attendance_records UPDATE + attendance_corrections INSERT
```

**7.2 52시간 리포트 + Excel**
```
파일: app/(admin)/reports/page.tsx
  - 주차별 직원 근무 시간 집계 테이블
  - 52시간 초과자 하이라이트

파일: app/api/reports/excel/route.ts
  - ExcelJS로 .xlsx 생성
  - 재택/외근/직출 컬럼 분리
  - Content-Disposition: attachment 응답
```

**7.3 전사 실시간 현황판**
```
파일: components/admin/StatusBoard.tsx  [Client Component]
  - Supabase Realtime: attendance_records 테이블 구독
  - 각 직원 최신 상태 집계 (업무중/휴식중/외근중/휴가중/퇴근)
  - 팀별 그룹핑 + 아바타 그리드 UI
```

---

### Phase 8: 시스템 설정 & 배포 (예상: 1일)

**8.1 Admin 설정 페이지**
```
파일: app/(admin)/settings/page.tsx
  - Google Drive 저장 경로 설정
  - 결재 양식 템플릿 관리 (JSON 에디터)
  - 주 52시간 경보 임계값 설정
```

**8.2 Vercel 배포**
```
파일: vercel.json
  - crons 설정 (Directory Sync)
  - 환경변수 Vercel Dashboard에 등록
```

---

## Risks and Mitigations

| 위험 | 가능성 | 영향도 | 완화 방안 |
|------|-------|-------|-----------|
| Google API Rate Limit (Directory API: 1500 req/day) | 중 | 중 | Daily Batch에서 incremental sync (syncToken 활용), 오류 시 재시도 큐 |
| GPS 권한 거부 (iOS Safari 등) | 고 | 중 | 수동 위치 입력 폼 폴백 + 에러 메시지 UX |
| Supabase RLS 설정 실수로 데이터 노출 | 저 | 고 | 각 RLS 정책마다 통합 테스트 작성, Supabase Studio에서 정책 검증 |
| Google Calendar/Drive API 장애 시 결재 블로킹 | 중 | 고 | Google API 호출을 결재 승인과 분리 (non-blocking async), 실패 시 재시도 큐 |
| PDFKit 서버리스 환경 호환성 (Vercel) | 중 | 중 | pdf-lib 또는 puppeteer-core + @sparticuz/chromium 대안 검토 |

---

## Verification Steps

1. **인증 플로우**: 테스트 Google 계정으로 로그인 → employees 레코드 자동 생성 확인
2. **근태 사이클**: 출근→태스크 입력→휴식→복귀→퇴근 전체 플로우 → attendance_records 5개 레코드 확인
3. **GPS 체크인**: 모바일 Chrome에서 [현장 직출] → 위치 권한 허용 → gps_address 저장 확인
4. **결재 사이클**: 연차 신청 → 팀장 승인 → 대표 승인 → remaining_leaves 차감 + Google Calendar 이벤트 생성 확인
5. **Chat 알림**: 결재 상신 시 Google Chat 봇 메시지 수신 확인
6. **52시간 리포트**: 테스트 데이터로 초과 직원 생성 → 리포트 테이블 표시 + Excel 다운로드 확인
7. **근태 수정 감사**: 관리자 근태 수정 → attendance_corrections 레코드 생성 확인
8. **RLS 검증**: 일반 직원으로 로그인 → 타 직원 근태 조회 시 빈 결과 확인

---

## Project File Structure

```
supery-backoffice/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # My Workspace
│   │   ├── attendance/page.tsx         # 타임 트래커 + GPS
│   │   ├── approval/
│   │   │   ├── page.tsx               # 신청 목록
│   │   │   ├── leave/new/page.tsx
│   │   │   ├── expense/new/page.tsx
│   │   │   └── inbox/page.tsx
│   │   └── team/page.tsx              # 팀 현황
│   ├── (admin)/
│   │   ├── layout.tsx                 # ADMIN role guard
│   │   ├── dashboard/page.tsx
│   │   ├── employees/page.tsx
│   │   ├── attendance/page.tsx        # 근태 기록 관리
│   │   ├── reports/page.tsx           # 52시간 리포트
│   │   └── settings/page.tsx
│   └── api/
│       ├── auth/callback/route.ts
│       ├── approval/[id]/route.ts
│       ├── reports/excel/route.ts
│       └── google/
│           ├── directory-sync/route.ts
│           ├── calendar/route.ts
│           └── drive/route.ts
├── components/
│   ├── attendance/TimeTracker.tsx, GPSCheckIn.tsx
│   ├── approval/LeaveForm.tsx, ExpenseForm.tsx, ApprovalCard.tsx
│   └── admin/StatusBoard.tsx, AttendanceEditor.tsx, WorkHoursChart.tsx
├── lib/
│   ├── supabase/client.ts, server.ts
│   ├── google/directory.ts, calendar.ts, drive.ts, chat.ts
│   └── utils/geocoding.ts, attendance.ts, excel.ts
├── supabase/migrations/
│   ├── 001_initial_schema.sql
│   └── 002_rls_policies.sql
├── types/database.ts
└── vercel.json
```

---

## Estimated Timeline

| Phase | 내용 | 예상 기간 |
|-------|------|-----------|
| Phase 1 | 프로젝트 기초 설정 | 1일 |
| Phase 2 | DB 스키마 + RLS | 1일 |
| Phase 3 | 인증 + Directory 동기화 | 1.5일 |
| Phase 4 | 근태 관리 (타임 트래커 + GPS) | 2.5일 |
| Phase 5 | 전자결재 (신청 + 워크플로우) | 3일 |
| Phase 6 | Google Workspace 자동화 | 1.5일 |
| Phase 7 | 관리자 기능 | 2일 |
| Phase 8 | 설정 + 배포 | 1일 |
| **합계** | | **~13.5일** |

---

**상태**: DRAFT v1 — Architect 검토 필요
