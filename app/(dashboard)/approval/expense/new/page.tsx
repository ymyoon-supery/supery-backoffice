import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ExpenseForm from '@/components/approval/ExpenseForm'

export default async function NewExpensePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, position, department_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let deptName = ''
  if (employee.department_id) {
    const { data: dept } = await admin
      .from('departments')
      .select('name')
      .eq('id', employee.department_id)
      .single()
    deptName = dept?.name ?? ''
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">지출결의서 작성</h1>
      <ExpenseForm
        employeeId={employee.id}
        employeeName={employee.name}
        employeePosition={employee.position ?? ''}
        departmentName={deptName}
      />
    </div>
  )
}
