'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function completeDocumentRequest(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: adminEmp } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (adminEmp?.role !== 'ADMIN') return { error: 'Unauthorized' }

  const admin = getAdmin()
  const { error } = await admin
    .from('document_requests')
    .update({
      status: 'COMPLETED',
      completed_by: adminEmp.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/documents')
  return { error: null }
}

export async function approveSupplyRequest(
  requestId: string,
  approved: boolean,
  comment?: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: adminEmp } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (adminEmp?.role !== 'ADMIN') return { error: 'Unauthorized' }

  const admin = getAdmin()
  const now = new Date().toISOString()

  if (approved) {
    // 승인: 관리자 본인 스텝만 처리 (선행 스텝이 아직 PENDING인 경우 오염 방지)
    const { error: stepErr } = await admin
      .from('supply_approval_steps')
      .update({ status: 'APPROVED', acted_at: now })
      .eq('supply_request_id', requestId)
      .eq('approver_id', adminEmp.id)
      .eq('status', 'PENDING')
    if (stepErr) return { error: stepErr.message }
  } else {
    // 반려: 모든 미처리 스텝을 반려 처리 후 이전 승인자에게도 사유 전파
    const { error: stepErr } = await admin
      .from('supply_approval_steps')
      .update({ status: 'REJECTED', comment: comment ?? null, acted_at: now })
      .eq('supply_request_id', requestId)
      .in('status', ['PENDING', 'WAITING'])
    if (stepErr) return { error: stepErr.message }

    await admin
      .from('supply_approval_steps')
      .update({ status: 'REJECTED', comment: comment ?? null })
      .eq('supply_request_id', requestId)
      .eq('status', 'APPROVED')
  }

  const { error: reqErr } = await admin
    .from('supply_requests')
    .update({ status: approved ? 'APPROVED' : 'REJECTED' })
    .eq('id', requestId)

  if (reqErr) return { error: reqErr.message }

  revalidatePath('/admin/documents')
  return { error: null }
}


export async function listDocumentRequests() {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('document_requests')
    .select(`
      id, doc_type, status, purpose, completed_at, created_at, doc_number,
      employees!employee_id ( name, position )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { error: error.message, data: null }
  return { error: null, data: data ?? [] }
}

export async function listSupplyRequests() {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('supply_requests')
    .select(`
      id, status, created_at, doc_number,
      employees ( name, position ),
      supply_request_items ( id, category, description, estimated_amount, note, sort_order ),
      supply_approval_steps ( id, approver_id, step_order, status, comment, acted_at )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { error: error.message, data: null }
  return { error: null, data: data ?? [] }
}
