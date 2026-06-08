# WorkSync 백오피스 구현 계획 v3

**상태**: PENDING APPROVAL  
**반복**: 3회 (Architect×3 + Critic×2)  
**최종 모호성**: 14.5% (Deep Interview PASSED)  
**스펙**: `.omc/specs/deep-interview-supery-backoffice.md`

---

## RALPLAN-DR Summary

### Principles
1. **직원 중심 모바일 UX** — 타임 트래커·GPS는 모바일 브라우저 우선, 터치 타겟 44px 이상
2. **Google Workspace 연장, 중복 금지** — Calendar·Drive·Chat을 결재 이벤트 자동화 허브로 활용
3. **노무 데이터 무결성** — 근태 및 결재 수정 시 audit trail 보존, 원본 데이터 불변
4. **역할 기반 접근 제어(RBAC)** — Supabase RLS + SECURITY DEFINER 헬퍼로 DB 레벨 권한 격리
5. **점진적 확장 가능 설계** — Google API는 outbox 패턴으로 추상화, 서비스 레이어 분리

### Decision Drivers
1. **RLS 아이덴티티 바인딩** — `auth.uid()` ↔ `employees.auth_user_id` FK 없이 RLS 전체 무효화
2. **Google API 원자성** — outbox 패턴으로 DB 커밋과 Google API 호출 분리 (Calendar/Drive)
3. **Vercel 서버리스 PDF** — 순수 JS `pdf-lib` 사용 (PDFKit의 `fs.readFileSync` 런타임 깨짐 회피)

### Viable Options

#### 채택: Hybrid RSC + Server Actions + TanStack Query
- **RSC**: `/admin/reports`, `/admin/employees`, 대시보드 요약 (읽기 전용, 캐시 활용)
- **Server Actions**: 모든 뮤테이션 (인증 + `revalidateTag` 통합)
- **TanStack Query** (Client Component 내부만): `TimeTracker`, `ApprovalInbox` (낙관적 업데이트)
- **`lib/cache/tags.ts`**: `revalidateTag` 키 중앙 관리

#### 기각: RSC 단독 — 실시간 현황판·GPS 체크인·타임 트래커가 강제로 Client Component화되어 혼용 복잡도 상승, `revalidateTag` 충돌 위험
#### 기각: TanStack Query 전체 — Google API 키 클라이언트 노출 위험, 관리자 리포트 캐싱 불가

---

## ADR

**결정**: Hybrid RSC + Server Actions + TanStack Query, Supabase + outbox 패턴  
**드라이버**: RLS 아이덴티티 보안, 결재-Google API 원자성, Vercel 서버리스 제약  
**대안 고려**:  
- Firebase — Google 생태계 유리하나 복잡한 다중 역할 쿼리와 SQL 트랜잭션 부재  
- RSC 전용 — 관리자 리포트 최적이나 실시간/인터랙티브 화면에서 근본적 제약  
**선택 이유**: Supabase의 RLS + RPC + Realtime이 근태·결재·감사 트레일 요건을 DB 레벨에서 충족; Next.js App Router가 Server/Client 혼용을 공식 지원  
**결과**: 직원·관리자 통합 포털, Google Workspace 자동화 완전 통합  
**후속 조치**: v2에서 Looker Studio 연동, 법인카드 API 연동 고려

---

## Requirements Summary

| 구분 | 내용 |
|------|------|
| 프로젝트 | WorkSync — 통합 근태 관리 + 전자결재 통합 포털 |
| 사용자 | 전직원(EMPLOYEE/MANAGER) + 관리자(ADMIN) |
| 스택 | Next.js 15 (App Router) + Supabase + Vercel |
| 인증 | Google OAuth via Supabase Auth |
| PDF | `pdf-lib` (순수 JS, Vercel 서버리스 안전) |
| Google API | Directory, Calendar, Drive, Chat Webhook (모두 MVP) |
| GPS | HTML5 Geolocation + Kakao Maps 역지오코딩 |
| 배포 | Vercel + Supabase Cloud |

---

## Acceptance Criteria

### 인증 & 조직
- [ ] Google OAuth 콜백 시 `auth.users.id`가 `employees.auth_user_id`에 저장되어 모든 RLS 정책의 `auth.uid()` 조건이 작동한다
- [ ] Daily Batch Cron이 `organizations.sync_token`을 증분 갱신하며 실패 시 `cron_logs` 테이블에 오류가 기록된다
- [ ] 3단 결재선(담당→팀장→대표)이 Directory API 데이터 기반으로 `approval_lines`에 자동 생성된다

