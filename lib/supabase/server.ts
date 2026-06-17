import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const opts = (options ?? {}) as Record<string, unknown>
              cookieStore.set(name, value, {
                ...options,
                maxAge: typeof opts.maxAge === 'number' ? opts.maxAge : 60 * 60 * 24 * 365,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              } as never)
            })
          } catch {
            // setAll called from Server Component — safe to ignore
          }
        },
      },
    },
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const opts = (options ?? {}) as Record<string, unknown>
              cookieStore.set(name, value, {
                ...options,
                maxAge: typeof opts.maxAge === 'number' ? opts.maxAge : 60 * 60 * 24 * 365,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              } as never)
            })
          } catch {}
        },
      },
    },
  )
}
