# Deep Interview Spec: SuperY WorkSync 백오피스

## Metadata
- Interview ID: supery-backoffice-001
- Rounds: 8
- Final Ambiguity Score: 14.5%
- Type: greenfield
- Generated: 2026-06-05
- Threshold: 0.20
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED

---

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 40% | 0.360 |
| Constraint Clarity | 0.80 | 30% | 0.240 |
| Success Criteria | 0.85 | 30% | 0.255 |
| **Total Clarity** | | | **0.855** |
| **Ambiguity** | | | **14.5%** |

---

## Topology
| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| 대시보드 & 리포트 | active | 전사 근태 현황, 주52시간 모니터링, 노무 증빙 엑셀 다운로드 | 관리자: 전수 직원 실시간 현황(업무중/회의중/외근중/휴가중), 주52시간 초과 경보, 엑셀 다운로드 |
| 직원 & 조직 관리 | active | 임직원 등록/관리, Google Directory API 연동 조직도 동기화 | Google Directory API Daily Batch 동기화, 3단 결재선(담당-팀장-대표) 자동 생성 |
| 근태 관리 | active | 타임 트래킹 기록 조회/수정, GPS 외근 로그, 시간-태스크 매핑 이력 | 직원: 출/휴식/퇴근 입력 + 수행 태스크 매핑 + GPS 현장 직출퇴. 관리자: 기록 수정/정정 |
| 전자결재 관리 | active | 결재 양식 관리, 결재 이력 조회, 워크플로우(결재선) 설정 | 연차/반차/지출결의서 신청→3단 승인/반려. 관리자: 양식 등록/수정 + 승인선 설정 |
| 시스템 설정 | active | Google Workspace 연동 설정, 알림 정책, 회사 정책 | Google OAuth + Directory/Calendar/Drive/Chat Webhook 연동 설정 |

---

## Goal
슈퍼와이(SuperY)가 구축하는 WorkSync는 **중소규모 기업 및 광고회사 대상의 통합 근태 관리 + 전자결재 서비스**이다. 이 시스템은 전체 임직원(일반 직원 + 팀장 + HR/대표)이 하나의 통합 포털에서 사용하는 완전한 웹 애플리케이션으로, 출퇴근 타임 트래킹, GPS 현장 근태, 전자결재 워크플로우, Google Workspace 자동화를 단일 플랫폼으로 제공한다.

---

## Constraints
- **Frontend**: Next.js (App Router, React)
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage)
- **인증**: Google OAuth (Supabase Auth Provider) — Google Workspace 계정으로 원클릭 SSO
- **Google Workspace APIs**: Directory API, Calendar API, Drive API, Chat Webhook (모두 MVP 포함)
- **GPS**: HTML5 Geolocation API (모바일 브라우저) — 위경도 캡처 후 역지오코딩
- **배포**: Vercel (Next.js 표준 배포 환경)
- **대상 기업 규모**: 중소규모 (SME) 및 광고회사
- **MVP**: 아래 핵심 기능 5가지 Must + Google 자동화 3가지 Must

---

## Non-Goals
- 네이티브 모바일 앱 (React Native/Flutter) — 모바일 반응형 웹으로 대체
- Google Looker Studio 연동 (PRD 확장성 항목 — v2)
- 법인카드 API 연동 (토스페이먼츠 등) — v2
- 급여 정산 시스템 — 범위 외
- 오프라인 지원 — 인터넷 연결 전제

---

## Acceptance Criteria

### 직원 기능
- [ ] Google Workspace 계정으로 로그인(SSO)하면 회사 조직도(직급·부서)가 자동 설정된다
- [ ] 출근 버튼 클릭 시 서버 타임스탬프가 기록되고, 세션 전환 시 수행 태스크 텍스트 입력이 강제된다
- [ ] 모바일에서 [현장 직출] 클릭 시 GPS 위경도가 캡처되고 역지오코딩된 위치명이 저장된다
- [ ] 연차 신청서를 상신하면 잔여 휴가 일수가 실시간으로 검증된다
- [ ] 지출결의서에 모바일 카메라로 영수증을 첨부할 수 있다
- [ ] 내 결재 신청 현황(진행 중 / 승인 / 반려)을 추적할 수 있다

### 관리자/팀장 기능
- [ ] 대표 최종 승인 시 잔여 연차가 차감되고 Google Calendar에 '[오후반차] 홍길동' 형식의 일정이 자동 등록된다
- [ ] 지출결의서 최종 승인 시 PDF + 영수증 이미지가 Google Drive 지정 폴더에 자동 업로드된다
- [ ] 결재 상신 시 팀장/대표에게, 승인/반려 시 기안자에게 Google Chat Webhook 알림이 발송된다
- [ ] 관리자는 특정 직원의 근태 기록을 수정/정정할 수 있다 (수정 이력 남김)
- [ ] 주 52시간 초과 직원 목록이 대시보드에 표시되고 Excel로 다운로드된다
- [ ] 전사 직원 실시간 상태(업무중/회의중/외근중/휴가중)가 현황판에 표시된다
- [ ] 관리자는 결재 양식(연차·지출)을 등록/수정하고 Google Shared Drive 저장 경로를 설정할 수 있다
- [ ] Google Directory API Daily Batch로 조직도(OU, 직급, 부서장)가 자동 동기화된다

