import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginButton from '@/components/auth/LoginButton'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SuperY WorkSync</h1>
          <p className="text-sm text-gray-500 mt-2">통합 근태 관리 및 전자결재 서비스</p>
        </div>
        <LoginButton />
        <p className="text-xs text-center text-gray-400 mt-6">
          조직 Google 계정(@supery.co.kr)으로 로그인하세요.
        </p>
      </div>
    </div>
  )
}
