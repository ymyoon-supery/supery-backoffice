'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { calcAnnualLeave } from '@/lib/annualLeave'

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
  hiredAt: string | null
}

export async function createEmployee(input: CreateEmployeeInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  if (!input.email.endsWith('@supery.co.kr')) {
    return { error: '이메일은 @supery.co.kr 도메인이어야 합니다.' }
  }

  const hiredDate = input.hiredAt ? new Date(input.hiredAt) : null
  const annualLeaveDays = hiredDate ? calcAnnualLeave(hiredDate) : 15

  const client = adminClient()
  const { error } = await client.from('employees').insert({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    department_id: input.departmentId || null,
    rank: input.rank || null,
    position: input.position || null,
    role: input.role,
    hired_at: input.hiredAt || null,
    annual_leave_days: annualLeaveDays,
    remaining_leaves: annualLeaveDays,
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
  hiredAt: string | null
  remainingLeaves: number | null // null → 부여연차와 동기화
}

export async function updateEmployee(input: UpdateEmployeeInput) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const hiredDate = input.hiredAt ? new Date(input.hiredAt) : null
  const annualLeaveDays = hiredDate ? calcAnnualLeave(hiredDate) : null

  const updateData: Record<string, unknown> = {
    name: input.name.trim(),
    department_id: input.departmentId || null,
    rank: input.rank || null,
    position: input.position || null,
    role: input.role,
    hired_at: input.hiredAt || null,
  }

  if (annualLeaveDays !== null) {
    updateData.annual_leave_days = annualLeaveDays
    // 관리자가 잔여연차를 직접 지정하면 그 값, 아니면 부여연차와 동기화
    updateData.remaining_leaves = input.remainingLeaves ?? annualLeaveDays
  } else if (input.remainingLeaves !== null) {
    updateData.remaining_leaves = input.remainingLeaves
  }

  const client = adminClient()
  const { error } = await client.from('employees').update(updateData).eq('id', input.id)

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
