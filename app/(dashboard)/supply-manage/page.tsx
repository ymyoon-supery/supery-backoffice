import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SupplyManageClient from './SupplyManageClient'

export const dynamic = 'force-dynamic'

export default async function SupplyManagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const { data: settings } = await supabase
    .from('company_settings')
    .select('supply_manager_id')
    .single()

  if (settings?.supply_manager_id !== employee.id) redirect('/')

  const { data: supplyRequests } = await supabase
    .from('supply_requests')
    .select(`
      id, status, created_at,
      employees ( name, position ),
      supply_request_items ( id, category, description, estimated_amount, note, sort_order ),
      supply_approval_steps ( id, approver_id, step_order, status, comment, acted_at )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <SupplyManageClient
      supplyRequests={supplyRequests ?? []}
      currentEmployeeId={employee.id}
    />
  )
}
