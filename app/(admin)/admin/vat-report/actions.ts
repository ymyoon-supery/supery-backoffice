'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: emp } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single()
  return emp?.role === 'ADMIN'
}

export type VatCategory =
  | 'EXPENSE'
  | 'BUSINESS_INCOME'
  | 'PRIZE'
  | 'CORPORATE_CARD'
  | 'TRANSPORTATION'
  | 'PERSONAL_CARD'
  | 'OTHER_RECEIPT'
  | 'CONDOLENCE'

export type VatRecord = {
  id: string
  expense_type: string
  evidence_type: string | null
  title: string | null
  amount: number | null
  payee: string | null
  payment_method: string | null
  payment_request_date: string | null
  settlement_date: string | null
  card_company: string | null
  tax_type: string | null
  line_items: Array<{ item: string; date: string; amount?: number; note?: string; userName?: string }> | null
  doc_number: string | null
  status: string
  created_at: string
  updated_at: string
  employees: {
    name: string
    department_id: string | null
    dept_name?: string
  } | null
}

export async function fetchVatReportData(params: {
  category: VatCategory
  startDate: string
  endDate: string
}): Promise<{ error: string | null; data: VatRecord[] | null }> {
  if (!await requireAdmin()) return { error: 'Unauthorized', data: null }

  const admin = getAdmin()
  const { category, startDate, endDate } = params

  // Build employee-department map
  const { data: empData } = await admin
    .from('employees')
    .select('id, name, department_id, departments!department_id(name)')

  const empMap: Record<string, { name: string; dept_name: string }> = {}
  if (empData) {
    for (const e of empData as any[]) {
      empMap[e.id] = { name: e.name, dept_name: e.departments?.name ?? '' }
    }
  }

  let query = admin
    .from('expense_reports')
    .select('id, expense_type, evidence_type, title, amount, payee, payment_method, payment_request_date, settlement_date, card_company, tax_type, line_items, doc_number, status, created_at, updated_at, employee_id')
    .eq('status', 'APPROVED')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lte('created_at', `${endDate}T23:59:59.999Z`)
    .order('created_at', { ascending: true })
    .limit(2000)

  if (category === 'EXPENSE') {
    query = query
      .eq('expense_type', 'EXPENSE')
      .or('evidence_type.is.null,and(evidence_type.neq.PERSONAL_CARD,evidence_type.neq.OTHER_RECEIPT)')
  } else if (category === 'PERSONAL_CARD') {
    query = query.eq('expense_type', 'EXPENSE').eq('evidence_type', 'PERSONAL_CARD')
  } else if (category === 'OTHER_RECEIPT') {
    query = query.eq('expense_type', 'EXPENSE').eq('evidence_type', 'OTHER_RECEIPT')
  } else {
    query = query.eq('expense_type', category)
  }

  const { data, error } = await query
  if (error) return { error: error.message, data: null }

  const records: VatRecord[] = (data ?? []).map((r: any) => {
    const emp = empMap[r.employee_id]
    return {
      ...r,
      employees: emp ? { name: emp.name, department_id: null, dept_name: emp.dept_name } : null,
    }
  })

  return { error: null, data: records }
}
