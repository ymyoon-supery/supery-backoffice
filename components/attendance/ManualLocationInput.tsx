'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'

type Props = {
  onConfirm: (location: string) => void
  disabled?: boolean
}

export default function ManualLocationInput({ onConfirm, disabled }: Props) {
  const [value, setValue] = useState('')

  return (
    <div className="flex items-center gap-2">
      <MapPin size={16} className="text-gray-400 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="현장 주소 직접 입력"
        disabled={disabled}
        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => value.trim() && onConfirm(value.trim())}
        disabled={disabled || !value.trim()}
        className="text-sm px-3 py-2 bg-primary text-white rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        확인
      </button>
    </div>
  )
}
