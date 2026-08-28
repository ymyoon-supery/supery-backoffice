'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Monitor, Copy, RefreshCw, Trash2, CheckCircle2, Clock, WifiOff, Upload, AlertTriangle } from 'lucide-react'
import { generateAgentKey, revokeAgentKey, toggleAutoBreak, getAgentUploadUrl, confirmAgentUpload } from './actions'
import { formatDistanceToNow, format } from 'date-fns'
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
  autoBreak: boolean
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

export default function AgentsClient({
  rows,
  agentVersion,
  agentVersionUpdatedAt,
}: {
  rows: Row[]
  agentVersion: string | null
  agentVersionUpdatedAt: string | null
}) {
  const [generatedKeys, setGeneratedKeys] = useState<Record<string, string>>({})
  const [autoBreakMap, setAutoBreakMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map(r => [r.id, r.autoBreak]))
  )
  const [isPending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())

  // 버전 관리 state
  const [deployedVersion, setDeployedVersion] = useState(agentVersion)
  const [deployedAt, setDeployedAt] = useState(agentVersionUpdatedAt)
  const [uploadVersion, setUploadVersion] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  async function handleUpload() {
    if (!uploadVersion.trim() || !uploadFile) {
      setUploadError('버전과 파일을 모두 선택하세요.')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const { uploadUrl, storagePath, error: urlError } = await getAgentUploadUrl(uploadVersion.trim())
      if (urlError) { setUploadError(urlError); return }

      const putResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: uploadFile,
      })
      if (!putResp.ok) { setUploadError(`Storage 업로드 실패 (${putResp.status})`); return }

      const { error: confirmError } = await confirmAgentUpload(storagePath, uploadVersion.trim())
      if (confirmError) { setUploadError(confirmError); return }

      const ver = uploadVersion.trim()
      setDeployedVersion(ver)
      setDeployedAt(new Date().toISOString())
      setUploadVersion('')
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success(`v${ver} 배포 완료 — 직원 PC 재시작 시 자동 업데이트됩니다.`)
    } catch (e) {
      setUploadError(String(e))
    } finally {
      setUploading(false)
    }
  }

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

  function handleToggleAutoBreak(employeeId: string, current: boolean) {
    const next = !current
    setAutoBreakMap(prev => ({ ...prev, [employeeId]: next }))
    startTransition(async () => {
      const { error } = await toggleAutoBreak(employeeId, next)
      if (error) {
        setAutoBreakMap(prev => ({ ...prev, [employeeId]: current }))
        toast.error(error)
      }
    })
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    toast.success('클립보드에 복사되었습니다.')
  }

  return (
    <div className="space-y-4">
      {/* 버전 관리 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">에이전트 버전 관리</p>
          <div className="text-sm text-gray-500">
            {deployedVersion ? (
              <span>
                배포 중: <span className="font-mono font-semibold text-gray-900">v{deployedVersion}</span>
                {deployedAt && (
                  <span className="text-gray-400 ml-2">
                    ({format(new Date(deployedAt), 'MM.dd HH:mm')})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-gray-400">배포된 버전 없음</span>
            )}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">새 버전</label>
            <input
              type="text"
              placeholder="예: 1.3.8"
              value={uploadVersion}
              onChange={e => setUploadVersion(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">EXE 파일</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".exe"
              onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading || !uploadVersion.trim() || !uploadFile}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap"
          >
            <Upload size={14} />
            {uploading ? '업로드 중...' : '배포'}
          </button>
        </div>

        {uploadError && (
          <p className="text-xs text-red-500">{uploadError}</p>
        )}
      </div>

      {/* 배포 안내 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium flex items-center gap-2"><Monitor size={15} />PC 에이전트 배포 방법</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-700 text-xs pl-1">
          <li>직원별 에이전트 키 생성 후 직원에게 전달</li>
          <li>직원은 <code className="bg-blue-100 px-1 rounded">SuperyAgent.exe</code> 실행 → 키 입력 → 자동 등록</li>
          <li>이후 업데이트는 위에서 EXE 배포 시 PC 재시작 시 자동 적용</li>
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
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">자동 휴식</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => {
              const latest = row.installations[0]
              const status = agentStatus(latest, now)
              const newKey = generatedKeys[row.id]
              const autoBreak = autoBreakMap[row.id] ?? row.autoBreak

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
                        {row.installations.map(inst => {
                          const outdated = deployedVersion && inst.app_version && inst.app_version !== deployedVersion
                          return (
                            <p key={inst.device_name} className="text-xs text-gray-600 flex items-center gap-1.5">
                              {inst.device_name}
                              {inst.app_version && (
                                <span className={outdated ? 'text-orange-500 font-medium' : 'text-gray-400'}>
                                  v{inst.app_version}
                                </span>
                              )}
                              {outdated && (
                                <span title={`최신 버전 v${deployedVersion}으로 업데이트 필요`}>
                                  <AlertTriangle size={11} className="text-orange-400" />
                                </span>
                              )}
                            </p>
                          )
                        })}
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
                    <button
                      onClick={() => handleToggleAutoBreak(row.id, autoBreak)}
                      disabled={isPending}
                      title={autoBreak ? '자동 휴식 감지 켜짐 — 클릭하여 끄기' : '자동 휴식 감지 꺼짐 — 클릭하여 켜기'}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${autoBreak ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoBreak ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
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
