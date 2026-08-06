import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DiaryViewerClient from '@/components/diary/DiaryViewerClient'

type SP = { employeeId?: string; tab?: string; date?: string; weekStart?: string }

function getMondayISO(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().split('T')[0]
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function AdminDiaryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const supabase = await createClient()

  const { data: rawEmployees } = await supabase
    .from('employees')
    .select('id, name, departments(name)')
    .eq('is_active', true)
    .order('name')

  const employees = (rawEmployees ?? []).map(e => ({
    id: e.id,
    name: e.name,
    department_name: (e.departments as unknown as { name: string } | null)?.name ?? null,
  }))

  if (employees.length === 0) {
    return <p className="text-gray-400 text-sm">등록된 직원이 없습니다.</p>
  }

  const tab = (sp.tab === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly'
  const selectedId = sp.employeeId && employees.some(e => e.id === sp.employeeId)
    ? sp.employeeId
    : employees[0].id
  const today = new Date().toISOString().split('T')[0]
  const dateParam = sp.date ?? today
  const weekStartParam = sp.weekStart ?? getMondayISO()

  let diary = null
  let weekDiaries: { diary_date: string; content: string | null }[] = []

  if (tab === 'daily') {
    const { data } = await supabase
      .from('work_diaries')
      .select('diary_date, content, created_at, updated_at')
      .eq('employee_id', selectedId)
      .eq('diary_date', dateParam)
      .maybeSingle()
    diary = data
  } else {
    const weekEnd = addDaysISO(weekStartParam, 6)
    const { data } = await supabase
      .from('work_diaries')
      .select('diary_date, content')
      .eq('employee_id', selectedId)
      .gte('diary_date', weekStartParam)
      .lte('diary_date', weekEnd)
    weekDiaries = data ?? []
  }

  return (
    <DiaryViewerClient
      basePath="/admin/diary"
      employees={employees}
      selectedEmployeeId={selectedId}
      tab={tab}
      date={dateParam}
      weekStart={weekStartParam}
      diary={diary}
      weekDiaries={weekDiaries}
    />
  )
}
