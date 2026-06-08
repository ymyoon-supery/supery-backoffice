import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { LogOut } from 'lucide-react'

type Employee = {
  id: string
  name: string
  email: string
  role: string
  avatar_url: string | null
  department_id: string | null
}

async function signOut() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default function Header({ employee }: { employee: Employee }) {
  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{employee.name}</span>
        {employee.avatar_url ? (
          <Image
            src={employee.avatar_url}
            alt={employee.name}
            width={32}
            height={32}
            className="rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
            {employee.name[0]}
          </div>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </header>
  )
}
