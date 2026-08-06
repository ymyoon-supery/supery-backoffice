import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DiaryEditorClient from '@/components/diary/DiaryEditorClient'

export default async function DiaryEditorPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect('/diary')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const { data: diary } = await supabase
    .from('work_diaries')
    .select('content, created_at, updated_at')
    .eq('employee_id', employee.id)
    .eq('diary_date', date)
    .maybeSingle()

  return <DiaryEditorClient date={date} initialDiary={diary ?? null} />
}
