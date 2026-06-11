import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { calcAnnualLeave } from '@/lib/annualLeave'
import LeavePromotionClient from './LeavePromotionClient'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function LeavePromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const params = await searchParams
  const year = parseInt(params.year ?? String(new Date().getFullYear()))

  const [{ data: rawEmployees }, { data: notices }, { data: teams }, { data: groups }, { data: usedTotals }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, department_id, annual_leave_days, remaining_leaves, hired_at')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('leave_promotion_notices')
      .select('*')
      .eq('fiscal_year', year),
    supabase.from('departments').select('id, name, group_id'),
    supabase.from('groups').select('id, name'),
    admin.from('leave_requests')
      .select('employee_id, leave_type, days_used')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS),
  ])

  const today = new Date()
  const usedByEmp: Record<string, number> = {}
  for (const r of usedTotals ?? []) {
    usedByEmp[r.employee_id] = (usedByEmp[r.employee_id] ?? 0) + Number(r.days_used)
  }

  const employees = (rawEmployees ?? []).map(e => {
    const entitlement = e.hired_at
      ? calcAnnualLeave(new Date(e.hired_at), today)
      : (e.annual_leave_days ?? 15)
    return {
      ...e,
      annual_leave_days: entitlement,
      remaining_leaves: Math.max(entitlement - (usedByEmp[e.id] ?? 0), 0),
    }
  })

  return (
    <LeavePromotionClient
      employees={employees}
      notices={notices ?? []}
      teams={teams ?? []}
      groups={groups ?? []}
      year={year}
    />
  )
}
