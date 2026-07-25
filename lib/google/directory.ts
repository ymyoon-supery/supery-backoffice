import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/server'

function getAdminClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user.readonly',
      'https://www.googleapis.com/auth/admin.directory.group.readonly',
    ],
    subject: process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
  })
  return google.admin({ version: 'directory_v1', auth })
}

export async function syncAll(): Promise<{ synced: number; errors: number }> {
  const admin = getAdminClient()
  const supabase = await createServiceClient()

  let synced = 0
  let errors = 0
  let pageToken: string | undefined

  try {
    do {
      const res = await admin.users.list({
        domain: process.env.GOOGLE_WORKSPACE_DOMAIN,
        maxResults: 200,
        pageToken,
        projection: 'full',
        orderBy: 'email',
      })

      const users = res.data.users ?? []
      pageToken = res.data.nextPageToken ?? undefined

      for (const u of users) {
        if (!u.primaryEmail || !u.id) continue

        // Check if this employee already exists and has been manually resigned.
        // We must not overwrite is_active for resigned employees — directory-sync
        // should only control active/suspended status for employees still in the system.
        const { data: existing } = await supabase
          .from('employees')
          .select('id, resigned_at')
          .eq('email', u.primaryEmail)
          .maybeSingle()

        let error
        if (existing) {
          // Update profile fields; only sync is_active when not manually resigned
          const update: Record<string, unknown> = {
            name: u.name?.fullName ?? u.primaryEmail.split('@')[0],
            google_user_id: u.id,
            avatar_url: u.thumbnailPhotoUrl ?? null,
          }
          if (!existing.resigned_at) update.is_active = !u.suspended
          ;({ error } = await supabase.from('employees').update(update).eq('id', existing.id))
        } else {
          ;({ error } = await supabase.from('employees').insert({
            email: u.primaryEmail,
            name: u.name?.fullName ?? u.primaryEmail.split('@')[0],
            google_user_id: u.id,
            avatar_url: u.thumbnailPhotoUrl ?? null,
            is_active: !u.suspended,
          }))
        }

        if (error) {
          console.error('[directory-sync] sync error:', u.primaryEmail, error.message)
          errors++
        } else {
          synced++
        }
      }
    } while (pageToken)

    await supabase.from('cron_logs' as never).insert({
      job_name: 'directory-sync',
      status: 'SUCCESS',
      details: { synced, errors },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from('cron_logs' as never).insert({
      job_name: 'directory-sync',
      status: 'FAILED',
      details: { message },
    })
    throw err
  }

  return { synced, errors }
}
