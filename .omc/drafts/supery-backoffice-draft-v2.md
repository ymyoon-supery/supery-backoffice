# WorkSync 백오피스 구현 계획 (Draft v2)

**상태**: DRAFT v2 — Architect + Critic 피드백 반영  
**Iteration**: 2 / 5  
**v1 대비 주요 변경**: RLS 아이덴티티 수정, outbox 패턴, pdf-lib 전환, 동시성 제어, Storage RLS, organizations DDL, 승인 감사 로그

---

## RALPLAN-DR Summary (Short Mode)

### Principles
1. **직원 중심 모바일 UX** — 타임 트래커·GPS 체크인은 모바일 브라우저 우선
2. **Google Workspace 연장, 중복 금지** — Calendar·Drive·Chat을 결재 이벤트 자동화 허브로 활용
3. **노무 데이터 무결성** — 근태 및 결재 수정 시 audit trail 보존, 원본 데이터 불변
4. **역할 기반 접근 제어(RBAC)** — Supabase RLS + SECURITY DEFINER 헬퍼로 DB 레벨 권한 격리
5. **점진적 확장 가능 설계** — Google API는 outbox 패턴으로 추상화, 서비스 레이어 분리

### Decision Drivers
1. **RLS 아이덴티티 바인딩** — `auth.uid()` ↔ `employees` FK 없이 RLS 전체 무효화
2. **Google API 원자성** — DB 커밋과 Calendar/Drive/Chat 호출이 동일 트랜잭션에 있으면 안 됨 → outbox 필수
3. **Vercel 서버리스 PDF** — PDFKit의 `fs.readFileSync` 런타임 깨짐 → 순수 JS 라이브러리 필수

### Viable Options (변경 없음 — Hybrid 채택 확정)
**RSC(Server Components) + Server Actions + TanStack Query Hybrid**:
- RSC: 읽기 전용 관리자 리포트, 대시보드 요약 (캐시·보안)
- Server Actions: 모든 뮤테이션 (인증 + revalidation 통합)
- TanStack Query (Client Component 내부만): TimeTracker, ApprovalInbox (낙관적 업데이트)
- `lib/cache/tags.ts`: revalidateTag 키 사전 정의 파일

---

## Requirements Summary (v1과 동일)

| 구분 | 내용 |
|------|------|
| 스택 | Next.js 15 (App Router) + Supabase + Vercel |
| 인증 | Google OAuth via Supabase Auth |
| PDF | **pdf-lib** (순수 JS, 서버리스 안전) — v1의 PDFKit에서 교체 |
| 역지오코딩 | Kakao Maps REST API |
| 배포 | Vercel + Supabase Cloud |

---

## Acceptance Criteria (v2 — 보완된 항목 🔄)

### 인증 & 조직
- [ ] Google OAuth 콜백 시 `auth.users.id`를 `employees.auth_user_id`로 저장하여 RLS `auth.uid()` 일치 보장
- [ ] Daily Batch Cron이 `organizations.sync_token`을 갱신하여 다음 실행 시 증분 동기화하며, 실패 시 `cron_logs` 테이블에 오류 기록
- [ ] 3단 결재선이 Directory API 데이터로 자동 생성되어 `approval_lines` 테이블에 저장

### 근태 (직원)
- [ ] [출근] 클릭 시 Supabase RPC `insert_attendance()`가 호출되어 동일 날짜 중복 CHECK_IN이 DB 유니크 제약으로 차단됨
- [ ] 세션 전환 시 태스크 입력 강제 — 미입력 시 Client 단에서 Submit 차단
- [ ] GPS 체크인: 위경도 + 역지오코딩 주소 저장, 권한 거부 시 수동 입력 폼 폴백

### 전자결재 (직원)
- [ ] 연차 신청 시 `validate_and_submit_leave()` RPC가 `remaining_leaves` 잔여 검증 + `leave_requests` INSERT를 단일 트랜잭션으로 처리 (체크-후-삽입 경쟁 조건 방지)
- [ ] 영수증을 Supabase Storage `receipts` 버킷에 업로드 시, 본인 소유 파일만 접근 가능한 버킷 RLS 정책이 적용됨
- [ ] 내 결재 신청 목록에서 단계별 상태(1단계/2단계/3단계 완료) 확인 가능

