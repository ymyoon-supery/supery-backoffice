# Expense Forms (5-Type) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지출결의서 폼을 5종으로 확장 — 기존 지출결의서 항목 수정, 사업소득·경품비 탭 신규 추가, 주민번호 AES-256-GCM 암호화 저장.

**Architecture:** 기존 3탭 `ExpenseForm.tsx`에 2탭 추가. 주민번호는 서버 액션에서 암호화 후 별도 `expense_sensitive_data` 테이블에 저장. 신규 서버 액션 2개(`submitBusinessIncomeExpense`, `submitPrizeExpense`)가 기존 `submitExpense` RPC를 내부 재사용.

**Tech Stack:** Next.js 14 App Router, Supabase (RPC + direct insert), Node.js crypto (AES-256-GCM), TypeScript, Tailwind CSS

---

## File Map

| 파일 | 유형 | 역할 |
|------|------|------|
| `lib/crypto/ssn.ts` | 신규 | AES-256-GCM 암호화/복호화 헬퍼 |
| `supabase/migrations/044_expense_sensitive_data.sql` | 신규 | expense_sensitive_data 테이블 생성 |
| `app/(dashboard)/approval/expense/actions.ts` | 수정 | 신규 서버 액션 2개 추가 |
| `components/approval/ExpenseForm.tsx` | 수정 | 탭 1 수정, 탭 4·5 추가 |

---

## Task 1: SSN 암호화 헬퍼

**Files:**
- Create: `lib/crypto/ssn.ts`

