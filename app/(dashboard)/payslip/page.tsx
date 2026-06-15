import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PayslipDownloadButton from '@/components/payslip/PayslipDownloadButton'

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return `${year}년 ${month}월`
}

export default async function PayslipPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const { data: payslips } = await supabase
    .from('payslips')
    .select('id, year_month, file_url, file_name, created_at')
    .eq('employee_id', employee.id)
    .order('year_month', { ascending: false })

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">급여명세서</h1>

      {(!payslips || payslips.length === 0) ? (
        <div className="py-16 text-center text-sm text-gray-400">
          등록된 급여명세서가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {payslips.map(slip => (
            <div
              key={slip.id}
              className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {formatYearMonth(slip.year_month)} 급여명세서
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {slip.file_name ?? '급여명세서.pdf'}
                  {' · '}
                  {new Date(slip.created_at).toLocaleDateString('ko-KR')} 업로드
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={slip.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  보기
                </a>
                <PayslipDownloadButton
                  url={slip.file_url}
                  fileName={slip.file_name ?? `${slip.year_month}_급여명세서.pdf`}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
