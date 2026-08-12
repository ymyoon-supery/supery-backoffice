import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VatReportClient from './VatReportClient'

export default async function VatReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: emp } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  if (emp?.role !== 'ADMIN') redirect('/approval/my')

  return (
    <div className="max-w-7xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">부가세 신고자료</h1>
      <VatReportClient />
    </div>
  )
}
