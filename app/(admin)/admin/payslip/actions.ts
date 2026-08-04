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

async function requireAdmin(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || emp.role !== 'ADMIN') return { error: '권한이 없습니다.' }
  return { error: null }
}

export async function uploadPayslip(input: {
  employeeId: string
  yearMonth: string
  fileName: string
}) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const { employeeId, yearMonth, fileName } = input

  if (!employeeId || !yearMonth) {
    return { error: '필수 항목이 누락되었습니다.' }
  }

  const ymRe = /^\d{4}-\d{2}$/
  if (!ymRe.test(yearMonth)) {
    return { error: '연월 형식이 올바르지 않습니다. (예: 2026-06)' }
  }

  const admin = getAdmin()
  const fileKey = `${employeeId}/${yearMonth}.pdf`

  const { error } = await admin
    .from('payslips')
    .upsert(
      { employee_id: employeeId, year_month: yearMonth, file_url: fileKey, file_name: fileName },
      { onConflict: 'employee_id,year_month' },
    )

  if (error) return { error: error.message }
  revalidatePath('/admin/payslip')
  return { error: null }
}

export interface PayslipRow {
  id: string
  employeeId: string
  employeeName: string
  employeeLabel: string
  yearMonth: string
  fileUrl: string
  fileName: string | null
  createdAt: string
}

export async function listPayslipsByMonth(yearMonth?: string): Promise<{ error: string | null; data: PayslipRow[] | null }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError, data: null }

  const admin = getAdmin()

  let query = admin
    .from('payslips')
    .select('id, employee_id, year_month, file_name, created_at')
    .order('year_month', { ascending: false })

  if (yearMonth) query = query.eq('year_month', yearMonth)

  const { data: payslips, error } = await query

  if (error) return { error: error.message, data: null }
  if (!payslips || payslips.length === 0) return { error: null, data: [] }

  const employeeIds = [...new Set(payslips.map((p: any) => p.employee_id as string))]

  const [{ data: employees }, { data: departments }] = await Promise.all([
    admin.from('employees').select('id, name, position, department_id').in('id', employeeIds),
    admin.from('departments').select('id, name'),
  ])

  const deptMap = Object.fromEntries((departments ?? []).map((d: any) => [d.id as string, d.name as string]))
  const empMap = Object.fromEntries((employees ?? []).map((e: any) => [e.id as string, e]))

  // Generate signed URLs (1-hour TTL) server-side — private bucket, never expose raw paths to client
  const keys = (payslips as any[]).map(p => `${p.employee_id as string}/${p.year_month as string}.pdf`)
  const { data: signed } = await admin.storage.from('payslips').createSignedUrls(keys, 3600)

  const rows: PayslipRow[] = (payslips as any[]).map((p, i) => {
    const emp = empMap[p.employee_id]
    const deptName = emp?.department_id ? deptMap[emp.department_id] : null
    return {
      id: p.id as string,
      employeeId: p.employee_id as string,
      employeeName: emp?.name ?? '—',
      employeeLabel: [deptName, emp?.position, emp?.name].filter(Boolean).join(' · '),
      yearMonth: p.year_month as string,
      fileUrl: (signed?.[i] as any)?.signedUrl ?? '',
      fileName: p.file_name as string | null,
      createdAt: p.created_at as string,
    }
  })

  return { error: null, data: rows }
}

export async function deletePayslip(id: string, employeeId: string, yearMonth: string) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const admin = getAdmin()

  await admin.storage.from('payslips').remove([`${employeeId}/${yearMonth}.pdf`])

  const { error } = await admin.from('payslips').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/payslip')
  return { error: null }
}
