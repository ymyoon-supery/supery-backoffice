import { listDocumentRequests, listSupplyRequests } from './actions'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminDocumentsClient from './AdminDocumentsClient'

export const dynamic = 'force-dynamic'

const DOC_STATUS_ORDER: Record<string, number> = { PENDING: 0, COMPLETED: 1, CANCELLED: 2 }
const SUPPLY_STATUS_ORDER: Record<string, number> = { REJECTED: 0, PENDING: 1, APPROVED: 2, COMPLETED: 3, CANCELLED: 4 }

function sortAdminList<T extends { status: string; created_at: string }>(arr: T[], order: Record<string, number>): T[] {
  return [...arr].sort((a, b) => {
    const dateDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (dateDiff !== 0) return dateDiff
    return (order[a.status] ?? 99) - (order[b.status] ?? 99)
  })
}

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
      documentRequests={sortAdminList(docRes.data ?? [], DOC_STATUS_ORDER)}
      supplyRequests={sortAdminList(supplyRes.data ?? [], SUPPLY_STATUS_ORDER)}
    />
  )
}
