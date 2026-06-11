'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, parseISO, addDays, addWeeks, addMonths,
  startOfWeek, endOfWeek, getDay,
} from 'date-fns'
import AttendanceEditor from './AttendanceEditor'

type DaySummary = {
  checkIn: string | null
  checkOut: string | null
  breakMin: number
  workMin: number
}
type EmpSummary = {
  id: string
  name: string
  days: Record<string, DaySummary>
}

const LEAVE_ABBR: Record<string, string> = {
  ANNUAL: '연차', HALF_DAY: '반차', AM_HALF: '오전', PM_HALF: '오후',
  SICK: '병가', GROUP: '공동', COMP: '보상', OTHER: '기타',
}
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function fmtWork(min: number): string {
  if (min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function workColor(min: number): string {
  if (min >= 600) return 'text-red-600 font-semibold'
  if (min >= 540) return 'text-amber-600'
  return 'text-gray-700'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AttendanceSummaryView({
  view, baseDate, dates, employees, allEmployees, selectedEmpId,
  leaveRecords, rawRecords, allEmployeesForEditor,
}: {
  view: 'day' | 'week' | 'month'
  baseDate: string
  dates: string[]
  employees: EmpSummary[]
  allEmployees: { id: string; name: string }[]
  selectedEmpId: string
  leaveRecords: any[]
  rawRecords: any[]
  allEmployeesForEditor: any[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'summary' | 'detail'>('summary')
  const base = parseISO(baseDate)

  function push(v: string, d: string, emp: string) {
    const p = new URLSearchParams({ view: v, date: d })
    if (emp) p.set('empId', emp)
    router.push(`/admin/attendance?${p}`)
  }

  const prev = () => {
    const nb = view === 'day' ? addDays(base, -1) : view === 'week' ? addWeeks(base, -1) : addMonths(base, -1)
    push(view, format(nb, 'yyyy-MM-dd'), selectedEmpId)
  }
  const next = () => {
    const nb = view === 'day' ? addDays(base, 1) : view === 'week' ? addWeeks(base, 1) : addMonths(base, 1)
    push(view, format(nb, 'yyyy-MM-dd'), selectedEmpId)
  }

  const periodLabel = () => {
    if (view === 'day') return `${format(base, 'yyyy.MM.dd')} (${DAY_KO[getDay(base)]})`
    if (view === 'week') {
      const ws = startOfWeek(base, { weekStartsOn: 1 })
      const we = endOfWeek(base, { weekStartsOn: 1 })
      return `${format(ws, 'yyyy.MM.dd')} ~ ${format(we, 'MM.dd')}`
    }
    return format(base, 'yyyy년 MM월')
  }

  function getLeave(empId: string, date: string) {
    return leaveRecords.find((lr: any) =>
      lr.employee_id === empId && lr.start_date <= date && lr.end_date >= date
    )
  }

  // Month: group dates into Mon–Sun weeks
  const weekGroups: string[][] = []
  if (view === 'month') {
    let current: string[] = []
    for (const d of dates) {
      if (getDay(parseISO(d)) === 1 && current.length > 0) {
        weekGroups.push(current)
        current = []
      }
      current.push(d)
    }
    if (current.length > 0) weekGroups.push(current)
  }

  const weekLabel = (wDates: string[]) =>
    `${wDates[0].slice(5).replace('-', '/')}~${wDates[wDates.length - 1].slice(5).replace('-', '/')}`

  const colCount = view === 'day' ? 5 : view === 'week' ? dates.length + 2 : weekGroups.length + 2

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {(['day', 'week', 'month'] as const).map(v => (
            <button key={v} onClick={() => push(v, baseDate, selectedEmpId)}
              className={`px-3 py-1.5 transition-colors ${view === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {v === 'day' ? '일별' : v === 'week' ? '주별' : '월별'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">‹</button>
          <span className="text-sm font-medium text-gray-700 min-w-[168px] text-center">{periodLabel()}</span>
          <button onClick={next} className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 text-lg leading-none">›</button>
        </div>

        <select value={selectedEmpId} onChange={e => push(view, baseDate, e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="">전체 직원</option>
          {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {(['summary', 'detail'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'summary' ? '근무 집계' : '상세 기록'}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          {/* Day view */}
          {view === 'day' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-3">직원</th>
                  <th className="px-4 py-3">출근</th>
                  <th className="px-4 py-3">퇴근</th>
                  <th className="px-4 py-3 text-right">휴식</th>
                  <th className="px-4 py-3 text-right">근무시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const ds = emp.days[dates[0]]
                  const leave = getLeave(emp.id, dates[0])
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      {leave && !ds ? (
                        <>
                          <td colSpan={3} className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{LEAVE_ABBR[leave.leave_type] ?? leave.leave_type}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">—</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 tabular-nums text-gray-700">{ds?.checkIn ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 tabular-nums text-gray-700">{ds?.checkOut ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-400 text-xs">{ds?.breakMin ? fmtWork(ds.breakMin) : '—'}</td>
                          <td className={`px-4 py-3 text-right tabular-nums ${ds ? workColor(ds.workMin) : 'text-gray-300'}`}>
                            {ds ? fmtWork(ds.workMin) : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Week view */}
          {view === 'week' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-3 sticky left-0 bg-white z-10">직원</th>
                  {dates.map(d => (
                    <th key={d} className="px-3 py-3 text-center min-w-[64px]">
                      <span className={getDay(parseISO(d)) === 0 || getDay(parseISO(d)) === 6 ? 'text-blue-400' : ''}>
                        {DAY_KO[getDay(parseISO(d))]}
                      </span>
                      <br />
                      <span className="text-gray-300 font-normal">{d.slice(5).replace('-', '/')}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const total = Object.values(emp.days).reduce((s, ds) => s + ds.workMin, 0)
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white z-10">{emp.name}</td>
                      {dates.map(d => {
                        const ds = emp.days[d]
                        const leave = getLeave(emp.id, d)
                        return (
                          <td key={d} className="px-2 py-3 text-center">
                            {ds ? (
                              <span className={`text-xs tabular-nums ${workColor(ds.workMin)}`}>{fmtWork(ds.workMin)}</span>
                            ) : leave ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 whitespace-nowrap">
                                {LEAVE_ABBR[leave.leave_type] ?? '휴가'}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-200">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className={`px-4 py-3 text-right tabular-nums font-medium text-sm ${total >= 52 * 60 ? 'text-red-600' : total > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                        {fmtWork(total)}
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Month view */}
          {view === 'month' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-3">직원</th>
                  {weekGroups.map(wg => (
                    <th key={wg[0]} className="px-3 py-3 text-center whitespace-nowrap">{weekLabel(wg)}</th>
                  ))}
                  <th className="px-4 py-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const total = Object.values(emp.days).reduce((s, ds) => s + ds.workMin, 0)
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      {weekGroups.map(wg => {
                        const weekMin = wg.reduce((s, d) => s + (emp.days[d]?.workMin ?? 0), 0)
                        return (
                          <td key={wg[0]} className={`px-3 py-3 text-center tabular-nums text-xs ${weekMin >= 52 * 60 ? 'text-red-600 font-semibold' : weekMin > 0 ? 'text-gray-700' : 'text-gray-200'}`}>
                            {weekMin > 0 ? fmtWork(weekMin) : '—'}
                          </td>
                        )
                      })}
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${total > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                        {fmtWork(total)}
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'detail' && (
        <AttendanceEditor
          records={rawRecords}
          employees={allEmployeesForEditor}
          leaveRecords={leaveRecords}
        />
      )}
    </div>
  )
}
