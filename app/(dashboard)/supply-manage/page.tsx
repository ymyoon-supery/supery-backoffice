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

  const { data: rawRequests } = await supabase
    .from('supply_requests')
    .select(`
      id, status, created_at,
      employees ( name, position ),
      supply_request_items ( id, category, description, estimated_amount, note, sort_order ),
      supply_approval_steps ( step_order, status, comment, approver_id, employees ( position, name, role ) )
    `)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supplyRequests = (rawRequests ?? []).map((r: any) => {
    const steps = (r.supply_approval_steps ?? []) as Array<{
      step_order: number; status: string; comment?: string | null; approver_id?: string | null
      employees?: { position?: string | null; name?: string | null; role?: string | null } | null
    }>

    let pendingApproverLabel: string | null = null
    if (r.status === 'PENDING') {
      const pendingStep = [...steps]
        .filter(s => s.status === 'PENDING')
        .sort((a, b) => a.step_order - b.step_order)[0]
      if (pendingStep) {
        if (pendingStep.approver_id === employee.id) {
          pendingApproverLabel = '내 결재 필요'
        } else if (pendingStep.employees?.role === 'ADMIN') {
          pendingApproverLabel = '관리자 승인 대기중'
        } else {
          pendingApproverLabel = `${pendingStep.employees?.position || pendingStep.employees?.name || '담당자'} 승인 대기중`
        }
      }
    }

    const rejectionComment = r.status === 'REJECTED'
      ? steps.find(s => s.status === 'REJECTED' && s.comment)?.comment ?? null
      : null

    return { ...r, pendingApproverLabel, rejectionComment }
  })

  const STATUS_ORDER: Record<string, number> = { REJECTED: 0, PENDING: 1, APPROVED: 2, COMPLETED: 3, CANCELLED: 4 }
  const sortedRequests = [...supplyRequests].sort((a, b) => {
    const dateDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (dateDiff !== 0) return dateDiff
    return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  })

  return (
    <SupplyManageClient supplyRequests={sortedRequests} />
  )
}
