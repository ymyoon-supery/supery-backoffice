'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateInactivityMinutes } from './actions'

const INACTIVITY_OPTIONS = [
  { value: 10, label: '10분' },
  { value: 15, label: '15분 (기본)' },
  { value: 20, label: '20분' },
  { value: 30, label: '30분' },
]

export default function GeneralSettingsClient({
  inactivityMinutes,
}: {
  inactivityMinutes: number
}) {
  const [minutes, setMinutes] = useState(inactivityMinutes)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await updateInactivityMinutes(minutes)
      if (res.error) { toast.error(res.error); return }
      toast.success('설정이 저장되었습니다.')
    })
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* 근태 설정 */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">근태 설정</h2>
        <div className="space-y-1">
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
          <p className="text-xs text-gray-400 pt-1">
            마지막 활동으로부터 설정된 시간 이상 비활동 시 자동으로 휴식이 기록됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || minutes === inactivityMinutes}
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>
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
