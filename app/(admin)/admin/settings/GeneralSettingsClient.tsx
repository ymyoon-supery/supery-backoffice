'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, Wifi } from 'lucide-react'
import { updateInactivityMinutes, addOfficeIp, removeOfficeIp } from './actions'

const INACTIVITY_OPTIONS = [
  { value: 10, label: '10분' },
  { value: 15, label: '15분 (기본)' },
  { value: 20, label: '20분' },
  { value: 30, label: '30분' },
]

export default function GeneralSettingsClient({
  inactivityMinutes,
  officeIps,
  currentIp,
}: {
  inactivityMinutes: number
  officeIps: string[]
  currentIp: string
}) {
  const [minutes, setMinutes] = useState(inactivityMinutes)
  const [ips, setIps] = useState<string[]>(officeIps)
  const [newIp, setNewIp] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSaveInactivity() {
    startTransition(async () => {
      const res = await updateInactivityMinutes(minutes)
      if (res.error) { toast.error(res.error); return }
      toast.success('저장되었습니다.')
    })
  }

  function handleAddIp(ip: string) {
    if (!ip.trim()) return
    startTransition(async () => {
      const res = await addOfficeIp(ip)
      if (res.error) { toast.error(res.error); return }
      setIps(prev => [...prev, ip.trim()])
      setNewIp('')
      toast.success(`${ip.trim()} 등록되었습니다.`)
    })
  }

  function handleRemoveIp(ip: string) {
    startTransition(async () => {
      const res = await removeOfficeIp(ip)
      if (res.error) { toast.error(res.error); return }
      setIps(prev => prev.filter(x => x !== ip))
      toast.success(`${ip} 삭제되었습니다.`)
    })
  }

  const currentIpAlreadyAdded = currentIp && ips.includes(currentIp)

  return (
    <div className="max-w-lg space-y-6">

      {/* 근태 설정 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">근태 설정</h2>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">자리비움 자동 감지 시간</label>
          <div className="flex gap-2 flex-wrap">
            {INACTIVITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMinutes(opt.value)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  minutes === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            마지막 활동으로부터 설정된 시간 이상 비활동 시 자동으로 휴식이 기록됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveInactivity}
          disabled={isPending || minutes === inactivityMinutes}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 사무실 IP 관리 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">사무실 IP 관리</h2>
        <p className="text-xs text-gray-400">
          등록된 IP에서 출근 시 사무실 근무로 인정됩니다. 여러 IP를 등록할 수 있습니다.
        </p>

        {/* 현재 내 IP 빠른 등록 */}
        {currentIp && (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Wifi size={14} className="text-gray-400" />
              <span>현재 접속 IP</span>
              <span className="font-mono font-medium text-gray-800">{currentIp}</span>
            </div>
            {currentIpAlreadyAdded ? (
              <span className="text-xs text-green-600 font-medium">등록됨</span>
            ) : (
              <button
                type="button"
                onClick={() => handleAddIp(currentIp)}
                disabled={isPending}
                className="text-xs px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                추가
              </button>
            )}
          </div>
        )}

        {/* 등록된 IP 목록 */}
        {ips.length > 0 ? (
          <ul className="space-y-1.5">
            {ips.map(ip => (
              <li key={ip} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 bg-gray-50/50">
                <span className="font-mono text-sm text-gray-700">{ip}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveIp(ip)}
                  disabled={isPending}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 text-center py-3">등록된 사무실 IP가 없습니다.</p>
        )}

        {/* 직접 입력 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddIp(newIp)}
            placeholder="IP 직접 입력 (예: 123.456.789.0)"
            className="flex-1 text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={() => handleAddIp(newIp)}
            disabled={isPending || !newIp.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
      </div>

      {/* Google Drive */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Google Drive</h2>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">보고서 저장 폴더 ID</label>
          <input
            type="text"
            placeholder="Google Drive 폴더 ID"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-gray-400">Drive URL에서 /folders/ 뒤의 ID를 입력하세요.</p>
        </div>
      </div>

      {/* Google Chat */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Google Chat</h2>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Webhook URL</label>
          <input
            type="url"
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-gray-400">결재 승인/반려 시 알림을 받을 Webhook URL을 입력하세요.</p>
        </div>
      </div>

    </div>
  )
}
