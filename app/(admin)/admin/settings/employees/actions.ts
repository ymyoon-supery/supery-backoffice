'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { error: '권한이 없습니다.' }
  return { error: null }
}

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export type CreateEmployeeInput = {
  name: string
  email: string
  departmentId: string | null
  rank: string | null
  position: string | null
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
}

export async function createEmployee(input: CreateEmployeeInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  if (!input.email.endsWith('@supery.co.kr')) {
    return { error: '이메일은 @supery.co.kr 도메인이어야 합니다.' }
  }

  const client = adminClient()
  const { error } = await client.from('employees').insert({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    department_id: input.departmentId || null,
    rank: input.rank || null,
    position: input.position || null,
    role: input.role,
  })

  if (error) {
    if (error.code === '23505') return { error: '이미 등록된 이메일입니다.' }
    return { error: error.message }
  }

  revalidatePath('/admin/settings/employees')
  return { error: null }
}

export type UpdateEmployeeInput = {
  id: string
  name: string
  departmentId: string | null
  rank: string | null
  position: string | null
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
}

export async function updateEmployee(input: UpdateEmployeeInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const client = adminClient()
  const { error } = await client.from('employees').update({
    name: input.name.trim(),
    department_id: input.departmentId || null,
    rank: input.rank || null,
    position: input.position || null,
    role: input.role,
  }).eq('id', input.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/settings/employees')
  return { error: null }
}

export async function deactivateEmployee(id: string) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const client = adminClient()
  const { error } = await client.from('employees').update({ is_active: false }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/settings/employees')
  return { error: null }
}
