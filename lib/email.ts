import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}
const FROM = process.env.EMAIL_FROM ?? 'Supery <noreply@supery.co.kr>'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getAuthEmail(authUserId: string): Promise<string | null> {
  const { data } = await db().auth.admin.getUserById(authUserId)
  return data.user?.email ?? null
}

async function getAdminEmails(): Promise<string[]> {
  const { data } = await db()
    .from('employees')
    .select('auth_user_id')
    .eq('role', 'ADMIN')
    .eq('is_active', true)
  if (!data?.length) return []
  const emails = await Promise.all(data.map(e => getAuthEmail(e.auth_user_id)))
  return emails.filter((e): e is string => !!e)
}

async function getTeamLeadEmail(departmentId: string | null): Promise<string | null> {
  if (!departmentId) return null
  const { data } = await db()
    .from('employees')
    .select('auth_user_id')
    .eq('department_id', departmentId)
    .eq('position', '팀장')
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return null
  return getAuthEmail(data.auth_user_id)
}

async function getSupplyManagerEmail(): Promise<string | null> {
  const { data: settings } = await db()
    .from('company_settings')
    .select('supply_manager_id')
    .single()
  if (!settings?.supply_manager_id) return null
  const { data: emp } = await db()
    .from('employees')
    .select('auth_user_id')
    .eq('id', settings.supply_manager_id)
    .single()
  if (!emp) return null
  return getAuthEmail(emp.auth_user_id)
}

async function getEmployeeEmailById(employeeId: string): Promise<string | null> {
  const { data } = await db()
    .from('employees')
    .select('auth_user_id')
    .eq('id', employeeId)
    .single()
  if (!data) return null
  return getAuthEmail(data.auth_user_id)
}

export type RequestType = '지출결의서' | '연차신청' | '비품/소모품 신청' | '서류신청'

// 신청 시 → 결재자에게 알림
// isSupply=true: 총무팀장+관리자 / false: 팀장+관리자
// excludeAuthUserId: 신청자 본인 이메일 제외 (팀장이 직접 신청하는 경우)
export async function notifyNewRequest({
  requestType,
  employeeName,
  departmentId,
  isSupply = false,
  excludeAuthUserId,
}: {
  requestType: RequestType
  employeeName: string
  departmentId: string | null
  isSupply?: boolean
  excludeAuthUserId?: string
}) {
  try {
    const [adminEmails, approverEmail, excludeEmail] = await Promise.all([
      getAdminEmails(),
      isSupply ? getSupplyManagerEmail() : getTeamLeadEmail(departmentId),
      excludeAuthUserId ? getAuthEmail(excludeAuthUserId) : null,
    ])

    const to = [...new Set([...adminEmails, approverEmail].filter((e): e is string => !!e && e !== excludeEmail))]
    if (!to.length) return

    await getResend().emails.send({
      from: FROM,
      to,
      subject: `[결재 요청] ${employeeName}님의 ${requestType}이 접수되었습니다`,
      html: newRequestHtml(requestType, employeeName),
    })
  } catch {
    // 이메일 실패가 메인 액션에 영향 없음
  }
}

// 결재 결과 → 신청자에게 알림
export async function notifyApprovalResult({
  employeeId,
  requestType,
  approved,
  isFinal = false,
  comment,
}: {
  employeeId: string
  requestType: RequestType
  approved: boolean
  isFinal?: boolean
  comment?: string | null
}) {
  try {
    const email = await getEmployeeEmailById(employeeId)
    if (!email) return

    const subject = approved
      ? `[결재 ${isFinal ? '최종 ' : ''}승인] ${requestType}`
      : `[결재 반려] ${requestType}`

    await getResend().emails.send({
      from: FROM,
      to: email,
      subject,
      html: approvalResultHtml(requestType, approved, isFinal, comment),
    })
  } catch {
    // 이메일 실패가 메인 액션에 영향 없음
  }
}

// ─── HTML Templates ───────────────────────────────────────────────────────────

function emailWrapper(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:560px">
      <tr><td style="background:#111827;padding:20px 32px">
        <span style="color:#ffffff;font-size:18px;font-weight:700">Supery</span>
        <span style="color:#9ca3af;font-size:13px;margin-left:8px">결재 알림</span>
      </td></tr>
      <tr><td style="padding:32px">
        <h2 style="margin:0 0 20px;font-size:19px;color:#111827;font-weight:700">${title}</h2>
        ${body}
      </td></tr>
      <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:12px;color:#9ca3af">이 메일은 Supery 백오피스에서 자동 발송되었습니다.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

function newRequestHtml(requestType: RequestType, employeeName: string) {
  return emailWrapper(`새 ${requestType} 결재 요청`, `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">
      <strong style="color:#111827">${employeeName}</strong>님이 새로운
      <strong style="color:#111827">${requestType}</strong>을 제출했습니다.
      결재를 진행해 주세요.
    </p>
    <div style="background:#f3f4f6;border-radius:6px;padding:16px 20px;margin-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="4">
        <tr>
          <td style="font-size:13px;color:#6b7280;width:80px;padding:4px 0">신청 유형</td>
          <td style="font-size:13px;color:#111827;font-weight:600;padding:4px 0">${requestType}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b7280;padding:4px 0">신청자</td>
          <td style="font-size:13px;color:#111827;padding:4px 0">${employeeName}</td>
        </tr>
      </table>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af">Supery 백오피스 결재 관리 메뉴에서 확인하실 수 있습니다.</p>
  `)
}

function approvalResultHtml(
  requestType: RequestType,
  approved: boolean,
  isFinal: boolean,
  comment?: string | null,
) {
  const color = approved ? '#059669' : '#dc2626'
  const bg = approved ? '#ecfdf5' : '#fef2f2'
  const statusText = approved
    ? (isFinal ? '최종 승인되었습니다' : '승인되었습니다')
    : '반려되었습니다'

  return emailWrapper(`${requestType} 결재 결과`, `
    <div style="background:${bg};border-left:4px solid ${color};border-radius:0 6px 6px 0;padding:14px 18px;margin-bottom:20px">
      <p style="margin:0;font-size:15px;color:${color};font-weight:600">
        ${requestType}이 ${statusText}.
      </p>
    </div>
    ${comment ? `
    <div style="background:#f9fafb;border-radius:6px;padding:16px 20px;margin-bottom:20px;border:1px solid #e5e7eb">
      <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;font-weight:600">결재 의견</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">${comment}</p>
    </div>` : ''}
    <p style="margin:0;font-size:13px;color:#9ca3af">Supery 백오피스에서 신청 내역을 확인하세요.</p>
  `)
}
