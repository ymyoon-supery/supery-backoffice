// 한국 법정 공휴일 2025~2027 (대체공휴일 포함, 매년 갱신 필요)
const HOLIDAYS: string[] = [
  // 2025
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01',
  '2025-05-05', '2025-05-06',
  '2025-05-15',
  '2025-06-06',
  '2025-08-15',
  '2025-10-03',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  '2025-10-09',
  '2025-12-25',
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01', '2026-03-02',
  '2026-05-05',
  '2026-05-24',
  '2026-06-06',
  '2026-08-15', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-10-03', '2026-10-05',
  '2026-10-09',
  '2026-12-25',
  // 2027
  '2027-01-01',
  '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
  '2027-03-01',
  '2027-05-05',
  '2027-05-13',
  '2027-06-06',
  '2027-08-15', '2027-08-16',
  '2027-10-03',
  '2027-10-14', '2027-10-15', '2027-10-16',
  '2027-10-09',
  '2027-12-25',
]

const HOLIDAY_SET = new Set(HOLIDAYS)

/** 주어진 날짜가 속한 주의 월요일(UTC 기준) 반환 */
export function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

/** 월요일이 공휴일이면 화~금 중 첫 번째 평일 반환. 모두 공휴일이면 월요일 원본 반환. */
export function getWeekLabelDate(mondayDate: Date): Date {
  for (let i = 0; i < 5; i++) {
    const d = new Date(mondayDate)
    d.setUTCDate(d.getUTCDate() + i)
    if (!HOLIDAY_SET.has(d.toISOString().slice(0, 10))) return d
  }
  return new Date(mondayDate)
}

/** "10월 20일(월)" 형식 반환 */
export function formatWeekLabel(date: Date): string {
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const names = ['일', '월', '화', '수', '목', '금', '토']
  return `${month}월 ${day}일(${names[date.getUTCDay()]})`
}

/** Date → "YYYY-MM-DD" 문자열 */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** 주어진 날짜(YYYY-MM-DD)가 평일(주말·공휴일 제외)인지 반환 */
export function isWorkday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=일, 6=토
  if (dow === 0 || dow === 6) return false
  return !HOLIDAY_SET.has(dateStr)
}
