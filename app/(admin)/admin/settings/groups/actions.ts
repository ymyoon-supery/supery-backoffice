'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { supabase: null, error: '권한이 없습니다.' }
  return { supabase, error: null }
}

export async function createGroup(name: string) {
  const { supabase, error } = await requireAdmin()
  if (!supabase) return { error }
  const { error: err } = await supabase.from('groups').insert({ name: name.trim() })
  if (err) return { error: err.code === '23505' ? '이미 존재하는 그룹명입니다.' : err.message }
  revalidatePath('/admin/settings/groups')
  return { error: null }
}

export async function deleteGroup(id: string) {
  const { supabase, error } = await requireAdmin()
  if (!supabase) return { error }
  const { error: err } = await supabase.from('groups').delete().eq('id', id)
  if (err) return { error: err.message }
  revalidatePath('/admin/settings/groups')
  return { error: null }
}

export async function createTeam(groupId: string, name: string) {
  const { supabase, error } = await requireAdmin()
  if (!supabase) return { error }
  const { error: err } = await supabase.from('departments').insert({ name: name.trim(), group_id: groupId })
  if (err) return { error: err.message }
  revalidatePath('/admin/settings/groups')
  return { error: null }
}

export async function deleteTeam(id: string) {
  const { supabase, error } = await requireAdmin()
  if (!supabase) return { error }
  const { error: err } = await supabase.from('departments').delete().eq('id', id)
  if (err) return { error: err.message }
  revalidatePath('/admin/settings/groups')
  return { error: null }
}
