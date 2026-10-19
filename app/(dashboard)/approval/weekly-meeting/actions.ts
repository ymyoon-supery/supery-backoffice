'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type UpsertWeeklyMeetingInput = {
  weekStart: string
  departmentId: string
  thisWeek: string
  nextWeek: string
  issues: string
}

export async function upsertWeeklyMeeting(input: UpsertWeeklyMeetingInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, position, department_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) return { error: '직원 정보를 찾을 수 없습니다.' }

  const isAdmin = employee.role === 'ADMIN'
  const isTeamLead = employee.position === '팀장'

  if (!isAdmin && !isTeamLead) return { error: '권한이 없습니다.' }
  if (!isAdmin && employee.department_id !== input.departmentId)
    return { error: '본인 팀의 주간회의만 수정할 수 있습니다.' }

  // 팀장: 해당 주에 이미 관리자가 확인했으면 차단
  if (!isAdmin) {
    const { data: confirmed } = await supabase
      .from('weekly_meetings')
      .select('id')
      .eq('week_start', input.weekStart)
      .eq('is_confirmed', true)
      .limit(1)
    if (confirmed && confirmed.length > 0)
      return { error: '관리자가 최종확인한 주간회의는 수정할 수 없습니다.' }
  }

  const { error } = await supabase
    .from('weekly_meetings')
    .upsert(
      {
        week_start: input.weekStart,
        department_id: input.departmentId,
        this_week: input.thisWeek,
        next_week: input.nextWeek,
        issues: input.issues,
        submitted_by: employee.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'week_start,department_id' },
    )

  if (error) return { error: error.message }

  revalidatePath('/approval/weekly-meeting')
  return { error: null }
}

export async function confirmWeeklyMeeting(weekStart: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.rpc('confirm_weekly_meetings', {
    p_week_start: weekStart,
  })

  if (error) return { error: error.message }

  revalidatePath('/approval/weekly-meeting')
  return { error: null }
}
