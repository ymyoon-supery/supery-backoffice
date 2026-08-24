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

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { error: '권한이 없습니다.' }
  return { error: null }
}

export async function generateAgentKey(employeeId: string): Promise<{ key?: string; error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const newKey = crypto.randomUUID()
  const supabase = adminClient()

  const { error } = await supabase
    .from('employees')
    .update({ agent_api_key: newKey })
    .eq('id', employeeId)

  if (error) return { error: error.message }

  revalidatePath('/admin/agents')
  return { key: newKey }
}

export async function revokeAgentKey(employeeId: string): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const supabase = adminClient()

  // 키 무효화를 먼저 처리 — 실패 시 재시도가 안전하도록 순서 보장
  const { error } = await supabase
    .from('employees')
    .update({ agent_api_key: null })
    .eq('id', employeeId)
  if (error) return { error: error.message }

  await supabase.from('agent_installations').delete().eq('employee_id', employeeId)

  revalidatePath('/admin/agents')
  return {}
}

export async function toggleAutoBreak(employeeId: string, enabled: boolean): Promise<{ error?: string }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const supabase = adminClient()
  const { error } = await supabase
    .from('employees')
    .update({ agent_auto_break: enabled })
    .eq('id', employeeId)

  if (error) return { error: error.message }

  revalidatePath('/admin/agents')
  return {}
}
