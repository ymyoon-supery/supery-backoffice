# Expense Search & Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지출결의서 내 신청내역과 결재관리에서 유형/월/기간/지출항목/신청인으로 전체 기간 서버사이드 검색을 제공한다.

**Architecture:** DB에 `expense_type` 컬럼이 추가됨(마이그레이션 049 완료). `actions.ts`에서 각 탭의 `expense_type`을 RPC로 전달하고, 공통 `ExpenseSearchFilter` 컴포넌트가 URL searchParams를 동기화한다. 내 신청내역은 Supabase 직접 필터, 결재관리는 fetch 후 JS 필터 방식으로 구현한다.

**Tech Stack:** Next.js 15 App Router, Supabase JS client, TypeScript, TailwindCSS

---

## 파일 구조

| 파일 | 변경 |
|------|------|
| `app/(dashboard)/approval/expense/actions.ts` | `SubmitExpenseInput`에 `expenseType` 추가, RPC 파라미터 전달 |
| `components/approval/ExpenseForm.tsx` | 각 탭에서 `expenseType` 전달 (3곳) |
| `components/approval/ExpenseSearchFilter.tsx` | 신규 — 공통 필터 UI |
| `app/(dashboard)/approval/my/page.tsx` | searchParams 읽어 Supabase 필터 적용, limit 제거 |
| `app/(dashboard)/approval/my/MyRequestsClient.tsx` | 필터 props 수신, expense 탭 시 필터 UI 표시 |
| `app/(admin)/admin/approval/page.tsx` | searchParams 확장, select에 expense_type 추가, JS 필터 |
| `components/admin/AdminApprovalClient.tsx` | 필터 props 확장, 필터 UI 표시, buildUrl 업데이트 |

---

## Task 1: actions.ts — expenseType 파라미터 추가

**Files:**
- Modify: `app/(dashboard)/approval/expense/actions.ts`

- [ ] **Step 1: SubmitExpenseInput 타입에 expenseType 추가**

`app/(dashboard)/approval/expense/actions.ts` 의 `SubmitExpenseInput` 타입을 수정한다.

```typescript
type SubmitExpenseInput = {
  title: string
  payee: string
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER'
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  paymentRequestDate: string
  settlementDate: string | null
  lineItems: LineItem[]
  attachmentUrls: string[]
  taxType: string | null
  evidenceType: string | null
  category?: string
  expenseType?: string
}
```

- [ ] **Step 2: submitExpense RPC 호출에 p_expense_type 추가**

`submitExpense` 함수의 `supabase.rpc('submit_expense_report', {...})` 블록에 한 줄 추가:

```typescript
const { data, error } = await supabase.rpc('submit_expense_report', {
  p_title: input.title,
  p_amount: totalAmount,
  p_category: input.category ?? 'OTHER',
  p_expense_date: input.paymentRequestDate,
  p_receipt_url: null,
  p_description: null,
  p_payee: input.payee,
  p_payment_method: input.paymentMethod,
  p_bank_name: input.bankName,
  p_account_number: input.accountNumber,
  p_account_holder: input.accountHolder,
  p_payment_request_date: input.paymentRequestDate,
  p_settlement_date: input.settlementDate,
  p_line_items: input.lineItems,
  p_attachment_urls: input.attachmentUrls,
  p_tax_type: input.taxType,
  p_evidence_type: input.evidenceType,
  p_expense_type: input.expenseType ?? 'EXPENSE',
})
```

- [ ] **Step 3: submitBusinessIncomeExpense에 expenseType 추가**

`submitBusinessIncomeExpense` 내부의 `submitExpense` 호출에 `expenseType: 'BUSINESS_INCOME'` 추가:

```typescript
const expenseResult = await submitExpense({
  title: `사업소득 지급요청 — ${input.recipientName} (${input.paymentRequestDate})`,
  payee: input.recipientName,
  paymentMethod: 'TRANSFER',
  bankName: input.bankName,
  accountNumber: input.accountNumber,
  accountHolder: input.recipientName,
  paymentRequestDate: input.paymentRequestDate,
  settlementDate: null,
  lineItems,
  attachmentUrls: input.attachmentUrls,
  taxType: 'WITHHOLDING_BUSINESS',
  evidenceType: null,
  category: 'BUSINESS_INCOME',
  expenseType: 'BUSINESS_INCOME',
})
```

