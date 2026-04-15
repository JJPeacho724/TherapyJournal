import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'
import { computeMetricsTimeSeries } from '@/lib/synthetic/metrics-engine'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = demoPModeGuard()
  if (guard) return guard

  const { id } = await params

  try {
    const supabase = getServiceClient()

    // Fetch entries with extractions
    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select('created_at, synthetic_day_index, ai_extractions(mood_score, anxiety_score)')
      .eq('synthetic_patient_id', id)
      .eq('is_synthetic', true)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ metrics: [] })
    }

    // Transform to metrics engine input
    const rawEntries = entries.map((e: any) => {
      const extraction = Array.isArray(e.ai_extractions)
        ? e.ai_extractions[0]
        : e.ai_extractions
      return {
        dayIndex: e.synthetic_day_index as number,
        date: e.created_at as string,
        moodScore: extraction?.mood_score ?? 5,
        anxietyScore: extraction?.anxiety_score ?? 5,
      }
    })

    const metrics = computeMetricsTimeSeries(rawEntries)

    return NextResponse.json({ metrics })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to compute metrics', details: String(error) },
      { status: 500 }
    )
  }
}
