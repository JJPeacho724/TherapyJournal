/**
 * Server-only Supabase service-role client for synthetic data operations.
 *
 * Creates a fresh client per call (no singleton) to avoid stale auth state
 * in the Next.js dev server's hot-reload environment.
 */

import { createClient } from '@supabase/supabase-js'

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for synthetic data operations'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
