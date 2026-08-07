import { createClient } from '@/lib/supabase/server'
import DiaryViewerClient from '@/components/diary/DiaryViewerClient'

type SP = { employeeId?: string; tab?: string; date?: string; weekStart?: string; keyword?: string }

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

  const [{ data: rawEmployees }, { data: depts }] = await Promise.all([
    supabase.from('employees').select('id, name, department_id').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name'),
  ])

  const deptMap = Object.fromEntries((depts ?? []).map(d => [d.id, d.name]))
  const employees = (rawEmployees ?? []).map(e => ({
    id: e.id,
    name: e.name,
    department_name: e.department_id ? (deptMap[e.department_id] ?? null) : null,
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
  const keyword = sp.keyword?.trim() ?? ''

  type DailyDiary = {
    employee_id: string; employee_name: string; department_name: string | null
    content: string; created_at: string; updated_at: string
  }

  let dailyDiaries: DailyDiary[] = []
  let noEntryEmployees: typeof employees = []
  let weekDiaries: { diary_date: string; content: string | null }[] = []
  let searchResults: { diary_date: string; content: string; created_at: string; employee_name: string; department_name: string | null }[] = []

  if (keyword) {
    const { data } = await supabase
      .from('work_diaries')
      .select('diary_date, content, created_at, employee_id')
      .ilike('content', `%${keyword}%`)
      .order('diary_date', { ascending: false })

    searchResults = (data ?? []).map(r => {
      const emp = employees.find(e => e.id === r.employee_id)
      return {
        diary_date: r.diary_date,
        content: r.content,
        created_at: r.created_at,
        employee_name: emp?.name ?? '',
        department_name: emp?.department_name ?? null,
      }
    })
  } else if (tab === 'daily') {
    const { data } = await supabase
      .from('work_diaries')
      .select('employee_id, content, created_at, updated_at')
      .eq('diary_date', dateParam)

    const diaryMap = Object.fromEntries((data ?? []).map(d => [d.employee_id, d]))

    dailyDiaries = employees
      .filter(e => diaryMap[e.id])
      .map(e => ({
        employee_id: e.id,
        employee_name: e.name,
        department_name: e.department_name,
        content: diaryMap[e.id].content,
        created_at: diaryMap[e.id].created_at,
        updated_at: diaryMap[e.id].updated_at,
      }))

    noEntryEmployees = employees.filter(e => !diaryMap[e.id])
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
      keyword={keyword}
      dailyDiaries={dailyDiaries}
      noEntryEmployees={noEntryEmployees}
      weekDiaries={weekDiaries}
      searchResults={searchResults}
    />
  )
}
