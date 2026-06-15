import { listDocumentRequests, listSupplyRequests } from './actions'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminDocumentsClient from './AdminDocumentsClient'

export const dynamic = 'force-dynamic'

export default async function AdminDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [docRes, supplyRes] = await Promise.all([
    listDocumentRequests(),
    listSupplyRequests(),
  ])

  if (docRes.error) {
    return <div className="p-6 text-red-600 text-sm">서류 조회 오류: {docRes.error}</div>
  }

  return (
    <AdminDocumentsClient
      documentRequests={docRes.data ?? []}
      supplyRequests={supplyRes.data ?? []}
    />
  )
}
