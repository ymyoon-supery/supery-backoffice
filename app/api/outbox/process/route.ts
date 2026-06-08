import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { insertEventForEmployee } from '@/lib/google/calendar'
import { uploadPDF } from '@/lib/google/drive'
import { sendWebhook, buildApprovalMessage } from '@/lib/google/chat'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: events, error: claimError } = await supabase.rpc('claim_outbox_batch', {
    p_batch_size: 10,
  })

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 })
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0
  let failed = 0

  for (const event of events) {
    try {
      await processEvent(supabase, event)
      await supabase.rpc('complete_outbox_event', { p_event_id: event.id })
      processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[outbox] event ${event.id} failed:`, message)
      await supabase.rpc('fail_outbox_event', {
        p_event_id: event.id,
        p_error: message,
      })
      failed++
    }
  }

  return NextResponse.json({ ok: true, processed, failed })
}

async function processEvent(supabase: Awaited<ReturnType<typeof createServiceClient>>, event: {
  id: string
  event_type: string
  payload: Record<string, unknown>
}) {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL

  switch (event.event_type) {
    case 'CALENDAR_INSERT': {
      const { employee_id, start_date, end_date, leave_type } = event.payload as {
        employee_id: string
        start_date: string
        end_date: string
        leave_type: string
      }

      const { data: emp } = await supabase
        .from('employees')
        .select('email, name')
        .eq('id', employee_id)
        .single()

      if (emp) {
        await insertEventForEmployee(emp.email, {
          summary: `[연차] ${emp.name} - ${leave_type}`,
          startDate: start_date,
          endDate: end_date,
        })
      }
      break
    }

    case 'CALENDAR_DELETE': {
      console.log(`[outbox] CALENDAR_DELETE event_id:`, event.payload.event_id)
      break
    }

    case 'DRIVE_UPLOAD': {
      const { pdf_bytes, file_name, folder_id } = event.payload as {
        pdf_bytes: number[]
        file_name: string
        folder_id?: string
      }
      await uploadPDF(new Uint8Array(pdf_bytes), file_name, folder_id)
      break
    }

    case 'CHAT_NOTIFY': {
      if (!webhookUrl) break

      const { type, request_id, report_id } = event.payload as {
        type: string
        request_id?: string
        report_id?: string
      }

      if (type === 'leave_approved' && request_id) {
        const { data: req } = await supabase
          .from('leave_requests')
          .select('leave_type, start_date, end_date, days_used, employees(name)')
          .eq('id', request_id)
          .single()

        if (req) {
          const empName = (req.employees as unknown as { name: string } | null)?.name ?? '직원'
          await sendWebhook(
            webhookUrl,
            buildApprovalMessage({
              type: 'leave_approved',
              employeeName: empName,
              detail: `${req.start_date} ~ ${req.end_date} (${req.days_used}일)`,
            }),
          )
        }
      } else if (type === 'expense_approved' && report_id) {
        const { data: rep } = await supabase
          .from('expense_reports')
          .select('title, amount, employees(name)')
          .eq('id', report_id)
          .single()

        if (rep) {
          const empName = (rep.employees as unknown as { name: string } | null)?.name ?? '직원'
          await sendWebhook(
            webhookUrl,
            buildApprovalMessage({
              type: 'expense_approved',
              employeeName: empName,
              detail: `${rep.title} — ${rep.amount.toLocaleString()}원`,
            }),
          )
        }
      }
      break
    }

    default:
      throw new Error(`Unknown event_type: ${event.event_type}`)
  }
}
