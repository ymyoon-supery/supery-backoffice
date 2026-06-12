'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Clock,
  FileText,
  BarChart2,
  Users,
  ClipboardList,
  Home,
  Bell,
  FilePlus,
  CalendarDays,
  Settings,
  Megaphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const employeeNavBase = [
  { href: '/', label: '홈', icon: Home },
  { href: '/attendance', label: '근태등록', icon: Clock },
  { href: '/leave', label: '연차 사용 내역', icon: CalendarDays },
  { href: '/approval/leave/new', label: '연차 신청', icon: FileText },
  { href: '/approval/expense/new', label: '지출결의', icon: FileText },
  { href: '/notices', label: '공지사항', icon: Megaphone },
]

const inboxNav = { href: '/approval/inbox', label: '결재함', icon: ClipboardList }

const adminNav = [
  { href: '/admin/approval', label: '결재함', icon: ClipboardList },
  { href: '/admin/employees', label: '출퇴근 현황', icon: Users },
  { href: '/admin/attendance', label: '근태 현황', icon: Clock },
  { href: '/admin/reports', label: '52시간 리포트', icon: BarChart2 },
  { href: '/admin/leave-manual', label: '연차관리', icon: FilePlus },
  { href: '/admin/leave-promotion', label: '연차사용촉진', icon: Bell },
  { href: '/admin/notices', label: '공지사항 관리', icon: Megaphone },
  { href: '/admin/settings', label: '설정', icon: Settings },
]

export default function Sidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const isAdmin = role === 'ADMIN'
  const employeeNav = isAdmin ? employeeNavBase : [...employeeNavBase, inboxNav]

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
