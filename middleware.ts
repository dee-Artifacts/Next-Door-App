import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip all auth callback routes — the Supabase client handles token exchange
  // client-side (implicit flow). Running auth.getUser() here on a PKCE-default
  // server client would consume the code/verifier before the page can use it.
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  // Check is_active / is_deleted on every page navigation (skip /blocked, /api/*, homepage)
  if (user && !pathname.startsWith('/blocked') && !pathname.startsWith('/api/') && pathname !== '/') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=is_active,is_deleted`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
        }
      )
      const rows: Array<{ is_active: number | null; is_deleted: boolean | null }> = await res.json()
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0]
        if (row.is_active === 0 && !row.is_deleted) {
          // Blocked — clear session cookies and send to /blocked
          const blockedUrl = request.nextUrl.clone()
          blockedUrl.pathname = '/blocked'
          const redirectResp = NextResponse.redirect(blockedUrl)
          // Clear Supabase auth cookies so they can't bypass by navigating directly
          request.cookies.getAll()
            .filter(c => c.name.startsWith('sb-'))
            .forEach(c => redirectResp.cookies.delete(c.name))
          return redirectResp
        }
      }
    } catch {
      // If DB check fails, allow through — don't block legitimate users due to middleware errors
    }
  }

  return supabaseResponse
}

export const config = {
  // Pages only. API routes authenticate themselves (authenticate() refreshes the
  // session cookie too, or the cron secret), so running getUser() here as well
  // doubled the Auth round trips on every API call.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
