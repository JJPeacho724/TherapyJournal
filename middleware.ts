import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Always bypass Next internals and static assets.
  // If middleware touches these (especially `/_next/webpack-hmr`), Next dev can break in confusing ways.
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:css|js|map|txt|xml|ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  // HTTPS enforcement in production
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('x-forwarded-proto') === 'http'
  ) {
    const httpsUrl = new URL(request.url)
    httpsUrl.protocol = 'https:'
    return NextResponse.redirect(httpsUrl, 301)
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Demo mode gate: /demo/* and /api/demo/* return 404 when DEMO_MODE is not 'true'
  // Use NEXT_PUBLIC_ prefix because middleware runs in Edge Runtime where
  // only NEXT_PUBLIC_ env vars from .env.local are automatically available.
  const isDemoRoute = pathname.startsWith('/demo') || pathname.startsWith('/api/demo')
  if (isDemoRoute && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return new NextResponse(null, { status: 404 })
  }
  // Demo routes don't require authentication — skip auth checks
  if (isDemoRoute) {
    return response
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/signup', '/api/auth/callback']
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith('/api/auth/')
  )

  // If not authenticated and trying to access protected route
  if (!session && !isPublicRoute) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    if (sessionError) {
      redirectUrl.searchParams.set('reason', 'session_expired')
    }
    return NextResponse.redirect(redirectUrl)
  }

  // If authenticated and trying to access auth pages
  if (session && (pathname === '/login' || pathname === '/signup')) {
    // Get user role to redirect to appropriate dashboard
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const redirectPath = profile?.role === 'therapist' 
      ? '/therapist/dashboard' 
      : '/dashboard'
    
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/ (Next internals, including static + HMR endpoints)
     * - favicon.ico (favicon file)
     * - common static files
     */
    '/((?!_next/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:css|js|map|txt|xml|ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot)$).*)',
  ],
}

