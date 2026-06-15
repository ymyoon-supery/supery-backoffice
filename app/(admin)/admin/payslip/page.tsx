import { createClient as createServiceClient } from '@supabase/supabase-js'
import AdminPayslipClient from './AdminPayslipClient'
import { sortEmployees } from '@/lib/sort-employees'

export default async function AdminPayslipPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: employees }, { data: departments }] = await Promise.all([
    admin.from('employees').select('id, name, position, department_id, rank, hired_at').eq('is_active', true),
    admin.from('departments').select('id, name'),
  ])

  const deptMap = Object.fromEntries((departments ?? []).map((d: any) => [d.id, d.name]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empList = sortEmployees((employees ?? []).map((e: any) => ({
    id: e.id as string,
    name: e.name as string,
    position: e.position as string | null,
    departmentName: (e.department_id ? deptMap[e.department_id] : null) as string | null,
    rank: e.rank as string | null,
    hiredAt: e.hired_at as string | null,
  }))).map(({ rank: _r, hiredAt: _h, ...rest }) => rest)

  return <AdminPayslipClient employees={empList} />
}
