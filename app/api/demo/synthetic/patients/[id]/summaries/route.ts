import { NextResponse } from 'next/server'
import { demoPModeGuard } from '@/lib/demo-mode'
import { getServiceClient } from '@/lib/synthetic/supabase-service'
import { computeMetricsTimeSeries } from '@/lib/synthetic/metrics-engine'
import { generateWeeklySummaries } from '@/lib/synthetic/weekly-summary'
import type { EvidenceSnippetItem } from '@/types/synthetic'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = demoPModeGuard()
  if (guard) return guard

  const { id } = await params

  try {
    const supabase = getServiceClient()

    // Fetch patient + entries with extractions
    const { data: patient, error: patientError } = await supabase
      .from('synthetic_patients')
      .select('start_date')
      .eq('id', id)
      .single()

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select(
        'created_at, synthetic_day_index, ai_extractions(mood_score, anxiety_score, evidence)'
      )
      .eq('synthetic_patient_id', id)
      .eq('is_synthetic', true)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ summaries: [] })
    }

    // Build metrics and evidence map
    const rawEntries = entries.map((e: any) => {
      const extraction = Array.isArray(e.ai_extractions)
        ? e.ai_extractions[0]
        : e.ai_extractions
      return {
        dayIndex: e.synthetic_day_index as number,
        date: e.created_at as string,
        moodScore: extraction?.mood_score ?? 5,
        anxietyScore: extraction?.anxiety_score ?? 5,
        evidence: extraction?.evidence,
      }
    })

    const metrics = computeMetricsTimeSeries(
      rawEntries.map((e) => ({
        dayIndex: e.dayIndex,
        date: e.date,
        moodScore: e.moodScore,
        anxietyScore: e.anxietyScore,
      }))
    )

    // Build evidence-by-day map from stored evidence
    const evidenceByDay = new Map<number, EvidenceSnippetItem[]>()
    for (const entry of rawEntries) {
      if (entry.evidence?.mood_score) {
        const snippets: EvidenceSnippetItem[] = entry.evidence.mood_score.map(
          (ev: any) => ({
            quote: ev.quote || '',
            theme: ev.rationale?.replace('Supports ', '').replace(' theme', '') || 'general',
          })
        )
        evidenceByDay.set(entry.dayIndex, snippets)
      }
    }

    const summaries = generateWeeklySummaries(
      metrics,
      evidenceByDay,
      patient.start_date
    )

    return NextResponse.json({ summaries })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate summaries', details: String(error) },
      { status: 500 }
    )
  }
}