### 전자결재 (관리자/팀장)
- [ ] 결재 승인 시 `approve_request()` RPC가 `SELECT FOR UPDATE`로 `approval_steps` 행을 잠근 후 상태를 변경하여 동시 이중 승인 방지
- [ ] 대표 최종 승인 시 `outbox_events`에 `{type: "CALENDAR_INSERT", payload: {...}}` 레코드가 삽입됨
- [ ] Outbox 프로세서 Cron(매 1분)이 `outbox_events`를 처리하여 Calendar 등록, Drive 업로드, Chat Webhook을 순서대로 실행; 각 이벤트 처리 결과(`SUCCESS`/`FAILED`/`RETRY`)가 기록됨
- [ ] Chat Webhook은 이벤트 처리 후 **60초 이내** 전송됨 (Cron 주기 1분 기준)

### 관리자 전용
- [ ] 근태 기록 수정 시 `attendance_corrections` 테이블에 (수정자, 수정 전, 수정 후, 사유, 시각) 저장
- [ ] 결재 승인/반려 행위가 `approval_audit_log` 테이블에 기록됨 (approver, action, timestamp, comment)
- [ ] 주52시간 초과 직원 목록 + Excel 다운로드 (재택/외근/직출 컬럼 분리)
- [ ] 전사 실시간 현황판: Supabase Realtime 구독 + `supabase_realtime` publication에 `attendance_records` 추가, RLS 적용 확인
- [ ] Storage `receipts` 버킷 정책: 소유자만 read, admin만 전체 read

---

## Database Schema v2

```sql
-- organizations (NEW in v2)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ou_path TEXT,
  manager_id UUID,
  sync_token TEXT,           -- Google Directory API incremental sync token
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- employees (v2: auth_user_id FK 추가)
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,  -- RLS 바인딩 핵심
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

-- attendance_records (v2: 중복 CHECK_IN 방지 유니크 제약)
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, DATE(recorded_at), type)  -- 같은 날 동일 타입 중복 방지
);

-- attendance_corrections (audit trail — v1과 동일)
CREATE TABLE attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES attendance_records(id),
  corrected_by UUID REFERENCES employees(id),
  before_value JSONB,
  after_value JSONB,
  reason TEXT NOT NULL,
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
  receipt_storage_paths TEXT[],   -- Supabase Storage paths
  drive_file_id TEXT,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- approval_lines
CREATE TABLE approval_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  request_type TEXT CHECK (request_type IN ('LEAVE','EXPENSE')),
  steps JSONB NOT NULL   -- [{order:1, approver_id:uuid, role:'MANAGER'}, ...]
);

-- approval_steps (v2: 명시적 FK + 동시성 제어용 unique constraint)
CREATE TABLE leave_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID REFERENCES employees(id),
  step_order INT NOT NULL,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
  comment TEXT,
  decided_at TIMESTAMPTZ,
  UNIQUE (leave_request_id, step_order)  -- 동일 단계 중복 방지
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

-- approval_audit_log (NEW in v2 — 결재 행위 감사 로그)
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

-- outbox_events (NEW in v2 — Google API 비동기 처리)
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT CHECK (event_type IN (
    'CALENDAR_INSERT','CALENDAR_DELETE','DRIVE_UPLOAD','CHAT_NOTIFY'
  )),
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('PENDING','SUCCESS','FAILED','RETRY')) DEFAULT 'PENDING',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- cron_logs (NEW in v2 — Directory sync 신뢰성)
CREATE TABLE cron_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('SUCCESS','FAILED')),
  records_synced INT,
  error_message TEXT,
  ran_at TIMESTAMPTZ DEFAULT NOW()
);
```

### SECURITY DEFINER 헬퍼 함수 (v2 — RLS 재귀 방지)

```sql
-- employees 테이블 RLS 없이 역할 조회
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION is_manager_of(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees mgr
    JOIN employees emp ON emp.manager_id = mgr.id
    WHERE mgr.auth_user_id = auth.uid() AND emp.id = target_employee_id
  );
$$;

CREATE OR REPLACE FUNCTION own_employee_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;
```

