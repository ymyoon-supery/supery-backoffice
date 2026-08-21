'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { encryptSSN, encryptCardNumber } from '@/lib/crypto/ssn'
import { notifyNewRequest, notifyApprovalResult } from '@/lib/email'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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
  })

  if (error) return { error: error.message }

  const reportId = data as string

  if (input.cardNumber) {
    const { encrypted, iv } = encryptCardNumber(input.cardNumber)
    const { error: cardError } = await serviceClient()
      .from('expense_card_sensitive_data')
      .insert({ expense_report_id: reportId, encrypted_card_number: encrypted, iv })
    if (cardError) {
      await serviceClient().from('expense_reports').delete().eq('id', reportId)
      return { error: cardError.message }
    }
  }

  const { data: emp } = await supabase
    .from('employees').select('name, department_id').eq('auth_user_id', user.id).single()
  if (emp) {
    await notifyNewRequest({ requestType: '지출결의서', employeeName: emp.name, departmentId: emp.department_id, excludeAuthUserId: user.id, title: input.title })
  }

  revalidateTag(CACHE_TAGS.approvalInbox)
  revalidateTag(CACHE_TAGS.expenseList)
  return { error: null, id: reportId }
}

// ─── 경조사비 지급요청서 ──────────────────────────────────────────────────────

export type CondolenceInput = {
  title: string
  targetType: string
  targetName: string
  paymentMethod: 'TRANSFER' | 'CASH'
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  paymentRequestDate: string
  ceremonyType: string
  ceremonyDetail: string
  description: string
  amount: number
  attachmentUrls: string[]
}

export async function submitCondolenceExpense(input: CondolenceInput) {
  const lineItems: LineItem[] = [{
    item: input.description,
    date: input.paymentRequestDate,
    amount: input.amount,
    note: [
      `대상: ${input.targetType}(${input.targetName})`,
      `경조사 유형: ${input.ceremonyType}`,
      input.ceremonyDetail || null,
    ].filter(Boolean).join(' / '),
  }]

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }
  const { data: emp } = await supabase.from('employees').select('name, department_id').eq('auth_user_id', user.id).single()

  const result = await submitExpense({
    title: input.title,
    payee: input.targetName,
    paymentMethod: input.paymentMethod,
    bankName: input.bankName,
    accountNumber: input.accountNumber,
    accountHolder: input.accountHolder ?? input.targetName,
    paymentRequestDate: input.paymentRequestDate,
    settlementDate: null,
    lineItems,
    attachmentUrls: input.attachmentUrls,
    taxType: null,
    evidenceType: null,
    category: 'CONDOLENCE',
    expenseType: 'CONDOLENCE',
  })

  if (!result.error && emp) {
    await notifyNewRequest({ requestType: '경조사비 지급요청서', employeeName: emp.name, departmentId: emp.department_id, excludeAuthUserId: user.id, title: input.title })
  }

  return result
}

// ─── 사업소득(원천징수) 지급요청서 ────────────────────────────────────────────

export type BusinessIncomeInput = {
  title: string
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
    title: input.title,
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
  const { error: ssnError } = await serviceClient()
    .from('expense_sensitive_data')
    .insert({ expense_report_id: expenseResult.id, encrypted_ssn: encrypted, iv })

  if (ssnError) {
    await serviceClient().from('expense_reports').delete().eq('id', expenseResult.id)
    return { error: ssnError.message }
  }

  // revalidateTag는 submitExpense 내부에서 이미 호출됨
  return { error: null, id: expenseResult.id }
}

// ─── 현금성 경품비(기타소득) 지급요청서 ──────────────────────────────────────