---

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 백오피스 = 관리자 전용 | "전직원이 사용한다고 했는데?" | 통합 포털 — 직원 + 관리자 모두 하나의 앱 사용 |
| 단순 관리자 도구 | "GPS, 타임 트래킹은 누가 쓰나?" | 직원도 프론트엔드에서 직접 사용 |
| Google 연동은 나중에 | "Calendar/Drive를 MVP에서 빼도 되나?" | 사용자: 반드시 MVP에 포함 |
| BaaS = bkend.ai | "어떤 백엔드를 쓸 것인가?" | Supabase 선택 (PostgreSQL + Auth + Storage) |
| GPS는 나중에 | "모바일 GPS가 MVP에 필요한가?" | Must 4개 중 하나로 확인됨 |

---

## Technical Context
- **신규(Greenfield)** — 기존 코드 없음
- **Auth**: Supabase Auth (Google OAuth Provider) + Google Workspace 도메인 제한 필요
- **Google API 연동**:
  - Directory API: 서버 사이드 (Next.js Route Handler) — Daily Batch (Cron)
  - Calendar API: 결재 최종 승인 Supabase Edge Function or Next.js Route Handler에서 호출
  - Drive API: 지출결의서 최종 승인 시 PDF 생성 후 업로드
  - Chat Webhook: 결재 상태 변경 이벤트 트리거 시 POST
- **GPS 역지오코딩**: 클라이언트에서 Geolocation API → 서버로 좌표 전송 → Google Geocoding API 또는 Kakao Maps API로 주소 변환
- **데이터 모델 핵심 엔티티**: Employee, Organization, AttendanceRecord, TaskEntry, LeaveRequest, ExpenseReport, ApprovalLine, ApprovalStep

---

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Employee | core domain | id, name, email, department, position, role(EMPLOYEE/MANAGER/ADMIN), google_id | belongs to Organization, has many AttendanceRecords, LeaveRequests |
| Organization | core domain | id, name, ou_path, manager_id, google_sync_at | has many Employees |
| AttendanceRecord | core domain | id, employee_id, date, type(CHECK_IN/BREAK/FIELD_OUT/CHECK_OUT), timestamp, task_description, gps_lat, gps_lng, gps_address, is_field | belongs to Employee |
| LeaveRequest | core domain | id, employee_id, leave_type(ANNUAL/HALF_AM/HALF_PM), start_date, end_date, reason, status, google_event_id | has many ApprovalSteps |
| ExpenseReport | core domain | id, employee_id, title, amount, receipts[], drive_file_id, status | has many ApprovalSteps |
| ApprovalLine | supporting | id, template_name, steps[{approver_id, order}] | used by LeaveRequest, ExpenseReport |
| ApprovalStep | supporting | id, request_id, approver_id, order, status(PENDING/APPROVED/REJECTED), comment, decided_at | belongs to Employee (approver) |
| Notification | supporting | id, type, recipient_id, payload, sent_at, channel(EMAIL/CHAT) | triggered by ApprovalStep state changes |

---

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 3 | 6 | 2 | 0 | 4 | 67% |
| 6 | 8 | 2 | 0 | 6 | 75% |
| 8 | 8 | 0 | 0 | 8 | 100% |

---

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 0 (Topology)
**Q:** PRD를 바탕으로 5개 컴포넌트로 읽었습니다. 맞나요?
**A:** 맞습니다 (5개 그대로)

### Round 1
**Q:** 이 백오피스를 주로 사용하는 사람은 누구인가요?
**A:** 전직원 및 관리자
**Ambiguity:** 75% (Goal: 0.40, Constraints: 0.25, Criteria: 0.15)

### Round 2
**Q:** 일반 직원이 직접 사용하는 기능은 어디까지인가요?
**A:** 통합 포털로 하나의 앱 (직원용 기능 포함)
**Ambiguity:** 61% (Goal: 0.65, Constraints: 0.25, Criteria: 0.20)

### Round 3
**Q:** 선호하는 프론트엔드 프레임워크가 있나요?
**A:** Next.js (React)
**Ambiguity:** 50%

### Round 4
**Q:** 백엔드 및 데이터베이스는 무엇을 사용할까요?
**A:** Supabase
**Ambiguity:** 50% (Goal: 0.70, Constraints: 0.55, Criteria: 0.20)

### Round 5
**Q:** MVP가 완료되었다는 것을 어떻게 판단할까요?
**A:** 실제 출퇴근 + 결재 승인 플로우
**Ambiguity:** 34% (Goal: 0.75, Constraints: 0.60, Criteria: 0.60)

### Round 6 (Simplifier Mode)
**Q:** PRD Must 5개 중 MVP 필수 vs 나중에 추가해도 되는 것은?
**A:** Google SSO + 조직도, 타임 트래킹, GPS 의출근, 연차/반차 + 지출결의서 결재 (4개 모두)
**Ambiguity:** 26%

### Round 7
**Q:** Google Workspace API 연동을 MVP에 포함할까요?
**A:** MVP에 반드시 포함
**Ambiguity:** 20.4%

### Round 8
**Q:** 관리자(HR/대표)만 할 수 있는 행동은 무엇인가요?
**A:** 근태 기록 수정/정정, 주 52시간 리포트 + 엑셀 다운로드, 전수 직원 실시간 현황, 결재 양식 + 승인선 설정
**Ambiguity:** 14.5% ✅ (threshold passed)

</details>
