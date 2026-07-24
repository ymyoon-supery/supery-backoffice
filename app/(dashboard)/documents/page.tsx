import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DocumentRequestClient from './DocumentRequestClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, position, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = employee as any

  let departmentName: string | null = null
  if (emp.department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', emp.department_id)
      .single()
    departmentName = dept?.name ?? null
  }

  return (
    <DocumentRequestClient
      employeeId={emp.id}
      employeeName={emp.name ?? ''}
      employeePosition={emp.position ?? null}
      departmentName={departmentName}
    />
  )
}
