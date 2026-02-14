import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Get user role to determine redirect
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      const redirectPath = profile?.role === 'therapist' 
        ? '/therapist/dashboard' 
        : next

      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // Return error page
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate user`)
}