export type PrizeInput = {
  title: string
  description: string
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
    item: input.description,
    date: input.paymentRequestDate,
    amount: input.prizeAmount,
    note: noteParts.join(' / ') || undefined,
  }]

  const expenseResult = await submitExpense({
    title: input.title,
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
    category: 'PRIZE_INCOME',
    expenseType: 'PRIZE',
  })

  if (expenseResult.error || !expenseResult.id) return { error: expenseResult.error ?? '제출 실패' }

  if (input.isOver50k && input.ssn) {
    const { encrypted, iv } = encryptSSN(input.ssn)
    const { error: ssnError } = await serviceClient()
      .from('expense_sensitive_data')
      .insert({ expense_report_id: expenseResult.id, encrypted_ssn: encrypted, iv })
    if (ssnError) {
      await serviceClient().from('expense_reports').delete().eq('id', expenseResult.id)
      return { error: ssnError.message }
    }
  }

  if (input.giftCardEvidence === 'PERSONAL_CARD' && input.giftCardCardNumber) {
    const { encrypted, iv } = encryptCardNumber(input.giftCardCardNumber)
    const { error: cardError } = await serviceClient()
      .from('expense_card_sensitive_data')
      .insert({ expense_report_id: expenseResult.id, encrypted_card_number: encrypted, iv })
    if (cardError) {
      await serviceClient().from('expense_reports').delete().eq('id', expenseResult.id)
      return { error: cardError.message }
    }
  }

  // revalidateTag는 submitExpense 내부에서 이미 호출됨
  return { error: null, id: expenseResult.id }
}

// ─── 재신청 (반려된 건 in-place 수정) ────────────────────────────────────────

export async function resubmitExpense(reportId: string, input: SubmitExpenseInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const totalAmount = input.lineItems.reduce((sum, li) => sum + (li.amount ?? 0), 0)

  const { error } = await supabase.rpc('resubmit_expense_report', {
    p_report_id:            reportId,
    p_title:                input.title,
    p_amount:               totalAmount,
    p_category:             input.category ?? 'OTHER',
    p_expense_date:         input.paymentRequestDate,
    p_payee:                input.payee,
    p_payment_method:       input.paymentMethod,
    p_bank_name:            input.bankName,
    p_account_number:       input.accountNumber,
    p_account_holder:       input.accountHolder,
    p_payment_request_date: input.paymentRequestDate,
    p_settlement_date:      input.settlementDate,
    p_line_items:           input.lineItems,
    p_attachment_urls:      input.attachmentUrls,
    p_tax_type:             input.taxType,
    p_evidence_type:        input.evidenceType,
    p_expense_type:         input.expenseType ?? 'EXPENSE',
    p_card_company:         input.cardCompany ?? null,
  })

  if (error) return { error: error.message }

  if (input.cardNumber) {
    const { encrypted, iv } = encryptCardNumber(input.cardNumber)
    await serviceClient().from('expense_card_sensitive_data').delete().eq('expense_report_id', reportId)
    await serviceClient().from('expense_card_sensitive_data')
      .insert({ expense_report_id: reportId, encrypted_card_number: encrypted, iv })
  }

  const { data: emp } = await supabase
    .from('employees').select('name, department_id').eq('auth_user_id', user.id).single()
  if (emp) {
    await notifyNewRequest({ requestType: '지출결의서', employeeName: emp.name, departmentId: emp.department_id, excludeAuthUserId: user.id, title: input.title })
  }

  revalidateTag(CACHE_TAGS.approvalInbox)
  revalidateTag(CACHE_TAGS.expenseList)
  return { error: null, id: reportId }
}

