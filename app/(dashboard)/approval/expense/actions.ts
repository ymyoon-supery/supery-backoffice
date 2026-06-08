'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache/tags'

type SubmitExpenseInput = {
  title: string
  amount: number
  category: string
  expenseDate: string
  receiptUrl: string | null
  description: string | null
}

export async function submitExpense(input: SubmitExpenseInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data, error } = await supabase.rpc('submit_expense_report', {
    p_title: input.title,
    p_amount: input.amount,
    p_category: input.category,
    p_expense_date: input.expenseDate,
    p_receipt_url: input.receiptUrl,
    p_description: input.description,
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
