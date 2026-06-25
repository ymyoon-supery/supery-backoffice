import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function EmploymentTabs({
  current,
  activeHref,
  resignedHref,
}: {
  current: 'active' | 'resigned'
  activeHref: string
  resignedHref: string
}) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
      <Link
        href={activeHref}
        className={cn(
          'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
          current === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
        )}
      >
        재직자
      </Link>
      <Link
        href={resignedHref}
        className={cn(
          'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
          current === 'resigned' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
        )}
      >
        퇴사자
      </Link>
    </div>
  )
}
