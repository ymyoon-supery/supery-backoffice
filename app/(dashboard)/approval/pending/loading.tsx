export default function Loading() {
  return (
    <div className="max-w-2xl space-y-4 animate-pulse">
      <div className="h-7 w-24 bg-gray-200 rounded-lg" />

      {/* View tabs (미결재 / 결재완료) */}
      <div className="flex gap-1">
        {[72, 80].map((w, i) => (
          <div key={i} className="h-9 rounded-lg bg-gray-200" style={{ width: w }} />
        ))}
      </div>

      {/* Type sub-tabs */}
      <div className="flex gap-1 flex-wrap">
        {[48, 48, 72, 72].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-gray-100" style={{ width: w }} />
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-14 bg-gray-100 rounded-lg" />
                <div className="h-8 w-14 bg-gray-100 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
