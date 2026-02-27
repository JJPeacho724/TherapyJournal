import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { Card } from '@/components/ui'
import { CrisisBanner, AIOutputLabel, CrisisKeywordDisclaimer } from '@/components/shared'
import { EntryActions } from './EntryActions'
import type { JournalEntry, CrisisSeverity } from '@/types'

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createServerSupabaseClient()

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .select(`
      *,
      structured_log:structured_logs(*),
      ai_extraction:ai_extractions(*)
    `)
    .eq('id', id)
    .eq('patient_id', profile.id)
    .single()

  if (error || !entry) {
    notFound()
  }

  const journalEntry: JournalEntry = {
    ...entry,
    structured_log: Array.isArray(entry.structured_log)
      ? entry.structured_log[0] || null
      : entry.structured_log || null,
    ai_extraction: Array.isArray(entry.ai_extraction)
      ? entry.ai_extraction[0] || null
      : entry.ai_extraction || null,
  }

  const date = new Date(journalEntry.created_at)
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  const extraction = journalEntry.ai_extraction

  // Convert mood score to description
  const getMoodDescription = (score: number) => {
    const descriptions = [
      'Very difficult', 'Difficult', 'Challenging', 'Below average',
      'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Wonderful'
    ]
    return descriptions[Math.min(Math.max(score - 1, 0), 9)]
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/journal"
        className="inline-flex items-center text-sm text-therapy-muted hover:text-therapy-text mb-8"
      >
        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      {/* Crisis Banner */}
      {extraction?.crisis_detected && (
        <>
          <CrisisBanner severity={(extraction.confidence ?? 0.5) > 0.7 ? 'high' : 'medium' as CrisisSeverity} />
          <CrisisKeywordDisclaimer className="mt-1 mb-2 text-center" />
        </>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-therapy-muted text-sm">{formattedTime}</p>
        <h1 className="text-xl font-normal text-therapy-text mt-1">{formattedDate}</h1>
        <div className="flex items-center justify-center gap-2 mt-3">
          {journalEntry.is_draft && (
            <span className="px-2 py-0.5 text-xs bg-warm-100 text-warm-700 rounded-full">
              Draft
            </span>
          )}
          {journalEntry.shared_with_therapist && (
            <span className="px-2 py-0.5 text-xs bg-sage-100 text-sage-700 rounded-full">
              Shared
            </span>
          )}
        </div>
      </div>

      {/* Mood indicator - subtle */}
      {extraction?.mood_score && (
        <div className="text-center mb-6">
          <p className="text-sm text-therapy-muted">
            You felt <span className="text-therapy-text">{getMoodDescription(extraction.mood_score).toLowerCase()}</span> this day
          </p>
        </div>
      )}

      {/* Content */}
      <Card className="mb-8 bg-white/80">
        <p className="font-serif text-therapy-text leading-relaxed whitespace-pre-wrap text-lg">
          {journalEntry.content}
        </p>
      </Card>

      {/* Actions */}
      <div className="flex justify-center mb-8">
        <EntryActions entryId={journalEntry.id} isShared={journalEntry.shared_with_therapist} />
      </div>

      {/* Reflections section - more friendly take on AI insights */}
      {extraction && (extraction.emotions?.length > 0 || extraction.summary) && (
        <Card className="mb-6 bg-sage-50/50 border-sage-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-therapy-muted">
              What we noticed
            </h3>
            <AIOutputLabel />
          </div>

          {extraction.summary && (
            <p className="text-therapy-text text-sm mb-4 italic">
              {extraction.summary}
            </p>
          )}

          {/* Emotions as gentle tags */}
          {extraction.emotions && extraction.emotions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-therapy-muted mb-2">Feelings that came up</p>
              <div className="flex flex-wrap gap-1.5">
                {extraction.emotions.map((emotion) => (
                  <span
                    key={emotion}
                    className="px-2.5 py-1 text-xs bg-white text-sage-700 rounded-full"
                  >
                    {emotion}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Themes/topics - renamed from symptoms */}
          {extraction.symptoms && extraction.symptoms.length > 0 && (
            <div>
              <p className="text-xs text-therapy-muted mb-2">Topics that came up</p>
              <div className="flex flex-wrap gap-1.5">
                {extraction.symptoms.map((symptom) => (
                  <span
                    key={symptom}
                    className="px-2.5 py-1 text-xs bg-white text-warm-700 rounded-full"
                  >
                    {symptom}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Daily tracking - softer presentation */}
      {journalEntry.structured_log && (
        <Card className="bg-white/60">
          <h3 className="text-sm font-medium text-therapy-muted mb-4">That day</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {journalEntry.structured_log.sleep_hours !== null && (
              <div>
                <span className="text-therapy-muted">Sleep: </span>
                <span className="text-therapy-text">{journalEntry.structured_log.sleep_hours} hours</span>
              </div>
            )}
            {journalEntry.structured_log.energy_level !== null && (
              <div>
                <span className="text-therapy-muted">Energy: </span>
                <span className="text-therapy-text">{journalEntry.structured_log.energy_level}/10</span>
              </div>
            )}
            {journalEntry.structured_log.medication_taken !== null && (
              <div>
                <span className="text-therapy-muted">Medication: </span>
                <span className="text-therapy-text">
                  {journalEntry.structured_log.medication_taken ? 'Taken' : 'Skipped'}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Footer */}
      <div className="mt-10 text-center">
        <Link
          href="/journal"
          className="text-sm text-therapy-muted hover:text-therapy-text transition-colors"
        >
          View all entries
        </Link>
      </div>
    </div>
  )
}