### RLS 정책 v2

```sql
-- attendance_records
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_records" ON attendance_records
  FOR ALL USING (employee_id = own_employee_id());

CREATE POLICY "admin_all" ON attendance_records
  FOR ALL USING (is_admin());

CREATE POLICY "manager_team" ON attendance_records
  FOR SELECT USING (is_manager_of(employee_id));
```

### 원자적 RPC (동시성 제어)

```sql
-- 연차 신청: 잔여 검증 + INSERT를 단일 트랜잭션
CREATE OR REPLACE FUNCTION validate_and_submit_leave(
  p_leave_type TEXT, p_start_date DATE, p_end_date DATE, p_reason TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_employee_id UUID;
  v_days NUMERIC;
  v_request_id UUID;
BEGIN
  v_employee_id := own_employee_id();
  v_days := (CASE p_leave_type WHEN 'ANNUAL' THEN (p_end_date - p_start_date + 1)
                                ELSE 0.5 END);
  IF (SELECT remaining_leaves FROM employees WHERE id = v_employee_id FOR UPDATE) < v_days THEN
    RAISE EXCEPTION 'insufficient_leave';
  END IF;
  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason)
    VALUES (v_employee_id, p_leave_type, p_start_date, p_end_date, p_reason)
    RETURNING id INTO v_request_id;
  RETURN v_request_id;
END;
$$;

-- 결재 승인: SELECT FOR UPDATE로 이중 승인 방지
CREATE OR REPLACE FUNCTION approve_leave_step(p_step_id UUID, p_comment TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_step leave_approval_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM leave_approval_steps WHERE id = p_step_id FOR UPDATE;
  IF v_step.status <> 'PENDING' THEN
    RAISE EXCEPTION 'already_decided';
  END IF;
  UPDATE leave_approval_steps
    SET status = 'APPROVED', comment = p_comment, decided_at = NOW()
    WHERE id = p_step_id;
  INSERT INTO approval_audit_log (request_type, request_id, approver_id, action, step_order, comment)
    VALUES ('LEAVE', v_step.leave_request_id, own_employee_id(), 'APPROVED', v_step.step_order, p_comment);
END;
$$;
```

---

## Implementation Steps v2

### Phase 1: 프로젝트 기초 (1일 — 변경 없음)
```
파일: package.json, tsconfig.json, tailwind.config.ts, next.config.ts
- Next.js 15, TypeScript, Tailwind, shadcn/ui, @supabase/ssr, pdf-lib, exceljs
```

**추가 — `lib/cache/tags.ts`**:
```typescript
// 모든 revalidateTag 키를 중앙 관리
export const CACHE_TAGS = {
  attendance: (employeeId: string) => `attendance-${employeeId}`,
  adminReport: (weekStart: string) => `report-${weekStart}`,
  orgChart: 'org-chart',
  approvalInbox: (approverId: string) => `inbox-${approverId}`,
} as const;
```

---

### Phase 2: DB 스키마 & RLS (1.5일 — v2 대폭 확장)
```
파일: supabase/migrations/001_initial_schema.sql — 위 DDL 전체 (organizations 포함)
파일: supabase/migrations/002_rls_helpers.sql   — SECURITY DEFINER 함수 4개
파일: supabase/migrations/003_rls_policies.sql  — 헬퍼 기반 RLS 정책
파일: supabase/migrations/004_rpc_functions.sql — validate_and_submit_leave, approve_leave_step 등
파일: supabase/migrations/005_realtime.sql
  ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
  ALTER PUBLICATION supabase_realtime ADD TABLE leave_approval_steps;
```

**Storage 버킷 RLS** (`supabase/migrations/006_storage_rls.sql`):
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

