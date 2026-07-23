'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { encryptSSN } from '@/lib/crypto/ssn'

export type LineItem = {
  item: string
  date: string
  amount: number
  note?: string
  userName?: string
}

type SubmitExpenseInput = {
  title: string
  payee: string
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER'
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  paymentRequestDate: string
  settlementDate: string | null
  lineItems: LineItem[]
  attachmentUrls: string[]
  taxType: string | null
  evidenceType: string | null
  category?: string
  expenseType?: string
  cardCompany?: string | null
  cardNumber?: string | null
}

export async function submitExpense(input: SubmitExpenseInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const totalAmount = input.lineItems.reduce((sum, li) => sum + (li.amount ?? 0), 0)

  const { data, error } = await supabase.rpc('submit_expense_report', {
    p_title: input.title,
    p_amount: totalAmount,
    p_category: input.category ?? 'OTHER',
    p_expense_date: input.paymentRequestDate,
    p_receipt_url: null,
    p_description: null,
    p_payee: input.payee,
    p_payment_method: input.paymentMethod,
    p_bank_name: input.bankName,
    p_account_number: input.accountNumber,
    p_account_holder: input.accountHolder,
    p_payment_request_date: input.paymentRequestDate,
    p_settlement_date: input.settlementDate,
    p_line_items: input.lineItems,
    p_attachment_urls: input.attachmentUrls,
    p_tax_type: input.taxType,
    p_evidence_type: input.evidenceType,
    p_expense_type: input.expenseType ?? 'EXPENSE',
    p_card_company: input.cardCompany ?? null,
    p_card_number: input.cardNumber ?? null,
  })

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.approvalInbox)
  revalidateTag(CACHE_TAGS.expenseList)
  return { error: null, id: data as string }
}

// ─── 사업소득(원천징수) 지급요청서 ────────────────────────────────────────────

export type BusinessIncomeInput = {
  recipientName: string
  ssn: string
  grossAmount: number
  description: string
  bankName: string
  accountNumber: string
  note: string
  attachmentUrls: string[]
  paymentRequestDate: string
}

export async function submitBusinessIncomeExpense(input: BusinessIncomeInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const withholding = Math.floor(input.grossAmount * 0.033)
  const netAmount = input.grossAmount - withholding

  const lineItems: LineItem[] = [{
    item: input.description,
    date: input.paymentRequestDate,
    amount: input.grossAmount,
    note: [
      `원천징수: ${withholding.toLocaleString('ko-KR')}원`,
      `실지급: ${netAmount.toLocaleString('ko-KR')}원`,
      input.note || null,
    ].filter(Boolean).join(' / '),
  }]

  const expenseResult = await submitExpense({
    title: `사업소득 지급요청 — ${input.recipientName} (${input.paymentRequestDate})`,
    payee: input.recipientName,
    paymentMethod: 'TRANSFER',
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    accountHolder: input.recipientName,
    paymentRequestDate: input.paymentRequestDate,
    settlementDate: null,
    lineItems,
    attachmentUrls: input.attachmentUrls,
    taxType: 'WITHHOLDING_BUSINESS',
    evidenceType: null,
    category: 'BUSINESS_INCOME',
    expenseType: 'BUSINESS_INCOME',
  })

  if (expenseResult.error || !expenseResult.id) return { error: expenseResult.error ?? '제출 실패' }

  const { encrypted, iv } = encryptSSN(input.ssn)
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error: ssnError } = await admin
    .from('expense_sensitive_data')
    .insert({ expense_report_id: expenseResult.id, encrypted_ssn: encrypted, iv })

  if (ssnError) return { error: ssnError.message }

  // revalidateTag는 submitExpense 내부에서 이미 호출됨
  return { error: null, id: expenseResult.id }
}

// ─── 현금성 경품비(기타소득) 지급요청서 ──────────────────────────────────────

export type PrizeInput = {
  recipientName: string
  ssn: string | null
  prizeAmount: number
  taxPaymentType: 'SELF' | 'COMPANY' | null
  paymentMethod: 'GIFT_CARD' | 'CASH'
  giftCardEvidence: 'CORPORATE_CARD' | 'PERSONAL_CARD' | null
  giftCardCardCompany: string | null
  giftCardCardNumber: string | null
  bankName: string | null
  accountNumber: string | null
  note: string
  attachmentUrls: string[]
  paymentRequestDate: string
  isOver50k: boolean
}

export async function submitPrizeExpense(input: PrizeInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  let taxAmount = 0
  let taxType: string | null = null
  if (input.isOver50k && input.taxPaymentType) {
    if (input.taxPaymentType === 'SELF') {
      taxAmount = Math.floor(input.prizeAmount * 0.22)
      taxType = 'WITHHOLDING_OTHER_WITHOUT'
    } else {
      taxAmount = Math.floor(input.prizeAmount * 0.22 / 0.78)
      taxType = 'WITHHOLDING_OTHER_WITH'
    }
  }

  const paymentMethod = input.paymentMethod === 'CASH' ? 'TRANSFER' : 'CARD'
  const evidenceType = input.paymentMethod === 'GIFT_CARD' ? input.giftCardEvidence : null

  const noteParts = [
    input.isOver50k && input.taxPaymentType
      ? `제세공과금: ${taxAmount.toLocaleString('ko-KR')}원 (${input.taxPaymentType === 'SELF' ? '본인납부' : '대납'})`
      : null,
    input.note || null,
  ].filter(Boolean) as string[]

  const lineItems: LineItem[] = [{
    item: '경품비',
    date: input.paymentRequestDate,
    amount: input.prizeAmount,
    note: noteParts.join(' / ') || undefined,
  }]

  const expenseResult = await submitExpense({
    title: `경품비 지급요청 — ${input.recipientName} (${input.prizeAmount.toLocaleString('ko-KR')}원)`,
    payee: input.recipientName,
    paymentMethod,
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    accountHolder: input.paymentMethod === 'CASH' ? input.recipientName : null,
    paymentRequestDate: input.paymentRequestDate,
    settlementDate: null,
    lineItems,
    attachmentUrls: input.attachmentUrls,
    taxType,
    evidenceType,
    cardCompany: input.giftCardEvidence === 'PERSONAL_CARD' ? input.giftCardCardCompany ?? null : null,
    cardNumber: input.giftCardEvidence === 'PERSONAL_CARD' ? input.giftCardCardNumber ?? null : null,
    category: 'PRIZE_INCOME',
    expenseType: 'PRIZE',
  })

  if (expenseResult.error || !expenseResult.id) return { error: expenseResult.error ?? '제출 실패' }

  if (input.isOver50k && input.ssn) {
    const { encrypted, iv } = encryptSSN(input.ssn)
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error: ssnError } = await admin
      .from('expense_sensitive_data')
      .insert({ expense_report_id: expenseResult.id, encrypted_ssn: encrypted, iv })
    if (ssnError) return { error: ssnError.message }
  }

  // revalidateTag는 submitExpense 내부에서 이미 호출됨
  return { error: null, id: expenseResult.id }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function approveExpense(reportId: string, approved: boolean, comment?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { error } = await supabase.rpc('approve_expense_step', {
    p_report_id: reportId,
    p_approved: approved,
    p_comment: comment ?? null,
  })

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}
