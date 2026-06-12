'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

export type LineItem = {
  item: string
  date: string
  count: number
}

type SubmitExpenseInput = {
  title: string
  amount: number
  payee: string
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER'
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  paymentRequestDate: string
  settlementDate: string | null
  lineItems: LineItem[]
  attachmentUrls: string[]
}

export async function submitExpense(input: SubmitExpenseInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data, error } = await supabase.rpc('submit_expense_report', {
    p_title: input.title,
    p_amount: input.amount,
    p_category: 'OTHER',
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
  })

  if (error) return { error: error.message }

  revalidateTag(CACHE_TAGS.approvalInbox)
  revalidateTag(CACHE_TAGS.expenseList)
  return { error: null, id: data as string }
}

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
