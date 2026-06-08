export async function sendWebhook(
  webhookUrl: string,
  message: { text: string } | { cards: unknown[] },
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chat webhook failed: ${res.status} ${body}`)
  }
}

export function buildApprovalMessage(params: {
  type: 'leave_approved' | 'expense_approved'
  employeeName: string
  detail: string
}): { text: string } {
  const emoji = params.type === 'leave_approved' ? '🌴' : '💳'
  const typeLabel = params.type === 'leave_approved' ? '연차' : '지출결의'
  return {
    text: `${emoji} *${params.employeeName}*님의 ${typeLabel} 신청이 승인되었습니다.\n${params.detail}`,
  }
}
