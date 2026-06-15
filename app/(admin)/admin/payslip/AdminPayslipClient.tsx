'use client'

import { useState, useRef, useEffect, useTransition, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadPayslip, listPayslipsByMonth, deletePayslip, type PayslipRow } from './actions'
import PayslipDownloadButton from '@/components/payslip/PayslipDownloadButton'

interface Employee {
  id: string
  name: string
  position: string | null
  departmentName: string | null
}

type Tab = 'upload' | 'manage'

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return `${year}년 ${month}월`
}

export default function AdminPayslipClient({ employees }: { employees: Employee[] }) {
  const [tab, setTab] = useState<Tab>('upload')

  // ── 업로드 탭 상태 ──
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [yearMonth, setYearMonth] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMonthSlips, setUploadMonthSlips] = useState<PayslipRow[]>([])
  const [loadingUploadList, startUploadList] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 관리 탭 상태 ──
  const [manageMonth, setManageMonth] = useState('')
  const [manageSlips, setManageSlips] = useState<PayslipRow[]>([])
  const [loadingManage, startManageList] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const refreshUploadMonth = useCallback(() => {
    startUploadList(async () => {
      const res = await listPayslipsByMonth(thisMonth())
      if (res.data) setUploadMonthSlips(res.data)
    })
  }, [])

  const refreshManageMonth = useCallback((ym?: string) => {
    startManageList(async () => {
      const res = await listPayslipsByMonth(ym || undefined)
      if (res.data) setManageSlips(res.data)
    })
  }, [])

  useEffect(() => { refreshUploadMonth() }, [refreshUploadMonth])
  useEffect(() => { if (tab === 'manage') refreshManageMonth(manageMonth || undefined) }, [tab, manageMonth, refreshManageMonth])

  async function handleUpload() {
    if (!selectedEmployeeId || !yearMonth || !file) return
    setUploading(true)
    try {
      const supabase = createClient()
      const path = `${selectedEmployeeId}/${yearMonth}.pdf`
      const { error: storageError } = await supabase.storage
        .from('payslips')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (storageError) { toast.error(`업로드 실패: ${storageError.message}`); return }

      const { data: { publicUrl } } = supabase.storage.from('payslips').getPublicUrl(path)
      const res = await uploadPayslip({ employeeId: selectedEmployeeId, yearMonth, fileUrl: publicUrl, fileName: file.name })
      if (res.error) { toast.error(res.error); return }

      toast.success('급여명세서가 업로드되었습니다.')
      setSelectedEmployeeId('')
      setYearMonth('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      refreshUploadMonth()
    } finally {
      setUploading(false)
    }
  }

  async function handleReplace(slip: PayslipRow, newFile: File | null) {
    if (!newFile) return
    setReplacingId(slip.id)
    try {
      const supabase = createClient()
      const path = `${slip.employeeId}/${slip.yearMonth}.pdf`
      const { error: storageError } = await supabase.storage
        .from('payslips')
        .upload(path, newFile, { upsert: true, contentType: 'application/pdf' })
      if (storageError) { toast.error(`변경 실패: ${storageError.message}`); return }

      const { data: { publicUrl } } = supabase.storage.from('payslips').getPublicUrl(path)
      const res = await uploadPayslip({ employeeId: slip.employeeId, yearMonth: slip.yearMonth, fileUrl: publicUrl, fileName: newFile.name })
      if (res.error) { toast.error(res.error); return }

      toast.success('파일이 변경되었습니다.')
      refreshManageMonth(manageMonth)
    } finally {
      setReplacingId(null)
      const input = replaceRefs.current[slip.id]
      if (input) input.value = ''
    }
  }

  async function handleDelete(slip: PayslipRow) {
    if (!confirm(`${slip.employeeLabel} ${formatYearMonth(slip.yearMonth)} 급여명세서를 삭제하시겠습니까?`)) return
    setDeletingId(slip.id)
    try {
      const res = await deletePayslip(slip.id, slip.employeeId, slip.yearMonth)
      if (res.error) { toast.error(res.error); return }
      toast.success('삭제되었습니다.')
      setManageSlips(prev => prev.filter(s => s.id !== slip.id))
    } finally {
      setDeletingId(null)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upload', label: '업로드' },
    { key: 'manage', label: '관리' },
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">급여명세서 관리</h1>

      {/* Tab selector */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 업로드 탭 ── */}
      {tab === 'upload' && (
        <div className="space-y-4">
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

          {/* 이번 달 업로드 내역 */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">
              이번 달 업로드 내역 <span className="text-gray-400 font-normal">({formatYearMonth(thisMonth())})</span>
            </h2>
            {loadingUploadList ? (
              <p className="text-sm text-gray-400 py-4 text-center">불러오는 중...</p>
            ) : uploadMonthSlips.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">이번 달 업로드된 급여명세서가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {uploadMonthSlips.map(slip => (
                  <div key={slip.id} className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{slip.employeeLabel}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {slip.fileName ?? '급여명세서.pdf'} · {new Date(slip.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={slip.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                        보기
                      </a>
                      <PayslipDownloadButton url={slip.fileUrl} fileName={slip.fileName ?? `${slip.yearMonth}_급여명세서.pdf`}
                        className="text-xs px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 관리 탭 ── */}
      {tab === 'manage' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={manageMonth}
              onChange={e => setManageMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {manageMonth ? (
              <button
                type="button"
                onClick={() => setManageMonth('')}
                className="text-xs px-3 py-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
              >
                전체 보기
              </button>
            ) : (
              <span className="text-sm text-gray-400">전체 급여명세서</span>
            )}
          </div>

          {loadingManage ? (
            <p className="text-sm text-gray-400 py-8 text-center">불러오는 중...</p>
          ) : manageSlips.length === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">업로드된 급여명세서가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {manageSlips.map(slip => (
                <div key={slip.id} className="bg-white rounded-xl border border-gray-100 px-5 py-3.5 flex items-center justify-between gap-4">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    ref={el => { replaceRefs.current[slip.id] = el }}
                    onChange={e => handleReplace(slip, e.target.files?.[0] ?? null)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {slip.employeeName} — {formatYearMonth(slip.yearMonth)} 급여명세서
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {slip.employeeLabel} · {new Date(slip.createdAt).toLocaleDateString('ko-KR')} 업로드
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a href={slip.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                      보기
                    </a>
                    <PayslipDownloadButton url={slip.fileUrl} fileName={slip.fileName ?? `${slip.yearMonth}_${slip.employeeName}_급여명세서.pdf`}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors" />
                    <button
                      type="button"
                      disabled={replacingId === slip.id}
                      onClick={() => replaceRefs.current[slip.id]?.click()}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {replacingId === slip.id ? '변경 중...' : '변경'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === slip.id}
                      onClick={() => handleDelete(slip)}
                      className="text-xs px-2.5 py-1 border border-red-100 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === slip.id ? '...' : '삭제'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
