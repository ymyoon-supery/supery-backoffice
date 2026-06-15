import { createClient as createServiceClient } from '@supabase/supabase-js'
import AdminPayslipClient from './AdminPayslipClient'

export default async function AdminPayslipPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: employees } = await admin
    .from('employees')
    .select('id, name, position, departments ( name )')
    .eq('is_active', true)
    .order('name')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empList = (employees ?? []).map((e: any) => ({
    id: e.id as string,
    name: e.name as string,
    position: e.position as string | null,
    departmentName: e.departments?.name as string | null,
  }))

  return <AdminPayslipClient employees={empList} />
}