### Phase 3: 인증 & Google Directory 동기화 (1.5일)
```
파일: app/api/auth/callback/route.ts
  - OAuth 콜백: auth.users 생성 후 employees 레코드 upsert (auth_user_id = session.user.id)

파일: lib/google/directory.ts
  - incremental sync: organizations.sync_token 읽기 → usersList({syncToken}) → upsert → sync_token 저장

파일: app/api/google/directory-sync/route.ts
  - GET → Authorization: Bearer ${CRON_SECRET} 검증
  - lib/google/directory.syncAll() 호출
  - cron_logs INSERT (성공/실패 기록)

파일: vercel.json
  - crons: [{ path: '/api/google/directory-sync', schedule: '0 17 * * *' }]
  - crons: [{ path: '/api/outbox/process', schedule: '* * * * *' }]  // 1분마다
```

---

### Phase 4: 근태 관리 (2.5일 — Supabase RPC 사용)
```
파일: components/attendance/TimeTracker.tsx  [Client Component]
  - 상태 머신: BEFORE_WORK → WORKING → BREAK → FIELD → DONE
  - 전환 시 Server Action 호출 (insert_attendance RPC)
  - TanStack Query로 낙관적 상태 업데이트 + revalidateTag(CACHE_TAGS.attendance)

파일: components/attendance/GPSCheckIn.tsx  [Client Component]
  - navigator.geolocation.getCurrentPosition()
  - Kakao Maps API 역지오코딩
  - iOS Safari 재요청 UX 처리
  - 권한 거부 → ManualLocationInput 폴백
```

---

### Phase 5: 전자결재 (3일)
```
파일: app/(dashboard)/approval/leave/new/page.tsx
  - Server Action: supabase.rpc('validate_and_submit_leave', {...})
  - 잔여 휴가 실시간 표시 (Server Component fetch)

파일: app/(dashboard)/approval/expense/new/page.tsx
  - 영수증 업로드: receipts/{auth.uid()}/{timestamp}_{filename} 경로
  - Server Action: expense_reports INSERT + expense_approval_steps 초기화

파일: app/(dashboard)/approval/inbox/page.tsx  [TanStack Query]
  - approve_leave_step / approve_expense_step RPC 호출
  - 승인 완료 시 outbox_events INSERT (CALENDAR_INSERT / DRIVE_UPLOAD / CHAT_NOTIFY)
```

---

### Phase 6: Outbox 프로세서 (1.5일 — v1의 인라인 Google 호출 교체)
```
파일: app/api/outbox/process/route.ts
  - GET → PENDING 이벤트 fetch (retry_count < max_retries)
  - 이벤트 타입별 Google API 호출 (lib/google/*.ts)
  - 성공: status=SUCCESS, processed_at=NOW()
  - 실패: retry_count++, status=RETRY (max 초과 시 FAILED)

파일: lib/google/calendar.ts
  - events.insert() 래퍼 + 에러 핸들링

파일: lib/google/drive.ts
  - pdf-lib로 지출결의서 PDF 생성 (순수 JS, 서버리스 안전)
  - files.create() 업로드

파일: lib/google/chat.ts
  - Webhook POST 헬퍼
```

---

### Phase 7: 관리자 기능 (2일 — 변경 없음)
```
파일: app/(admin)/attendance/page.tsx + AttendanceEditor.tsx
  - 수정 시 attendance_corrections 감사 로그

파일: app/(admin)/reports/page.tsx + app/api/reports/excel/route.ts
  - ExcelJS .xlsx 생성 (재택/외근/직출 분리)

파일: components/admin/StatusBoard.tsx  [Client Component + Realtime]
  - useSupabaseRealtime('attendance_records') 구독
  - RLS 적용 확인 필수
```

---

### Phase 8: 시스템 설정 & 배포 (1일)
```
파일: app/(admin)/settings/page.tsx
  - Drive 폴더 경로, Chat Webhook URL, 결재 양식 관리
  - Vercel 환경변수 점검 체크리스트
```

---

## Risks and Mitigations v2

| 위험 | 가능성 | 영향도 | 완화 방안 |
|------|-------|-------|-----------|
| Google API Rate Limit | 중 | 중 | incremental sync (syncToken), outbox retry 큐 |
| GPS 권한 거부 (iOS) | 고 | 중 | 수동 입력 폼 폴백 |
| RLS 설정 실수 | 저 | 고 | SECURITY DEFINER 함수 + 네거티브 RLS 통합 테스트 |
| Outbox 지연 (최대 1분) | 중 | 저 | 허용 가능 — Chat SLO = 60초 이내로 명시 |
| Realtime RLS 누락 | 중 | 고 | migration에서 publication + RLS 동시 설정 |
| 동시 이중 승인 | 저 | 고 | approve_*_step RPC의 SELECT FOR UPDATE |
| 잔여 연차 레이스 | 저 | 고 | validate_and_submit_leave RPC의 원자적 처리 |
| Supabase Storage 무단 접근 | 중 | 고 | bucket RLS 정책 (Phase 2에서 migration으로 설정) |

