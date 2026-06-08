import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as never),
          )
        },
      },
    },
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const user = data.user

  // Use service role to bypass RLS — new users have no employee record yet
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error: upsertError } = await adminClient
    .from('employees')
    .upsert(
      {
        auth_user_id: user.id,
        email: user.email!,
        name: user.user_metadata.full_name ?? user.email!.split('@')[0],
        avatar_url: user.user_metadata.avatar_url ?? null,
        google_user_id: user.user_metadata.sub ?? null,
      },
      {
        onConflict: 'auth_user_id',
        ignoreDuplicates: false,
      },
    )

  if (upsertError) {
    console.error('[auth/callback] employee upsert failed:', upsertError.message)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
