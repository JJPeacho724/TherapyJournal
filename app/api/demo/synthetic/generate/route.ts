import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'
import { generateCohort } from '@/lib/synthetic/cohort-generator'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const guard = demoPModeGuard()
  if (guard) return guard

  try {
    const body = await request.json()
    const patientsPerArchetype = Number(body.patientsPerArchetype) || 2
    const days = Number(body.days) || 45

    const supabase = getServiceClient()
    const result = await generateCohort(supabase, patientsPerArchetype, days)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Cohort generation failed:', error)
    return NextResponse.json(
      { error: 'Cohort generation failed', details: String(error) },
      { status: 500 }
    )
  }
}
