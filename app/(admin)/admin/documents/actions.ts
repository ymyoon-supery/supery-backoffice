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

  const { error } = await supabase.rpc('approve_supply_step', {
    p_request_id: requestId,
    p_approved: approved,
    p_comment: comment ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/documents')
  return { error: null }
}

export async function listDocumentRequests() {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('document_requests')
    .select(`
      id, doc_type, status, purpose, completed_at, created_at,
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
      id, status, created_at,
      employees ( name, position ),
      supply_request_items ( id, category, description, estimated_amount, note, sort_order ),
      supply_approval_steps ( id, approver_id, step_order, status, comment, acted_at )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { error: error.message, data: null }
  return { error: null, data: data ?? [] }
}
