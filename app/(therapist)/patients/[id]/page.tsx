import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { MoodTimeline, SymptomChart, SleepCorrelation } from '@/components/charts'
import { MoodBadge, JournalCard } from '@/components/journal'
import { CrisisBanner } from '@/components/shared'
import type { MoodDataPoint, SymptomFrequency, SleepMoodCorrelation, JournalEntry } from '@/types'
import { interpretGAD7, interpretPHQ9, getReliableChangeIndex } from '@/lib/clinical-scales'

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: patientId } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createServerSupabaseClient()

  // Verify therapist has access to this patient
  const { data: relationship } = await supabase
    .from('patient_therapist')
    .select('patient_id')
    .eq('therapist_id', profile.id)
    .eq('patient_id', patientId)
    .single()

  if (!relationship) {
    notFound()
  }

  // Log access for HIPAA compliance
  await supabase.from('access_logs').insert({
    therapist_id: profile.id,
    patient_id: patientId,
    action: 'viewed_patient_detail',
  })

  // Get patient profile
  const { data: patient } = await supabase
    .from('profiles')
    .select('id, full_name, created_at')
    .eq('id', patientId)
    .single()

  if (!patient) {
    notFound()
  }

  // Get shared journal entries
  const { data: entries } = await supabase
    .from('journal_entries')
    .select(`
      *,
      structured_log:structured_logs(*),
      ai_extraction:ai_extractions(*)
    `)
    .eq('patient_id', patientId)
    .eq('shared_with_therapist', true)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(30)

  // Helper to get extraction data (handles both array and object returns from Supabase)
  const getExtraction = (e: NonNullable<typeof entries>[number]) => {
    if (!e.ai_extraction) return null
    return Array.isArray(e.ai_extraction) ? e.ai_extraction[0] : e.ai_extraction
  }
  
  const getStructuredLog = (e: NonNullable<typeof entries>[number]) => {
    if (!e.structured_log) return null
    return Array.isArray(e.structured_log) ? e.structured_log[0] : e.structured_log
  }

  // Transform entries
  const journalEntries: JournalEntry[] = (entries || []).map(entry => ({
    ...entry,
    structured_log: getStructuredLog(entry),
    ai_extraction: getExtraction(entry),
  }))

  // Get crisis alerts
  const { data: crisisAlerts } = await supabase
    .from('crisis_alerts')
    .select('*')
    .eq('patient_id', patientId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })

  // Process data for charts
  const moodData: MoodDataPoint[] = (entries || [])
    .filter(e => getExtraction(e)?.mood_score)
    .map(e => {
      const extraction = getExtraction(e)!
      return {
        date: e.created_at,
        mood: extraction.mood_score!,
        anxiety: extraction.anxiety_score || 5,
      }
    })
    .reverse()

  // Aggregate symptoms
  const symptomMap = new Map<string, number>()
  ;(entries || []).forEach(e => {
    const extraction = getExtraction(e)
    const symptoms = extraction?.symptoms || []
    symptoms.forEach((s: string) => {
      symptomMap.set(s, (symptomMap.get(s) || 0) + 1)
    })
  })
  const symptomData: SymptomFrequency[] = Array.from(symptomMap.entries())
    .map(([symptom, count]) => ({ symptom, count }))

  // Sleep-mood correlation
  const sleepMoodData: SleepMoodCorrelation[] = (entries || [])
    .filter(e => getExtraction(e)?.mood_score && getStructuredLog(e)?.sleep_hours)
    .map(e => {
      const extraction = getExtraction(e)!
      const log = getStructuredLog(e)!
      return {
        sleep_hours: log.sleep_hours!,
        mood: extraction.mood_score!,
      }
    })

  // Stats
  const totalEntries = entries?.length || 0
  const avgMood = moodData.length > 0 
    ? Math.round(moodData.reduce((sum, d) => sum + d.mood, 0) / moodData.length * 10) / 10
    : null

  const latestExtraction = journalEntries.find((e) => e.ai_extraction)?.ai_extraction ?? null
  const phq9Latest = typeof latestExtraction?.phq9_estimate === 'number' ? latestExtraction.phq9_estimate : null
  const gad7Latest = typeof latestExtraction?.gad7_estimate === 'number' ? latestExtraction.gad7_estimate : null

  const secondLatestExtraction =
    journalEntries.filter((e) => typeof e.ai_extraction?.phq9_estimate === 'number' || typeof e.ai_extraction?.gad7_estimate === 'number')[1]
      ?.ai_extraction ?? null

  const phq9Prev = typeof secondLatestExtraction?.phq9_estimate === 'number' ? secondLatestExtraction.phq9_estimate : null
  const gad7Prev = typeof secondLatestExtraction?.gad7_estimate === 'number' ? secondLatestExtraction.gad7_estimate : null

  const phq9Rci =
    phq9Prev !== null && phq9Latest !== null ? getReliableChangeIndex(phq9Prev, phq9Latest, 'phq9') : null
  const gad7Rci =
    gad7Prev !== null && gad7Latest !== null ? getReliableChangeIndex(gad7Prev, gad7Latest, 'gad7') : null

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/therapist/patients"
        className="inline-flex items-center text-sm text-therapy-muted hover:text-therapy-text mb-6"
      >
        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Patients
      </Link>

      {/* Crisis Alerts */}
      {crisisAlerts && crisisAlerts.length > 0 && (
        <CrisisBanner severity={crisisAlerts[0].severity as 'low' | 'medium' | 'high'} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-sage-100 flex items-center justify-center">
            <span className="text-sage-700 font-semibold text-2xl">
              {(patient.full_name || 'P').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-therapy-text">
              {patient.full_name || 'Patient'}
            </h1>
            <p className="text-therapy-muted mt-1">
              Patient since {new Date(patient.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card padding="md" className="text-center">
          <div className="text-3xl font-semibold text-therapy-text">{totalEntries}</div>
          <div className="text-sm text-therapy-muted">Shared Entries</div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-3xl font-semibold text-therapy-text">
            {avgMood !== null ? avgMood : '—'}
          </div>
          <div className="text-sm text-therapy-muted">Avg Mood</div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-2xl font-semibold text-therapy-text">
            {phq9Latest !== null ? phq9Latest : '—'}
          </div>
          <div className="text-xs text-therapy-muted mt-1">
            PHQ-9-aligned est. {phq9Latest !== null ? `(${interpretPHQ9(phq9Latest)})` : ''}
          </div>
          {phq9Rci?.changed && (
            <div
              className={`mt-2 text-xs font-medium ${
                phq9Rci.direction === 'improved' ? 'text-sage-700' : 'text-therapy-danger'
              }`}
            >
              Reliable change: {phq9Rci.direction}
            </div>
          )}
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-2xl font-semibold text-therapy-text">
            {gad7Latest !== null ? gad7Latest : '—'}
          </div>
          <div className="text-xs text-therapy-muted mt-1">
            GAD-7-aligned est. {gad7Latest !== null ? `(${interpretGAD7(gad7Latest)})` : ''}
          </div>
          {gad7Rci?.changed && (
            <div
              className={`mt-2 text-xs font-medium ${
                gad7Rci.direction === 'improved' ? 'text-sage-700' : 'text-therapy-danger'
              }`}
            >
              Reliable change: {gad7Rci.direction}
            </div>
          )}
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-3xl font-semibold text-therapy-danger">
            {crisisAlerts?.length || 0}
          </div>
          <div className="text-sm text-therapy-muted">Active Alerts</div>
        </Card>
      </div>

      {/* Clinical normalization notes */}
      <div className="mb-8">
        <p className="text-xs text-therapy-muted">
          PHQ-9-aligned / GAD-7-aligned values shown here are text-derived indicator estimates for trend awareness.
          They are not an administered questionnaire and do not constitute a clinical score.
        </p>
        <p className="text-xs text-therapy-muted mt-1">
          Z-scores (when available) are normalized after 5+ entries. Higher z means better relative to baseline; anxiety
          is reverse-coded internally to reflect calmness.
        </p>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Mood & Anxiety Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <MoodTimeline data={moodData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Common Symptoms</CardTitle>
          </CardHeader>
          <CardContent>
            <SymptomChart data={symptomData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Sleep & Mood Correlation</CardTitle>
          </CardHeader>
          <CardContent>
            <SleepCorrelation data={sleepMoodData} />
          </CardContent>
        </Card>

        {/* Common Emotions */}
        <Card>
          <CardHeader>
            <CardTitle>Emotional Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            {entries && entries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const emotionMap = new Map<string, number>()
                  entries.forEach(e => {
                    const extraction = Array.isArray(e.ai_extraction) ? e.ai_extraction[0] : e.ai_extraction
                    const emotions = extraction?.emotions || []
                    emotions.forEach((em: string) => {
                      emotionMap.set(em, (emotionMap.get(em) || 0) + 1)
                    })
                  })
                  return Array.from(emotionMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([emotion, count]) => (
                      <span
                        key={emotion}
                        className="px-3 py-1 text-sm bg-sage-50 text-sage-700 rounded-full"
                        title={`${count} occurrences`}
                      >
                        {emotion} ({count})
                      </span>
                    ))
                })()}
              </div>
            ) : (
              <p className="text-therapy-muted text-center py-8">No data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shared Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Shared Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {journalEntries.length > 0 ? (
            <div className="space-y-4">
              {journalEntries.map((entry) => (
                <div key={entry.id} className="border border-therapy-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <time className="text-sm font-medium text-therapy-text">
                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </time>
                      {entry.ai_extraction?.crisis_detected && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                          Crisis Detected
                        </span>
                      )}
                    </div>
                    {entry.ai_extraction?.mood_score && (
                      <MoodBadge value={entry.ai_extraction.mood_score} />
                    )}
                  </div>
                  
                  <p className="text-therapy-text font-serif leading-relaxed whitespace-pre-wrap">
                    {entry.content}
                  </p>

                  {/* AI Summary */}
                  {entry.ai_extraction?.summary && (
                    <p className="mt-3 text-sm text-therapy-muted italic border-l-2 border-sage-200 pl-3">
                      {entry.ai_extraction.summary}
                    </p>
                  )}

                  {/* Clinical estimates + normalization */}
                  {(typeof entry.ai_extraction?.phq9_estimate === 'number' ||
                    typeof entry.ai_extraction?.gad7_estimate === 'number') && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-therapy-border bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-therapy-text">PHQ-9-aligned est.</div>
                          <div className="text-therapy-text">
                            {typeof entry.ai_extraction?.phq9_estimate === 'number'
                              ? entry.ai_extraction.phq9_estimate
                              : '—'}
                          </div>
                        </div>
                        {typeof entry.ai_extraction?.phq9_estimate === 'number' && (
                          <div className="text-xs text-therapy-muted mt-1">
                            {interpretPHQ9(entry.ai_extraction.phq9_estimate)}
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg border border-therapy-border bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-therapy-text">GAD-7-aligned est.</div>
                          <div className="text-therapy-text">
                            {typeof entry.ai_extraction?.gad7_estimate === 'number'
                              ? entry.ai_extraction.gad7_estimate
                              : '—'}
                          </div>
                        </div>
                        {typeof entry.ai_extraction?.gad7_estimate === 'number' && (
                          <div className="text-xs text-therapy-muted mt-1">
                            {interpretGAD7(entry.ai_extraction.gad7_estimate)}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-therapy-border bg-white p-3">
                        <div className="font-medium text-therapy-text">Compared to patient baseline</div>
                        <div className="text-xs text-therapy-muted mt-1">
                          Mood z:{' '}
                          {typeof entry.ai_extraction?.mood_z_score === 'number'
                            ? entry.ai_extraction.mood_z_score.toFixed(2)
                            : 'Calibrating…'}
                          {' · '}Anxiety z:{' '}
                          {typeof entry.ai_extraction?.anxiety_z_score === 'number'
                            ? entry.ai_extraction.anxiety_z_score.toFixed(2)
                            : 'Calibrating…'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-therapy-border bg-white p-3">
                        <div className="font-medium text-therapy-text">Compared to all patients</div>
                        <div className="text-xs text-therapy-muted mt-1">
                          Mood z:{' '}
                          {typeof entry.ai_extraction?.mood_pop_z === 'number'
                            ? entry.ai_extraction.mood_pop_z.toFixed(2)
                            : 'Calibrating…'}
                          {' · '}Anxiety z:{' '}
                          {typeof entry.ai_extraction?.anxiety_pop_z === 'number'
                            ? entry.ai_extraction.anxiety_pop_z.toFixed(2)
                            : 'Calibrating…'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {entry.ai_extraction?.emotions?.slice(0, 4).map((emotion) => (
                      <span
                        key={emotion}
                        className="px-2 py-0.5 text-xs bg-sage-50 text-sage-700 rounded-full"
                      >
                        {emotion}
                      </span>
                    ))}
                    {entry.ai_extraction?.symptoms?.slice(0, 3).map((symptom) => (
                      <span
                        key={symptom}
                        className="px-2 py-0.5 text-xs bg-warm-50 text-warm-700 rounded-full"
                      >
                        {symptom}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-therapy-muted">No shared entries yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

