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

export default async function DiaryTeamPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('employees')
    .select('id, position, department_id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!me || (me.position !== '팀장' && me.role !== 'ADMIN')) redirect('/diary')

  // Team members in same department (exclude self)
  const [{ data: rawEmployees }, { data: depts }] = await Promise.all([
    supabase.from('employees').select('id, name, department_id')
      .eq('department_id', me.department_id).eq('is_active', true).neq('id', me.id).order('name'),
    supabase.from('departments').select('id, name'),
  ])

  const deptMap = Object.fromEntries((depts ?? []).map(d => [d.id, d.name]))
  const employees = (rawEmployees ?? []).map(e => ({
    id: e.id,
    name: e.name,
    department_name: e.department_id ? (deptMap[e.department_id] ?? null) : null,
  }))

  if (employees.length === 0) redirect('/diary')

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
      basePath="/diary/team"
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
