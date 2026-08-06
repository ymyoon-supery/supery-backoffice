import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DiaryListClient from '@/components/diary/DiaryListClient'

type SP = { from?: string; to?: string; keyword?: string; page?: string }

export default async function DiaryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const page = Math.max(1, Number(sp.page ?? 1))
  const pageSize = 10
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = rangeFrom + pageSize - 1

  let query = supabase
    .from('work_diaries')
    .select('id, diary_date, content, created_at, updated_at', { count: 'exact' })
    .eq('employee_id', employee.id)
    .order('diary_date', { ascending: false })
    .range(rangeFrom, rangeTo)

  if (sp.from) query = query.gte('diary_date', sp.from)
  if (sp.to) query = query.lte('diary_date', sp.to)
  if (sp.keyword) query = query.ilike('content', `%${sp.keyword}%`)

  const { data: diaries, count } = await query

  return (
    <DiaryListClient
      diaries={diaries ?? []}
      total={count ?? 0}
      page={page}
      from={sp.from ?? ''}
      to={sp.to ?? ''}
      keyword={sp.keyword ?? ''}
    />
  )
}
