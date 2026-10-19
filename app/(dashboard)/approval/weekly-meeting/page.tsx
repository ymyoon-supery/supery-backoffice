import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getWeekStart, getWeekLabelDate, formatWeekLabel, toDateString } from '@/lib/holidays'
import WeeklyMeetingClient from './WeeklyMeetingClient'

export const dynamic = 'force-dynamic'

export default async function WeeklyMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, position, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) redirect('/login')

  const isAdmin = employee.role === 'ADMIN'
  const isTeamLead = employee.position === '팀장'
  if (!isAdmin && !isTeamLead) redirect('/approval/my')

  const today = new Date(Date.now() + 9 * 3600000)
  const currentMonday = getWeekStart(today)
  const currentWeekStart = toDateString(currentMonday)

  const params = await searchParams
  const weekDate = params.week
    ? (() => { const d = new Date(params.week! + 'T00:00:00Z'); return isNaN(d.getTime()) ? currentMonday : d })()
    : currentMonday
  const weekStart = toDateString(getWeekStart(weekDate))

  const labelDate = getWeekLabelDate(new Date(weekStart + 'T00:00:00Z'))
  const weekLabel = formatWeekLabel(labelDate)

  const prevDate = new Date(weekStart + 'T00:00:00Z')
  prevDate.setUTCDate(prevDate.getUTCDate() - 7)

  const nextDate = new Date(weekStart + 'T00:00:00Z')
  nextDate.setUTCDate(nextDate.getUTCDate() + 7)

  const [{ data: departments }, { data: meetings }] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name, sort_order')
      .order('sort_order')
      .order('name'),
    supabase
      .from('weekly_meetings')
      .select('id, department_id, this_week, next_week, issues, is_confirmed, confirmed_at')
      .eq('week_start', weekStart),
  ])

  return (
    <WeeklyMeetingClient
      weekStart={weekStart}
      weekLabel={weekLabel}
      prevWeekStart={toDateString(prevDate)}
      nextWeekStart={toDateString(nextDate)}
      currentWeekStart={currentWeekStart}
      departments={departments ?? []}
      meetings={meetings ?? []}
      isAdmin={isAdmin}
      myDepartmentId={employee.department_id ?? null}
    />
  )
}
