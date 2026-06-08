import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('name, role, remaining_leaves')
    .eq('auth_user_id', user.id)
    .single()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          안녕하세요, {employee?.name ?? ''}님
        </h1>
        <p className="text-sm text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium">잔여 연차</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {employee?.remaining_leaves ?? 0}
            <span className="text-sm font-normal text-gray-400 ml-1">일</span>
          </p>
        </div>
      </div>
    </div>
  )
}
