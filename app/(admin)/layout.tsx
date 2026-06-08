import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, email, role, avatar_url, department_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee || employee.role !== 'ADMIN') {
    redirect('/')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role={employee.role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header employee={employee} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
