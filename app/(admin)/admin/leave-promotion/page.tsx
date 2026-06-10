import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeavePromotionClient from './LeavePromotionClient'

export default async function LeavePromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const year = parseInt(params.year ?? String(new Date().getFullYear()))

  const [{ data: employees }, { data: notices }, { data: teams }, { data: groups }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, email, department_id, annual_leave_days, remaining_leaves, hired_at')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('leave_promotion_notices')
      .select('*')
      .eq('fiscal_year', year),
    supabase.from('departments').select('id, name, group_id'),
    supabase.from('groups').select('id, name'),
  ])

  return (
    <LeavePromotionClient
      employees={employees ?? []}
      notices={notices ?? []}
      teams={teams ?? []}
      groups={groups ?? []}
      year={year}
    />
  )
}
