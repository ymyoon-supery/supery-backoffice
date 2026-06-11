'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Home, MapPin, RefreshCw, Clock } from 'lucide-react'
import { registerHomeLocation, createHomeLocationRequest } from '@/app/(dashboard)/attendance/actions'

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    })
  )
}

type PendingRequest = {
  id: string
  lat: number
  lng: number
  locationName: string | null
  createdAt: string
}

export default function HomeLocationCard({
  initialLocation,
  initialPendingRequest = null,
}: {
  initialLocation: { lat: number; lng: number } | null
  initialPendingRequest?: PendingRequest | null
}) {
  const [location, setLocation] = useState(initialLocation)
  const [pendingReq, setPendingReq] = useState<PendingRequest | null>(initialPendingRequest)
  const [isPending, startTransition] = useTransition()

  function handleAction() {
    if (!navigator.geolocation) {
      toast.error('이 브라우저는 위치 서비스를 지원하지 않습니다.')
      return
    }
    startTransition(async () => {
      let position: GeolocationPosition
      try {
        position = await getCurrentPosition()
      } catch {
        toast.error('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.')
        return
      }

      const lat = position.coords.latitude
      const lng = position.coords.longitude

      if (location) {
        const res = await createHomeLocationRequest(lat, lng)
        if (res.error) { toast.error(res.error); return }
        setPendingReq({ id: '', lat, lng, locationName: null, createdAt: new Date().toISOString() })
        toast.success('재택근무지 변경 신청이 접수되었습니다. 관리자 승인 후 반영됩니다.')
      } else {
        const res = await registerHomeLocation(lat, lng)
        if (res.error) { toast.error(res.error); return }
        setLocation({ lat, lng })
        setPendingReq(null)
        toast.success('재택근무지가 등록되었습니다.')
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">재택근무지</span>
        </div>
        <button
          type="button"
          onClick={handleAction}
          disabled={isPending || (!!pendingReq && !!location)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
          {location ? '변경 신청' : '현재 위치로 등록'}
        </button>
      </div>

      {pendingReq ? (
        <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
          <Clock size={13} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-700">변경 신청 검토 중</p>
            {pendingReq.locationName && (
              <p className="text-xs text-amber-600 truncate">{pendingReq.locationName}</p>
            )}
          </div>
          <span className="text-xs text-amber-500 shrink-0">관리자 승인 대기</span>
        </div>
      ) : location ? (
        <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
          <MapPin size={13} className="text-green-500 shrink-0" />
          <span className="text-xs text-green-700 font-mono">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </span>
          <span className="text-xs text-green-600 ml-auto">등록됨</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-1">
          재택근무지가 등록되지 않았습니다. 위치를 등록해야 재택 출근이 가능합니다.
        </p>
      )}
    </div>
  )
}
