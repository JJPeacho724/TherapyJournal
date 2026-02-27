/**
 * Feature flag helpers for synthetic demo mode.
 * When DEMO_MODE is off, all /demo/* routes return 404.
 */

/** Server-side check (API routes, server components) */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
}

/** Client-side check (client components) */
export function isDemoModeClient(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
}

/** Guard for API routes — returns a 404 Response if demo mode is off */
export function demoPModeGuard(): Response | null {
  if (!isDemoMode()) {
    return new Response(JSON.stringify({ error: 'Demo mode is not enabled' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}
