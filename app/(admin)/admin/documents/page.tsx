import { listDocumentRequests, listSupplyRequests } from './actions'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminDocumentsClient from './AdminDocumentsClient'

export default async function AdminDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [docRes, supplyRes] = await Promise.all([
    listDocumentRequests(),
    listSupplyRequests(),
  ])

  return (
    <AdminDocumentsClient
      documentRequests={docRes.data ?? []}
      supplyRequests={supplyRes.data ?? []}
    />
  )
}
