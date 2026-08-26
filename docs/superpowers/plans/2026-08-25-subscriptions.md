# 구독서비스 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 전용 SaaS 구독서비스 관리 페이지 (`/admin/subscriptions`) 구현 — CRUD + 사이드바 메뉴 추가

**Architecture:** Supabase `subscriptions` 테이블 + RLS(어드민 전용) → Next.js Server Actions(create/update/delete) → Server Component(data fetch) → Client Component(테이블+모달 UI). 기존 `agents`, `payslip` 페이지와 동일한 패턴.

**Tech Stack:** Next.js App Router, Supabase (service_role), TypeScript, Tailwind CSS, lucide-react

## Global Constraints

- 어드민(`role = 'ADMIN'`)만 접근 가능 — RLS 및 Server Actions 모두 검증
- 모든 DB 접근은 `SUPABASE_SERVICE_ROLE_KEY` 사용 (RLS bypass)
- `revalidatePath('/admin/subscriptions')` — 변경 후 서버 캐시 무효화
- 카드 끝 4자리는 숫자만 4자리 (`card_last4`)

---

### Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/082_subscriptions.sql`

**Interfaces:**
- Produces: `subscriptions` 테이블 (Task 2, 3이 의존)

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/082_subscriptions.sql` 내용:

```sql
-- 082_subscriptions.sql
-- 회사 SaaS 구독서비스 관리 테이블

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  cost            INTEGER NOT NULL CHECK (cost > 0),
  billing_cycle   TEXT NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  renewal_date    DATE NOT NULL,
  manager_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('CARD', 'TRANSFER', 'OTHER')),
  card_name       TEXT,
  card_last4      TEXT,
  license_count   INTEGER,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_admin_all" ON subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
    )
  );

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

Supabase 대시보드 → SQL Editor → 위 SQL 전체 붙여넣기 → Run

- [ ] **Step 3: 테이블 생성 확인**

Table Editor에서 `subscriptions` 테이블이 생겼는지 확인. RLS 토글이 켜져 있는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/082_subscriptions.sql
git commit -m "feat: subscriptions 테이블 마이그레이션 추가"
```

---

### Task 2: Server Actions

**Files:**
- Create: `app/(admin)/admin/subscriptions/actions.ts`

**Interfaces:**
- Consumes: `subscriptions` 테이블 (Task 1)
- Produces:
  - `SubscriptionFormData` 타입
  - `createSubscription(data: SubscriptionFormData): Promise<{ error?: string }>`
  - `updateSubscription(id: string, data: SubscriptionFormData): Promise<{ error?: string }>`
  - `deleteSubscription(id: string): Promise<{ error?: string }>`

- [ ] **Step 1: actions.ts 작성**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }
  const { data: emp } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!emp || emp.role !== 'ADMIN') return { error: '권한이 없습니다.' }
  return { error: null }
}

export type SubscriptionFormData = {
  name: string
  cost: number
  billing_cycle: 'MONTHLY' | 'YEARLY'
  renewal_date: string
  manager_id: string | null
  payment_method: 'CARD' | 'TRANSFER' | 'OTHER'
  card_name: string | null
  card_last4: string | null
  license_count: number | null
  department_id: string | null
  notes: string | null
}

export async function createSubscription(
  data: SubscriptionFormData,
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { error } = await adminClient().from('subscriptions').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/admin/subscriptions')
  return {}
}

export async function updateSubscription(
  id: string,
  data: SubscriptionFormData,
): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { error } = await adminClient()
    .from('subscriptions')
    .update(data)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/subscriptions')
  return {}
}

export async function deleteSubscription(id: string): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { error } = await adminClient()
    .from('subscriptions')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/subscriptions')
  return {}
}
```

- [ ] **Step 2: 타입 오류 확인**

```bash
npx tsc --noEmit
```

오류 없이 통과해야 함.

- [ ] **Step 3: 커밋**

```bash
git add app/(admin)/admin/subscriptions/actions.ts
git commit -m "feat: subscriptions Server Actions 추가 (create/update/delete)"
```

---

### Task 3: 서버 컴포넌트 페이지

**Files:**
- Create: `app/(admin)/admin/subscriptions/page.tsx`

**Interfaces:**
- Consumes:
  - `subscriptions` 테이블 (Task 1) — `*, manager:manager_id(id,name), department:department_id(id,name)` join
  - `employees` 테이블 — `id, name`
  - `departments` 테이블 — `id, name`
