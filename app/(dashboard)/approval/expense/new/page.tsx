import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExpenseForm from '@/components/approval/ExpenseForm'

export default async function NewExpensePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">지출결의서 작성</h1>
      <ExpenseForm employeeId={employee.id} />
    </div>
  )
}