- [ ] **Step 1: `lib/crypto/ssn.ts` 작성**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.EXPENSE_SSN_ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('EXPENSE_SSN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

export function encryptSSN(ssn: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(ssn, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decryptSSN(encryptedB64: string, ivB64: string): string {
  const combined = Buffer.from(encryptedB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const data = combined.subarray(0, combined.length - 16)
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 2: 환경변수 추가**

`.env.local`에 추가 (64자 hex = 32바이트):
```
EXPENSE_SSN_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
```

실제 운영 키는 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 로 생성.

Vercel 프로젝트에도 동일 키 추가 필요 (`vercel env add EXPENSE_SSN_ENCRYPTION_KEY`).

- [ ] **Step 3: TypeScript 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/crypto/ssn.ts
git commit -m "Add AES-256-GCM SSN encryption helper"
```

---

## Task 2: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/044_expense_sensitive_data.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 주민번호 암호화 저장 테이블
CREATE TABLE expense_sensitive_data (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  encrypted_ssn     text NOT NULL,
  iv                text NOT NULL,
  created_at        timestamptz DEFAULT now()
);

-- 사용자 직접 접근 차단 (서비스 롤만 접근)
ALTER TABLE expense_sensitive_data ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Supabase 대시보드에서 실행**

Supabase 대시보드 → SQL Editor → 위 SQL 실행.
또는: `npx supabase db push` (로컬 supabase 설정된 경우).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/044_expense_sensitive_data.sql
git commit -m "Add expense_sensitive_data migration for encrypted SSN"
```

---

## Task 3: 서버 액션 추가

**Files:**
- Modify: `app/(dashboard)/approval/expense/actions.ts`

- [ ] **Step 1: 파일 상단 import 추가**

기존 import 블록 아래에 추가:
```ts
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { encryptSSN } from '@/lib/crypto/ssn'
```

- [ ] **Step 2: 타입 및 `submitBusinessIncomeExpense` 추가**

파일 끝에 추가:
```ts
export type BusinessIncomeInput = {
  recipientName: string
  ssn: string
  grossAmount: number
  description: string
  bankName: string
  accountNumber: string
  note: string
  attachmentUrls: string[]
  paymentRequestDate: string
}

export async function submitBusinessIncomeExpense(input: BusinessIncomeInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const withholding = Math.floor(input.grossAmount * 0.033)
  const netAmount = input.grossAmount - withholding

  const lineItems: LineItem[] = [{
    item: input.description,
    date: input.paymentRequestDate,
    amount: input.grossAmount,
    note: [
      `원천징수: ${withholding.toLocaleString('ko-KR')}원`,
      `실지급: ${netAmount.toLocaleString('ko-KR')}원`,
      input.note || null,
    ].filter(Boolean).join(' / '),
  }]

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
  })

  if (expenseResult.error || !expenseResult.id) return { error: expenseResult.error ?? '제출 실패' }

  const { encrypted, iv } = encryptSSN(input.ssn)
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error: ssnError } = await admin
    .from('expense_sensitive_data')
    .insert({ expense_report_id: expenseResult.id, encrypted_ssn: encrypted, iv })

  if (ssnError) return { error: ssnError.message }

  // revalidateTag는 submitExpense 내부에서 이미 호출됨
  return { error: null, id: expenseResult.id }
}
```

- [ ] **Step 3: `submitPrizeExpense` 추가**

```ts
export type PrizeInput = {
  recipientName: string
  ssn: string | null
  prizeAmount: number
  taxPaymentType: 'SELF' | 'COMPANY' | null
  paymentMethod: 'GIFT_CARD' | 'CASH'
  giftCardEvidence: 'CORPORATE_CARD' | 'PERSONAL_CARD' | null
  bankName: string | null
  accountNumber: string | null
  note: string
  attachmentUrls: string[]
  paymentRequestDate: string
  isOver50k: boolean
}

export async function submitPrizeExpense(input: PrizeInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  let taxAmount = 0
  let taxType: string | null = null
  if (input.isOver50k && input.taxPaymentType) {
    if (input.taxPaymentType === 'SELF') {
      taxAmount = Math.floor(input.prizeAmount * 0.22)
      taxType = 'WITHHOLDING_OTHER_WITHOUT'
    } else {
      taxAmount = Math.floor(input.prizeAmount * 0.22 / 0.78)
      taxType = 'WITHHOLDING_OTHER_WITH'
    }
  }

  const paymentMethod = input.paymentMethod === 'CASH' ? 'TRANSFER' : 'CARD'
  const evidenceType = input.paymentMethod === 'GIFT_CARD' ? input.giftCardEvidence : null

  const noteParts = [
    input.isOver50k
      ? `제세공과금: ${taxAmount.toLocaleString('ko-KR')}원 (${input.taxPaymentType === 'SELF' ? '본인납부' : '대납'})`
      : null,
    input.note || null,
  ].filter(Boolean) as string[]

  const lineItems: LineItem[] = [{
    item: '경품비',
    date: input.paymentRequestDate,
    amount: input.prizeAmount,
    note: noteParts.join(' / ') || undefined,
  }]

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
  })

  if (expenseResult.error || !expenseResult.id) return { error: expenseResult.error ?? '제출 실패' }

  if (input.isOver50k && input.ssn) {
    const { encrypted, iv } = encryptSSN(input.ssn)
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error: ssnError } = await admin
      .from('expense_sensitive_data')
      .insert({ expense_report_id: expenseResult.id, encrypted_ssn: encrypted, iv })
    if (ssnError) return { error: ssnError.message }
  }

  // revalidateTag는 submitExpense 내부에서 이미 호출됨
  return { error: null, id: expenseResult.id }
}
```

- [ ] **Step 4: TypeScript 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/(dashboard)/approval/expense/actions.ts
git commit -m "Add submitBusinessIncomeExpense and submitPrizeExpense server actions"
```

---

## Task 4: ExpenseForm — 지출결의서 탭(①) 수정

**Files:**
- Modify: `components/approval/ExpenseForm.tsx`

- [ ] **Step 1: `EVIDENCE_TYPE_OPTIONS` 교체**

기존:
```ts
const EVIDENCE_TYPE_OPTIONS = [
  { value: 'TAX_INVOICE', label: '세금계산서 (또는 인보이스)' },
  { value: 'BUSINESS_RECEIPT', label: '사업자 지출증빙' },
  { value: 'CORPORATE_CARD', label: '법인카드' },
  { value: 'PERSONAL_CARD', label: '개인카드' },
  { value: 'OTHER_RECEIPT', label: '기타 - 개별 영수증' },
]
```

변경 후:
```ts
const EVIDENCE_TYPE_OPTIONS = [
  { value: 'TAX_INVOICE',        label: '세금계산서' },
  { value: 'ELECTRONIC_INVOICE', label: '전자계산서(또는 인보이스)' },
  { value: 'BUSINESS_RECEIPT',   label: '사업자지출증빙' },
  { value: 'CORPORATE_CARD',     label: '법인카드영수증' },
  { value: 'PERSONAL_CARD',      label: '개인카드영수증' },
  { value: 'OTHER_RECEIPT',      label: '기타-개별영수증' },
]
```

- [ ] **Step 2: `TAX_TYPE_OPTIONS` 상수 삭제**

파일에서 아래 블록 전체 삭제:
```ts
const TAX_TYPE_OPTIONS = [
  { value: 'TAXABLE', label: '과세' },
  { value: 'EXEMPT', label: '면세 (면세사업자 또는 해외 인보이스)' },
  { value: 'WITHHOLDING_BUSINESS', label: '원천징수 (사업소득)' },
  { value: 'WITHHOLDING_OTHER_WITH', label: '원천징수 (기타소득 - 제세공과금 포함)' },
  { value: 'WITHHOLDING_OTHER_WITHOUT', label: '원천징수 (기타소득 - 제세공과금 불포함)' },
]
```

- [ ] **Step 3: `ExpenseTab` 컴포넌트에서 taxType 제거**

`ExpenseTab` 함수 안에서:

1. `const [taxType, setTaxType] = useState('')` 줄 삭제
2. `canSubmit` 조건에서 `taxType &&` 부분 삭제
3. `handleSubmit` 내 `taxType: taxType || null` → `taxType: null` 로 변경

- [ ] **Step 4: `ExpenseTab` JSX에서 구분(세목) 섹션 삭제**

아래 블록 전체 삭제:
```tsx
{/* 구분 (세목) */}
<div className="space-y-2">
  <SectionLabel>구분 (세목)</SectionLabel>
  <div className="flex flex-col gap-2">
    {TAX_TYPE_OPTIONS.map(opt => (
      ...
    ))}
  </div>
</div>
```

- [ ] **Step 5: TypeScript 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add components/approval/ExpenseForm.tsx
git commit -m "Remove 구분(세목) section and update evidence type labels in ExpenseTab"
```

---

## Task 5: BusinessIncomeTab 컴포넌트 추가

**Files:**
- Modify: `components/approval/ExpenseForm.tsx`
- Modify: `app/(dashboard)/approval/expense/actions.ts` (import 추가)

- [ ] **Step 1: actions.ts import 추가**

`ExpenseForm.tsx` 상단 import 블록에 추가:
```ts
import {
  submitExpense,
  submitBusinessIncomeExpense,
  submitPrizeExpense,
  type LineItem,
} from '@/app/(dashboard)/approval/expense/actions'
```

기존 `import { submitExpense, type LineItem }` 줄을 위 내용으로 교체.

- [ ] **Step 2: `BusinessIncomeTab` 컴포넌트 추가**

`// ─── Tab 3: 교통비` 블록 바로 아래, `// ─── Main export` 위에 삽입:

```tsx
// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function formatSSN(value: string) {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 13)
  if (digits.length > 6) return `${digits.slice(0, 6)}-${digits.slice(6)}`
  return digits
}

// ─── Tab 4: 사업소득(원천징수) 지급요청서 ─────────────────────────────────────

type BusinessIncomeFields = {
  recipientName: string
  ssn: string
  grossAmountRaw: string
  description: string
  bankName: string
  accountNumber: string
  note: string
}

function BusinessIncomeTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [fields, setFields] = useState<BusinessIncomeFields>({
    recipientName: '',
    ssn: '',
    grossAmountRaw: '',
    description: '',
    bankName: '',
    accountNumber: '',
    note: '',
  })
  const [paymentRequestDate, setPaymentRequestDate] = useState(today)
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  function setField(key: keyof BusinessIncomeFields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  const grossAmount = Number(fields.grossAmountRaw.replace(/[^0-9]/g, '')) || 0
  const withholding = Math.floor(grossAmount * 0.033)
  const netAmount = grossAmount - withholding
  const ssnClean = fields.ssn.replace(/-/g, '')

  const canSubmit =
    fields.recipientName.trim() !== '' &&
    ssnClean.length === 13 &&
    grossAmount > 0 &&
    fields.description.trim() !== '' &&
    fields.bankName.trim() !== '' &&
    fields.accountNumber.trim() !== '' &&
    !uploading

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const result = await submitBusinessIncomeExpense({
        recipientName: fields.recipientName.trim(),
        ssn: ssnClean,
        grossAmount,
        description: fields.description.trim(),
        bankName: fields.bankName.trim(),
        accountNumber: fields.accountNumber.trim(),
        note: fields.note.trim(),
        attachmentUrls,
        paymentRequestDate,
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('사업소득 지급요청서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <SectionLabel>이름</SectionLabel>
          <input
            type="text"
            value={fields.recipientName}
            onChange={e => setField('recipientName', e.target.value)}
            placeholder="홍길동"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>주민번호</SectionLabel>
          <input
            type="text"
            value={fields.ssn}
            onChange={e => setField('ssn', formatSSN(e.target.value))}
            placeholder="000000-0000000"
            maxLength={14}
            autoComplete="off"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wider"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionLabel>지급 금액 (세전)</SectionLabel>
        <input
          type="text"
          inputMode="numeric"
          value={fields.grossAmountRaw}
          onChange={e => setField('grossAmountRaw', formatKRWInput(e.target.value))}
          placeholder="0"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
        />
      </div>

      {grossAmount > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-200">
          <div className="flex justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-500">원천징수액 (3.3%)</span>
            <span className="text-gray-700 tabular-nums">- {withholding.toLocaleString('ko-KR')}원</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-700">실지급액</span>
            <span className="text-base font-bold text-primary tabular-nums">{netAmount.toLocaleString('ko-KR')}원</span>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <SectionLabel>내역</SectionLabel>
        <input
          type="text"
          value={fields.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="예: 2026년 6월 영상 편집 용역"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <SectionLabel>은행</SectionLabel>
          <input
            type="text"
            value={fields.bankName}
            onChange={e => setField('bankName', e.target.value)}
            placeholder="국민은행"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>계좌번호</SectionLabel>
          <input
            type="text"
            value={fields.accountNumber}
            onChange={e => setField('accountNumber', e.target.value)}
            placeholder="000-0000-0000"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionLabel>지급요청일</SectionLabel>
        <input
          type="date"
          value={paymentRequestDate}
          onChange={e => setPaymentRequestDate(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          비고 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={fields.note}
          onChange={e => setField('note', e.target.value)}
          placeholder="기타 참고사항"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>첨부파일</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending || uploading}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '사업소득 지급요청서 제출'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/approval/ExpenseForm.tsx
git commit -m "Add BusinessIncomeTab with SSN input and 3.3% withholding calculation"
```

---

## Task 6: PrizeTab 컴포넌트 추가

**Files:**
- Modify: `components/approval/ExpenseForm.tsx`

- [ ] **Step 1: `PrizeTab` 컴포넌트 추가**

`BusinessIncomeTab` 끝, `// ─── Main export` 위에 삽입:

```tsx
// ─── Tab 5: 현금성 경품비(기타소득) 지급요청서 ───────────────────────────────

type PrizeFields = {
  recipientName: string
  ssn: string
  prizeAmountRaw: string
  taxPaymentType: 'SELF' | 'COMPANY'
  paymentType: 'GIFT_CARD' | 'CASH'
  giftCardEvidence: 'CORPORATE_CARD' | 'PERSONAL_CARD'
  bankName: string
  accountNumber: string
  note: string
}

function PrizeTab({
  employeeId,
  employeeName,
  employeePosition,
  departmentName,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [isOver50k, setIsOver50k] = useState(false)
  const [fields, setFields] = useState<PrizeFields>({
    recipientName: '',
    ssn: '',
    prizeAmountRaw: '',
    taxPaymentType: 'SELF',
    paymentType: 'CASH',
    giftCardEvidence: 'CORPORATE_CARD',
    bankName: '',
    accountNumber: '',
    note: '',
  })
  const [paymentRequestDate, setPaymentRequestDate] = useState(today)
  const [attachments, setAttachments] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  function setField(key: keyof PrizeFields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  const prizeAmount = Number(fields.prizeAmountRaw.replace(/[^0-9]/g, '')) || 0
  const taxAmount = isOver50k
    ? fields.taxPaymentType === 'SELF'
      ? Math.floor(prizeAmount * 0.22)
      : Math.floor(prizeAmount * 0.22 / 0.78)
    : 0
  const ssnClean = fields.ssn.replace(/-/g, '')

  const canSubmit =
    fields.recipientName.trim() !== '' &&
    prizeAmount > 0 &&
    (!isOver50k || ssnClean.length === 13) &&
    (fields.paymentType === 'GIFT_CARD' || (fields.bankName.trim() !== '' && fields.accountNumber.trim() !== '')) &&
    !uploading

  function handleSubmit() {
    startTransition(async () => {
      let attachmentUrls: string[] = []
      if (attachments.length > 0) {
        setUploading(true)
        const supabase = createClient()
        attachmentUrls = await uploadFiles(supabase, employeeId, attachments)
        setUploading(false)
        if (attachmentUrls.length !== attachments.length) return
      }

      const result = await submitPrizeExpense({
        recipientName: fields.recipientName.trim(),
        ssn: isOver50k ? ssnClean : null,
        prizeAmount,
        taxPaymentType: isOver50k ? fields.taxPaymentType : null,
        paymentMethod: fields.paymentType,
        giftCardEvidence: fields.paymentType === 'GIFT_CARD' ? fields.giftCardEvidence : null,
        bankName: fields.paymentType === 'CASH' ? fields.bankName.trim() : null,
        accountNumber: fields.paymentType === 'CASH' ? fields.accountNumber.trim() : null,
        note: fields.note.trim(),
        attachmentUrls,
        paymentRequestDate,
        isOver50k,
      })

      if (result.error) { toast.error(result.error); return }
      toast.success('경품비 지급요청서가 제출되었습니다.')
      onSuccess()
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* 금액 구분 토글 */}
      <div className="space-y-2">
        <SectionLabel>경품 금액 구분</SectionLabel>
        <div className="flex gap-2">
          {([
            { value: false, label: '5만원 이하' },
            { value: true, label: '5만원 이상 (기타소득 신고)' },
          ] as const).map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setIsOver50k(opt.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isOver50k === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 이름 + 주민번호 */}
      <div className={`grid gap-4 ${isOver50k ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-1.5">
          <SectionLabel>이름</SectionLabel>
          <input
            type="text"
            value={fields.recipientName}
            onChange={e => setField('recipientName', e.target.value)}
            placeholder="홍길동"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {isOver50k && (
          <div className="space-y-1.5">
            <SectionLabel>주민번호</SectionLabel>
            <input
              type="text"
              value={fields.ssn}
              onChange={e => setField('ssn', formatSSN(e.target.value))}
              placeholder="000000-0000000"
              maxLength={14}
              autoComplete="off"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wider"
            />
          </div>
        )}
      </div>

      {/* 경품 금액 */}
      <div className="space-y-1.5">
        <SectionLabel>경품 금액</SectionLabel>
        <input
          type="text"
          inputMode="numeric"
          value={fields.prizeAmountRaw}
          onChange={e => setField('prizeAmountRaw', formatKRWInput(e.target.value))}
          placeholder="0"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
        />
      </div>

      {/* 제세공과금 (5만원 이상) */}
      {isOver50k && (
        <div className="space-y-3">
          <SectionLabel>제세공과금 방식</SectionLabel>
          <div className="flex gap-2">
            {([
              { value: 'SELF' as const, label: '본인 납부' },
              { value: 'COMPANY' as const, label: '대납 (회사 부담)' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField('taxPaymentType', opt.value)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  fields.taxPaymentType === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {prizeAmount > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-200">
              <div className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-500">
                  제세공과금 ({fields.taxPaymentType === 'SELF' ? '22%' : '역산 22%/78%'})
                </span>
                <span className="text-gray-700 tabular-nums font-semibold">
                  {taxAmount.toLocaleString('ko-KR')}원
                </span>
              </div>
              <div className="px-4 py-2 text-xs text-gray-400">
                {fields.taxPaymentType === 'SELF'
                  ? '수령자가 제세공과금을 별도 자진 납부합니다.'
                  : '회사가 경품금액 외 제세공과금을 추가 납부합니다.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 지급방식 */}
      <div className="space-y-3">
        <SectionLabel>지급방식</SectionLabel>
        <div className="flex gap-2">
          {([
            { value: 'CASH' as const, label: '현금 지급' },
            { value: 'GIFT_CARD' as const, label: '상품권' },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setField('paymentType', opt.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                fields.paymentType === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {fields.paymentType === 'CASH' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">은행</label>
              <input
                type="text"
                value={fields.bankName}
                onChange={e => setField('bankName', e.target.value)}
                placeholder="국민은행"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">계좌번호</label>
              <input
                type="text"
                value={fields.accountNumber}
                onChange={e => setField('accountNumber', e.target.value)}
                placeholder="000-0000-0000"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        )}

        {fields.paymentType === 'GIFT_CARD' && (
          <div className="space-y-2 pt-1">
            <label className="text-xs text-gray-500">상품권 구매 증빙</label>
            <div className="flex gap-2">
              {([
                { value: 'CORPORATE_CARD' as const, label: '법인카드' },
                { value: 'PERSONAL_CARD' as const, label: '개인카드' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setField('giftCardEvidence', opt.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    fields.giftCardEvidence === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 지급요청일 */}
      <div className="space-y-1.5">
        <SectionLabel>지급요청일</SectionLabel>
        <input
          type="date"
          value={paymentRequestDate}
          onChange={e => setPaymentRequestDate(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 비고 */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          비고 <span className="text-gray-400 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={fields.note}
          onChange={e => setField('note', e.target.value)}
          placeholder="기타 참고사항"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* 첨부파일 */}
      <div className="space-y-2">
        <SectionLabel>첨부파일</SectionLabel>
        <AttachmentSection
          attachments={attachments}
          onAdd={files => setAttachments(prev => [...prev, ...files])}
          onRemove={idx => setAttachments(prev => prev.filter((_, i) => i !== idx))}
        />
      </div>

      {/* 신청인 */}
      <div className="space-y-2">
        <SectionLabel>신청인</SectionLabel>
        <ApplicantBox departmentName={departmentName} employeePosition={employeePosition} employeeName={employeeName} />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending || uploading}
        className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        {uploading ? '파일 업로드 중...' : isPending ? '제출 중...' : '경품비 지급요청서 제출'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add components/approval/ExpenseForm.tsx
git commit -m "Add PrizeTab with 5만원 threshold, tax calculation, gift card/cash payment"
```

---

## Task 7: 탭 배선 및 최종 연결

**Files:**
- Modify: `components/approval/ExpenseForm.tsx`

- [ ] **Step 1: `ActiveTab` 타입 확장**

```ts
type ActiveTab = 'EXPENSE' | 'CORPORATE_CARD' | 'TRANSPORTATION' | 'BUSINESS_INCOME' | 'PRIZE'
```

- [ ] **Step 2: `TABS` 배열 업데이트**

```ts
const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'EXPENSE',           label: '지출결의서' },
  { id: 'CORPORATE_CARD',    label: '법인카드' },
  { id: 'TRANSPORTATION',    label: '교통비' },
  { id: 'BUSINESS_INCOME',   label: '사업소득' },
  { id: 'PRIZE',             label: '경품비' },
]
```

- [ ] **Step 3: `TAB_TITLES` 업데이트**

```ts
const TAB_TITLES: Record<ActiveTab, string> = {
  EXPENSE:          '지 출 결 의 서',
  CORPORATE_CARD:   '법인카드 사용 내역서',
  TRANSPORTATION:   '교통비 사용내역서',
  BUSINESS_INCOME:  '사업소득(원천징수) 지급요청서',
  PRIZE:            '현금성 경품비(기타소득) 지급요청서',
}
```

- [ ] **Step 4: 탭 콘텐츠 렌더링 추가**

`{activeTab === 'TRANSPORTATION' && ...}` 아래에 추가:
```tsx
{activeTab === 'BUSINESS_INCOME' && <BusinessIncomeTab {...props} onSuccess={onSuccess} />}
{activeTab === 'PRIZE' && <PrizeTab {...props} onSuccess={onSuccess} />}
```

- [ ] **Step 5: TypeScript 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 수동 동작 확인**

```bash
npm run dev
```

브라우저에서 `/approval/expense/new` 접속 후:

1. **탭①**: 구분(세목) 없음 확인, 증빙 6개 항목 확인
2. **탭④**: 이름·주민번호·금액 입력 → 원천징수/실지급액 자동계산 확인 → 제출 → `/approval/my` 이동 확인
3. **탭⑤**: 5만원 이하 → 이름·금액·지급방식 입력 → 제출 확인
4. **탭⑤**: 5만원 이상 → 주민번호 필드 표시 확인 → 제세공과금 자동계산 확인 → 제출 확인
5. Supabase `expense_sensitive_data` 테이블에 레코드 생성 확인

- [ ] **Step 7: 최종 커밋**

```bash
git add components/approval/ExpenseForm.tsx
git commit -m "Wire up 5-tab expense form: add BUSINESS_INCOME and PRIZE tabs"
```
