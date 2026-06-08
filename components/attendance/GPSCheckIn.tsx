'use client'

import { useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import ManualLocationInput from './ManualLocationInput'

type Props = {
  onLocation: (data: { location: string; latitude: number; longitude: number }) => void
  disabled?: boolean
}

export default function GPSCheckIn({ onLocation, disabled }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)

  async function handleGPS() {
    setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setShowManual(true)
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(
            `/api/geocode?lat=${latitude}&lng=${longitude}`,
          )
          const data = await res.json()
          onLocation({
            location: data.address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            latitude,
            longitude,
          })
        } catch {
          onLocation({
            location: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            latitude,
            longitude,
          })
        } finally {
          setLoading(false)
        }
      },
      (err) => {
        console.warn('[GPS] denied:', err.message)
        setError('GPS 권한이 거부되었습니다.')
        setShowManual(true)
        setLoading(false)
      },
      { timeout: 10000, maximumAge: 30000 },
    )
  }

  if (showManual) {
    return (
      <div className="space-y-2">
        {error && <p className="text-xs text-red-500">{error}</p>}
        <ManualLocationInput
          onConfirm={(location) =>
            onLocation({ location, latitude: 0, longitude: 0 })
          }
          disabled={disabled}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleGPS}
      disabled={disabled || loading}
      className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <MapPin size={16} className="text-primary" />
      )}
      {loading ? 'GPS 확인 중...' : '현장 위치 가져오기'}
    </button>
  )
}
