'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/admin/settings', label: '기본 설정', exact: true },
  { href: '/admin/settings/groups', label: '그룹/팀 관리' },
  { href: '/admin/settings/employees', label: '직원 관리' },
  { href: '/admin/settings/home-locations', label: '재택근무지 현황' },
]

export default function SettingsTabs() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 border-b border-gray-100">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
