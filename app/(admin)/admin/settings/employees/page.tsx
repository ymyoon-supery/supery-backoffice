import { createClient } from '@/lib/supabase/server'
import EmployeesClient from './EmployeesClient'

export default async function EmployeesSettingsPage() {
  const supabase = await createClient()

  const [{ data: employees }, { data: groups }, { data: teams }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, role, rank, position, department_id, is_active, auth_user_id')
      .order('name'),
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
  ])

  return (
    <EmployeesClient
      employees={employees ?? []}
      groups={groups ?? []}
      teams={teams ?? []}
    />
  )
}