- Produces: `<SubscriptionsClient>` props
  - `subscriptions: Subscription[]`
  - `employees: { id: string; name: string }[]`
  - `departments: { id: string; name: string }[]`

- [ ] **Step 1: page.tsx 작성**

```typescript
import { createClient as createServiceClient } from '@supabase/supabase-js'
import SubscriptionsClient from './SubscriptionsClient'

export default async function SubscriptionsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: subscriptions }, { data: employees }, { data: departments }] =
    await Promise.all([
      admin
        .from('subscriptions')
        .select('*, manager:manager_id(id, name), department:department_id(id, name)')
        .order('renewal_date', { ascending: true }),
      admin
        .from('employees')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
      admin.from('departments').select('id, name').order('name'),
    ])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">구독서비스 관리</h1>
      <SubscriptionsClient
        subscriptions={subscriptions ?? []}
        employees={employees ?? []}
        departments={departments ?? []}
      />
    </div>
  )
}
```

- [ ] **Step 2: 타입 오류 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add app/(admin)/admin/subscriptions/page.tsx
git commit -m "feat: subscriptions 서버 컴포넌트 페이지 추가"
```

---

### Task 4: 클라이언트 UI

**Files:**
- Create: `app/(admin)/admin/subscriptions/SubscriptionsClient.tsx`

**Interfaces:**
- Consumes:
  - `createSubscription`, `updateSubscription`, `deleteSubscription` (Task 2)
  - `SubscriptionFormData` 타입 (Task 2)
  - props: `subscriptions`, `employees`, `departments` (Task 3)

- [ ] **Step 1: SubscriptionsClient.tsx 작성**

```typescript
'use client'

import { useState } from 'react'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from './actions'
import type { SubscriptionFormData } from './actions'

type Subscription = {
  id: string
  name: string
  cost: number
  billing_cycle: 'MONTHLY' | 'YEARLY'
  renewal_date: string
  manager_id: string | null
  manager: { id: string; name: string } | null
  payment_method: 'CARD' | 'TRANSFER' | 'OTHER'
  card_name: string | null
  card_last4: string | null
  license_count: number | null
  department_id: string | null
  department: { id: string; name: string } | null
  notes: string | null
}

type Employee = { id: string; name: string }
type Department = { id: string; name: string }

const EMPTY_FORM: SubscriptionFormData = {
  name: '',
  cost: 0,
  billing_cycle: 'MONTHLY',
  renewal_date: '',
  manager_id: null,
  payment_method: 'CARD',
  card_name: null,
  card_last4: null,
  license_count: null,
  department_id: null,
  notes: null,
}

