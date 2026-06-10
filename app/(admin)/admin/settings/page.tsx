export default function AdminSettingsPage() {
  return (
    <div className="max-w-lg space-y-6">
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

      <button
        type="button"
        className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
      >
        저장
      </button>
    </div>
  )
}
