'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { createEmployee, updateEmployee, resignEmployee, type CreateEmployeeInput, type UpdateEmployeeInput } from './actions'
import { calcAnnualLeave } from '@/lib/annualLeave'

type Employee = {
  id: string; name: string; email: string; role: string
  rank: string | null; position: string | null; department_id: string | null
  is_active: boolean; auth_user_id: string | null
  hired_at: string | null; annual_leave_days: number; remaining_leaves: number
  resigned_at: string | null
}
type Group = { id: string; name: string }
type Team = { id: string; name: string; group_id: string | null }

const RANKS = ['사원', '대리', '과장', '차장', '부장']
const POSITIONS = ['팀원', '팀장']
const ROLES = [
  { value: 'EMPLOYEE', label: '일반 직원' },
  { value: 'MANAGER', label: '매니저' },
  { value: 'ADMIN', label: '관리자' },
]

const emptyForm: {
  name: string; email: string; departmentId: string; rank: string
  position: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  groupId: string; hiredAt: string; remainingLeaves: string
} = {
  name: '', email: '', departmentId: '', rank: '', position: '팀원',
  role: 'EMPLOYEE', groupId: '', hiredAt: '', remainingLeaves: '',
}

function calcDisplay(hiredAt: string | null): number | null {
  if (!hiredAt) return null
  return calcAnnualLeave(new Date(hiredAt))
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function EmployeesClient({ employees: init, groups, teams }: {
  employees: Employee[]; groups: Group[]; teams: Team[]
}) {
  const [employees, setEmployees] = useState(init)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [resignDate, setResignDate] = useState(todayStr)
  const [isPending, startTransition] = useTransition()

  const filteredTeams = form.groupId ? teams.filter(t => t.group_id === form.groupId) : teams
  const calcDays = calcDisplay(form.hiredAt)

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(emp: Employee) {
    const team = teams.find(t => t.id === emp.department_id)
    const calcDaysForEmp = calcDisplay(emp.hired_at)
    setEditId(emp.id)
    setResignDate(todayStr())
    setForm({
      name: emp.name,
      email: emp.email,
      departmentId: emp.department_id ?? '',
      rank: emp.rank ?? '',
      position: emp.position ?? '팀원',
      role: emp.role as 'ADMIN' | 'MANAGER' | 'EMPLOYEE',
      groupId: team?.group_id ?? '',
      hiredAt: emp.hired_at ?? '',
      remainingLeaves: String(calcDaysForEmp ?? emp.remaining_leaves),
    })
    setShowForm(true)
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error('이름을 입력하세요.'); return }
    if (!editId && !form.email.trim()) { toast.error('이메일을 입력하세요.'); return }

    const parsedRemaining = form.remainingLeaves !== '' ? parseFloat(form.remainingLeaves) : null

    startTransition(async () => {
      let result
      if (editId) {
        result = await updateEmployee({
          id: editId,
          name: form.name,
          departmentId: form.departmentId || null,
          rank: form.rank || null,
          position: form.position || null,
          role: form.role,
          hiredAt: form.hiredAt || null,
          remainingLeaves: parsedRemaining,
        } as UpdateEmployeeInput)
        if (!result.error) {
          const newAnnual = calcDays ?? undefined
          const newRemaining = parsedRemaining ?? newAnnual ?? undefined
          setEmployees(prev => prev.map(e => e.id === editId ? {
            ...e,
            name: form.name,
            department_id: form.departmentId || null,
            rank: form.rank || null,
            position: form.position || null,
            role: form.role,
            hired_at: form.hiredAt || null,
            annual_leave_days: newAnnual ?? e.annual_leave_days,
            remaining_leaves: newRemaining ?? e.remaining_leaves,
          } : e))
          toast.success('직원 정보가 수정됐습니다.')
        }
      } else {
        result = await createEmployee({
          name: form.name,
          email: form.email,
          departmentId: form.departmentId || null,
          rank: form.rank || null,
          position: form.position || null,
          role: form.role,
          hiredAt: form.hiredAt || null,
        } as CreateEmployeeInput)
        if (!result.error) {
          const days = calcDays ?? 15
          setEmployees(prev => [...prev, {
            id: crypto.randomUUID(), name: form.name, email: form.email,
            role: form.role, rank: form.rank || null, position: form.position || null,
            department_id: form.departmentId || null, is_active: true, auth_user_id: null,
            hired_at: form.hiredAt || null, annual_leave_days: days, remaining_leaves: days,
            resigned_at: null,
          }])
          toast.success('직원이 등록됐습니다. 해당 직원이 Google 계정으로 첫 로그인하면 자동 연결됩니다.')
        }
      }
      if (result.error) { toast.error(result.error); return }
      setShowForm(false)
    })
  }

  function handleResign(name: string) {
    if (!editId) return
    if (!resignDate) { toast.error('퇴사일을 입력하세요.'); return }
    if (!confirm(`"${name}" 직원을 퇴사 처리하시겠습니까?\n퇴사일: ${resignDate}\n\n계정 접근이 즉시 차단됩니다.`)) return
    startTransition(async () => {
      const result = await resignEmployee(editId, resignDate)
      if (result.error) { toast.error(result.error); return }
      setEmployees(prev => prev.map(e => e.id === editId ? { ...e, is_active: false, resigned_at: resignDate } : e))
      toast.success('퇴사 처리됐습니다.')
      setShowForm(false)
    })
  }

  const active = employees.filter(e => e.is_active)
  const inactive = employees.filter(e => !e.is_active)
  const editingEmployee = editId ? employees.find(e => e.id === editId) : null

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          직원을 사전 등록하면 해당 이메일로 Google 로그인 시 자동 연결됩니다.
        </p>
        <button onClick={openAdd} disabled={isPending}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
          <Plus size={14} /> 직원 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">{editId ? '직원 정보 수정' : '직원 등록'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">이름 *</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">이메일 {editId ? '' : '*'}</label>
              <input type="email" value={form.email} disabled={!!editId}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="name@supery.co.kr"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">입사일자</label>
              <input type="date" value={form.hiredAt}
                onChange={e => {
                  const newHiredAt = e.target.value
                  const newCalc = calcDisplay(newHiredAt)
                  setForm(p => ({
                    ...p,
                    hiredAt: newHiredAt,
                    remainingLeaves: newCalc !== null ? String(newCalc) : p.remainingLeaves,
                  }))
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30" />
              {calcDays !== null && (
                <p className="text-xs text-primary">→ {new Date().getFullYear()}년 부여연차 {calcDays}일 (근로기준법 제60조)</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">
                잔여연차
                {editId && <span className="ml-1 text-gray-400">(직접 조정 가능)</span>}
              </label>
              <input
                type="number" min="0" max="25" step="0.5"
                value={form.remainingLeaves}
                onChange={e => setForm(p => ({ ...p, remainingLeaves: e.target.value }))}
                placeholder={calcDays !== null ? String(calcDays) : '15'}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">그룹</label>
              <select value={form.groupId}
                onChange={e => setForm(p => ({ ...p, groupId: e.target.value, departmentId: '' }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="">그룹 선택</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">팀/부서</label>
              <select value={form.departmentId} onChange={e => setForm(p => ({ ...p, departmentId: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="">팀 선택</option>
                {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">직급</label>
              <select value={form.rank} onChange={e => setForm(p => ({ ...p, rank: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30">
                <option value="">선택</option>
                {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">직위</label>
              <select value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30">
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">권한</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as 'ADMIN' | 'MANAGER' | 'EMPLOYEE' }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSubmit} disabled={isPending}
              className="text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {editId ? '수정' : '등록'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3">취소</button>
          </div>

          {editId && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <p className="text-xs font-semibold text-gray-500">퇴사 처리</p>
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">퇴사일</label>
                  <input
                    type="date"
                    value={resignDate}
                    onChange={e => setResignDate(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-300"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleResign(editingEmployee?.name ?? '')}
                  disabled={isPending || !resignDate}
                  className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  퇴사 처리
                </button>
              </div>
              <p className="text-xs text-gray-400">퇴사 처리 시 계정 접근이 즉시 차단되며, 데이터는 유지됩니다.</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">그룹/팀</th>
              <th className="px-4 py-3">직급</th>
              <th className="px-4 py-3">직위</th>
              <th className="px-4 py-3">입사일</th>
              <th className="px-4 py-3 text-right">부여연차</th>
              <th className="px-4 py-3 text-right">잔여연차</th>
              <th className="px-4 py-3">권한</th>
              <th className="px-4 py-3">연결</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {active.map(emp => {
              const team = teams.find(t => t.id === emp.department_id)
              const group = team ? groups.find(g => g.id === team.group_id) : null
              const displayAnnual = calcDisplay(emp.hired_at) ?? emp.annual_leave_days
              return (
                <tr key={emp.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{emp.email}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {group && <span className="text-xs text-gray-400 mr-1">{group.name}</span>}
                    {team?.name ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.rank ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {emp.position
                      ? <span className={`text-xs px-2 py-0.5 rounded-full ${emp.position === '팀장' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{emp.position}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {emp.hired_at ? emp.hired_at.slice(0, 10) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium tabular-nums text-gray-700">{displayAnnual}일</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium tabular-nums ${emp.remaining_leaves <= 3 ? 'text-red-500' : 'text-gray-700'}`}>
                      {emp.remaining_leaves}일
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${emp.role === 'ADMIN' ? 'bg-red-50 text-red-600' : emp.role === 'MANAGER' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                      {ROLES.find(r => r.value === emp.role)?.label ?? emp.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${emp.auth_user_id ? 'text-green-600' : 'text-gray-300'}`}>
                      {emp.auth_user_id ? '연결됨' : '대기 중'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(emp)} className="text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                  </td>
                </tr>
              )
            })}
            {active.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400">등록된 직원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {inactive.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-gray-400 hover:text-gray-600 select-none">
            퇴사자 {inactive.length}명
          </summary>
          <div className="mt-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-xs text-gray-400 font-medium text-left">
                  <th className="px-4 py-2">이름</th>
                  <th className="px-4 py-2">이메일</th>
                  <th className="px-4 py-2">팀</th>
                  <th className="px-4 py-2">입사일</th>
                  <th className="px-4 py-2">퇴사일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inactive.map(e => {
                  const team = teams.find(t => t.id === e.department_id)
                  return (
                    <tr key={e.id} className="text-gray-400">
                      <td className="px-4 py-2">{e.name}</td>
                      <td className="px-4 py-2 text-xs">{e.email}</td>
                      <td className="px-4 py-2 text-xs">{team?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-xs">{e.hired_at ? e.hired_at.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2 text-xs">{e.resigned_at ? e.resigned_at.slice(0, 10) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
