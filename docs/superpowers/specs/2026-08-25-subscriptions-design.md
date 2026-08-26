# 구독서비스 관리 설계 문서

## 개요

회사가 사용 중인 SaaS 구독 서비스(Notion, Slack, Adobe 등)의 비용·계약·담당자 정보를 어드민이 한 곳에서 관리하는 기능.

---

## 데이터 모델

### `subscriptions` 테이블

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | 서비스명 (Notion, Slack 등) |
| cost | INTEGER | NOT NULL, > 0 | 비용 (원) |
| billing_cycle | TEXT | NOT NULL, MONTHLY \| YEARLY | 결제 주기 |
| renewal_date | DATE | NOT NULL | 다음 갱신일 |
| manager_id | UUID | FK → employees(id), ON DELETE SET NULL | 담당자 |
| payment_method | TEXT | NOT NULL, CARD \| TRANSFER \| OTHER | 결제 수단 |
| card_name | TEXT | nullable | 카드명 (신한, 국민 등) — CARD 시에만 사용 |
| card_last4 | TEXT | nullable, 4자리 | 카드 끝 4자리 — CARD 시에만 사용 |
| license_count | INTEGER | nullable | 라이선스 수량 |
| department_id | UUID | FK → departments(id), ON DELETE SET NULL, nullable | 사용 부서 |
| notes | TEXT | nullable | 메모 |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() | |

### RLS
- 어드민(`role = 'ADMIN'`)만 SELECT / INSERT / UPDATE / DELETE 가능
- 일반 직원 접근 없음

---

## 파일 구조

```
supabase/migrations/
  082_subscriptions.sql

app/(admin)/admin/subscriptions/
  page.tsx                   # 서버 컴포넌트 — 데이터 fetch
  actions.ts                 # Server Actions: createSubscription / updateSubscription / deleteSubscription
  SubscriptionsClient.tsx    # 클라이언트 UI (목록 테이블 + 추가/수정 모달)

components/layout/Sidebar.tsx  # 시스템 그룹에 메뉴 항목 추가
```

---

## UI 설계

### 사이드바
기존 `시스템` 그룹에 항목 추가:
```
시스템
  ├─ 설정
  └─ 구독서비스 관리   (아이콘: CreditCard)
```

### `/admin/subscriptions` 페이지

**상단**
- 제목: "구독서비스 관리"
- 우측: "추가" 버튼

**테이블 컬럼**
| 서비스명 | 비용 | 결제주기 | 갱신일 | 담당자 | 라이선스 | 부서 | 결제수단 | 액션 |

- 비용: `₩1,000,000` 형식으로 포맷
- 갱신일: `YYYY-MM-DD` 표시
- 결제수단: CARD이면 `{카드명} ****{끝4자리}`, TRANSFER이면 `계좌이체`, OTHER이면 `기타`
- 액션: 수정 / 삭제 버튼

**추가/수정 모달 필드**
1. 서비스명 (text, 필수)
2. 비용 (number, 필수)
3. 결제주기 (select: 월간 / 연간, 필수)
4. 갱신일 (date, 필수)
5. 담당자 (select: 활성 직원 목록, 필수)
6. 결제수단 (select: 카드 / 계좌이체 / 기타, 필수)
   - 카드 선택 시: 카드명 (text) + 카드 끝 4자리 (text, 4자리 숫자)
7. 라이선스 수량 (number, 선택)
8. 사용 부서 (select: 부서 목록, 선택)
9. 메모 (textarea, 선택)

**삭제**: 인라인 confirm 후 삭제 (별도 모달 없음)

---

## Server Actions

```typescript
createSubscription(formData)  // INSERT
updateSubscription(id, formData)  // UPDATE
deleteSubscription(id)  // DELETE
```

모든 액션에서 어드민 권한 검증 후 실행.

---

## 구현 순서

1. `082_subscriptions.sql` 마이그레이션 작성
2. `page.tsx` — subscriptions + employees + departments fetch
3. `actions.ts` — create / update / delete Server Actions
4. `SubscriptionsClient.tsx` — 테이블 + 모달 UI
5. `Sidebar.tsx` — 메뉴 항목 추가
