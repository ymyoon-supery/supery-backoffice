# 지출결의서 5종 폼 설계

**날짜:** 2026-06-23  
**범위:** ExpenseForm 탭 3개 → 5개 확장, 지출결의서 항목 수정, 사업소득·경품비 신규 폼 추가

---

## 1. 개요

현재 3개 탭(지출결의서, 법인카드, 교통비)을 5개 탭으로 확장한다.
기존 탭 2개(법인카드, 교통비)는 변경 없음.

| 탭 | 변경 여부 |
|----|----------|
| ① 지출결의서 | 수정 (구분 제거, 증빙 재정의) |
| ② 법인카드 사용내역서 | 그대로 |
| ③ 교통비 사용내역서 | 그대로 |
| ④ 사업소득(원천징수) 지급요청서 | 신규 |
| ⑤ 현금성 경품비(기타소득) 지급요청서 | 신규 |

---

## 2. 탭 ① 지출결의서 변경

### 2-1. 제거 항목
- `구분(세목)` 섹션 전체 제거 (`TAX_TYPE_OPTIONS` 라디오 버튼 및 관련 state)

### 2-2. 증빙 항목 재정의

```ts
const EVIDENCE_TYPE_OPTIONS = [
  { value: 'TAX_INVOICE',       label: '세금계산서' },
  { value: 'ELECTRONIC_INVOICE', label: '전자계산서(또는 인보이스)' },
  { value: 'BUSINESS_RECEIPT',  label: '사업자지출증빙' },
  { value: 'CORPORATE_CARD',    label: '법인카드영수증' },
  { value: 'PERSONAL_CARD',     label: '개인카드영수증' },
  { value: 'OTHER_RECEIPT',     label: '기타-개별영수증' },
]
```

기존 `TAX_INVOICE` 값("세금계산서 (또는 인보이스)")은 두 항목으로 분리된다.
`ELECTRONIC_INVOICE`는 신규 value로 추가.

### 2-3. submitExpense 호출 변경
- `taxType: null` 고정 (구분 제거에 따라)

---

## 3. DB 스키마

### 3-1. 신규 테이블: `expense_sensitive_data`

주민번호(SSN)를 기존 expense_reports 테이블과 분리해 별도 보관한다.

```sql
CREATE TABLE expense_sensitive_data (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  encrypted_ssn     text NOT NULL,  -- AES-256-GCM 암호화 결과 (base64)
  iv                text NOT NULL,  -- 초기화 벡터 (base64, 복호화에 필요)
  created_at        timestamptz DEFAULT now()
);

-- RLS: 서비스 롤만 접근 허용
ALTER TABLE expense_sensitive_data ENABLE ROW LEVEL SECURITY;
```

### 3-2. 암호화 방식

- 알고리즘: AES-256-GCM (Node.js `crypto` 모듈)
- 키: 환경변수 `EXPENSE_SSN_ENCRYPTION_KEY` (32바이트 hex 문자열)
- IV: 매 건마다 랜덤 생성 (16바이트), DB에 함께 저장
- 서버 액션에서만 암호화/복호화 수행 (클라이언트에 키 노출 없음)

### 3-3. 헬퍼 함수 위치

`lib/crypto/ssn.ts`
```ts
export function encryptSSN(ssn: string): { encrypted: string; iv: string }
export function decryptSSN(encrypted: string, iv: string): string
```

---

## 4. 탭 ④ 사업소득(원천징수) 지급요청서

### 4-1. 입력 필드

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| 이름 | text | ✅ | 지급 대상자 성명 |
| 주민번호 | text | ✅ | `000000-0000000` 형식, 마스킹 표시 |
| 지급 금액 (세전) | number | ✅ | KRW 포맷 |
| 원천징수액 (3.3%) | number | — | 자동계산, 읽기 전용 |
| 실지급액 | number | — | 자동계산, 읽기 전용, 굵게 강조 |
| 내역 | text | ✅ | 지급 사유 |
| 은행 | text | ✅ | |
| 계좌번호 | text | ✅ | |
| 비고 | text | ❌ | 선택 |
| 첨부파일 | file | ❌ | 계약서, 세금계산서 등 |

### 4-2. 자동계산 공식

```
원천징수액 = Math.floor(세전금액 × 0.033)
실지급액   = 세전금액 - 원천징수액
```

### 4-3. 제출 처리