### 근태 (직원)
- [ ] 같은 날 동일 `type`의 `CHECK_IN`이 두 번 입력되면 `uniq_attendance_daily` 인덱스 위반으로 DB에서 거부된다 (KST 기준)
- [ ] 세션 전환 시 태스크 입력 모달이 강제 노출되며 미입력 시 클라이언트에서 Submit 차단
- [ ] GPS 체크인: 위경도 + KST 역지오코딩 주소 저장, 권한 거부 시 수동 입력 폼 폴백

### 전자결재 (직원)
- [ ] `validate_and_submit_leave()` RPC가 단일 트랜잭션 내에서 잔여 휴가 검증 + INSERT를 처리하여 동시 초과 신청을 방지한다
- [ ] 영수증 업로드 경로 `receipts/{auth.uid()}/{timestamp}_{filename}` 에 Storage RLS가 적용되어 본인 외 접근이 차단된다
- [ ] 내 결재 신청 목록에서 단계별 상태(1/2/3단계) 확인 가능

### 전자결재 (관리자/팀장)
- [ ] `approve_leave_step()` / `approve_expense_step()` RPC가 `SELECT FOR UPDATE`로 행을 잠근 후 처리하여 동시 이중 승인 시도 중 하나가 `already_decided` 에러를 반환한다
- [ ] 대표 최종 승인 시 `outbox_events`에 `CALENDAR_INSERT`, `DRIVE_UPLOAD`, `CHAT_NOTIFY` 레코드가 삽입된다
- [ ] Outbox Cron(1분 주기)이 `FOR UPDATE SKIP LOCKED`로 이벤트를 처리하여 중복 처리 없이 Calendar 등록, Drive 업로드, Chat 알림을 실행한다
- [ ] Chat 알림은 결재 완료 후 **60초 이내** 전송된다

### 관리자 전용
- [ ] 근태 기록 수정 시 `attendance_corrections`에 (수정자, 전후 값, 사유, 시각) 저장
- [ ] 결재 승인/반려 행위가 `approval_audit_log`에 기록된다
- [ ] 주52시간 초과 직원 목록 + Excel(.xlsx) 다운로드 (재택/외근/직출 분리)
- [ ] `StatusBoard`가 `supabase_realtime` publication의 `attendance_records`를 구독하여 실시간 갱신된다

---

## Database Schema (최종)

### 마이그레이션 파일 구조
```
supabase/migrations/
├── 001_initial_schema.sql    — 전체 DDL
├── 002_rls_helpers.sql       — SECURITY DEFINER 헬퍼
├── 003_rls_policies.sql      — RLS 정책
├── 004_rpc_functions.sql     — validate_and_submit_leave, approve_*_step
├── 005_realtime.sql          — publication 설정
└── 006_storage_rls.sql       — Storage 버킷 + RLS
```

### 001_initial_schema.sql 핵심 DDL

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ou_path TEXT,
  manager_id UUID,
  sync_token TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  position TEXT,
  role TEXT CHECK (role IN ('EMPLOYEE','MANAGER','ADMIN')) DEFAULT 'EMPLOYEE',
  manager_id UUID REFERENCES employees(id),
  remaining_leaves NUMERIC(4,1) DEFAULT 15,
  google_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
-- ✅ v3 fix: 함수 표현식은 인라인 UNIQUE 불가 → 별도 인덱스, KST 타임존 캐스트 적용
CREATE UNIQUE INDEX uniq_attendance_daily
  ON attendance_records (employee_id, ((recorded_at AT TIME ZONE 'Asia/Seoul')::date), type);

CREATE TABLE attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES attendance_records(id),
  corrected_by UUID REFERENCES employees(id),
  before_value JSONB,
  after_value JSONB,
  reason TEXT NOT NULL,
  corrected_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,0),
  description TEXT,
  receipt_storage_paths TEXT[],
  drive_file_id TEXT,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE approval_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  request_type TEXT CHECK (request_type IN ('LEAVE','EXPENSE')),
  steps JSONB NOT NULL
);

-- ✅ 폴리모픽 FK 대신 타입별 분리 테이블 (Critic v1 fix)
CREATE TABLE leave_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID REFERENCES employees(id),
  step_order INT NOT NULL,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  comment TEXT,
  decided_at TIMESTAMPTZ,
  UNIQUE (leave_request_id, step_order)
);

