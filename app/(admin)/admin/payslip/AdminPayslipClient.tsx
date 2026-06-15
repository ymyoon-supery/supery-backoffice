'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadPayslip, listAllPayslips } from './actions'
import PayslipDownloadButton from '@/components/payslip/PayslipDownloadButton'

interface Employee {
  id: string
  name: string
  position: string | null
  departmentName: string | null
}

interface PayslipRow {
  id: string
  employee_name: string
  year_month: string
  file_url: string
  file_name: string | null
  created_at: string
}

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return `${year}년 ${month}월`
}

export default function AdminPayslipClient({ employees }: { employees: Employee[] }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [yearMonth, setYearMonth] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [payslips, setPayslips] = useState<PayslipRow[]>([])
  const [loadingList, startLoadingList] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    startLoadingList(async () => {
      const res = await listAllPayslips()
      if (res.data) setPayslips(res.data)
    })
  }, [])

  async function handleUpload() {
    if (!selectedEmployeeId) { toast.error('직원을 선택해주세요.'); return }
    if (!yearMonth) { toast.error('연월을 입력해주세요.'); return }
    if (!file) { toast.error('PDF 파일을 선택해주세요.'); return }

    setUploading(true)
    try {
      const supabase = createClient()
      const path = `${selectedEmployeeId}/${yearMonth}.pdf`

      const { error: storageError } = await supabase.storage
        .from('payslips')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })

      if (storageError) {
        toast.error(`업로드 실패: ${storageError.message}`)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('payslips')
        .getPublicUrl(path)

      const res = await uploadPayslip({
        employeeId: selectedEmployeeId,
        yearMonth,
        fileUrl: publicUrl,
        fileName: file.name,
      })

      if (res.error) {
        toast.error(res.error)
        return
      }

      toast.success('급여명세서가 업로드되었습니다.')
      setSelectedEmployeeId('')
      setYearMonth('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''

      // Refresh list
      startLoadingList(async () => {
        const updated = await listAllPayslips()
        if (updated.data) setPayslips(updated.data)
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">급여명세서 관리</h1>

      {/* Upload form */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">급여명세서 업로드</h2>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">직원 선택</label>
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">직원을 선택하세요</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {[emp.departmentName, emp.position, emp.name].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">연월</label>
            <input
              type="month"
              value={yearMonth}
              onChange={e => setYearMonth(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">파일 (PDF)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 file:mr-3 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading || !selectedEmployeeId || !yearMonth || !file}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {uploading ? '업로드 중...' : '업로드'}
        </button>
      </div>

      {/* Recent payslips */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">최근 업로드 내역</h2>
        {loadingList ? (
          <p className="text-sm text-gray-400 py-4 text-center">불러오는 중...</p>
        ) : payslips.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">업로드된 급여명세서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {payslips.map(slip => (
              <div
                key={slip.id}
                className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {slip.employee_name} — {formatYearMonth(slip.year_month)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {slip.file_name ?? '급여명세서.pdf'}
                    {' · '}
                    {new Date(slip.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={slip.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    보기
                  </a>
                  <PayslipDownloadButton
                    url={slip.file_url}
                    fileName={slip.file_name ?? `${slip.year_month}_급여명세서.pdf`}
                    className="text-xs px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
