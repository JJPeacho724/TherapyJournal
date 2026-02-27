/**
 * Performance test script — hits main API routes and logs response times.
 *
 * Usage:
 *   npm run test:perf
 *
 * Requires the dev server running at http://localhost:3000.
 * Uses the demo patient credentials for authenticated routes.
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

const BASE_URL = process.env.PERF_TEST_BASE_URL || 'http://localhost:3000'
const ITERATIONS = parseInt(process.env.PERF_TEST_ITERATIONS || '50')

const DEMO_PATIENT_EMAIL = 'test.patient@therapyjournal.local'
const DEMO_PATIENT_PASSWORD = 'TestPatient123!'

interface TimingResult {
  route: string
  method: string
  times: number[]
  errors: number
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function formatMs(ms: number): string {
  return `${Math.round(ms)}ms`
}

async function getAuthToken(): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    process.exit(1)
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ email: DEMO_PATIENT_EMAIL, password: DEMO_PATIENT_PASSWORD }),
  })

  if (!res.ok) {
    console.error('Failed to authenticate demo user. Run npm run seed:demo first.')
    process.exit(1)
  }

  const data = await res.json()
  return data.access_token
}

async function timeRequest(
  url: string,
  options: RequestInit = {}
): Promise<{ durationMs: number; ok: boolean }> {
  const start = performance.now()
  try {
    const res = await fetch(url, options)
    const durationMs = performance.now() - start
    await res.text()
    return { durationMs, ok: res.ok }
  } catch {
    return { durationMs: performance.now() - start, ok: false }
  }
}

async function runBenchmark(
  name: string,
  method: string,
  url: string,
  options: RequestInit,
  iterations: number
): Promise<TimingResult> {
  const result: TimingResult = { route: name, method, times: [], errors: 0 }

  for (let i = 0; i < iterations; i++) {
    const { durationMs, ok } = await timeRequest(url, options)
    if (ok) {
      result.times.push(durationMs)
    } else {
      result.errors++
    }
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  ${name}: ${i + 1}/${iterations}\r`)
    }
  }

  return result
}

function printResults(results: TimingResult[]) {
  console.log('\n' + '='.repeat(80))
  console.log('PERFORMANCE TEST RESULTS')
  console.log('='.repeat(80))
  console.log(`Iterations per route: ${ITERATIONS}`)
  console.log('')

  const header = ['Route', 'Method', 'Avg', 'P50', 'P95', 'P99', 'Errors'].map(h => h.padEnd(18)).join('')
  console.log(header)
  console.log('-'.repeat(header.length))

  for (const r of results) {
    if (r.times.length === 0) {
      console.log(`${r.route.padEnd(18)}${r.method.padEnd(18)}${'N/A'.padEnd(18)}${'N/A'.padEnd(18)}${'N/A'.padEnd(18)}${'N/A'.padEnd(18)}${r.errors}`)
      continue
    }

    const sorted = [...r.times].sort((a, b) => a - b)
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length

    const row = [
      r.route.padEnd(18),
      r.method.padEnd(18),
      formatMs(avg).padEnd(18),
      formatMs(percentile(sorted, 50)).padEnd(18),
      formatMs(percentile(sorted, 95)).padEnd(18),
      formatMs(percentile(sorted, 99)).padEnd(18),
      String(r.errors),
    ].join('')

    console.log(row)
  }

  console.log('\n' + '='.repeat(80))
}

async function main() {
  console.log(`Performance test: ${BASE_URL}`)
  console.log(`Iterations: ${ITERATIONS}\n`)

  console.log('Authenticating...')
  const token = await getAuthToken()
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  }

  const cookieHeader = {
    'Cookie': `sb-access-token=${token}`,
    'Content-Type': 'application/json',
  }

  const routes: Array<{
    name: string
    method: string
    url: string
    options: RequestInit
  }> = [
    {
      name: 'GET /api/journal',
      method: 'GET',
      url: `${BASE_URL}/api/journal?limit=10`,
      options: { method: 'GET', headers: cookieHeader },
    },
    {
      name: 'GET /login',
      method: 'GET',
      url: `${BASE_URL}/login`,
      options: { method: 'GET' },
    },
    {
      name: 'GET /',
      method: 'GET',
      url: `${BASE_URL}/`,
      options: { method: 'GET' },
    },
  ]

  const results: TimingResult[] = []

  for (const route of routes) {
    console.log(`\nBenchmarking: ${route.name}`)
    const result = await runBenchmark(route.name, route.method, route.url, route.options, ITERATIONS)
    results.push(result)
  }

  printResults(results)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