export default function SubscriptionsClient({
  subscriptions,
  employees,
  departments,
}: {
  subscriptions: Subscription[]
  employees: Employee[]
  departments: Department[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Subscription | null>(null)
  const [form, setForm] = useState<SubscriptionFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setError(null)
    setIsModalOpen(true)
  }

  function openEdit(sub: Subscription) {
    setEditTarget(sub)
    setForm({
      name: sub.name,
      cost: sub.cost,
      billing_cycle: sub.billing_cycle,
      renewal_date: sub.renewal_date,
      manager_id: sub.manager_id,
      payment_method: sub.payment_method,
      card_name: sub.card_name,
      card_last4: sub.card_last4,
      license_count: sub.license_count,
      department_id: sub.department_id,
      notes: sub.notes,
    })
    setError(null)
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = editTarget
      ? await updateSubscription(editTarget.id, form)
      : await createSubscription(form)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setIsModalOpen(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 구독을 삭제하시겠습니까?`)) return
    const result = await deleteSubscription(id)
    if (result.error) alert(result.error)
  }

  function formatCost(cost: number) {
    return `₩${cost.toLocaleString()}`
  }

  function formatPayment(sub: Subscription) {
    if (sub.payment_method === 'CARD') {
      const parts = [
        sub.card_name,
        sub.card_last4 ? `****${sub.card_last4}` : null,
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : '카드'
    }
    if (sub.payment_method === 'TRANSFER') return '계좌이체'
    return '기타'
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90"
        >
          추가
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['서비스명', '비용', '결제주기', '갱신일', '담당자', '라이선스', '부서', '결제수단', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subscriptions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  등록된 구독서비스가 없습니다.
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{sub.name}</td>
                  <td className="px-4 py-3 text-gray-700">{formatCost(sub.cost)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {sub.billing_cycle === 'MONTHLY' ? '월간' : '연간'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{sub.renewal_date}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.manager?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.license_count ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.department?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatPayment(sub)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(sub)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(sub.id, sub.name)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">
                {editTarget ? '구독서비스 수정' : '구독서비스 추가'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {/* 서비스명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  서비스명 *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {/* 비용 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비용 (원) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={form.cost || ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cost: Number(e.target.value) }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {/* 결제주기 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  결제주기 *
                </label>
                <select
                  value={form.billing_cycle}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      billing_cycle: e.target.value as 'MONTHLY' | 'YEARLY',
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="MONTHLY">월간</option>
                  <option value="YEARLY">연간</option>
                </select>
              </div>
              {/* 갱신일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  갱신일 *
                </label>
                <input
                  type="date"
                  required
                  value={form.renewal_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, renewal_date: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {/* 담당자 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  담당자 *
                </label>
                <select
                  required
                  value={form.manager_id ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, manager_id: e.target.value || null }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">선택</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* 결제수단 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  결제수단 *
                </label>
                <select
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payment_method: e.target.value as 'CARD' | 'TRANSFER' | 'OTHER',
                      card_name: null,
                      card_last4: null,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="CARD">카드</option>
                  <option value="TRANSFER">계좌이체</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>
              {/* 카드 상세 — CARD 선택 시에만 표시 */}
              {form.payment_method === 'CARD' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      카드명
                    </label>
                    <input
                      type="text"
                      placeholder="신한, 국민 등"
                      value={form.card_name ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, card_name: e.target.value || null }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      끝 4자리
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="1234"
                      value={form.card_last4 ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          card_last4: e.target.value.replace(/\D/g, '').slice(0, 4) || null,
                        }))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
              {/* 라이선스 수량 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  라이선스 수량
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.license_count ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      license_count: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {/* 사용 부서 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  사용 부서
                </label>
                <select
                  value={form.department_id ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, department_id: e.target.value || null }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">전사</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  rows={2}
                  value={form.notes ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value || null }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? '저장 중...' : editTarget ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 오류 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 개발 서버에서 동작 확인**

`npm run dev` 후 `/admin/subscriptions` 접속:
- 빈 목록 화면 표시 확인
- "추가" 버튼 클릭 → 모달 열림 확인
- 구독 추가 → 목록에 표시 확인
- 수정 버튼 → 기존 값 채워진 모달 확인
- 삭제 버튼 → confirm 후 제거 확인
- 결제수단 "카드" 선택 시 카드명/끝자리 필드 나타남 확인
- 결제수단 변경 시 카드 필드 사라짐 확인

- [ ] **Step 4: 커밋**

```bash
git add app/(admin)/admin/subscriptions/SubscriptionsClient.tsx
git commit -m "feat: subscriptions 클라이언트 UI 추가 (테이블 + 추가/수정/삭제 모달)"
```

---

### Task 5: 사이드바 메뉴 추가

**Files:**
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: 기존 `adminNavGroups` 배열의 `시스템` 그룹

- [ ] **Step 1: Sidebar.tsx import에 CreditCard 추가**

`components/layout/Sidebar.tsx` 상단 import 수정:

```typescript
import {
  Clock, FileText, BarChart2, Users, ClipboardList, Home,
  Bell, FilePlus, CalendarDays, Settings, Megaphone, Inbox,
  Receipt, Package, Loader2, X, BookOpen, FileBarChart, Monitor,
  CreditCard,
} from 'lucide-react'
```

- [ ] **Step 2: adminNavGroups의 시스템 그룹에 항목 추가**

```typescript
  {
    label: '시스템',
    items: [
      { href: '/admin/settings', label: '설정', icon: Settings },
      { href: '/admin/subscriptions', label: '구독서비스 관리', icon: CreditCard },
    ],
  },
```

- [ ] **Step 3: 사이드바 확인**

개발 서버에서 어드민 계정으로 로그인 후 사이드바 하단 `시스템` 그룹에 "구독서비스 관리" 메뉴가 보이는지 확인. 클릭 시 `/admin/subscriptions` 이동 확인.

- [ ] **Step 4: 최종 커밋 및 push**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: 사이드바에 구독서비스 관리 메뉴 추가"
git push origin main
```
