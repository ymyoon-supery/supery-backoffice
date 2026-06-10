import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaveManualClient from './LeaveManualClient'

export default async function LeaveManualPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, email, remaining_leaves')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">연차 수동 등록</h1>
      <p className="text-sm text-gray-500 mb-6">시스템 도입 이전 연차 사용 내역을 직접 등록합니다.</p>
      <LeaveManualClient employees={employees ?? []} />
    </div>
  )
}
