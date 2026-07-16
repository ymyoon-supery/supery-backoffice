import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { calcAnnualLeave, isUnderOneYear } from '@/lib/annualLeave'
import LeavePromotionClient from './LeavePromotionClient'
import EmploymentTabs from '@/components/admin/EmploymentTabs'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function LeavePromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; employment?: string }>
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
  const employment = params.employment === 'resigned' ? 'resigned' : 'active'

  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`

  function tabHref(status: string) {
    const p = new URLSearchParams({ year: String(year), employment: status })
    return `/admin/leave-promotion?${p.toString()}`
  }

  const [{ data: rawEmployees }, { data: notices }, { data: teams }, { data: groups }, { data: usedTotals }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, department_id, annual_leave_days, remaining_leaves, hired_at')
      .eq('is_active', employment === 'active')
      .order('name'),
    supabase
      .from('leave_promotion_notices')
      .select('*')
      .eq('fiscal_year', year),
    supabase.from('departments').select('id, name, group_id'),
    supabase.from('groups').select('id, name'),
    admin.from('leave_requests')
      .select('employee_id, days_used, start_date')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS),
  ])

  const usedAllTime: Record<string, number> = {}
  const usedThisYear: Record<string, number> = {}
  for (const r of usedTotals ?? []) {
    usedAllTime[r.employee_id] = (usedAllTime[r.employee_id] ?? 0) + Number(r.days_used)
    if (r.start_date >= yearStart) {
      usedThisYear[r.employee_id] = (usedThisYear[r.employee_id] ?? 0) + Number(r.days_used)
    }
  }

  const employees = (rawEmployees ?? []).map(e => {
    const hiredAt = e.hired_at ? new Date(e.hired_at) : null
    const entitlement = hiredAt
      ? calcAnnualLeave(hiredAt, today)
      : (e.annual_leave_days ?? 15)
    const used = hiredAt && isUnderOneYear(hiredAt, today)
      ? (usedAllTime[e.id] ?? 0)
      : (usedThisYear[e.id] ?? 0)
    return {
      ...e,
      annual_leave_days: entitlement,
      remaining_leaves: Math.max(Math.round((entitlement - used) * 10) / 10, 0),
    }
  })

  return (
    <div className="space-y-4">
      <EmploymentTabs
        current={employment}
        activeHref={tabHref('active')}
        resignedHref={tabHref('resigned')}
      />
      <LeavePromotionClient
        employees={employees}
        notices={notices ?? []}
        teams={teams ?? []}
        groups={groups ?? []}
        year={year}
      />
    </div>
  )
}
