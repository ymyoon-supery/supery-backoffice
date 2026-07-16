export default function Loading() {
  return (
    <div className="max-w-2xl space-y-4 animate-pulse">
      <div className="h-7 w-32 bg-gray-200 rounded-lg" />

      {/* Tab pills */}
      <div className="flex gap-1 flex-wrap">
        {[80, 56, 80, 80, 80].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-gray-200" style={{ width: w }} />
        ))}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {[48, 48, 48, 80].map((w, i) => (
          <div key={i} className="h-6 rounded-full bg-gray-100" style={{ width: w }} />
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-32 bg-gray-100 rounded" />
              </div>
              <div className="h-6 w-12 bg-gray-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
