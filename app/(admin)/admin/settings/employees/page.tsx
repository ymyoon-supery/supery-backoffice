import { createClient as createServiceClient } from '@supabase/supabase-js'
import EmployeesClient from './EmployeesClient'
import { calcAnnualLeave } from '@/lib/annualLeave'

export default async function EmployeesSettingsPage() {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date(Date.now() + 9 * 3600000)

  const [{ data: rawEmployees }, { data: groups }, { data: teams }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, role, rank, position, department_id, is_active, auth_user_id, hired_at, annual_leave_days, remaining_leaves, resigned_at')
      .order('name'),
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
  ])

  const employees = (rawEmployees ?? []).map(e => {
    const hiredAt = e.hired_at ? new Date(e.hired_at) : null
    const entitlement = hiredAt
      ? calcAnnualLeave(hiredAt, today)
      : (e.annual_leave_days ?? 15)
    return {
      ...e,
      annual_leave_days: entitlement,
      // remaining_leaves는 DB 저장 값 그대로 사용 (연차 승인/취소/관리자 조정 반영)
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
