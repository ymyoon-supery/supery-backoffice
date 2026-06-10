'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin(): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { ok: false, error: '권한이 없습니다.' }
  return { ok: true, error: null }
}

export async function createGroup(name: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error, id: null }
  const { data, error: err } = await adminClient().from('groups').insert({ name: name.trim() }).select('id').single()
  if (err) {
    console.error('[createGroup] error:', err)
    return { error: err.code === '23505' ? '이미 존재하는 그룹명입니다.' : err.message, id: null }
  }
  revalidatePath('/admin/settings/groups')
  return { error: null, id: data.id as string }
}

export async function deleteGroup(id: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error }
  const { error: err } = await adminClient().from('groups').delete().eq('id', id)
  if (err) return { error: err.message }
  revalidatePath('/admin/settings/groups')
  return { error: null }
}

export async function createTeam(groupId: string, name: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error, id: null }
  const { data, error: err } = await adminClient().from('departments').insert({ name: name.trim(), group_id: groupId }).select('id').single()
  if (err) {
    console.error('[createTeam] error:', err)
    return { error: err.message, id: null }
  }
  revalidatePath('/admin/settings/groups')
  return { error: null, id: data.id as string }
}

export async function deleteTeam(id: string) {
  const { ok, error } = await requireAdmin()
  if (!ok) return { error }
  const { error: err } = await adminClient().from('departments').delete().eq('id', id)
  if (err) return { error: err.message }
  revalidatePath('/admin/settings/groups')
  return { error: null }
}