- [ ] **Step 4: submitPrizeExpense에 expenseType 추가**

`submitPrizeExpense` 내부의 `submitExpense` 호출에 `expenseType: 'PRIZE'` 추가:

```typescript
const expenseResult = await submitExpense({
  title: `경품비 지급요청 — ${input.recipientName} (${input.prizeAmount.toLocaleString('ko-KR')}원)`,
  payee: input.recipientName,
  paymentMethod,
  bankName: input.bankName,
  accountNumber: input.accountNumber,
  accountHolder: input.paymentMethod === 'CASH' ? input.recipientName : null,
  paymentRequestDate: input.paymentRequestDate,
  settlementDate: null,
  lineItems,
  attachmentUrls: input.attachmentUrls,
  taxType,
  evidenceType,
  category: 'PRIZE_INCOME',
  expenseType: 'PRIZE',
})
```

- [ ] **Step 5: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

에러 없으면 계속.

- [ ] **Step 6: 커밋**

```powershell
git add "app/(dashboard)/approval/expense/actions.ts"
git commit -m "feat: pass expense_type to submit_expense_report RPC"
git push origin main
```

---

## Task 2: ExpenseForm.tsx — 각 탭에 expenseType 전달

**Files:**
- Modify: `components/approval/ExpenseForm.tsx`

- [ ] **Step 1: ExpenseTab의 submitExpense 호출에 expenseType 추가**

`components/approval/ExpenseForm.tsx`에서 `ExpenseTab` 컴포넌트 내부의 `submitExpense` 호출을 찾는다 (약 350번째 줄, `category: 'OTHER'` 있는 곳). `category: 'OTHER'` 아래에 한 줄 추가:

```typescript
const result = await submitExpense({
  // ... 기존 필드들 ...
  category: 'OTHER',
  expenseType: 'EXPENSE',
})
```

- [ ] **Step 2: CorporateCardTab의 submitExpense 호출에 expenseType 추가**

약 694번째 줄의 CorporateCardTab submitExpense 호출에 추가:

```typescript
const result = await submitExpense({
  // ... 기존 필드들 ...
  category: 'OTHER',
  expenseType: 'CORPORATE_CARD',
})
```

- [ ] **Step 3: TransportationTab의 submitExpense 호출에 expenseType 추가**

약 907번째 줄의 TransportationTab submitExpense 호출에 추가:

```typescript
const result = await submitExpense({
  // ... 기존 필드들 ...
  category: 'OTHER',
  expenseType: 'TRANSPORTATION',
})
```

- [ ] **Step 4: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: 커밋**

```powershell
git add "components/approval/ExpenseForm.tsx"
git commit -m "feat: set expense_type per tab in ExpenseForm"
git push origin main
```

---

## Task 3: ExpenseSearchFilter 컴포넌트 생성

**Files:**
- Create: `components/approval/ExpenseSearchFilter.tsx`

- [ ] **Step 1: 컴포넌트 파일 생성**

`components/approval/ExpenseSearchFilter.tsx` 를 아래 내용으로 생성한다:

