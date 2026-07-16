import { createClient as createServiceClient } from '@supabase/supabase-js'
import EmployeesClient from './EmployeesClient'
import { calcAnnualLeave, isUnderOneYear } from '@/lib/annualLeave'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function EmployeesSettingsPage() {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`

  const [{ data: rawEmployees }, { data: groups }, { data: teams }, { data: usedTotals }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, role, rank, position, department_id, is_active, auth_user_id, hired_at, annual_leave_days, remaining_leaves, resigned_at')
      .order('name'),
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
    supabase
      .from('leave_requests')
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
    <EmployeesClient
      employees={employees}
      groups={groups ?? []}
      teams={teams ?? []}
    />
  )
}
