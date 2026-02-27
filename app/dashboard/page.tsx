import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Card, Button } from '@/components/ui'
import { WellnessChart } from '@/components/charts'
import { CrisisBanner, Navbar } from '@/components/shared'
import { NarrativeHeader, ThemesCard, BetterTimesCard, RecentThoughtsCard } from '@/components/wellness'
import { processMoodData } from '@/lib/dashboard-utils'
import {
  generateWeeklyNarrative,
  extractWeeklyThemes,
  describeWhenFeltBetter,
  getRecentThoughts,
} from '@/lib/wellness-utils'

export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  // Redirect therapists to their dashboard
  if (profile.role === 'therapist') {
    redirect('/therapist/dashboard')
  }

  const supabase = await createServerSupabaseClient()

  // Fetch recent entries with extractions
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
    .limit(30)

  // Check for unresolved crisis alerts
  const { data: crisisAlerts } = await supabase
    .from('crisis_alerts')
    .select('severity')
    .eq('patient_id', profile.id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)

  // Process data for wellness view
  const moodData = processMoodData(entries || [])
  const narrative = generateWeeklyNarrative(entries || [], moodData)
  const themes = extractWeeklyThemes(entries || [])
  const whenBetter = describeWhenFeltBetter(entries || [])
  const recentThoughts = getRecentThoughts(entries || [])

  const firstName = profile.full_name?.split(' ')[0]

  return (
    <div className="min-h-screen bg-therapy-background">
      <Navbar role="patient" userName={profile.full_name || undefined} />
      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Crisis Banner */}
          {crisisAlerts && crisisAlerts.length > 0 && (
            <CrisisBanner severity={crisisAlerts[0].severity as 'low' | 'medium' | 'high'} />
          )}

          {/* Greeting */}
          <div className="text-center mb-6">
            <p className="text-therapy-muted">
              {firstName ? `Hi, ${firstName}` : 'Welcome back'}
            </p>
          </div>

          {/* Weekly Narrative Headline */}
          <NarrativeHeader headline={narrative.headline} subtext={narrative.subtext} />

          {/* Single Mood Chart */}
          <Card className="mb-8 overflow-hidden">
            <div className="px-5 pt-4 pb-0">
              <p className="text-sm text-therapy-muted mb-2">How your days felt overall</p>
            </div>
            <WellnessChart data={moodData} />
          </Card>

          {/* Three Simple Cards */}
          <div className="grid gap-4 mb-8">
            <ThemesCard themes={themes} />
            <BetterTimesCard data={whenBetter} />
            <RecentThoughtsCard thoughts={recentThoughts} />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <Link href="/journal/new" className="flex-1">
              <Button className="w-full justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Write something
              </Button>
            </Link>
            <Link href="/dashboard/insights" className="flex-1">
              <Button variant="secondary" className="w-full justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View details
              </Button>
            </Link>
          </div>

          {/* Subtle footer link */}
          <div className="text-center">
            <Link
              href="/journal"
              className="text-sm text-therapy-muted hover:text-therapy-text transition-colors"
            >
              Browse all entries
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
