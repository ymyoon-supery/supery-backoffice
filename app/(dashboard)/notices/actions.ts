'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function createNotice(title: string, content: string, isPinned: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: emp } = await supabase
    .from('employees')
    .select('id, role, can_write_notice')
    .eq('auth_user_id', user.id)
    .single()

  if (!emp || (emp.role !== 'ADMIN' && !emp.can_write_notice)) {
    return { error: '권한이 없습니다.' }
  }

  const { error } = await supabase.from('notices').insert({
    author_id: emp.id,
    title: title.trim(),
    content: content.trim(),
    is_pinned: isPinned,
  })

  if (error) return { error: error.message }
  revalidatePath('/notices')
  revalidatePath('/admin/notices')
  return { error: null }
}

export async function updateNotice(id: string, title: string, content: string, isPinned: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase
    .from('notices')
    .update({ title: title.trim(), content: content.trim(), is_pinned: isPinned })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/notices')
  revalidatePath(`/notices/${id}`)
  revalidatePath('/admin/notices')
  return { error: null }
}

export async function deleteNotice(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.from('notices').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/notices')
  revalidatePath('/admin/notices')
  return { error: null }
}

export async function toggleNoticeWriter(employeeId: string, canWrite: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!me || me.role !== 'ADMIN') return { error: '권한이 없습니다.' }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await admin
    .from('employees')
    .update({ can_write_notice: canWrite })
    .eq('id', employeeId)

  if (error) return { error: error.message }
  revalidatePath('/admin/notices')
  return { error: null }
}
