'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Clock,
  FileText,
  BarChart2,
  Settings,
  Users,
  ClipboardList,
  Home,
  Bell,
  FilePlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const employeeNav = [
  { href: '/', label: '홈', icon: Home },
  { href: '/attendance', label: '근태 기록', icon: Clock },
  { href: '/leave', label: '내 연차', icon: FileText },
  { href: '/approval/leave/new', label: '연차 신청', icon: FileText },
  { href: '/approval/expense/new', label: '지출결의', icon: FileText },
  { href: '/approval/inbox', label: '결재함', icon: ClipboardList },
]

const adminNav = [
  { href: '/admin/attendance', label: '근태 관리', icon: Clock },
  { href: '/admin/reports', label: '리포트', icon: BarChart2 },
  { href: '/admin/employees', label: '직원 상태', icon: Users },
  { href: '/admin/leave-promotion', label: '연차사용촉진', icon: Bell },
  { href: '/admin/leave-manual', label: '연차 관리', icon: FilePlus },
  { href: '/admin/settings', label: '설정', icon: Settings },
]

export default function Sidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const isAdmin = role === 'ADMIN'

  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
      <div className="h-14 flex items-center px-5 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">WorkSync</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {employeeNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                관리자
              </span>
            </div>
            {adminNav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}
