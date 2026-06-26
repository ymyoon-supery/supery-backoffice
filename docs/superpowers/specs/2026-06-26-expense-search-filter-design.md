# Expense Search & Filter Design

**Goal:** 지출결의서 내 신청내역과 결재관리에서 유형/월/기간/지출항목/부서/신청인으로 전체 기간 검색 가능하게 한다.

**Architecture:** DB에 `expense_type` 컬럼을 추가해 5개 탭 유형을 정확하게 저장하고, URL searchParams 기반 서버사이드 Supabase 쿼리로 필터를 적용한다. 필터 UI는 공통 컴포넌트로 분리한다.

**Tech Stack:** Next.js App Router (Server Components + Client Components), Supabase PostgreSQL, TailwindCSS

---

## 1. DB Schema 변경

### expense_reports 테이블에 expense_type 컬럼 추가

```sql
ALTER TABLE expense_reports
  ADD COLUMN expense_type TEXT CHECK (expense_type IN (
    'EXPENSE', 'CORPORATE_CARD', 'TRANSPORTATION', 'BUSINESS_INCOME', 'PRIZE'
  ));

-- 기존 데이터 백필
UPDATE expense_reports SET expense_type =
  CASE
    WHEN title ILIKE '법인카드%'   THEN 'CORPORATE_CARD'
    WHEN title ILIKE '교통비%'     THEN 'TRANSPORTATION'
    WHEN title ILIKE '%사업소득%'   THEN 'BUSINESS_INCOME'
    WHEN title ILIKE '%경품비%'     THEN 'PRIZE'
    ELSE 'EXPENSE'
  END
WHERE expense_type IS NULL;
```

### submit_expense_report RPC 파라미터 추가

```sql
p_expense_type TEXT DEFAULT 'EXPENSE'
```

RPC 내부에서 `INSERT`에 `expense_type = p_expense_type` 추가.

---

## 2. ExpenseForm 액션 변경

`app/(dashboard)/approval/expense/new/actions.ts`의 `submitExpense` 함수에 `expenseType` 파라미터 추가.

각 탭에서 호출 시:
- ExpenseTab → `expenseType: 'EXPENSE'`
- CorporateCardTab → `expenseType: 'CORPORATE_CARD'`
- TransportationTab → `expenseType: 'TRANSPORTATION'`
- BusinessIncomeTab → `expenseType: 'BUSINESS_INCOME'`
- PrizeTab → `expenseType: 'PRIZE'`

---

## 3. 공통 필터 UI 컴포넌트

**파일:** `components/approval/ExpenseSearchFilter.tsx`

**Props:**
```typescript
interface ExpenseSearchFilterProps {
  // 현재 필터 값 (URL에서 읽어 전달)
  expenseType: string
  month: string        // 'YYYY-MM' 형식, 없으면 ''
  dateFrom: string     // 'YYYY-MM-DD', 없으면 ''
  dateTo: string       // 'YYYY-MM-DD', 없으면 ''
  keyword: string      // 지출항목 검색어
  // 관리자 전용 (전달 안 하면 표시 안 함)
  department?: string
  employeeName?: string
  departmentOptions?: Array<{ id: string; name: string }>
}
```

**동작:**
- 각 필터 변경 시 `router.push(buildUrl(...))` 호출 (URL 동기화)
- 월 선택과 기간 선택은 상호 배타적 (월 선택 시 기간 초기화, 반대도 동일)
- 초기화 버튼: 모든 필터 제거
- `keyword` 입력은 300ms debounce 후 URL 업데이트

**필터 항목:**
| 필터 | UI | URL Param |
|------|-----|-----------|
| 유형 | select (전체/지출결의서/법인카드/교통비/사업소득/경품비) | `expenseType` |
| 월 | `<input type="month">` | `month` |
| 기간 | from/to `<input type="date">` 2개 | `dateFrom`, `dateTo` |
| 지출항목 | text input | `keyword` |
| 부서 | select (관리자만) | `department` |
| 신청인 | text input (관리자만) | `employeeName` |

---

## 4. 내 신청내역 (my/page.tsx + MyRequestsClient.tsx)