export async function resubmitBusinessIncomeExpense(reportId: string, input: BusinessIncomeInput) {
  const withholding = Math.floor(input.grossAmount * 0.033)
  const netAmount   = input.grossAmount - withholding

  const lineItems: LineItem[] = [{
    item:   input.description,
    date:   input.paymentRequestDate,
    amount: input.grossAmount,
    note: [
      `원천징수: ${withholding.toLocaleString('ko-KR')}원`,
      `실지급: ${netAmount.toLocaleString('ko-KR')}원`,
      input.note || null,
    ].filter(Boolean).join(' / '),
  }]

  const result = await resubmitExpense(reportId, {
    title: input.title, payee: input.recipientName, paymentMethod: 'TRANSFER',
    bankName: input.bankName, accountNumber: input.accountNumber, accountHolder: input.recipientName,
    paymentRequestDate: input.paymentRequestDate, settlementDate: null,
    lineItems, attachmentUrls: input.attachmentUrls,
    taxType: 'WITHHOLDING_BUSINESS', evidenceType: null,
    category: 'BUSINESS_INCOME', expenseType: 'BUSINESS_INCOME',
  })
  if (result.error) return result

  const { encrypted, iv } = encryptSSN(input.ssn)
  await serviceClient().from('expense_sensitive_data').delete().eq('expense_report_id', reportId)
  const { error: ssnError } = await serviceClient()
    .from('expense_sensitive_data')
    .insert({ expense_report_id: reportId, encrypted_ssn: encrypted, iv })
  if (ssnError) return { error: ssnError.message }

  return { error: null, id: reportId }
}

export async function resubmitPrizeExpense(reportId: string, input: PrizeInput) {
  let taxAmount = 0
  let taxType: string | null = null
  if (input.isOver50k && input.taxPaymentType) {
    taxAmount = input.taxPaymentType === 'SELF'
      ? Math.floor(input.prizeAmount * 0.22)
      : Math.floor(input.prizeAmount * 0.22 / 0.78)
    taxType = input.taxPaymentType === 'SELF' ? 'WITHHOLDING_OTHER_WITHOUT' : 'WITHHOLDING_OTHER_WITH'
  }

  const paymentMethod = input.paymentMethod === 'CASH' ? 'TRANSFER' : 'CARD'
  const evidenceType  = input.paymentMethod === 'GIFT_CARD' ? input.giftCardEvidence : null
  const noteParts = [
    input.isOver50k && input.taxPaymentType
      ? `제세공과금: ${taxAmount.toLocaleString('ko-KR')}원 (${input.taxPaymentType === 'SELF' ? '본인납부' : '대납'})`
      : null,
    input.note || null,
  ].filter(Boolean) as string[]

  const lineItems: LineItem[] = [{
    item: input.description, date: input.paymentRequestDate, amount: input.prizeAmount,
    note: noteParts.join(' / ') || undefined,
  }]

  const result = await resubmitExpense(reportId, {
    title: input.title, payee: input.recipientName, paymentMethod,
    bankName: input.bankName, accountNumber: input.accountNumber,
    accountHolder: input.paymentMethod === 'CASH' ? input.recipientName : null,
    paymentRequestDate: input.paymentRequestDate, settlementDate: null,
    lineItems, attachmentUrls: input.attachmentUrls,
    taxType, evidenceType,
    cardCompany: input.giftCardEvidence === 'PERSONAL_CARD' ? input.giftCardCardCompany ?? null : null,
    category: 'PRIZE_INCOME', expenseType: 'PRIZE',
  })
  if (result.error) return result

  if (input.isOver50k && input.ssn) {
    const { encrypted, iv } = encryptSSN(input.ssn)
    await serviceClient().from('expense_sensitive_data').delete().eq('expense_report_id', reportId)
    const { error: ssnError } = await serviceClient()
      .from('expense_sensitive_data')
      .insert({ expense_report_id: reportId, encrypted_ssn: encrypted, iv })
    if (ssnError) return { error: ssnError.message }
  }

  return { error: null, id: reportId }
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

  const { data: report } = await supabase
    .from('expense_reports').select('employee_id, title, created_at').eq('id', reportId).single()
  if (report) {
    await notifyApprovalResult({ employeeId: report.employee_id, requestType: '지출결의서', approved, comment, title: report.title, requestedAt: report.created_at })
  }

  revalidateTag(CACHE_TAGS.approvalInbox)
  return { error: null }
}
