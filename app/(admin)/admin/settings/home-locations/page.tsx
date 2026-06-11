import { createClient as createServiceClient } from '@supabase/supabase-js'
import { MapPin, ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HomeLocationsPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: employees } = await admin
    .from('employees')
    .select('id, name, home_lat, home_lng, department_id, departments(name)')
    .eq('is_active', true)
    .order('name')

  const registered = (employees ?? []).filter(e => e.home_lat && e.home_lng)
  const unregistered = (employees ?? []).filter(e => !e.home_lat || !e.home_lng)

  function mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-800">재택근무지 현황</h2>
        <span className="text-xs text-gray-400">
          등록 {registered.length}명 / 미등록 {unregistered.length}명
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium text-left bg-gray-50/50">
              <th className="px-4 py-3 w-[140px]">직원</th>
              <th className="px-4 py-3 w-[120px]">부서</th>
              <th className="px-4 py-3">GPS 좌표</th>
              <th className="px-4 py-3 w-[90px] text-center">지도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {registered.map(e => {
              const dept = e.departments as unknown as { name: string } | null
              const lat = Number(e.home_lat)
              const lng = Number(e.home_lng)
              return (
                <tr key={e.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{dept?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-green-500 shrink-0" />
                      <span className="font-mono text-xs text-gray-600">
                        {lat.toFixed(5)}, {lng.toFixed(5)}
                      </span>
                    </div>
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

            {unregistered.map(e => {
              const dept = e.departments as unknown as { name: string } | null
              return (
                <tr key={e.id} className="hover:bg-gray-50/50 opacity-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{dept?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">미등록</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-300">—</td>
                </tr>
              )
            })}

            {(employees ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">
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