```tsx
'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef } from 'react'

const EXPENSE_TYPE_OPTIONS = [
  { value: '', label: '전체 유형' },
  { value: 'EXPENSE', label: '지출결의서' },
  { value: 'CORPORATE_CARD', label: '법인카드' },
  { value: 'TRANSPORTATION', label: '교통비' },
  { value: 'BUSINESS_INCOME', label: '사업소득' },
  { value: 'PRIZE', label: '경품비' },
]

interface Props {
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
  employeeName?: string
  showAdminFilters?: boolean
  baseParams?: Record<string, string>
}

export default function ExpenseSearchFilter({
  expenseType, month, dateFrom, dateTo, keyword,
  employeeName = '', showAdminFilters = false, baseParams = {},
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buildUrl(overrides: Record<string, string>) {
    const merged = { ...baseParams, expenseType, month, dateFrom, dateTo, keyword, employeeName, ...overrides }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v)
    }
    return `${pathname}?${p.toString()}`
  }

  function nav(overrides: Record<string, string>) {
    router.push(buildUrl({ ...overrides, page: '1' }))
  }

  function debounceNav(overrides: Record<string, string>) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => nav(overrides), 300)
  }

  function handleMonthChange(value: string) {
    nav({ month: value, dateFrom: '', dateTo: '' })
  }

  function handleDateChange(field: 'dateFrom' | 'dateTo', value: string) {
    nav({ [field]: value, month: '' })
  }

  const hasFilters = !!(expenseType || month || dateFrom || dateTo || keyword || employeeName)

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={expenseType}
          onChange={e => nav({ expenseType: e.target.value })}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {EXPENSE_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="month"
          value={month}
          onChange={e => handleMonthChange(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <input
          type="date"
          value={dateFrom}
          onChange={e => handleDateChange('dateFrom', e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-gray-300 text-xs">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => handleDateChange('dateTo', e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          defaultValue={keyword}
          key={keyword}
          onChange={e => debounceNav({ keyword: e.target.value })}
          placeholder="지출항목 검색"
          className="flex-1 min-w-[140px] text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {showAdminFilters && (
          <input
            type="text"
            defaultValue={employeeName}
            key={`emp-${employeeName}`}
            onChange={e => debounceNav({ employeeName: e.target.value })}
            placeholder="신청인 검색"
            className="flex-1 min-w-[120px] text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}

        {hasFilters && (
          <button
            onClick={() => nav({ expenseType: '', month: '', dateFrom: '', dateTo: '', keyword: '', employeeName: '' })}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: 커밋**

```powershell
git add "components/approval/ExpenseSearchFilter.tsx"
git commit -m "feat: add ExpenseSearchFilter shared component"
git push origin main
```

---

## Task 4: 내 신청내역 page.tsx — 서버사이드 필터 적용

**Files:**
- Modify: `app/(dashboard)/approval/my/page.tsx`

- [ ] **Step 1: searchParams 파라미터 추가 및 필터 읽기**

`MyRequestsPage` 함수 시그니처를 변경하고, 상단에 파라미터 읽기 코드를 추가한다.

```typescript
export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    expenseType?: string
    month?: string
    dateFrom?: string
    dateTo?: string
    keyword?: string
  }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const expenseType = params.expenseType ?? ''
  const month       = params.month ?? ''
  const dateFrom    = params.dateFrom ?? ''
  const dateTo      = params.dateTo ?? ''
  const keyword     = params.keyword ?? ''

  // ... 이하 기존 employee/department 조회 코드 유지 ...