1. 서버 액션 `submitBusinessIncomeExpense` 신규 생성
2. `submitExpense` 내부 RPC 재사용 (category: `BUSINESS_INCOME`, taxType: `WITHHOLDING_BUSINESS`)
3. expense_report_id 반환 후 → `expense_sensitive_data` 테이블에 암호화 SSN insert
4. 결재라인은 기존과 동일

### 4-4. title 자동 생성

```
`사업소득 지급요청 — ${이름} (${지급요청일})`
```

---

## 5. 탭 ⑤ 현금성 경품비(기타소득) 지급요청서

### 5-1. 5만원 기준 분기

폼 상단에 토글: **5만원 이하 / 5만원 이상**  
선택에 따라 보이는 필드가 달라진다.

### 5-2. 5만원 이하 필드

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| 이름 | text | ✅ | |
| 경품 금액 | number | ✅ | KRW 포맷 |
| 지급방식 | toggle | ✅ | 상품권 / 현금 |
| └ 상품권 선택 시: 구매 증빙 | select | ✅ | 법인카드 / 개인카드 |
| └ 현금 선택 시: 은행 | text | ✅ | |
| └ 현금 선택 시: 계좌번호 | text | ✅ | |
| 비고 | text | ❌ | |

### 5-3. 5만원 이상 필드

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| 이름 | text | ✅ | |
| 주민번호 | text | ✅ | 마스킹, 암호화 |
| 경품 금액 | number | ✅ | KRW 포맷 |
| 제세공과금 방식 | toggle | ✅ | 본인납부 / 대납 |
| 제세공과금 | number | — | 자동계산, 읽기 전용 |
| 실지급액 | number | — | 자동계산, 읽기 전용 |
| 지급방식 | toggle | ✅ | 상품권 / 현금 |
| └ 상품권: 구매 증빙 | select | ✅ | 법인카드 / 개인카드 |
| └ 현금: 은행, 계좌번호 | text | ✅ | |
| 비고 | text | ❌ | |

### 5-4. 제세공과금 자동계산 공식

```
본인 납부: 제세공과금 = Math.floor(경품금액 × 0.22)
           → 회사 지급액 = 경품금액 (수령자가 22%를 별도 자진 납부)

대납:      제세공과금 = Math.floor(경품금액 × 0.22 / 0.78)
           → 회사 지급액 = 경품금액, 회사 추가 납세 = 제세공과금
```

> **본인납부**: 회사는 경품금액 전액 지급. 수령자가 제세공과금(22%)을 별도 자진 납부.  
> **대납**: 회사는 경품금액 전액 지급 + 제세공과금을 회사가 추가 납부. 제세공과금은 `경품금액 × 0.22 / 0.78`으로 역산.

### 5-5. 제출 처리

1. 서버 액션 `submitPrizeExpense` 신규 생성
2. `submitExpense` RPC 재사용 (category: `PRIZE_INCOME`, taxType: `WITHHOLDING_OTHER_WITH` 또는 `WITHHOLDING_OTHER_WITHOUT`)
3. 5만원 이상이고 주민번호 입력된 경우 → `expense_sensitive_data`에 암호화 SSN insert
4. 결재라인은 기존과 동일

### 5-6. title 자동 생성

```
`경품비 지급요청 — ${이름} (${경품금액}원)`
```

---

## 6. 파일 변경 목록

| 파일 | 변경 유형 |
|------|----------|
| `lib/crypto/ssn.ts` | 신규 — AES-256-GCM 암호화 헬퍼 |
| `app/(dashboard)/approval/expense/actions.ts` | 수정 — `submitBusinessIncomeExpense`, `submitPrizeExpense` 추가 |
| `components/approval/ExpenseForm.tsx` | 수정 — 탭 확장, 지출결의서 수정, 4·5번 탭 컴포넌트 추가 |
| Supabase migration | 신규 — `expense_sensitive_data` 테이블 |

---

## 7. 보안 고려사항

- SSN은 서버 액션에서만 처리, 클라이언트에 평문 전달 없음
- `expense_sensitive_data` 테이블은 RLS로 서비스 롤만 접근
- 주민번호 입력 필드는 `autocomplete="off"`, `type="password"` 스타일 마스킹 (입력 시 `•••••••••••••`)
- 환경변수 `EXPENSE_SSN_ENCRYPTION_KEY` 미설정 시 서버 액션 초기화 단계에서 에러 throw
