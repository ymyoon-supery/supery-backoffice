# Approval Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드바 결재 메뉴를 "내 신청 내역"과 "결재 대기(팀장전용 배지)"로 분리하고, 관리자 메뉴의 결재함을 "결재관리"로 변경한다.

**Architecture:** 기존 `/approval/inbox` 단일 페이지(탭 2개)를 `/approval/my`(내 신청)와 `/approval/pending`(결재 대기)로 분리한다. `layout.tsx`에서 `position`과 `pendingCount`를 fetch해 Sidebar에 prop으로 전달한다. 팀장 여부는 `employees.position = '팀장'`으로 판단한다.

**Tech Stack:** Next.js 14 App Router, Supabase, TypeScript, Tailwind CSS, lucide-react

---

## File Map

| 파일 | 역할 |
|------|------|
| `components/layout/Sidebar.tsx` | 수정 — 메뉴 재구성, 팀장 분기, 배지 렌더링 |
| `app/(dashboard)/layout.tsx` | 수정 — `position` 추가 fetch, `pendingCount` 계산 후 Sidebar 전달 |
| `app/(dashboard)/approval/my/page.tsx` | 신규 — 내 신청 내역 (server component, 읽기 전용) |
| `app/(dashboard)/approval/pending/page.tsx` | 신규 — 결재 대기 (server component + PendingApprovalsClient) |
| `components/approval/PendingApprovalsClient.tsx` | 신규 — 승인/반려 UI (client component) |
| `app/(dashboard)/approval/inbox/page.tsx` | 삭제 |
| `components/approval/LeaveForm.tsx` | 수정 — 제출 후 리다이렉트 |
| `components/approval/ExpenseForm.tsx` | 수정 — 제출 후 리다이렉트 |
| `app/(admin)/admin/approval/page.tsx` | 수정 — 비관리자 가드 리다이렉트 |

---

### Task 1: Sidebar 재구성

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Sidebar.tsx 전체 교체**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Clock, FileText, BarChart2, Users, ClipboardList, Home,
  Bell, FilePlus, CalendarDays, Settings, Megaphone, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const adminNav = [
  { href: '/admin/approval', label: '결재관리', icon: ClipboardList },
  { href: '/admin/employees', label: '출퇴근 현황', icon: Users },
  { href: '/admin/attendance', label: '근태 현황', icon: Clock },
  { href: '/admin/reports', label: '52시간 리포트', icon: BarChart2 },
  { href: '/admin/leave-manual', label: '연차관리', icon: FilePlus },
  { href: '/admin/leave-promotion', label: '연차사용촉진', icon: Bell },
  { href: '/admin/notices', label: '공지사항 관리', icon: Megaphone },
  { href: '/admin/settings', label: '설정', icon: Settings },
]

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  badge?: number
}