CREATE TABLE expense_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id UUID REFERENCES expense_reports(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID REFERENCES employees(id),
  step_order INT NOT NULL,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  comment TEXT,
  decided_at TIMESTAMPTZ,
  UNIQUE (expense_report_id, step_order)
);

CREATE TABLE approval_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT CHECK (request_type IN ('LEAVE','EXPENSE')),
  request_id UUID NOT NULL,
  approver_id UUID REFERENCES employees(id),
  action TEXT CHECK (action IN ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  step_order INT,
  comment TEXT,
  acted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ idempotency_key 추가 (Architect suggestion — Calendar 이중 등록 방지)
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,  -- e.g. 'CALENDAR_{request_id}', 'DRIVE_{request_id}'
  event_type TEXT CHECK (event_type IN ('CALENDAR_INSERT','CALENDAR_DELETE','DRIVE_UPLOAD','CHAT_NOTIFY')),
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('PENDING','SUCCESS','FAILED','RETRY')) DEFAULT 'PENDING',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE cron_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('SUCCESS','FAILED')),
  records_synced INT,
  error_message TEXT,
  ran_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 002_rls_helpers.sql — SECURITY DEFINER + search_path 하드닝

```sql
-- ✅ v3 fix: SET search_path 추가 (Supabase 공식 hardening 권고, CVE 방어)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'ADMIN');
$$;

CREATE OR REPLACE FUNCTION is_manager_of(target_employee_id UUID)
RETURNS BOOLEAN LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees mgr
    JOIN employees emp ON emp.manager_id = mgr.id
    WHERE mgr.auth_user_id = auth.uid() AND emp.id = target_employee_id
  );
$$;

CREATE OR REPLACE FUNCTION own_employee_id()
RETURNS UUID LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;
```

### 004_rpc_functions.sql

```sql
-- 연차 원자적 제출
CREATE OR REPLACE FUNCTION validate_and_submit_leave(
  p_leave_type TEXT, p_start_date DATE, p_end_date DATE, p_reason TEXT
)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- ✅ v3 fix
AS $$
DECLARE
  v_employee_id UUID;
  v_days NUMERIC;
  v_request_id UUID;
BEGIN
  v_employee_id := own_employee_id();
  v_days := CASE p_leave_type WHEN 'ANNUAL' THEN (p_end_date - p_start_date + 1) ELSE 0.5 END;
  PERFORM FROM employees WHERE id = v_employee_id AND remaining_leaves >= v_days FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_leave'; END IF;
  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason)
    VALUES (v_employee_id, p_leave_type, p_start_date, p_end_date, p_reason)
    RETURNING id INTO v_request_id;
  INSERT INTO approval_audit_log (request_type, request_id, approver_id, action)
    VALUES ('LEAVE', v_request_id, v_employee_id, 'SUBMITTED');
  RETURN v_request_id;
END;
$$;

-- 연차 결재 승인
CREATE OR REPLACE FUNCTION approve_leave_step(p_step_id UUID, p_comment TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- ✅ v3 fix
AS $$
DECLARE v_step leave_approval_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM leave_approval_steps WHERE id = p_step_id FOR UPDATE;
  IF v_step.status <> 'PENDING' THEN RAISE EXCEPTION 'already_decided'; END IF;
  UPDATE leave_approval_steps SET status='APPROVED', comment=p_comment, decided_at=NOW() WHERE id=p_step_id;
  INSERT INTO approval_audit_log (request_type, request_id, approver_id, action, step_order, comment)
    VALUES ('LEAVE', v_step.leave_request_id, own_employee_id(), 'APPROVED', v_step.step_order, p_comment);
END;
$$;

-- ✅ v3 추가: 지출 결재 승인 (Critic v2 missing item)
CREATE OR REPLACE FUNCTION approve_expense_step(p_step_id UUID, p_comment TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_step expense_approval_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM expense_approval_steps WHERE id = p_step_id FOR UPDATE;
  IF v_step.status <> 'PENDING' THEN RAISE EXCEPTION 'already_decided'; END IF;
  UPDATE expense_approval_steps SET status='APPROVED', comment=p_comment, decided_at=NOW() WHERE id=p_step_id;
  INSERT INTO approval_audit_log (request_type, request_id, approver_id, action, step_order, comment)
    VALUES ('EXPENSE', v_step.expense_report_id, own_employee_id(), 'APPROVED', v_step.step_order, p_comment);
END;
$$;
```