---

## Verification Steps v2 (강화됨)

1. **인증**: Google 로그인 → `employees.auth_user_id = auth.uid()` 확인
2. **RLS 포지티브**: 직원으로 로그인 → 자신의 attendance_records 조회 성공
3. **RLS 네거티브**: 직원 A로 로그인 → 직원 B의 attendance_records UPDATE → 403 또는 0 rows
4. **근태 사이클**: 출근→태스크 입력→휴식→복귀→퇴근 → attendance_records 5개 확인
5. **연차 동시성**: 동시 2개 연차 신청 (잔여=1일) → 1개만 성공 확인
6. **결재 이중 승인**: 동시 2개 approve_leave_step 호출 → 1개만 성공, 1개 `already_decided` 에러
7. **Outbox 플로우**: 연차 최종 승인 → outbox_events 레코드 생성 → 60초 이내 Calendar 이벤트 확인
8. **Storage RLS**: 직원 A가 직원 B 영수증 URL 직접 접근 → 403
9. **Excel 다운로드**: 52시간 초과 테스트 데이터 → 리포트 + .xlsx 다운로드 확인
10. **Realtime**: StatusBoard에서 타 직원 출근 입력 → 1초 이내 현황판 갱신

---

## Estimated Timeline v2

| Phase | 내용 | 예상 기간 |
|-------|------|-----------|
| Phase 1 | 프로젝트 기초 + cache/tags.ts | 1일 |
| Phase 2 | DB 스키마 + RLS + Storage + Realtime | 1.5일 |
| Phase 3 | 인증 + Directory 동기화 (증분) | 1.5일 |
| Phase 4 | 근태 관리 (타임 트래커 + GPS) | 2.5일 |
| Phase 5 | 전자결재 (신청 + 워크플로우) | 3일 |
| Phase 6 | Outbox 프로세서 + Google API | 1.5일 |
| Phase 7 | 관리자 기능 | 2일 |
| Phase 8 | 설정 + 배포 | 1일 |
| **합계** | | **~14일** |

---

## v1 → v2 변경 로그

| # | 항목 | 출처 |
|---|------|------|
| 1 | `employees.auth_user_id UUID REFERENCES auth.users` 추가, RLS 전면 재작성 | Architect #1 |
| 2 | SECURITY DEFINER 헬퍼 함수 (`is_admin`, `is_manager_of`, `own_employee_id`) | Architect #2 |
| 3 | PDFKit → **pdf-lib** 교체 | Architect #4 |
| 4 | `outbox_events` + Cron 프로세서 도입 (인라인 Google 호출 제거) | Architect #3 |
| 5 | `organizations` 테이블 + `sync_token`, `cron_logs` DDL 추가 | Architect #5 |
| 6 | `approval_audit_log` 테이블 추가 | Architect #6 |
| 7 | `lib/cache/tags.ts` revalidateTag 키 사전 | Architect #7 |
| 8 | `validate_and_submit_leave` RPC (원자적 잔여 검증 + INSERT) | Critic #3 |
| 9 | `approve_leave_step` RPC (`SELECT FOR UPDATE` 동시성 제어) | Critic #1 |
| 10 | `leave_approval_steps` / `expense_approval_steps` 분리 (FK 무결성) | Critic #2 |
| 11 | Storage `receipts` 버킷 RLS 정책 (migration 포함) | Critic #4 |
| 12 | `supabase_realtime` publication 명시적 설정 | Critic #5 |
| 13 | Chat SLO: "3초 이내" → "60초 이내" (Outbox 주기 반영) | Critic (측정 가능성) |

---

**상태**: DRAFT v2 — Architect/Critic 재검토 대기
