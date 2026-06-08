import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaveForm from '@/components/approval/LeaveForm'

export default async function NewLeavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, remaining_leaves')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">연차 신청</h1>
      <LeaveForm remainingLeaves={employee.remaining_leaves} />
    </div>
  )
}
