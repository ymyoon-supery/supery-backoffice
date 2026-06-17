'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Clock, FileText, BarChart2, Users, ClipboardList, Home,
  Bell, FilePlus, CalendarDays, Settings, Megaphone, Inbox,
  Receipt, Package, Loader2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileSidebar } from './MobileSidebarContext'

const adminNavGroups = [
  {
    label: '결재',
    items: [
      { href: '/admin/approval', label: '결재관리', icon: ClipboardList },
      { href: '/admin/documents', label: '서류/비품 관리', icon: Package },
    ],
  },
  {
    label: '근태',
    items: [
      { href: '/admin/employees', label: '출퇴근 현황', icon: Users },
      { href: '/admin/attendance', label: '근태 현황', icon: Clock },
      { href: '/admin/reports', label: '52시간 리포트', icon: BarChart2 },
    ],
  },
  {
    label: '연차',
    items: [
      { href: '/admin/leave-manual', label: '연차관리', icon: FilePlus },
      { href: '/admin/leave-promotion', label: '연차사용촉진', icon: Bell },
    ],
  },
  {
    label: '인사/급여',
    items: [
      { href: '/admin/payslip', label: '급여명세서 관리', icon: Receipt },
    ],
  },
  {
    label: '공지',
    items: [
      { href: '/admin/notices', label: '공지사항 관리', icon: Megaphone },
    ],
  },
  {
    label: '시스템',
    items: [
      { href: '/admin/settings', label: '설정', icon: Settings },
    ],
  },
]

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  exact?: boolean
  badge?: number
}

export default function Sidebar({
  role,
  position,
  pendingCount,
}: {
  role: string
  position: string | null
  pendingCount: number
}) {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const { isOpen, close } = useMobileSidebar()
  const isAdmin = role === 'ADMIN'
  const isTeamLead = position === '팀장'

  // 페이지 이동 완료 시 pending 초기화
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  function linkClass(href: string, exact = false) {
    const active = pendingHref !== null
      ? pendingHref === href
      : exact ? pathname === href : pathname.startsWith(href)
    return cn(
      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors',
      active ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50',
    )
  }

  const employeeNavGroups: { label: string | null; items: NavItem[] }[] = [
    {
      label: null,
      items: [{ href: '/', label: '홈', icon: Home, exact: true }],
    },
    {
      label: '근태',
      items: [{ href: '/attendance', label: '근태등록', icon: Clock, exact: false }],
    },
    {
      label: '연차',
      items: [
        { href: '/leave', label: '연차 사용 내역', icon: CalendarDays, exact: false },
        { href: '/approval/leave/new', label: '연차 신청', icon: FileText, exact: true },
      ],
    },
    {
      label: '신청/결재',
      items: [
        { href: '/approval/expense/new', label: '지출결의', icon: FileText, exact: true },
        { href: '/documents', label: '서류/비품 신청', icon: Package, exact: false },
        { href: '/approval/my', label: '내 신청 내역', icon: Inbox, exact: false },
        ...(isTeamLead && !isAdmin
          ? [{ href: '/approval/pending', label: '결재 대기', icon: ClipboardList, exact: false, badge: pendingCount }]
          : []),
      ],
    },
    {
      label: '급여',
      items: [{ href: '/payslip', label: '급여명세서', icon: Receipt, exact: false }],
    },
    {
      label: '공지',
      items: [{ href: '/notices', label: '공지사항', icon: Megaphone, exact: false }],
    },
  ]

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

    <aside className={cn(
      'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col transition-transform duration-300 ease-in-out',
      'md:relative md:z-auto md:w-56 md:translate-x-0 md:transition-none',
      isOpen ? 'translate-x-0' : '-translate-x-full',
    )}>
      <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">WorkSync</span>
        <button
          type="button"
          onClick={close}
          aria-label="메뉴 닫기"
          className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {employeeNavGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="pt-2 pb-0.5 px-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
              </div>
            )}
            {group.items.map(({ href, label, icon: Icon, exact, badge }) => (
              <Link
                key={href}
                href={href}
                onClick={() => { setPendingHref(href); close() }}
                className={linkClass(href, exact)}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {pendingHref === href
                  ? <Loader2 size={12} className="animate-spin text-primary" />
                  : badge != null && badge > 0
                    ? <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">{badge}</span>
                    : null
                }
              </Link>
            ))}
          </div>
        ))}

        {isAdmin && (
          <div className="mt-2 -mx-2 border-t border-gray-200">
            <div className="px-3 pt-2 pb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold text-white bg-primary/80 rounded px-1.5 py-0.5 tracking-widest uppercase">Admin</span>
            </div>
            <div className="px-2 space-y-0.5 pb-2 bg-gray-50/60">
              {adminNavGroups.map(group => (
                <div key={group.label}>
                  <div className="pt-1.5 pb-0.5 px-2">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
                  </div>
                  {group.items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => { setPendingHref(href); close() }}
                      className={linkClass(href, false)}
                    >
                      <Icon size={16} />
                      <span className="flex-1">{label}</span>
                      {pendingHref === href && <Loader2 size={12} className="animate-spin text-primary" />}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
    </>
  )
}