### 005_realtime.sql
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE leave_approval_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE expense_approval_steps;
```

### 006_storage_rls.sql
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

CREATE POLICY "owner_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "admin_all" ON storage.objects FOR ALL
  USING (bucket_id = 'receipts' AND is_admin());
```

---

## Implementation Steps

### Phase 1: 프로젝트 기초 (1일)
```
파일: package.json
  의존성: next@15, @supabase/ssr, @supabase/supabase-js,
          pdf-lib, exceljs, @tanstack/react-query, shadcn/ui

파일: lib/cache/tags.ts
  export const CACHE_TAGS = {
    attendance: (id: string) => `attendance-${id}`,
    adminReport: (week: string) => `report-${week}`,
    orgChart: 'org-chart',
    approvalInbox: (id: string) => `inbox-${id}`,
  } as const;

파일: middleware.ts — Supabase 세션 갱신
파일: .env.local — 환경변수 13개 (아래 목록)
```

**환경변수 목록**:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
GOOGLE_SERVICE_ACCOUNT_KEY   (base64 JSON)
GOOGLE_CALENDAR_ID
GOOGLE_DRIVE_FOLDER_ID
GOOGLE_CHAT_WEBHOOK_URL
KAKAO_REST_API_KEY
CRON_SECRET
NEXT_PUBLIC_APP_URL
```

---

### Phase 2: DB 스키마 & RLS (1.5일)
```
6개 마이그레이션 파일 적용 (위 목록 순서대로)
supabase db push 또는 supabase migration up
```

---

### Phase 3: 인증 & Directory 동기화 (1.5일)
```
파일: app/(auth)/login/page.tsx
  - "Google로 로그인" → supabase.auth.signInWithOAuth({ provider: 'google' })

파일: app/api/auth/callback/route.ts
  - auth.users 생성 후 employees upsert (auth_user_id = session.user.id)

파일: lib/google/directory.ts
  - google-auth-library + googleapis
  - syncAll(): organizations.sync_token 읽기 → usersList({pageToken:syncToken}) → upsert → token 저장

파일: app/api/google/directory-sync/route.ts
  - Bearer CRON_SECRET 검증
  - syncAll() + cron_logs INSERT

파일: vercel.json
  {
    "crons": [
      { "path": "/api/google/directory-sync", "schedule": "0 17 * * *" },
      { "path": "/api/outbox/process", "schedule": "* * * * *" }
    ]
  }
```

---

### Phase 4: 근태 관리 (2.5일)
```
파일: app/(dashboard)/attendance/page.tsx  [Server Component]
  - 오늘 타임라인, 주간 누적 근무 시간 (revalidateTag 적용)

파일: components/attendance/TimeTracker.tsx  [Client Component]
  - 상태 머신: BEFORE_WORK → WORKING ⇌ BREAK ⇌ FIELD → DONE
  - Server Action: supabase.rpc('insert_attendance')
  - TanStack Query 낙관적 업데이트

파일: components/attendance/GPSCheckIn.tsx  [Client Component]
  - navigator.geolocation.getCurrentPosition()
  - → POST /api/geocode (Kakao Maps REST)
  - iOS Safari 재요청 처리 + ManualLocationInput 폴백

파일: app/api/geocode/route.ts
  - Kakao Maps API 역지오코딩 프록시 (API 키 서버 보관)
```

---

### Phase 5: 전자결재 (3일)
```
파일: app/(dashboard)/approval/leave/new/page.tsx
  - Server Action: supabase.rpc('validate_and_submit_leave', {...})
  - 잔여 일수 Server Component에서 fetch

파일: app/(dashboard)/approval/expense/new/page.tsx
  - 영수증: <input type="file" capture="environment" accept="image/*">
  - supabase.storage.from('receipts').upload(`${userId}/${timestamp}_${filename}`)
  - Server Action: expense_reports INSERT + expense_approval_steps 초기화

파일: app/(dashboard)/approval/inbox/page.tsx  [TanStack Query]
  - approve_leave_step / approve_expense_step RPC 호출
  - 최종 승인 시 outbox_events INSERT:
    { idempotency_key: 'CALENDAR_{requestId}', event_type: 'CALENDAR_INSERT', ... }
    { idempotency_key: 'DRIVE_{requestId}',    event_type: 'DRIVE_UPLOAD',    ... }
    { idempotency_key: 'CHAT_{requestId}_approved', event_type: 'CHAT_NOTIFY', ... }
