/**
 * 입사일 기준 실발생 연차 계산 (근로기준법 제60조)
 *
 * - 1년 미만: 개근 완성 월수 + 진행 중인 월의 경과일/30 (소수점 1자리, 최대 11)
 * - 1년 이상: 15일
 * - 3년 이상: 15 + floor((근속연수 - 1) / 2), 최대 25일
 */
export function calcAnnualLeave(hiredAt: Date, asOf: Date = new Date()): number {
  // asOf 기준 완성된 근속 개월수
  let completedMonths = (asOf.getFullYear() - hiredAt.getFullYear()) * 12
                      + (asOf.getMonth() - hiredAt.getMonth())
  if (asOf.getDate() < hiredAt.getDate()) completedMonths--
  completedMonths = Math.max(completedMonths, 0)

  if (completedMonths < 12) {
    // 마지막 월 기념일 이후 경과일 / 30 으로 소수 부분 계산
    const lastAnniv = new Date(
      hiredAt.getFullYear(),
      hiredAt.getMonth() + completedMonths,
      hiredAt.getDate(),
    )
    const daysIntoMonth = Math.max(
      Math.floor((asOf.getTime() - lastAnniv.getTime()) / 86400000),
      0,
    )
    const fraction = Math.round((daysIntoMonth / 30) * 10) / 10
    return Math.min(Math.round((completedMonths + fraction) * 10) / 10, 11)
  }

  const fullYears = Math.floor(completedMonths / 12)
  if (fullYears < 3) return 15
  return Math.min(15 + Math.floor((fullYears - 1) / 2), 25)
}

/** 입사 1년 미만 여부 — 1년 미만이면 연차 소진 기산일이 입사일 기준이므로 별도 처리 필요 */
export function isUnderOneYear(hiredAt: Date, asOf: Date = new Date()): boolean {
  const anniversary = new Date(hiredAt.getFullYear() + 1, hiredAt.getMonth(), hiredAt.getDate())
  return anniversary > asOf
}

/** 연차사용촉진제도 법정 일정 (근로기준법 제61조) */
export function legalSchedule(year: number) {
  return {
    firstNoticeBy:     `${year}년 7월 10일`,   // 1차: 잔여연차 서면 통보
    planSubmitBy:      `${year}년 7월 20일`,   // 직원 사용계획 제출
    secondNoticeBy:    `${year}년 10월 10일`,  // 2차: 사용시기 지정 통보
    yearEnd:           `${year}년 12월 31일`,
  }
}

/** 공지 본문 생성 */
export function generateNoticeContent(
  type: 'FIRST' | 'SECOND',
  employeeName: string,
  year: number,
  remainingDays: number,
): string {
  const today = new Date()
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`
  const sched = legalSchedule(year)

  if (type === 'FIRST') {
    return `[${year}년 연차유급휴가 사용촉진 통보 - 1차]

수신: ${employeeName} 님

안녕하세요.

귀하의 ${year}년 미사용 연차유급휴가는 현재 ${remainingDays}일입니다.

근로기준법 제61조에 따른 연차유급휴가 사용촉진제도에 의거하여, 미사용 연차에 대한 사용 계획서를 아래 기한까지 제출하여 주시기 바랍니다.

  ▶ 잔여 연차: ${remainingDays}일
  ▶ 사용 계획서 제출 기한: ${sched.planSubmitBy}

기한 내 사용 계획서를 제출하지 않으실 경우, ${sched.secondNoticeBy}까지 사용 시기를 지정하여 별도 통보드릴 예정입니다.

지정된 기간에 연차를 사용하지 않을 경우 금전보상 의무가 면제됩니다.

${dateStr}
(주)슈퍼와이 대표이사`
  }

  return `[${year}년 연차유급휴가 사용촉진 통보 - 2차]

수신: ${employeeName} 님

안녕하세요.

1차 촉진 통보에 대한 연차 사용 계획서가 제출되지 않아, 근로기준법 제61조에 따라 아래와 같이 사용 시기를 지정하여 통보드립니다.

  ▶ 잔여 연차: ${remainingDays}일
  ▶ 지정 사용 기간: ${year}년 10월 1일 ~ ${sched.yearEnd}

지정된 기간 내에 연차를 사용하지 않을 경우 해당 연차에 대한 금전보상 의무가 면제됩니다.

${dateStr}
(주)슈퍼와이 대표이사`
}
