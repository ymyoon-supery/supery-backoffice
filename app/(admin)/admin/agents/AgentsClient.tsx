'use client'

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Monitor, Copy, RefreshCw, Trash2, CheckCircle2, Clock, WifiOff } from 'lucide-react'
import { generateAgentKey, revokeAgentKey } from './actions'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

type Installation = {
  employee_id: string
  device_name: string
  os_info: string | null
  app_version: string | null
  registered_at: string
  last_seen_at: string
}

type Row = {
  id: string
  name: string
  email: string
  hasKey: boolean
  installations: Installation[]
}

function agentStatus(inst: Installation | undefined, now: number): 'online' | 'away' | 'offline' {
  if (!inst) return 'offline'
  const diffMin = (now - new Date(inst.last_seen_at).getTime()) / 60000
  if (diffMin < 10) return 'online'
  if (diffMin < 30) return 'away'
  return 'offline'
}

const STATUS_BADGE = {
  online: <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} />온라인</span>,
  away: <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full"><Clock size={11} />자리비움</span>,
  offline: <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><WifiOff size={11} />오프라인</span>,
}

export default function AgentsClient({ rows }: { rows: Row[] }) {
  const [generatedKeys, setGeneratedKeys] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())

  // 30초마다 상태 뱃지 재계산 (페이지 오래 열어둬도 stale 방지)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  function handleGenerate(employeeId: string) {
    startTransition(async () => {
      const { key, error } = await generateAgentKey(employeeId)
      if (error) { toast.error(error); return }
      setGeneratedKeys(prev => ({ ...prev, [employeeId]: key! }))
      toast.success('에이전트 키가 생성되었습니다. 직원에게 전달하세요.')
    })
  }

  function handleRevoke(employeeId: string, name: string) {
    if (!confirm(`${name}의 에이전트 키와 설치 기록을 모두 삭제하시겠습니까?`)) return
    startTransition(async () => {
      const { error } = await revokeAgentKey(employeeId)
      if (error) { toast.error(error); return }
      setGeneratedKeys(prev => { const n = { ...prev }; delete n[employeeId]; return n })
      toast.success('에이전트 키가 삭제되었습니다.')
    })
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    toast.success('클립보드에 복사되었습니다.')
  }

  return (
    <div className="space-y-3">
      {/* 다운로드 안내 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium flex items-center gap-2"><Monitor size={15} />PC 에이전트 배포 방법</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-700 text-xs pl-1">
          <li>직원별 에이전트 키 생성 후 직원에게 전달</li>
          <li>직원은 <code className="bg-blue-100 px-1 rounded">SuperyAgent.exe</code> 실행 → 키 입력 → 자동 등록</li>
          <li>Windows 시작 프로그램 자동 등록 (PC 켤 때마다 자동 실행)</li>
        </ol>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">직원</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">에이전트 키</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">설치 기기</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">마지막 접속</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => {
              const latest = row.installations[0]
              const status = agentStatus(latest, now)
              const newKey = generatedKeys[row.id]

              return (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-400">{row.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {newKey ? (
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-1 rounded font-mono">
                          {newKey}
                        </code>
                        <button onClick={() => copyKey(newKey)} className="text-gray-400 hover:text-gray-600">
                          <Copy size={13} />
                        </button>
                      </div>
                    ) : row.hasKey ? (
                      <span className="text-xs text-gray-500">키 발급됨</span>
                    ) : (
                      <span className="text-xs text-gray-300">미발급</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.installations.length > 0 ? (
                      <div className="space-y-0.5">
                        {row.installations.map(inst => (
                          <p key={inst.device_name} className="text-xs text-gray-600">
                            {inst.device_name}
                            {inst.app_version && <span className="text-gray-400 ml-1">v{inst.app_version}</span>}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">미설치</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {latest ? formatDistanceToNow(new Date(latest.last_seen_at), { addSuffix: true, locale: ko }) : '-'}
                  </td>
                  <td className="px-4 py-3">{STATUS_BADGE[status]}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleGenerate(row.id)}
                        disabled={isPending}
                        title={row.hasKey ? '키 재생성' : '키 생성'}
                        className="flex items-center gap-1 text-xs text-primary border border-primary/30 px-2 py-1 rounded hover:bg-primary/5 disabled:opacity-50"
                      >
                        <RefreshCw size={11} />{row.hasKey ? '재생성' : '키 생성'}
                      </button>
                      {row.hasKey && (
                        <button
                          onClick={() => handleRevoke(row.id, row.name)}
                          disabled={isPending}
                          title="키 삭제"
                          className="text-red-400 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