export default function Sidebar({
  role,
  position,
  pendingCount,
}: {
  role: string
  position: string | null
  pendingCount: number
}) {
  const pathname = usePathname()
  const isAdmin = role === 'ADMIN'
  const isTeamLead = position === '팀장'

  const employeeNav: NavItem[] = [
    { href: '/', label: '홈', icon: Home },
    { href: '/attendance', label: '근태등록', icon: Clock },
    { href: '/leave', label: '연차 사용 내역', icon: CalendarDays },
    { href: '/approval/leave/new', label: '연차 신청', icon: FileText },
    { href: '/approval/expense/new', label: '지출결의', icon: FileText },
    { href: '/approval/my', label: '내 신청 내역', icon: Inbox },
    ...(isTeamLead && !isAdmin
      ? [{ href: '/approval/pending', label: '결재 대기', icon: ClipboardList, badge: pendingCount }]
      : []),
    { href: '/notices', label: '공지사항', icon: Megaphone },
  ]

  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
      <div className="h-14 flex items-center px-5 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">WorkSync</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {employeeNav.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {badge != null && badge > 0 && (
              <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                {badge}
              </span>
            )}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">관리자</span>
            </div>
            {adminNav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd C:\Anitgravity_ymyoon\supery-backoffice && npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음 (또는 layout.tsx 관련 prop 불일치 에러 — Task 2에서 수정)

- [ ] **Step 3: 커밋**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: restructure sidebar nav with 내 신청 내역 and 결재 대기 badge"
```

---

### Task 2: Layout에 position + pendingCount 추가

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: layout.tsx 전체 교체**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, email, role, position, avatar_url, department_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  let pendingCount = 0
  if (employee.position === '팀장' && employee.role !== 'ADMIN') {
    const [{ count: leaveCount }, { count: expenseCount }] = await Promise.all([
      supabase
        .from('leave_approval_steps')
        .select('*', { count: 'exact', head: true })
        .eq('approver_id', employee.id)
        .eq('status', 'PENDING'),
      supabase
        .from('expense_approval_steps')
        .select('*', { count: 'exact', head: true })
        .eq('approver_id', employee.id)
        .eq('status', 'PENDING'),
    ])
    pendingCount = (leaveCount ?? 0) + (expenseCount ?? 0)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        role={employee.role}
        position={employee.position ?? null}
        pendingCount={pendingCount}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header employee={employee} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: fetch position and pendingCount in dashboard layout"
```

---

### Task 3: /approval/my 페이지 생성 (내 신청 내역)

**Files:**
- Create: `app/(dashboard)/approval/my/page.tsx`

- [ ] **Step 1: 페이지 파일 생성**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING:  { label: '대기', className: 'bg-yellow-50 text-yellow-700' },
  APPROVED: { label: '승인', className: 'bg-green-50 text-green-700' },
  REJECTED: { label: '반려', className: 'bg-red-50 text-red-600' },
}

export default async function MyRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const [{ data: myLeave }, { data: myExpense }] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, days_used, status, created_at, leave_approval_steps(comment, status)')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('expense_reports')
      .select('id, title, amount, category, status, created_at')
      .eq('employee_id', employee.id)
      .in('status', ['PENDING', 'APPROVED', 'REJECTED'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items = [
    ...(myLeave ?? []).map(r => ({ ...r, kind: 'leave' as const })),
    ...(myExpense ?? []).map(r => ({ ...r, kind: 'expense' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">내 신청 내역</h1>
      <div className="space-y-2">
        {items.map(item => {
          const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING
          const rejectionReason = item.kind === 'leave' && item.status === 'REJECTED'
            ? (item.leave_approval_steps as { status: string; comment: string | null }[])
                ?.find(s => s.status === 'REJECTED')?.comment
            : null
          return (
            <div key={item.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.kind === 'leave'
                      ? `${LEAVE_LABELS[item.leave_type]} ${item.days_used}일`
                      : `${item.title} — ${item.amount?.toLocaleString()}원`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(item.created_at), 'yyyy.MM.dd')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              {rejectionReason && (
                <p className="text-xs text-red-500 mt-2 pl-0.5">반려 사유: {rejectionReason}</p>
              )}
            </div>
          )
        })}
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">신청 내역이 없습니다.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/(dashboard)/approval/my/page.tsx"
git commit -m "feat: add /approval/my page for own request history"
```

---

### Task 4: /approval/pending 페이지 생성 (결재 대기)

**Files:**
- Create: `app/(dashboard)/approval/pending/page.tsx`
- Create: `components/approval/PendingApprovalsClient.tsx`

- [ ] **Step 1: PendingApprovalsClient.tsx 생성**

승인/반려 액션이 필요해 client component으로 작성. 기존 `ApprovalInboxClient`의 pending 탭 로직을 탭 UI 없이 재구성.

```tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { approveLeave } from '@/app/(dashboard)/approval/leave/actions'
import { approveExpense } from '@/app/(dashboard)/approval/expense/actions'
import { useRouter } from 'next/navigation'

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전반차', PM_HALF: '오후반차',
  SICK: '병가(무급)', GROUP: '공동연차', COMP: '보상휴가', OTHER: '기타',
}
const EXPENSE_LABELS: Record<string, string> = {
  TRANSPORT: '교통비', MEAL: '식대', ACCOMMODATION: '숙박비', SUPPLIES: '소모품', OTHER: '기타',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PendingApprovalsClient({ leaveSteps, expenseSteps }: { leaveSteps: any[]; expenseSteps: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  function handleLeave(requestId: string, approved: boolean, comment?: string) {
    startTransition(async () => {
      const result = await approveLeave(requestId, approved, comment)
      if (result.error) { toast.error(result.error); return }
      toast.success(approved ? '승인되었습니다.' : '반려되었습니다.')
      setRejectingId(null)
      setRejectReason('')
      router.refresh()
    })
  }

  function handleExpense(reportId: string, approved: boolean) {
    startTransition(async () => {
      const result = await approveExpense(reportId, approved)
      if (result.error) { toast.error(result.error); return }
      toast.success(approved ? '승인되었습니다.' : '반려되었습니다.')
      router.refresh()
    })
  }

  const totalPending = leaveSteps.length + expenseSteps.length

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">결재 대기</h1>

      <div className="space-y-3">
        {leaveSteps.map((step: any) => {
          const req = step.leave_requests
          return (
            <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {req.employees?.name} — {LEAVE_LABELS[req.leave_type]} {req.days_used}일
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {req.start_date} ~ {req.end_date}
                    {req.reason && <span className="ml-2">· {req.reason}</span>}
                  </p>
                </div>
                <span className="text-xs text-gray-400">{format(new Date(req.created_at), 'MM/dd')}</span>
              </div>

              {rejectingId === step.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="반려 사유 (선택)"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLeave(req.id, false, rejectReason || undefined)}
                      disabled={isPending}
                      className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700"
                    >
                      반려 확인
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectReason('') }}
                      className="flex-1 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLeave(req.id, true)}
                    disabled={isPending}
                    className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => setRejectingId(step.id)}
                    disabled={isPending}
                    className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50"
                  >
                    반려
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {expenseSteps.map((step: any) => {
          const rep = step.expense_reports
          return (
            <div key={step.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {rep.employees?.name} — {rep.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {EXPENSE_LABELS[rep.category]} · {rep.amount.toLocaleString()}원 · {rep.expense_date}
                  </p>
                </div>
                <span className="text-xs text-gray-400">{format(new Date(rep.created_at), 'MM/dd')}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExpense(rep.id, true)}
                  disabled={isPending}
                  className="flex-1 py-2 text-sm font-medium bg-primary text-white rounded-lg disabled:opacity-50 hover:bg-primary/90"
                >
                  승인
                </button>
                <button
                  onClick={() => handleExpense(rep.id, false)}
                  disabled={isPending}
                  className="flex-1 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg disabled:opacity-50 hover:bg-red-50"
                >
                  반려
                </button>
              </div>
            </div>
          )
        })}

        {totalPending === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">결재 대기 항목이 없습니다.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: /approval/pending/page.tsx 생성**

팀장이 아닌 사용자가 직접 접근하면 `/approval/my`로 redirect.

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendingApprovalsClient from '@/components/approval/PendingApprovalsClient'

export default async function PendingApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, position')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')
  if (employee.position !== '팀장') redirect('/approval/my')

  const [{ data: leaveSteps }, { data: expenseSteps }] = await Promise.all([
    supabase
      .from('leave_approval_steps')
      .select(`
        id, step_order, status,
        leave_requests (
          id, leave_type, start_date, end_date, days_used, reason, status, created_at,
          employees ( name, email, department_id )
        )
      `)
      .eq('approver_id', employee.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false }),
    supabase
      .from('expense_approval_steps')
      .select(`
        id, step_order, status,
        expense_reports (
          id, title, amount, category, expense_date, status, created_at,
          employees ( name, email )
        )
      `)
      .eq('approver_id', employee.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false }),
  ])

  return (
    <PendingApprovalsClient
      leaveSteps={leaveSteps ?? []}
      expenseSteps={expenseSteps ?? []}
    />
  )
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add "components/approval/PendingApprovalsClient.tsx" "app/(dashboard)/approval/pending/page.tsx"
git commit -m "feat: add /approval/pending page for team lead approvals"
```

---

### Task 5: 링크 교체 + inbox 페이지 삭제

**Files:**
- Modify: `components/approval/LeaveForm.tsx:67`
- Modify: `components/approval/ExpenseForm.tsx:133`
- Modify: `app/(admin)/admin/approval/page.tsx:44`
- Delete: `app/(dashboard)/approval/inbox/page.tsx`

- [ ] **Step 1: LeaveForm.tsx 리다이렉트 수정**

`components/approval/LeaveForm.tsx` 에서:

```tsx
// 변경 전
router.push('/approval/inbox')

// 변경 후
router.push('/approval/my')
```

- [ ] **Step 2: ExpenseForm.tsx 리다이렉트 수정**

`components/approval/ExpenseForm.tsx` 에서:

```tsx
// 변경 전
router.push('/approval/inbox')

// 변경 후
router.push('/approval/my')
```

- [ ] **Step 3: admin/approval/page.tsx 가드 수정**

`app/(admin)/admin/approval/page.tsx:44` 에서:

```tsx
// 변경 전
if (!employee || employee.role !== 'ADMIN') redirect('/approval/inbox')

// 변경 후
if (!employee || employee.role !== 'ADMIN') redirect('/approval/my')
```

- [ ] **Step 4: inbox 페이지 삭제**

```bash
rm "app/(dashboard)/approval/inbox/page.tsx"
```

- [ ] **Step 5: 잔여 inbox 링크 없는지 확인**

```bash
grep -r "approval/inbox" --include="*.tsx" --include="*.ts" . --exclude-dir=.next
```

Expected: 아무 출력 없음 (0 matches)

- [ ] **Step 6: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 7: 커밋 + 푸시**

```bash
git add components/approval/LeaveForm.tsx components/approval/ExpenseForm.tsx
git add "app/(admin)/admin/approval/page.tsx"
git rm "app/(dashboard)/approval/inbox/page.tsx"
git commit -m "feat: replace /approval/inbox with /approval/my across codebase"
git push origin main
```
