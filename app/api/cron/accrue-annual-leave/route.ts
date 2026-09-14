import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcAnnualLeave, isUnderOneYear } from '@/lib/annualLeave'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // KST 기준 오늘 날짜
  const today = new Date(Date.now() + 9 * 3600000)

  // 입사 1년 미만 직원만 조회 (1년 이상은 연차가 15일 고정이므로 불필요)
  const oneYearAgo = new Date(today)
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1)

  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, name, hired_at, annual_leave_days, remaining_leaves')
    .eq('is_active', true)
    .not('hired_at', 'is', null)
    .gt('hired_at', oneYearAgo.toISOString().slice(0, 10))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const accrued: string[] = []
  const skipped: string[] = []

  for (const emp of employees ?? []) {
    const hiredAt = new Date(emp.hired_at)

    if (!isUnderOneYear(hiredAt, today)) {
      skipped.push(emp.name)
      continue
    }

    const newEntitlement = calcAnnualLeave(hiredAt, today)
    const prevEntitlement = Math.round(Number(emp.annual_leave_days ?? 0) * 10) / 10
    const increment = Math.round((newEntitlement - prevEntitlement) * 10) / 10

    if (increment <= 0) {
      skipped.push(emp.name)
      continue
    }

    const newRemaining = Math.round((Number(emp.remaining_leaves) + increment) * 10) / 10

    const { error: updateError } = await supabase
      .from('employees')
      .update({
        annual_leave_days: newEntitlement,
        remaining_leaves: newRemaining,
      })
      .eq('id', emp.id)

    if (updateError) {
      console.error('[accrue-annual-leave] update failed:', emp.name, updateError.message)
    } else {
      accrued.push(`${emp.name}: +${increment}일 (${prevEntitlement} → ${newEntitlement}, 잔여 ${newRemaining})`)
    }
  }

  return NextResponse.json({ ok: true, accrued, skipped })
}
