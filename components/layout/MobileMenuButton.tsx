'use client'

import { Menu } from 'lucide-react'
import { useMobileSidebar } from './MobileSidebarContext'

export default function MobileMenuButton() {
  const { open } = useMobileSidebar()
  return (
    <button
      type="button"
      onClick={open}
      aria-label="메뉴 열기"
      className="md:hidden flex-shrink-0 p-2 -ml-1 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <Menu size={20} />
    </button>
  )
}
