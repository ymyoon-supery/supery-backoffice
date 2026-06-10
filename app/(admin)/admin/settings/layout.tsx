import SettingsTabs from './SettingsTabs'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">설정</h1>
      <SettingsTabs />
      {children}
    </div>
  )
}
