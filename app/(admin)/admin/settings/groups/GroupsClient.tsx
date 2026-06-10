'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { createGroup, deleteGroup, createTeam, deleteTeam } from './actions'

const PRESET_GROUPS = ['기획', '제작', '커머스']
const PRESET_TEAMS = ['1팀', '2팀', '3팀', '브랜드커머스팀', '기타 (직접 입력)']

type Group = { id: string; name: string }
type Team = { id: string; name: string; group_id: string | null }

export default function GroupsClient({ groups: init, teams: initTeams }: { groups: Group[]; teams: Team[] }) {
  const [groups, setGroups] = useState(init)
  const [teams, setTeams] = useState(initTeams)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupInput, setGroupInput] = useState('')
  const [groupPreset, setGroupPreset] = useState('')
  const [addingTeamFor, setAddingTeamFor] = useState<string | null>(null)
  const [teamInput, setTeamInput] = useState('')
  const [teamPreset, setTeamPreset] = useState('')
  const [isPending, startTransition] = useTransition()

  function toggle(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleAddGroup() {
    const name = (groupPreset === '기타' ? groupInput : groupPreset || groupInput).trim()
    if (!name) { toast.error('그룹명을 입력하세요.'); return }
    startTransition(async () => {
      const result = await createGroup(name)
      if (result.error) { toast.error(result.error); return }
      toast.success(`그룹 "${name}" 등록됨`)
      setGroups(prev => [...prev, { id: crypto.randomUUID(), name }])
      setAddingGroup(false); setGroupInput(''); setGroupPreset('')
    })
  }

  function handleDeleteGroup(id: string, name: string) {
    if (!confirm(`"${name}" 그룹을 삭제하면 소속 팀의 그룹 연결이 해제됩니다. 계속하시겠습니까?`)) return
    startTransition(async () => {
      const result = await deleteGroup(id)
      if (result.error) { toast.error(result.error); return }
      toast.success('그룹이 삭제됐습니다.')
      setGroups(prev => prev.filter(g => g.id !== id))
    })
  }

  function handleAddTeam(groupId: string) {
    const name = (teamPreset === '기타 (직접 입력)' ? teamInput : teamPreset || teamInput).trim()
    if (!name) { toast.error('팀명을 입력하세요.'); return }
    startTransition(async () => {
      const result = await createTeam(groupId, name)
      if (result.error) { toast.error(result.error); return }
      toast.success(`팀 "${name}" 등록됨`)
      setTeams(prev => [...prev, { id: crypto.randomUUID(), name, group_id: groupId }])
      setAddingTeamFor(null); setTeamInput(''); setTeamPreset('')
    })
  }

  function handleDeleteTeam(id: string, name: string) {
    if (!confirm(`"${name}" 팀을 삭제하시겠습니까?`)) return
    startTransition(async () => {
      const result = await deleteTeam(id)
      if (result.error) { toast.error(result.error); return }
      toast.success('팀이 삭제됐습니다.')
      setTeams(prev => prev.filter(t => t.id !== id))
    })
  }

  const ungrouped = teams.filter(t => !t.group_id)

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">그룹을 만들고 각 그룹 아래에 팀을 등록하세요.</p>
        <button
          onClick={() => setAddingGroup(true)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus size={14} /> 그룹 추가
        </button>
      </div>

      {addingGroup && (
        <div className="border border-dashed border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
          <p className="text-xs font-medium text-gray-600">새 그룹</p>
          <div className="flex gap-2 flex-wrap">
            {PRESET_GROUPS.map(p => (
              <button key={p} onClick={() => setGroupPreset(p)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${groupPreset === p ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-primary hover:text-primary'}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setGroupPreset('기타')}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${groupPreset === '기타' ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-primary hover:text-primary'}`}>
              직접 입력
            </button>
          </div>
          {(groupPreset === '기타' || !groupPreset) && (
            <input
              type="text" value={groupInput} onChange={e => setGroupInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              placeholder="그룹명 입력" autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          )}
          <div className="flex gap-2">
            <button onClick={handleAddGroup} disabled={isPending}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50">저장</button>
            <button onClick={() => { setAddingGroup(false); setGroupInput(''); setGroupPreset('') }}
              className="text-xs text-gray-500 hover:text-gray-700">취소</button>
          </div>
        </div>
      )}

      {groups.map(group => {
        const groupTeams = teams.filter(t => t.group_id === group.id)
        const open = expanded[group.id] !== false
        return (
          <div key={group.id} className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => toggle(group.id)}>
              <div className="flex items-center gap-2">
                {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                <span className="text-sm font-semibold text-gray-900">{group.name}</span>
                <span className="text-xs text-gray-400">{groupTeams.length}개 팀</span>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id, group.name) }}
                className="text-gray-300 hover:text-red-400 transition-colors" disabled={isPending}>
                <Trash2 size={14} />
              </button>
            </div>

            {open && (
              <div className="border-t border-gray-50 px-4 py-3 space-y-2">
                {groupTeams.map(team => (
                  <div key={team.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">{team.name}</span>
                    <button onClick={() => handleDeleteTeam(team.id, team.name)}
                      className="text-gray-300 hover:text-red-400 transition-colors" disabled={isPending}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {addingTeamFor === group.id ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_TEAMS.map(p => (
                        <button key={p} onClick={() => setTeamPreset(p)}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${teamPreset === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                    {(teamPreset === '기타 (직접 입력)' || !teamPreset) && (
                      <input type="text" value={teamInput} onChange={e => setTeamInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTeam(group.id)}
                        placeholder="팀명 직접 입력" autoFocus
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleAddTeam(group.id)} disabled={isPending}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">저장</button>
                      <button onClick={() => { setAddingTeamFor(null); setTeamInput(''); setTeamPreset('') }}
                        className="text-xs text-gray-500 hover:text-gray-700">취소</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setAddingTeamFor(group.id); setTeamInput(''); setTeamPreset('') }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors pt-1">
                    <Plus size={13} /> 팀 추가
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-2">그룹 미지정 팀</p>
          {ungrouped.map(team => (
            <div key={team.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-500">{team.name}</span>
              <button onClick={() => handleDeleteTeam(team.id, team.name)}
                className="text-gray-300 hover:text-red-400" disabled={isPending}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && !addingGroup && (
        <div className="text-center py-12 text-sm text-gray-400">
          등록된 그룹이 없습니다. 위의 그룹 추가 버튼을 눌러 시작하세요.
        </div>
      )}
    </div>
  )
}