```

---

### Phase 6: Outbox 프로세서 (1.5일)
```
파일: app/api/outbox/process/route.ts
  - CRON_SECRET 검증
  - ✅ FOR UPDATE SKIP LOCKED (중복 처리 방지 — Architect suggestion):
    SELECT * FROM outbox_events
    WHERE status IN ('PENDING','RETRY') AND retry_count < max_retries
    ORDER BY created_at
    LIMIT 10
    FOR UPDATE SKIP LOCKED;
  - 이벤트 타입별 처리:
    CALENDAR_INSERT → lib/google/calendar.insertEvent()
    DRIVE_UPLOAD    → lib/google/drive.uploadPDF() (pdf-lib)
    CHAT_NOTIFY     → lib/google/chat.sendWebhook()
  - 성공: status=SUCCESS, processed_at=NOW()
  - 실패: retry_count++, status=RETRY (max 초과: FAILED)

파일: lib/google/calendar.ts — events.insert() 래퍼
파일: lib/google/drive.ts    — pdf-lib PDF 생성 + files.create()
파일: lib/google/chat.ts     — Webhook POST
```

---

### Phase 7: 관리자 기능 (2일)
```
파일: app/(admin)/attendance/page.tsx  [RSC]
  - 직원별 월간 근태 달력
파일: components/admin/AttendanceEditor.tsx
  - 수정 폼 + Server Action: attendance_records UPDATE + attendance_corrections INSERT

파일: app/(admin)/reports/page.tsx  [RSC, revalidateTag('report-*')]
파일: app/api/reports/excel/route.ts
  - ExcelJS .xlsx 생성 (재택/외근/직출 컬럼 분리)
  - Content-Disposition: attachment

파일: components/admin/StatusBoard.tsx  [Client Component]
  - supabase.channel('attendance').on('postgres_changes', ...).subscribe()
  - RLS: 관리자만 전체 직원 상태 조회
```

---

### Phase 8: 시스템 설정 & 배포 (1일)
```
파일: app/(admin)/settings/page.tsx
  - Google Drive 폴더 경로, Chat Webhook URL 설정
  - 결재 양식 템플릿 JSON 관리
  - Outbox 실패 이벤트 재시도 트리거

배포:
  vercel env add (13개 환경변수)
  vercel --prod
