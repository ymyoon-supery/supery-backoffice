'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { SuspiciousFlag } from '@/lib/attendance/detect-suspicious'

type Result = {
  empId: string
  name: string
  sampleCount: number
  flags: SuspiciousFlag[]
}

const KST_MS = 9 * 60 * 60 * 1000
function kstTime(ts: string) {
  const d = new Date(new Date(ts).getTime() + KST_MS)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const FLAG_STYLE: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border border-red-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
}

const FLAG_TYPE_LABEL: Record<string, string> = {
  MOUSE_JIGGLER: '마우스 자동화',
  IMPOSSIBLE_HOURS: '새벽 활성',
  UNIFORM_MOUSE: '균일 마우스',
}

export default function ActivityAuditClient({
  date,
  results,
  today,
}: {
  date: string
  results: Result[]
  today: string
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(null)

  const suspicious = results.filter(r => r.flags.length > 0)
  const clean = results.filter(r => r.flags.length === 0)
  const totalSamples = results.reduce((a, r) => a + r.sampleCount, 0)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">활동 패턴 분석</h1>
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => router.push(`/admin/activity-audit?date=${e.target.value}`)}
          className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      <p className="text-xs text-gray-400">
        에이전트 heartbeat 데이터 기반 자동화 도구 사용 패턴을 탐지합니다.
        분석 대상 {results.length}명 · heartbeat {totalSamples}건 ·{' '}
        <span className={suspicious.length > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
          의심 패턴 {suspicious.length}명
        </span>
      </p>

      {suspicious.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-red-700 flex items-center gap-1.5">
            <AlertTriangle size={14} /> 의심 패턴 감지됨
          </h2>
          {suspicious.map(r => (
            <div key={r.empId} className="bg-white border border-red-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === r.empId ? null : r.empId)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-red-50/40 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">{r.name}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {r.flags.map((f, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${FLAG_STYLE[f.severity]}`}>
                        {FLAG_TYPE_LABEL[f.type] ?? f.label}
                      </span>
                    ))}
                  </div>
                </div>
                {expanded === r.empId
                  ? <ChevronUp size={14} className="shrink-0 text-gray-400" />
                  : <ChevronDown size={14} className="shrink-0 text-gray-400" />}
              </button>

              {expanded === r.empId && (
                <div className="border-t border-red-50 divide-y divide-gray-50">
                  {r.flags.map((f, fi) => (
                    <div key={fi} className="px-4 py-3 space-y-2">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${FLAG_STYLE[f.severity]}`}>
                          {f.label}
                        </span>
                        <span className="text-xs text-gray-500">{f.detail}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-100">
                              <th className="text-left font-medium pr-5 pb-1">시각 (KST)</th>
                              <th className="text-left font-medium pr-5 pb-1">idle(s)</th>
                              <th className="text-left font-medium pr-5 pb-1">mouse_px</th>
                              <th className="text-left font-medium pb-1">key_count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.samples.map((s, si) => (
                              <tr key={si} className="border-b border-gray-50 last:border-0">
                                <td className="pr-5 py-1 tabular-nums text-gray-600">{kstTime(s.ts)}</td>
                                <td className="pr-5 py-1 tabular-nums text-gray-600">{s.idle}</td>
                                <td className="pr-5 py-1 tabular-nums text-gray-600">{s.mouse_px ?? '—'}</td>
                                <td className={`py-1 tabular-nums font-medium ${s.key_count === 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {s.key_count ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {clean.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
            <CheckCircle size={14} className="text-green-500" /> 정상 ({clean.length}명)
          </h2>
          <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
            {clean.map(r => (
              <div key={r.empId} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-700">{r.name}</span>
                <span className="text-xs text-gray-400">{r.sampleCount}건</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-10 text-center text-sm text-gray-400">
          이 날짜의 heartbeat 데이터가 없습니다.
        </div>
      )}
    </div>
  )
}
