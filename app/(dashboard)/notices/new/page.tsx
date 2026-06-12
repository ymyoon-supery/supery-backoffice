import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewNoticeClient from './NewNoticeClient'

export default async function NewNoticePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: emp } = await supabase
    .from('employees')
    .select('role, can_write_notice')
    .eq('auth_user_id', user.id)
    .single()

  if (!emp || (emp.role !== 'ADMIN' && !emp.can_write_notice)) {
    redirect('/notices')
  }

  const isAdmin = emp.role === 'ADMIN'

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">공지사항 작성</h1>
      <NewNoticeClient isAdmin={isAdmin} />
    </div>
  )
}
