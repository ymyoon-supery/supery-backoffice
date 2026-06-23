import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listDocumentRequests, listSupplyRequests } from '@/app/(admin)/admin/documents/actions'
import AdminDocumentsClient from '@/app/(admin)/admin/documents/AdminDocumentsClient'

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

  const [docRes, supplyRes] = await Promise.all([
    listDocumentRequests(),
    listSupplyRequests(),
  ])

  return (
    <AdminDocumentsClient
      documentRequests={docRes.data ?? []}
      supplyRequests={supplyRes.data ?? []}
      initialTab="supply"
    />
  )
}
