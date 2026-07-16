import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ExpenseForm, { type ExpenseInitialData } from '@/components/approval/ExpenseForm'

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ editFrom?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, position, department_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let deptName = ''
  if (employee.department_id) {
    const { data: dept } = await admin
      .from('departments')
      .select('name')
      .eq('id', employee.department_id)
      .single()
    deptName = dept?.name ?? ''
  }

  const { editFrom } = await searchParams
  let initialData: ExpenseInitialData | null = null
  if (editFrom) {
    const { data: existing } = await supabase
      .from('expense_reports')
      .select('id, expense_type, title, tax_type, evidence_type, payee, payment_method, bank_name, account_number, account_holder, payment_request_date, settlement_date, line_items, attachment_urls')
      .eq('id', editFrom)
      .eq('employee_id', employee.id)
      .single()
    if (existing) {
      initialData = {
        id: existing.id,
        expenseType: existing.expense_type,
        title: existing.title,
        taxType: existing.tax_type,
        evidenceType: existing.evidence_type,
        payee: existing.payee,
        paymentMethod: existing.payment_method,
        bankName: existing.bank_name,
        accountNumber: existing.account_number,
        accountHolder: existing.account_holder,
        paymentRequestDate: existing.payment_request_date,
        settlementDate: existing.settlement_date,
        lineItems: existing.line_items as ExpenseInitialData['lineItems'],
        attachmentUrls: existing.attachment_urls,
      }
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">지출결의</h1>
      <ExpenseForm
        employeeId={employee.id}
        employeeName={employee.name}
        employeePosition={employee.position ?? ''}
        departmentName={deptName}
        allowedTabs={['EXPENSE', 'BUSINESS_INCOME', 'PRIZE']}
        initialData={initialData}
      />
    </div>
  )
}
