'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, UserX } from 'lucide-react'
import { createEmployee, updateEmployee, deactivateEmployee, type CreateEmployeeInput, type UpdateEmployeeInput } from './actions'
import { calcAnnualLeave } from '@/lib/annualLeave'

type Employee = {
  id: string; name: string; email: string; role: string
  rank: string | null; position: string | null; department_id: string | null
  is_active: boolean; auth_user_id: string | null
  hired_at: string | null; annual_leave_days: number; remaining_leaves: number
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
  position: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; groupId: string; hiredAt: string
} = {
  name: '', email: '', departmentId: '', rank: '', position: '팀원', role: 'EMPLOYEE', groupId: '', hiredAt: '',
}

function previewLeave(hiredAt: string): number | null {
  if (!hiredAt) return null
  return calcAnnualLeave(new Date(hiredAt))
}

export default function EmployeesClient({ employees: init, groups, teams }: {
  employees: Employee[]; groups: Group[]; teams: Team[]
}) {
  const [employees, setEmployees] = useState(init)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [isPending, startTransition] = useTransition()

  const filteredTeams = form.groupId ? teams.filter(t => t.group_id === form.groupId) : teams
  const leavePreview = previewLeave(form.hiredAt)

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(emp: Employee) {
    const team = teams.find(t => t.id === emp.department_id)
    setEditId(emp.id)
    setForm({
      name: emp.name,
      email: emp.email,
      departmentId: emp.department_id ?? '',
      rank: emp.rank ?? '',
      position: emp.position ?? '팀원',
      role: emp.role as 'ADMIN' | 'MANAGER' | 'EMPLOYEE',
      groupId: team?.group_id ?? '',
      hiredAt: emp.hired_at ?? '',
    })
    setShowForm(true)
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error('이름을 입력하세요.'); return }
    if (!editId && !form.email.trim()) { toast.error('이메일을 입력하세요.'); return }

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
        } as UpdateEmployeeInput)
        if (!result.error) {
          const newLeave = form.hiredAt ? calcAnnualLeave(new Date(form.hiredAt)) : undefined
          setEmployees(prev => prev.map(e => e.id === editId ? {
            ...e,
            name: form.name,
            department_id: form.departmentId || null,
            rank: form.rank || null,
            position: form.position || null,
            role: form.role,
            hired_at: form.hiredAt || null,
            annual_leave_days: newLeave ?? e.annual_leave_days,
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
          const days = form.hiredAt ? calcAnnualLeave(new Date(form.hiredAt)) : 15
          setEmployees(prev => [...prev, {
            id: crypto.randomUUID(), name: form.name, email: form.email,
            role: form.role, rank: form.rank || null, position: form.position || null,
            department_id: form.departmentId || null, is_active: true, auth_user_id: null,
            hired_at: form.hiredAt || null, annual_leave_days: days, remaining_leaves: days,
          }])
          toast.success('직원이 등록됐습니다. 해당 직원이 Google 계정으로 첫 로그인하면 자동 연결됩니다.')
        }
      }
      if (result.error) { toast.error(result.error); return }
      setShowForm(false)
    })
  }

  function handleDeactivate(id: string, name: string) {
    if (!confirm(`"${name}" 직원을 비활성화하시겠습니까?`)) return
    startTransition(async () => {
      const result = await deactivateEmployee(id)
      if (result.error) { toast.error(result.error); return }
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, is_active: false } : e))
      toast.success('비활성화됐습니다.')
    })
  }

  const active = employees.filter(e => e.is_active)
  const inactive = employees.filter(e => !e.is_active)

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
              <input type="date" value={form.hiredAt} onChange={e => setForm(p => ({ ...p, hiredAt: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30" />
              {leavePreview !== null && (
                <p className="text-xs text-primary">→ {new Date().getFullYear()}년 연차 {leavePreview}일 자동 계산</p>
              )}
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
              <th className="px-4 py-3 text-right">연차(잔여/부여)</th>
              <th className="px-4 py-3">권한</th>
              <th className="px-4 py-3">연결</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {active.map(emp => {
              const team = teams.find(t => t.id === emp.department_id)
              const group = team ? groups.find(g => g.id === team.group_id) : null
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
                    {emp.hired_at
                      ? emp.hired_at.slice(0, 10)
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs tabular-nums text-gray-700">
                      {emp.remaining_leaves}<span className="text-gray-400">/{emp.annual_leave_days}일</span>
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
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(emp)} className="text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                      <button onClick={() => handleDeactivate(emp.id, emp.name)} className="text-gray-300 hover:text-red-400"><UserX size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {active.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">등록된 직원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {inactive.length > 0 && (
        <details className="text-sm text-gray-400">
          <summary className="cursor-pointer py-2 hover:text-gray-600">비활성 직원 {inactive.length}명</summary>
          <div className="mt-2 space-y-1 pl-2">
            {inactive.map(e => <div key={e.id} className="text-gray-400">{e.name} ({e.email})</div>)}
          </div>
        </details>
      )}
    </div>
  )
}
