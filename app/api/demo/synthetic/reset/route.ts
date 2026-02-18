import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'
import { resetSyntheticData } from '@/lib/synthetic/cohort-generator'

export async function DELETE() {
  const guard = demoPModeGuard()
  if (guard) return guard

  try {
    const supabase = getServiceClient()
    const result = await resetSyntheticData(supabase)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Synthetic data reset failed:', error)
    return NextResponse.json(
      { error: 'Reset failed', details: String(error) },
      { status: 500 }
    )
  }
}
