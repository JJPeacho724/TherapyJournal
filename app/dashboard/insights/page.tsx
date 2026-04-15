import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui'
import { MoodTimeline, SymptomChart, SleepCorrelation, DailyMoodPattern } from '@/components/charts'
import { Navbar } from '@/components/shared'
import {
  processMoodData,
  aggregateSymptoms,
  processSleepMoodCorrelation,
  processTimeOfDayPatterns,
  getTimeOfDayInsights,
} from '@/lib/dashboard-utils'

export default async function InsightsPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  if (profile.role === 'therapist') {
    redirect('/therapist/dashboard')
  }

  const supabase = await createServerSupabaseClient()

  // Fetch more entries for longer time range views
  const { data: entries } = await supabase
    .from('journal_entries')
    .select(`
      id,
      created_at,
      content,
      ai_extraction:ai_extractions(mood_score, anxiety_score, emotions, symptoms),
      structured_log:structured_logs(sleep_hours)
    `)
    .eq('patient_id', profile.id)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(200)

  const moodData = processMoodData(entries || [])
  const symptomData = aggregateSymptoms(entries || [])
  const sleepMoodData = processSleepMoodCorrelation(entries || [])
  const timeOfDayData = processTimeOfDayPatterns(entries || [])
  const { bestTimeOfDay, worstTimeOfDay } = getTimeOfDayInsights(timeOfDayData)

  return (
    <div className="min-h-screen bg-therapy-background">
      <Navbar role="patient" userName={profile.full_name || undefined} />
      <main className="pt-16">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </Button>
            </Link>
            <h1 className="text-xl font-normal text-therapy-text">A closer look</h1>
          </div>

          {moodData.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-therapy-muted mb-4">
                Not enough entries yet to see patterns.
              </p>
              <Link href="/journal/new">
                <Button>Write an entry</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Mood Over Time */}
              <Card>
                <CardHeader>
                  <CardTitle>How your mood has moved</CardTitle>
                </CardHeader>
                <CardContent>
                  <MoodTimeline data={moodData} showAnxiety={true} />
                </CardContent>
              </Card>

              {/* Time of Day Patterns */}
              {timeOfDayData.some(t => t.entryCount > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>By time of day</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DailyMoodPattern data={timeOfDayData} />
                    {bestTimeOfDay && worstTimeOfDay && bestTimeOfDay.timeOfDay !== worstTimeOfDay.timeOfDay && (
                      <div className="mt-4 pt-4 border-t border-sage-100">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-sage-50 rounded-xl p-3">
                            <p className="text-therapy-muted text-xs mb-1">Usually felt better</p>
                            <p className="font-medium text-sage-700">{bestTimeOfDay.label}s</p>
                          </div>
                          <div className="bg-warm-50 rounded-xl p-3">
                            <p className="text-therapy-muted text-xs mb-1">Often felt harder</p>
                            <p className="font-medium text-warm-700">{worstTimeOfDay.label}s</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Topics */}
              {symptomData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>What came up most</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SymptomChart data={symptomData.slice(0, 8)} />
                  </CardContent>
                </Card>
              )}

              {/* Sleep and Mood */}
              {sleepMoodData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Sleep and how you felt</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SleepCorrelation data={sleepMoodData} />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