### page.tsx 변경

`searchParams`를 읽어 Supabase 쿼리에 조건 적용:

```typescript
// searchParams from function signature
const { expenseType, month, dateFrom, dateTo, keyword } = searchParams

let query = supabase
  .from('expense_reports')
  .select('...')
  .eq('employee_id', employee.id)
  .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
  .order('created_at', { ascending: false })
  // limit(20) 제거

if (expenseType) query = query.eq('expense_type', expenseType)

if (month) {
  // YYYY-MM → 해당 월 첫날/마지막날
  query = query.gte('created_at', `${month}-01`)
               .lt('created_at', nextMonth(month))
} else if (dateFrom || dateTo) {
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59')
}

if (keyword) query = query.ilike('line_items::text', `%${keyword}%`)
```

결과는 기존과 동일한 `items` props로 `MyRequestsClient`에 전달.

### MyRequestsClient.tsx 변경

- Props에 현재 필터값 (expenseType, month, dateFrom, dateTo, keyword) 추가
- expense 탭 활성 시 `ExpenseSearchFilter` 렌더 (지출항목 탭에서만 표시)
- 전체 탭에서는 필터 숨김 (전체 신청 내역에 연차/서류/비품도 섞이므로)

---

## 5. 결재관리 (admin/approval/page.tsx + AdminApprovalClient.tsx)

### page.tsx 변경

기존 `type`, `period`, `sort` 외 새 params 추가:
- `expenseType`, `month`, `dateFrom`, `dateTo`, `keyword`, `department`, `employeeName`

expense 쿼리에 조건 추가:
```typescript
// PostgREST 중첩 필터 지원 범위:
// - expense_type, created_at: expense_reports 컬럼 직접 필터 가능
// - keyword (line_items::text): RPC 또는 Postgres function으로 처리
// - employeeName: 먼저 employees 테이블에서 id 목록 조회 후 expense_reports.employee_id IN(...) 적용
// - department: 먼저 departments → employees 경로로 employee_id 목록 조회 후 IN(...) 적용

if (expenseType) query = query.eq('expense_reports.expense_type', expenseType)
// month/dateFrom/dateTo → expense_reports.created_at 범위 조건 (PostgREST embedded filter 사용)

// employeeName/department/keyword 는 page.tsx에서 사전 조회 후 employee_id 배열로 필터:
// const matchedIds = await getEmployeeIdsByName(employeeName, department)
// if (matchedIds) query = query.in('expense_reports.employee_id', matchedIds)
```

부서 목록 별도 fetch → `departmentOptions` props로 전달.

### AdminApprovalClient.tsx 변경

- `type === 'expense'` 또는 `type === 'all'` 시 `ExpenseSearchFilter` 표시 (관리자 버전, 부서/신청인 포함)
- 기존 period 필터는 유지 (leave에도 사용하므로)

---

## 6. 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `supabase/migrations/049_expense_type_column.sql` | 신규 |
| `components/approval/ExpenseSearchFilter.tsx` | 신규 |
| `app/(dashboard)/approval/expense/new/actions.ts` | 수정 |
| `components/approval/ExpenseForm.tsx` | 수정 (각 탭 expenseType 전달) |
| `app/(dashboard)/approval/my/page.tsx` | 수정 (searchParams 적용) |
| `app/(dashboard)/approval/my/MyRequestsClient.tsx` | 수정 (필터 UI 추가) |
| `app/(admin)/admin/approval/page.tsx` | 수정 (새 filter params) |
| `app/(admin)/admin/approval/AdminApprovalClient.tsx` | 수정 (필터 UI 추가) |

---

## 7. 엣지 케이스

- `expense_type IS NULL`인 기존 데이터: 백필로 처리, 쿼리 시 `expenseType` 미지정이면 전체 반환
- 월 + 기간 동시 지정 불가: UI에서 상호 배타적으로 처리
- `line_items::text ILIKE` 검색: JSONB를 텍스트로 캐스팅 — 데이터 적으므로 성능 문제 없음, 추후 GIN 인덱스 고려 가능
- 결재관리 `type='leave'` 탭에서는 expense 필터 숨김
