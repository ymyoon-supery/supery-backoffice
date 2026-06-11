import { createClient as createServiceClient } from '@supabase/supabase-js'
import { MapPin, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function fetchKoreanAddress(lat: number, lng: number): Promise<string> {
  const apiKey = process.env.KAKAO_REST_API_KEY
  if (!apiKey) return ''
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${apiKey}` }, cache: 'no-store' },
    )
    if (!res.ok) return ''
    const data = await res.json()
    const doc = data.documents?.[0]
    if (!doc) return ''
    // address(지번) 우선, 없으면 road_address(도로명)로 fallback
    const r1 = doc.address?.region_1depth_name ?? doc.road_address?.region_1depth_name ?? ''
    const r2 = doc.address?.region_2depth_name ?? doc.road_address?.region_2depth_name ?? ''
    const r3 = doc.address?.region_3depth_name ?? ''
    return [r1, r2, r3].filter(Boolean).join(' ')
  } catch {
    return ''
  }
}

export default async function HomeLocationsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [{ data: employees, error }, { data: depts }] = await Promise.all([
    admin.from('employees')
      .select('id, name, home_lat, home_lng, department_id')
      .eq('is_active', true)
      .order('name'),
    admin.from('departments').select('id, name'),
  ])

  if (error) {
    console.error('[home-locations] query error:', error)
  }

  const deptMap = new Map((depts ?? []).map(d => [d.id, d.name as string]))

  const registered = (employees ?? []).filter(e => e.home_lat != null && e.home_lng != null)
  const unregistered = (employees ?? []).filter(e => e.home_lat == null || e.home_lng == null)

  // 등록된 직원의 GPS 좌표를 한국 주소로 변환 (병렬 요청)
  const addressResults = await Promise.all(
    registered.map(e => fetchKoreanAddress(Number(e.home_lat), Number(e.home_lng)))
  )
  const addressMap = new Map(registered.map((e, i) => [e.id, addressResults[i]]))

  function mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-800">재택근무지 현황</h2>
        <span className="text-xs text-gray-400">
          등록 {registered.length}명 / 미등록 {unregistered.length}명
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-mono">
          쿼리 오류: {error.message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium text-left bg-gray-50/50">
              <th className="px-4 py-3 w-[130px]">직원</th>
              <th className="px-4 py-3 w-[110px]">부서</th>
              <th className="px-4 py-3 w-[170px]">GPS 좌표</th>
              <th className="px-4 py-3">주소 (시구군동)</th>
              <th className="px-4 py-3 w-[80px] text-center">지도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {registered.map(e => {
              const lat = Number(e.home_lat)
              const lng = Number(e.home_lng)
              return (
                <tr key={e.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{deptMap.get(e.department_id) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-green-500 shrink-0" />
                      <span className="font-mono text-xs text-gray-600">
                        {lat.toFixed(5)}, {lng.toFixed(5)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {addressMap.get(e.id) || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={mapsUrl(lat, lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      보기 <ExternalLink size={11} />
                    </a>
                  </td>
                </tr>
              )
            })}

            {unregistered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50/50 opacity-50">
                <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{deptMap.get(e.department_id) ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">미등록</td>
                <td className="px-4 py-3 text-xs text-gray-300">—</td>
                <td className="px-4 py-3 text-center text-xs text-gray-300">—</td>
              </tr>
            ))}

            {(employees ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  직원 정보가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
