import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'

export async function GET() {
  const guard = demoPModeGuard()
  if (guard) return guard

  try {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('synthetic_patients')
      .select('*')
      .order('archetype')
      .order('created_at')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ patients: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list patients', details: String(error) },
      { status: 500 }
    )
  }
}