```

---

## Risks and Mitigations (최종)

| 위험 | 완화 방안 |
|------|-----------|
| Google Directory Rate Limit (1500/day) | incremental sync (syncToken) + cron_logs 실패 기록 |
| GPS 권한 거부 | 수동 입력 폼 폴백 |
| RLS 오설정 → 데이터 노출 | SECURITY DEFINER + search_path 하드닝 + 네거티브 RLS 통합 테스트 |
| Outbox 중복 처리 | `FOR UPDATE SKIP LOCKED` + `idempotency_key UNIQUE` |
| Calendar/Drive API 장애 | outbox retry_count/max_retries, 실패는 FAILED 상태로 Admin UI 노출 |
| 잔여 연차 동시 초과 신청 | validate_and_submit_leave RPC `FOR UPDATE` |
| 이중 결재 승인 | approve_*_step RPC `FOR UPDATE` + `already_decided` 예외 |
| Storage 무단 접근 | bucket RLS + 사용자 ID 폴더 경로 규칙 |

---

## Verification Steps (최종 — 네거티브 포함)

| # | 테스트 | 예상 결과 |
|---|--------|-----------|
| 1 | Google 로그인 | `employees.auth_user_id = auth.uid()` 확인 |
| 2 | RLS 포지티브 | 직원 A → 자신의 attendance_records SELECT 성공 |
| 3 | **RLS 네거티브** | 직원 A → 직원 B의 attendance_records UPDATE → 0 rows affected |
| 4 | 근태 중복 방지 | 같은 날 CHECK_IN 두 번 → `uniq_attendance_daily` 위반 에러 |
| 5 | 연차 동시성 | 잔여 1일, 동시 2개 연차 신청 → 1개 성공, 1개 `insufficient_leave` |
| 6 | 이중 승인 방지 | 동시 approve_leave_step 2회 → 1개 성공, 1개 `already_decided` |
| 7 | Outbox 플로우 | 연차 최종 승인 → outbox_events 3개 → 60초 이내 Calendar 이벤트 확인 |
| 8 | Outbox 멱등성 | 동일 idempotency_key 두 번 INSERT → UNIQUE 제약 위반 |
| 9 | Storage RLS | 직원 A → 직원 B 영수증 URL 직접 접근 → 403 |
| 10 | Excel 다운로드 | 52시간 초과 테스트 데이터 → 리포트 + .xlsx 다운로드 |
| 11 | Realtime | StatusBoard에서 타 직원 CHECK_IN → 1초 이내 갱신 |
| 12 | search_path | `SET search_path` 없는 환경에서 DEFINER 함수 호출 → 동일 결과 확인 |

---

## Project File Structure

```
supery-backoffice/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # My Workspace (RSC)
│   │   ├── attendance/page.tsx           # 타임 트래커 + GPS (RSC + Client)
│   │   ├── approval/
│   │   │   ├── page.tsx
│   │   │   ├── leave/new/page.tsx
│   │   │   ├── expense/new/page.tsx
│   │   │   └── inbox/page.tsx            # TanStack Query
│   │   └── team/page.tsx
│   ├── (admin)/
│   │   ├── layout.tsx                    # ADMIN role guard
│   │   ├── dashboard/page.tsx            # RSC
│   │   ├── employees/page.tsx            # RSC
│   │   ├── attendance/page.tsx           # RSC + AttendanceEditor
│   │   ├── reports/page.tsx              # RSC
│   │   └── settings/page.tsx
│   └── api/
│       ├── auth/callback/route.ts
│       ├── geocode/route.ts
│       ├── approval/[id]/route.ts
│       ├── reports/excel/route.ts
│       ├── outbox/process/route.ts       # 1-min Cron
│       └── google/
│           └── directory-sync/route.ts  # Daily Cron
├── components/
│   ├── attendance/TimeTracker.tsx, GPSCheckIn.tsx, ManualLocationInput.tsx
│   ├── approval/LeaveForm.tsx, ExpenseForm.tsx, ApprovalCard.tsx
│   └── admin/StatusBoard.tsx, AttendanceEditor.tsx, WorkHoursChart.tsx
├── lib/
│   ├── supabase/client.ts, server.ts
│   ├── google/directory.ts, calendar.ts, drive.ts, chat.ts
│   ├── utils/geocoding.ts, attendance.ts, excel.ts
│   └── cache/tags.ts
├── supabase/migrations/ (001~006)
├── types/database.ts                     # Supabase gen types
└── vercel.json                           # 2 crons
```

---

## Estimated Timeline

| Phase | 내용 | 예상 기간 |
|-------|------|-----------|
| 1 | 프로젝트 기초 + cache/tags.ts | 1일 |
| 2 | DB 스키마 + RLS + Storage + Realtime | 1.5일 |
| 3 | 인증 + Directory 동기화 | 1.5일 |
| 4 | 근태 관리 (타임 트래커 + GPS) | 2.5일 |
| 5 | 전자결재 | 3일 |
| 6 | Outbox 프로세서 + Google API | 1.5일 |
| 7 | 관리자 기능 | 2일 |
| 8 | 설정 + 배포 | 1일 |
| **합계** | | **~14일** |

---

## v1 → v3 변경 로그

| # | 항목 | 출처 |
|---|------|------|
| 1 | `employees.auth_user_id` + DEFINER 헬퍼 + `search_path` | Architect v1#1,2 + v3#2 |
| 2 | PDFKit → pdf-lib | Architect v1#4 |
| 3 | outbox_events + Cron 프로세서 + `FOR UPDATE SKIP LOCKED` + `idempotency_key` | Architect v1#3, v2#4,5 |
| 4 | organizations DDL + sync_token + cron_logs | Architect v1#5 |
| 5 | approval_audit_log | Architect v1#6 |
| 6 | lib/cache/tags.ts | Architect v1#7 |
| 7 | validate_and_submit_leave RPC | Critic v1#3 |
| 8 | approve_leave_step + approve_expense_step RPC | Critic v1#1, v2 missing |
| 9 | leave_approval_steps / expense_approval_steps 분리 | Critic v1#2 |
| 10 | Storage receipts 버킷 RLS | Critic v1#4 |
| 11 | supabase_realtime publication 명시 | Critic v1#5 |
| 12 | **CREATE UNIQUE INDEX uniq_attendance_daily (KST cast)** | Architect v2#1 (BLOCKING) |
| 13 | **SET search_path 모든 DEFINER 함수** | Architect v2#2 (BLOCKING) |
| 14 | Chat SLO: "3초" → "60초" | Critic v1 측정 가능성 |
