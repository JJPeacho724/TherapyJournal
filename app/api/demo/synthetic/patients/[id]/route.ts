import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = demoPModeGuard()
  if (guard) return guard

  const { id } = await params

  try {
    const supabase = getServiceClient()

    // Fetch synthetic patient
    const { data: patient, error: patientError } = await supabase
      .from('synthetic_patients')
      .select('*')
      .eq('id', id)
      .single()

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Fetch all journal entries + ai_extractions for this synthetic patient
    const { data: entries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('id, content, created_at, synthetic_day_index, ai_extractions(*)')
      .eq('synthetic_patient_id', id)
      .eq('is_synthetic', true)
      .order('created_at', { ascending: true })

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 })
    }

    return NextResponse.json({ patient, entries: entries ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch patient', details: String(error) },
      { status: 500 }
    )
  }
}
