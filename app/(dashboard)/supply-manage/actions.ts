'use server'

import { createClient } from '@/lib/supabase/server'

export async function completeSupplyAction(requestId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) return { error: '직원 정보를 찾을 수 없습니다.' }

  const isAdmin = employee.role === 'ADMIN'

  if (!isAdmin) {
    const { data: settings } = await supabase
      .from('company_settings')
      .select('supply_manager_id')
      .single()
    if (settings?.supply_manager_id !== employee.id) return { error: '권한이 없습니다.' }
  }

  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await admin
    .from('supply_requests')
    .update({ status: 'COMPLETED' })
    .eq('id', requestId)
    .eq('status', 'APPROVED')

  if (error) return { error: error.message }
  return { error: null }
}
