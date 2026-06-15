const DEPT_ORDER: Record<string, number> = {
  '1팀': 1,
  '2팀': 2,
  '3팀': 3,
  '커머스팀': 4,
}

const RANK_ORDER: Record<string, number> = {
  '부장': 1,
  '차장': 2,
  '과장': 3,
  '대리': 4,
  '사원': 5,
}

interface SortableEmployee {
  departmentName: string | null
  position: string | null
  rank: string | null
  hiredAt: string | null
}

export function sortEmployees<T extends SortableEmployee>(employees: T[]): T[] {
  return [...employees].sort((a, b) => {
    // 대표(position=null or dept='대표') comes first
    const repA = (a.position === null || a.departmentName === '대표') ? 0 : 1
    const repB = (b.position === null || b.departmentName === '대표') ? 0 : 1
    if (repA !== repB) return repA - repB

    // Department order: 1팀→2팀→3팀→커머스팀→기타
    const deptA = DEPT_ORDER[a.departmentName ?? ''] ?? 99
    const deptB = DEPT_ORDER[b.departmentName ?? ''] ?? 99
    if (deptA !== deptB) return deptA - deptB

    // Position: 팀장 before 팀원
    const posA = a.position === '팀장' ? 0 : 1
    const posB = b.position === '팀장' ? 0 : 1
    if (posA !== posB) return posA - posB

    // Rank: 부장 > 차장 > 과장 > 대리 > 사원
    const rankA = RANK_ORDER[a.rank ?? ''] ?? 99
    const rankB = RANK_ORDER[b.rank ?? ''] ?? 99
    if (rankA !== rankB) return rankA - rankB

    // Hired date ascending
    const dateA = a.hiredAt ? new Date(a.hiredAt).getTime() : Infinity
    const dateB = b.hiredAt ? new Date(b.hiredAt).getTime() : Infinity
    return dateA - dateB
  })
}
