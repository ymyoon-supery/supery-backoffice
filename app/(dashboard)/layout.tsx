import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, email, role, position, avatar_url, department_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  let pendingCount = 0
  if (employee.position === '팀장' && employee.role !== 'ADMIN') {
    const [{ count: leaveCount }, { count: expenseCount }] = await Promise.all([
      supabase
        .from('leave_approval_steps')
        .select('*', { count: 'exact', head: true })
        .eq('approver_id', employee.id)
        .eq('status', 'PENDING'),
      supabase
        .from('expense_approval_steps')
        .select('*', { count: 'exact', head: true })
        .eq('approver_id', employee.id)
        .eq('status', 'PENDING'),
    ])
    pendingCount = (leaveCount ?? 0) + (expenseCount ?? 0)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        role={employee.role}
        position={employee.position ?? null}
        pendingCount={pendingCount}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header employee={employee} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
