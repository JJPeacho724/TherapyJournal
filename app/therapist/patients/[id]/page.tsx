import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { MoodTimeline, SymptomChart, SleepCorrelation } from '@/components/charts'
import { MoodBadge } from '@/components/journal'
import { CrisisBanner } from '@/components/shared'
import { LongitudinalProfileView } from '@/components/therapist/LongitudinalProfile'
import { computeLongitudinalProfile } from '@/lib/longitudinal-profile'
import type { MoodDataPoint, SymptomFrequency, SleepMoodCorrelation, JournalEntry } from '@/types'

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
    .limit(100)

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

  // Longitudinal profile
  const longitudinalProfile = computeLongitudinalProfile(entries || [])

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
          <div className="text-3xl font-semibold text-therapy-danger">
            {crisisAlerts?.length || 0}
          </div>
          <div className="text-sm text-therapy-muted">Active Alerts</div>
        </Card>
        <Card padding="md" className="text-center">
          {moodData.length > 0 ? (
            <>
              <MoodBadge value={moodData[moodData.length - 1].mood} />
              <div className="text-sm text-therapy-muted mt-1">Latest Mood</div>
            </>
          ) : (
            <div className="text-sm text-therapy-muted">No mood data</div>
          )}
        </Card>
      </div>

      {/* Longitudinal Profile */}
      <div className="mb-8">
        <LongitudinalProfileView
          profile={longitudinalProfile}
          patientName={patient.full_name || 'Patient'}
        />
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

