import { createClient } from '@/lib/supabase/server'
import EmployeesClient from './EmployeesClient'
import { calcAnnualLeave } from '@/lib/annualLeave'

const DEDUCTS = ['ANNUAL', 'HALF_DAY', 'AM_HALF', 'PM_HALF', 'GROUP']

export default async function EmployeesSettingsPage() {
  const supabase = await createClient()

  const yearStart = `${new Date().getFullYear()}-01-01`

  const [{ data: rawEmployees }, { data: groups }, { data: teams }, { data: usedTotals }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, role, rank, position, department_id, is_active, auth_user_id, hired_at, annual_leave_days, remaining_leaves')
      .order('name'),
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
    supabase
      .from('leave_requests')
      .select('employee_id, days_used')
      .eq('status', 'APPROVED')
      .in('leave_type', DEDUCTS)
      .gte('start_date', yearStart),
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
      remaining_leaves: Math.max(Math.round((entitlement - (usedByEmp[e.id] ?? 0)) * 10) / 10, 0),
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
