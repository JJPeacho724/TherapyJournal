/**
 * Server-only Supabase service-role client for synthetic data operations.
 *
 * Does NOT use cookies or browser context. Uses the service role key
 * which bypasses RLS — appropriate for demo data management only.
 *
 * Uses `any` for the Database generic to allow operations on tables
 * not present in the auto-generated types (synthetic_patients,
 * clinician_feedback, new columns on journal_entries).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getServiceClient(): SupabaseClient<any> {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for synthetic data operations'
    )
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return client
}
