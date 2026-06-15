'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function uploadPayslip(input: {
  employeeId: string
  yearMonth: string
  fileUrl: string
  fileName: string
}) {
  const { employeeId, yearMonth, fileUrl, fileName } = input

  if (!employeeId || !yearMonth || !fileUrl) {
    return { error: '필수 항목이 누락되었습니다.' }
  }

  const ymRe = /^\d{4}-\d{2}$/
  if (!ymRe.test(yearMonth)) {
    return { error: '연월 형식이 올바르지 않습니다. (예: 2026-06)' }
  }

  const admin = getAdmin()

  const { error } = await admin
    .from('payslips')
    .upsert(
      { employee_id: employeeId, year_month: yearMonth, file_url: fileUrl, file_name: fileName },
      { onConflict: 'employee_id,year_month' },
    )

  if (error) return { error: error.message }
  revalidatePath('/admin/payslip')
  return { error: null }
}

export async function listAllPayslips() {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('payslips')
    .select(`
      id, year_month, file_url, file_name, created_at,
      employees ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { error: error.message, data: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    id: r.id as string,
    employee_name: r.employees?.name as string ?? '—',
    year_month: r.year_month as string,
    file_url: r.file_url as string,
    file_name: r.file_name as string | null,
    created_at: r.created_at as string,
  }))

  return { error: null, data: rows }
}
