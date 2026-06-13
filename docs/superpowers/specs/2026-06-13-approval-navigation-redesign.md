# Approval Navigation Redesign

**Date:** 2026-06-13
**Feature:** 결재 메뉴 구조 개편 — 내 신청 내역 / 결재 대기 분리 + 관리자 결재관리 명칭 변경

---

## Overview

현재 "결재함" 메뉴가 본인 신청 내역 조회와 타인 결재 처리 두 역할을 혼용하고 있어 혼란을 유발한다. 이를 역할별로 분리하고, 메뉴 순서를 정리한다.

---

## Requirements

| # | 요구사항 |
|---|---------|
| 1 | 사이드바 메뉴 순서: 지출결의 → 내 신청 내역 → (결재 대기) → 공지사항 |
| 2 | "결재함" 항목을 "내 신청 내역"으로 이름 변경, 라우트 `/approval/my` |
| 3 | 팀장(position = '팀장') 에게만 "결재 대기 [N]" 메뉴 추가, 라우트 `/approval/pending` |
| 4 | 관리자에게는 "결재 대기" 미표시 (관리자 승인은 관리자 메뉴 "결재관리"에서 처리) |
| 5 | 관리자 메뉴의 "결재함" → "결재관리"로 명칭 변경 |
| 6 | 결재 대기 배지: 본인이 처리해야 할 건수 (leave + expense 합산), 0이면 숨김 |
| 7 | 기존 `/approval/inbox` 라우트 삭제, `/approval/my` 로 교체 |
| 8 | 소스 내 `/approval/inbox` 링크 4곳 일괄 수정 |

---

## Sidebar Menu Structure

### 일반 팀원
```
홈
근태등록
연차 사용 내역
연차 신청
지출결의
내 신청 내역    /approval/my
공지사항
```

### 팀장 (position = '팀장')
```
홈
근태등록
연차 사용 내역
연차 신청
지출결의
내 신청 내역    /approval/my
결재 대기 [N]   /approval/pending
공지사항
```

### 관리자
```
홈
근태등록
연차 사용 내역
연차 신청
지출결의
내 신청 내역    /approval/my
공지사항
─── 관리자 ───
결재관리        /admin/approval
출퇴근 현황
근태 현황
52시간 리포트
연차관리
연차사용촉진
공지사항 관리
설정
```

---

## Data Model

DB 변경 없음. 배지 카운트는 런타임에서 계산.

### 결재 대기 건수 쿼리

```sql
-- leave 대기
SELECT COUNT(*) FROM leave_approval_steps
WHERE approver_id = :userId AND status = 'PENDING';

-- expense 대기
SELECT COUNT(*) FROM expense_approval_steps
WHERE approver_id = :userId AND status = 'PENDING';
```

두 값의 합계를 배지에 표시.

---

## Pages

### `/approval/my` (기존 `/approval/inbox` 교체)

본인이 제출한 연차 신청 + 지출결의 목록을 표시.

| 컬럼 | 내용 |
|------|------|
| 종류 | 연차/지출결의 구분 |
| 제목/내용 | 연차 유형 또는 지출 제목 |
| 신청일 | created_at |
| 상태 | PENDING/APPROVED/REJECTED/CANCELLED 배지 |

- 기존 `/approval/inbox` 페이지의 "내 신청" 탭 내용 기반으로 구현
- 연차, 지출결의 통합 목록 (최신순)

### `/approval/pending` (신규)

본인이 승인해야 할 결재 목록 (팀장 전용).

| 컬럼 | 내용 |
|------|------|
| 종류 | 연차/지출결의 구분 |
| 신청자 | 이름 |
| 내용 | 연차 유형 또는 지출 제목 |
| 신청일 | created_at |
| 액션 | 승인 / 반려 버튼 |

- 기존 `/approval/inbox` 페이지의 "결재 대기" 탭 내용 기반으로 구현
- 팀장이 아닌 사용자가 직접 접근 시 `/approval/my` 로 redirect

---

## Files Changed

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `components/layout/Sidebar.tsx` | 수정 | 메뉴 재정의, 팀장 조건 분기, 배지 렌더링 |
| `app/(dashboard)/layout.tsx` | 수정 | 결재 대기 건수 fetch, Sidebar에 prop 전달 |
| `app/(dashboard)/approval/my/page.tsx` | 신규 | 내 신청 내역 페이지 |
| `app/(dashboard)/approval/pending/page.tsx` | 신규 | 결재 대기 페이지 (팀장 전용) |
| `app/(dashboard)/approval/inbox/page.tsx` | 삭제 | `/approval/my` 로 교체 |
| `components/approval/LeaveForm.tsx` | 수정 | 제출 후 리다이렉트 `/approval/my` |
| `components/approval/ExpenseForm.tsx` | 수정 | 제출 후 리다이렉트 `/approval/my` |
| `app/(admin)/admin/approval/page.tsx` | 수정 | 비관리자 가드 리다이렉트 `/approval/my` |

---

## Out of Scope

- 결재 알림(푸시/이메일) 발송
- 결재 대기 건수 실시간 폴링 (페이지 로드 시 1회 fetch)
- 팀/그룹별 결재 필터링
