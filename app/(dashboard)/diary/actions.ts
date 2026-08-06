'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getEmployeeId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, employeeId: null }

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  return { supabase, employeeId: employee?.id ?? null }
}

export async function upsertDiary(date: string, content: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!supabase || !employeeId) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.from('work_diaries').upsert(
    { employee_id: employeeId, diary_date: date, content },
    { onConflict: 'employee_id,diary_date' },
  )

  if (error) return { error: error.message }
  revalidatePath('/diary')
  revalidatePath(`/diary/${date}`)
  return { error: null }
}

export async function deleteDiary(date: string) {
  const { supabase, employeeId } = await getEmployeeId()
  if (!supabase || !employeeId) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.from('work_diaries')
    .delete()
    .eq('employee_id', employeeId)
    .eq('diary_date', date)

  if (error) return { error: error.message }
  revalidatePath('/diary')
  return { error: null }
}