```

- [ ] **Step 2: expense 쿼리에 expense_type select 추가 및 limit 제거, 필터 적용**

`Promise.all` 안의 expense 쿼리를 아래로 교체한다:

```typescript
// expense 쿼리 빌드 (필터 적용)
;(async () => {
  let q = supabase
    .from('expense_reports')
    .select('id, title, amount, category, expense_type, status, created_at, tax_type, evidence_type, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, expense_approval_steps(step_order, status, employees(position, name))')
    .eq('employee_id', employee.id)
    .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
    .order('created_at', { ascending: false })

  if (expenseType) q = q.eq('expense_type', expenseType)

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    q = q.gte('created_at', `${month}-01T00:00:00`).lt('created_at', `${nextM}-01T00:00:00`)
  } else if (dateFrom || dateTo) {
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)
  }

  if (keyword) q = (q as any).filter('line_items::text', 'ilike', `%${keyword}%`)

  return q
})()
```

실제로는 `Promise.all` 배열 내부의 기존 expense 쿼리 전체를 아래로 대체한다:

```typescript
const [
  { data: myLeave },
  { data: myExpense },
  { data: myDocuments },
  { data: mySupply },
] = await Promise.all([
  supabase
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, days_used, reason, status, created_at, leave_approval_steps(step_order, comment, status, employees(position, name))')
    .eq('employee_id', employee.id)
    .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
    .order('created_at', { ascending: false })
    .limit(20),
  (() => {
    let q = supabase
      .from('expense_reports')
      .select('id, title, amount, category, expense_type, status, created_at, tax_type, evidence_type, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, expense_approval_steps(step_order, status, employees(position, name))')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
    if (expenseType) q = q.eq('expense_type', expenseType)
    if (month) {
      const [y, m] = month.split('-').map(Number)
      const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      q = q.gte('created_at', `${month}-01T00:00:00`).lt('created_at', `${nextM}-01T00:00:00`)
    } else if (dateFrom || dateTo) {
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)
    }
    if (keyword) q = (q as any).filter('line_items::text', 'ilike', `%${keyword}%`)
    return q
  })(),
  supabase
    .from('document_requests')
    .select('id, doc_type, status, purpose, created_at')
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false })
    .limit(20),
  supabase
    .from('supply_requests')
    .select('id, status, created_at, supply_request_items(id, category, description, estimated_amount, note, sort_order), supply_approval_steps(step_order, status, employees(position, name))')
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false })
    .limit(20),
])
```

- [ ] **Step 3: MyRequestsClient에 필터 props 전달**

`return` 의 `<MyRequestsClient ...>` 부분에 필터값 추가:

```tsx
return (
  <MyRequestsClient
    items={items}
    employeeName={employeeName}
    employeePosition={employeePosition}
    departmentName={departmentName}
    documentRequests={myDocuments ?? []}
    supplyRequests={supplyRequests as any[]}
    expenseType={expenseType}
    month={month}
    dateFrom={dateFrom}
    dateTo={dateTo}
    keyword={keyword}
  />
)
```

- [ ] **Step 4: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: 커밋**

```powershell
git add "app/(dashboard)/approval/my/page.tsx"
git commit -m "feat: server-side expense search filter in my requests page"
git push origin main
```

---

## Task 5: MyRequestsClient.tsx — 필터 UI 통합

**Files:**
- Modify: `app/(dashboard)/approval/my/MyRequestsClient.tsx`

- [ ] **Step 1: Props 인터페이스에 필터 필드 추가**

```typescript
interface Props {
  items: AnyItem[]
  employeeName: string
  employeePosition: string | null
  departmentName: string | null
  documentRequests: DocumentRequest[]
  supplyRequests: SupplyRequest[]
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
}
```

- [ ] **Step 2: 컴포넌트 파라미터에 새 props 추가 및 activeTab 초기값 설정**

```typescript
export default function MyRequestsClient({
  items,
  employeeName,
  employeePosition,
  departmentName,
  documentRequests,
  supplyRequests,
  expenseType,
  month,
  dateFrom,
  dateTo,
  keyword,
}: Props) {
  const [selectedExpense, setSelectedExpense] = useState<ExpenseViewData | null>(null)
  const [expandedSupplyId, setExpandedSupplyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    // 필터가 활성화된 상태로 페이지 로드 시 expense 탭으로 이동
    if (expenseType || month || dateFrom || dateTo || keyword) return 'expense'
    return 'all'
  })
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  // ... 이하 기존 코드 ...
```

- [ ] **Step 3: ExpenseSearchFilter import 추가**

파일 상단 import 목록에 추가:

```typescript
import ExpenseSearchFilter from '@/components/approval/ExpenseSearchFilter'
```

- [ ] **Step 4: expense 탭 활성 시 필터 UI 렌더**

탭 버튼 div 바로 아래 (Category tabs 섹션 끝)에 추가:

```tsx
{/* Expense Search Filter — expense 탭 활성 시만 표시 */}
{activeTab === 'expense' && (
  <ExpenseSearchFilter
    expenseType={expenseType}
    month={month}
    dateFrom={dateFrom}
    dateTo={dateTo}
    keyword={keyword}
  />
)}
```

- [ ] **Step 5: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: 커밋**

```powershell
git add "app/(dashboard)/approval/my/MyRequestsClient.tsx"
git commit -m "feat: show expense search filter in my requests client"
git push origin main
```

---

## Task 6: admin/approval/page.tsx — expense 필터 확장

**Files:**
- Modify: `app/(admin)/admin/approval/page.tsx`

- [ ] **Step 1: searchParams 타입 및 파라미터 읽기 확장**

`searchParams` 타입 선언을 아래로 교체:

```typescript
export default async function AdminApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; type?: string; period?: string; sort?: string; page?: string
    expenseType?: string; month?: string; dateFrom?: string; dateTo?: string
    keyword?: string; employeeName?: string
  }>
}) {
```

`const params = await searchParams` 아래에 새 변수 추가:

```typescript
const params = await searchParams
const tab    = params.tab    === 'done'    ? 'done'    : 'pending'
const type   = ['leave', 'expense', 'home_location'].includes(params.type ?? '') ? params.type! : 'all'
const period = ['day', 'week', 'month'].includes(params.period ?? '') ? params.period! : 'all'
const sort   = params.sort  === 'asc' ? 'asc' : 'desc'
const page   = Math.max(1, parseInt(params.page ?? '1') || 1)
const expenseType  = params.expenseType ?? ''
const month        = params.month ?? ''
const dateFrom     = params.dateFrom ?? ''
const dateTo       = params.dateTo ?? ''
const keyword      = params.keyword ?? ''
const employeeName = params.employeeName ?? ''
```

- [ ] **Step 2: ApprovalItem 타입에 expenseType 추가**

`app/(admin)/admin/approval/page.tsx` 상단의 `ApprovalItem` 타입 (exported)에 필드 추가:

```typescript
export type ApprovalItem = {
  // ... 기존 필드들 ...
  expenseType?: string | null
}
```

- [ ] **Step 3: expense 쿼리 select에 expense_type 추가**

expense_approval_steps 쿼리의 `expense_reports (...)` 안에 `expense_type,` 추가 (두 곳: 일반 step과 fullApprove step):

첫 번째 (약 149번째 줄):
```typescript
expense_reports (
  id, title, amount, category, expense_type, created_at, payment_status,
  payee, payment_method, bank_name, account_number, account_holder,
  payment_request_date, settlement_date, line_items, attachment_urls,
  tax_type, evidence_type,
  employees ( name, position )
)
```

두 번째 (약 274번째 줄 fullApprove expense):
```typescript
expense_reports ( id, title, amount, category, expense_type, created_at, payment_status, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls, tax_type, evidence_type, employees ( name, position ) )
```

- [ ] **Step 4: item 매핑에 expenseType 포함**

expenseItems 매핑 (약 164번째 줄) 에서 반환 객체에 추가:

```typescript
expenseItems = (data ?? []).flatMap((s: any) => {
  const rep = s.expense_reports
  if (!rep) return []
  return [{
    stepId:             s.id,
    kind:               'expense' as const,
    requestId:          rep.id,
    employeeName:       rep.employees?.name ?? '—',
    employeePosition:   rep.employees?.position ?? null,
    departmentName:     null,
    typeLabel:          EXPENSE_LABELS[rep.category] ?? rep.category,
    detail:             `${rep.title} · ${Number(rep.amount).toLocaleString()}원`,
    requestDate:        rep.created_at,
    status:             s.status,
    paymentStatus:      rep.payment_status ?? null,
    expenseType:        rep.expense_type ?? null,      // ← 추가
    title:              rep.title ?? null,
    taxType:            rep.tax_type ?? null,
    evidenceType:       rep.evidence_type ?? null,
    payee:              rep.payee ?? null,
    paymentMethod:      rep.payment_method ?? null,
    bankName:           rep.bank_name ?? null,
    accountNumber:      rep.account_number ?? null,
    accountHolder:      rep.account_holder ?? null,
    paymentRequestDate: rep.payment_request_date ?? null,
    settlementDate:     rep.settlement_date ?? null,
    lineItems:          rep.line_items ?? null,
    attachmentUrls:     rep.attachment_urls ?? null,
  }]
})
```

fullApproveExpenseItems 매핑에도 동일하게 `expenseType: rep.expense_type ?? null` 추가.

- [ ] **Step 5: JS 필터 적용 (expenseItems 및 fullApproveExpenseItems)**

`expenseItems` 빌드 직후, merge 전에 JS 필터 추가:

```typescript
// ── Expense JS 필터 ──────────────────────────────────────────────────────
if (expenseType) {
  expenseItems = expenseItems.filter(e => e.expenseType === expenseType)
}
if (month) {
  expenseItems = expenseItems.filter(e => e.requestDate.startsWith(month))
} else if (dateFrom || dateTo) {
  if (dateFrom) expenseItems = expenseItems.filter(e => e.requestDate.slice(0, 10) >= dateFrom)
  if (dateTo)   expenseItems = expenseItems.filter(e => e.requestDate.slice(0, 10) <= dateTo)
}
if (keyword) {
  const kw = keyword.toLowerCase()
  expenseItems = expenseItems.filter(e =>
    JSON.stringify(e.lineItems ?? []).toLowerCase().includes(kw)
  )
}
if (employeeName) {
  const en = employeeName.toLowerCase()
  expenseItems = expenseItems.filter(e => e.employeeName.toLowerCase().includes(en))
}
```

fullApproveExpenseItems도 동일하게 (`fullApproveExpenseItems = fullApproveExpenseItems.filter(...)`) 추가, `if (tab === 'pending')` 블록 직후.

- [ ] **Step 6: AdminApprovalClient에 새 props 전달**

`<AdminApprovalClient ...>` 에 추가:

```tsx
<AdminApprovalClient
  items={items}
  total={total}
  page={curPage}
  totalPages={totalPages}
  tab={tab}
  type={type}
  period={period}
  sort={sort}
  fullApproveItems={[...fullApproveLeaveItems, ...fullApproveExpenseItems]}
  expenseType={expenseType}
  month={month}
  dateFrom={dateFrom}
  dateTo={dateTo}
  keyword={keyword}
  employeeName={employeeName}
/>
```

- [ ] **Step 7: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 8: 커밋**

```powershell
git add "app/(admin)/admin/approval/page.tsx"
git commit -m "feat: add expense search filter params to admin approval page"
git push origin main
```

---

## Task 7: AdminApprovalClient.tsx — 필터 UI 통합

**Files:**
- Modify: `components/admin/AdminApprovalClient.tsx`

- [ ] **Step 1: ExpenseSearchFilter import 추가**

파일 상단에 추가:

```typescript
import ExpenseSearchFilter from '@/components/approval/ExpenseSearchFilter'
```

- [ ] **Step 2: Props 인터페이스에 새 필터 필드 추가**

기존 Props interface에 추가:

```typescript
interface Props {
  items: ApprovalItem[]
  total: number
  page: number
  totalPages: number
  tab: string
  type: string
  period: string
  sort: string
  fullApproveItems?: ApprovalItem[]
  expenseType: string
  month: string
  dateFrom: string
  dateTo: string
  keyword: string
  employeeName: string
}
```

- [ ] **Step 3: 컴포넌트 파라미터에 새 props 추가**

destructuring에 추가:

```typescript
function AdminApprovalClient({
  items, total, page, totalPages, tab, type, period, sort,
  fullApproveItems = [],
  expenseType, month, dateFrom, dateTo, keyword, employeeName,
}: Props) {
```

- [ ] **Step 4: buildUrl 함수에 expense 필터 params 포함**

```typescript
function buildUrl(overrides: Record<string, string>) {
  const p = new URLSearchParams({
    tab, type, period, sort, page: String(page),
    ...(expenseType  && { expenseType }),
    ...(month        && { month }),
    ...(dateFrom     && { dateFrom }),
    ...(dateTo       && { dateTo }),
    ...(keyword      && { keyword }),
    ...(employeeName && { employeeName }),
    ...overrides,
  })
  return `...?${p.toString()}`
}
```

기존 buildUrl의 `return` 문은 그대로 유지하고 초기화 객체만 위처럼 교체.

- [ ] **Step 5: expense 관련 시 ExpenseSearchFilter 렌더**

기존 period 필터 버튼 그룹 아래 (또는 type 필터 아래)에 추가:

```tsx
{/* Expense 검색 필터 — expense 또는 전체 탭에서 표시 */}
{(type === 'expense' || type === 'all') && (
  <ExpenseSearchFilter
    expenseType={expenseType}
    month={month}
    dateFrom={dateFrom}
    dateTo={dateTo}
    keyword={keyword}
    employeeName={employeeName}
    showAdminFilters
    baseParams={{ tab, type, period, sort }}
  />
)}
```

- [ ] **Step 6: TypeScript 빌드 확인**

```powershell
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: 커밋**

```powershell
git add "components/admin/AdminApprovalClient.tsx"
git commit -m "feat: integrate expense search filter into admin approval client"
git push origin main
```

---

## 완료 확인 체크리스트

- [ ] 지출결의 탭에서 '법인카드' 선택 시 법인카드 제출 건만 표시되는가
- [ ] 월 선택 시 해당 월 지출결의서만 표시되는가
- [ ] 기간 선택 시 월 선택이 초기화되는가 (상호 배타)
- [ ] 지출항목 검색어 입력 시 line_items에 해당 텍스트 포함된 건만 표시되는가
- [ ] 결재관리에서 신청인 검색 시 해당 이름 포함 건만 표시되는가
- [ ] 초기화 버튼 클릭 시 모든 필터 해제되는가
- [ ] 필터 활성 상태로 페이지 새로고침 시 필터값 유지되는가 (URL 기반)
- [ ] 신규 지출결의서 제출 후 DB에 `expense_type` 올바르게 저장되는가
