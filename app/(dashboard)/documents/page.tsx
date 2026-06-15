import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DocumentRequestClient from './DocumentRequestClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, position, departments ( name )')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = employee as any

  return (
    <DocumentRequestClient
      employeeId={emp.id}
      employeeName={emp.name ?? ''}
      employeePosition={emp.position ?? null}
      departmentName={emp.departments?.name ?? null}
    />
  )
}
