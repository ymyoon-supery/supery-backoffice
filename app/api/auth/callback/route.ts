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

  // Block non-company accounts at the application layer
  if (!user.email?.endsWith('@supery.co.kr')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`)
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Only allow pre-registered employees (admin must create the account first)
  const { data: preRegistered } = await adminClient
    .from('employees')
    .select('id')
    .eq('email', user.email!)
    .is('auth_user_id', null)
    .maybeSingle()

  if (preRegistered) {
    const { error: linkError } = await adminClient
      .from('employees')
      .update({
        auth_user_id: user.id,
        avatar_url: user.user_metadata.avatar_url ?? null,
        google_user_id: user.user_metadata.sub ?? null,
      })
      .eq('id', preRegistered.id)
    if (linkError) console.error('[auth/callback] pre-registered link failed:', linkError.message)
  } else {
    // Email not pre-registered — check if already linked (returning user)
    const { data: existing } = await adminClient
      .from('employees')
      .select('id')
      .eq('email', user.email!)
      .not('auth_user_id', 'is', null)
      .maybeSingle()

    if (!existing) {
      // Not pre-registered and not a known employee — deny access
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=not_registered`)
    }

    // Returning user — refresh profile metadata
    await adminClient
      .from('employees')
      .update({
        avatar_url: user.user_metadata.avatar_url ?? null,
        google_user_id: user.user_metadata.sub ?? null,
      })
      .eq('email', user.email!)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
