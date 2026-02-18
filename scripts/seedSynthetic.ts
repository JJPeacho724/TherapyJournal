/**
 * Seed script for synthetic demo data.
 *
 * Usage:
 *   pnpm seed:synthetic
 *   npx tsx scripts/seedSynthetic.ts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { generateCohort, resetSyntheticData } from '../lib/synthetic/cohort-generator'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const args = process.argv.slice(2)
  const shouldReset = args.includes('--reset')
  const patientsPerArchetype = Number(args.find(a => a.startsWith('--patients='))?.split('=')[1]) || 2
  const days = Number(args.find(a => a.startsWith('--days='))?.split('=')[1]) || 45

  if (shouldReset) {
    console.log('Resetting existing synthetic data...')
    const resetResult = await resetSyntheticData(supabase)
    if (!resetResult.success) {
      console.error('Reset failed:', resetResult.error)
      process.exit(1)
    }
    console.log('Reset complete.')
  }

  console.log(`Generating cohort: ${patientsPerArchetype} patients/archetype, ${days} days each...`)
  console.log(`Total: ${6 * patientsPerArchetype} patients, ~${6 * patientsPerArchetype * days} entries`)

  const result = await generateCohort(supabase, patientsPerArchetype, days)

  if (result.success) {
    console.log(`Done! Created ${result.patientsCreated} patients with ${result.entriesCreated} entries.`)
  } else {
    console.error('Generation failed:', result)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Seed script error:', err)
  process.exit(1)
})
