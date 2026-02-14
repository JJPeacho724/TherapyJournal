import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui'
import { MoodBadge } from '@/components/journal'
import { getExtraction } from '@/lib/dashboard-utils'

export default async function TherapistDashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createServerSupabaseClient()

  // Get patients assigned to this therapist
  const { data: patientRelations } = await supabase
    .from('patient_therapist')
    .select(`
      patient_id,
      patient:profiles!patient_therapist_patient_id_fkey(id, full_name)
    `)
    .eq('therapist_id', profile.id)

  // Transform patient data (Supabase returns array for joins)
  const transformedPatients = (patientRelations || []).map(r => ({
    ...r,
    patient: Array.isArray(r.patient) ? r.patient[0] : r.patient,
  }))

  const patientIds = transformedPatients.map(r => r.patient_id)

  // Get crisis alerts
  const { data: crisisAlertsRaw } = await supabase
    .from('crisis_alerts')
    .select(`
      *,
      patient:profiles!crisis_alerts_patient_id_fkey(full_name)
    `)
    .in('patient_id', patientIds.length > 0 ? patientIds : ['none'])
    .eq('resolved', false)
    .order('created_at', { ascending: false })

  // Transform alerts (Supabase returns array for joins)
  const crisisAlerts = (crisisAlertsRaw || []).map(a => ({
    ...a,
    patient: Array.isArray(a.patient) ? a.patient[0] : a.patient,
  }))

  // Get recent shared entries from patients
  const { data: recentEntriesRaw } = await supabase
    .from('journal_entries')
    .select(`
      id,
      created_at,
      content,
      patient:profiles!journal_entries_patient_id_fkey(id, full_name),
      ai_extraction:ai_extractions(mood_score, crisis_detected)
    `)
    .in('patient_id', patientIds.length > 0 ? patientIds : ['none'])
    .eq('shared_with_therapist', true)
    .eq('is_draft', false)
    .order('created_at', { ascending: false })
    .limit(10)

  // Transform entries (Supabase returns array for joins)
  const recentEntries = (recentEntriesRaw || []).map(e => ({
    ...e,
    patient: Array.isArray(e.patient) ? e.patient[0] : e.patient,
  }))

  // Calculate average patient mood across recent entries
  let avgPatientMood: number | null = null
  if (recentEntries && recentEntries.length > 0) {
    let totalMood = 0
    let moodCount = 0
    recentEntries.forEach(e => {
      const extraction = getExtraction(e)
      if (extraction?.mood_score) {
        totalMood += extraction.mood_score
        moodCount++
      }
    })
    avgPatientMood = moodCount > 0 ? Math.round((totalMood / moodCount) * 10) / 10 : null
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-therapy-text">
          Therapist Dashboard
        </h1>
        <p className="text-therapy-muted mt-1">
          {patientIds.length} {patientIds.length === 1 ? 'patient' : 'patients'} under your care
        </p>
      </div>

      {/* Priority: Crisis Alerts at the Top */}
      {crisisAlerts && crisisAlerts.length > 0 && (
        <Card className="mb-6 border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="text-therapy-danger flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Needs Immediate Attention ({crisisAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {crisisAlerts.slice(0, 5).map((alert) => (
                <Link
                  key={alert.id}
                  href={`/therapist/patients/${alert.patient_id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200 hover:border-red-300 transition-colors">
                    <div className="flex-1">
                      <p className="font-medium text-therapy-text">
                        {alert.patient?.full_name || 'Patient'}
                      </p>
                      <p className="text-sm text-therapy-muted">
                        {new Date(alert.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                        <span className="mx-2">•</span>
                        <span className="capitalize font-medium text-red-700">{alert.severity} severity</span>
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-therapy-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats - Simplified and Action-Focused */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card padding="md" className="text-center">
          <div className="text-3xl font-semibold text-therapy-text">{patientIds.length}</div>
          <div className="text-sm text-therapy-muted">Patients</div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-3xl font-semibold text-therapy-text">
            {recentEntries?.length || 0}
          </div>
          <div className="text-sm text-therapy-muted">Shared Entries</div>
        </Card>
        <Card
          padding="md"
          className={`text-center ${crisisAlerts && crisisAlerts.length > 0 ? 'border-therapy-danger bg-red-50' : ''}`}
        >
          <div className={`text-3xl font-semibold ${crisisAlerts && crisisAlerts.length > 0 ? 'text-therapy-danger' : 'text-therapy-text'}`}>
            {crisisAlerts?.length || 0}
          </div>
          <div className="text-sm text-therapy-muted">
            {crisisAlerts && crisisAlerts.length > 0 ? 'Needs Attention' : 'Active Alerts'}
          </div>
        </Card>
        <Card padding="md" className="text-center">
          <div className="text-3xl font-semibold text-therapy-accent">
            {avgPatientMood !== null ? avgPatientMood : '—'}
          </div>
          <div className="text-sm text-therapy-muted">Avg Mood</div>
        </Card>
      </div>

      {/* Recent Activity - Streamlined */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Patients List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your Patients</CardTitle>
            {transformedPatients.length > 5 && (
              <Link href="/therapist/patients" className="text-sm text-therapy-accent hover:underline">
                View all
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {transformedPatients && transformedPatients.length > 0 ? (
              <div className="space-y-2">
                {transformedPatients.slice(0, 5).map((relation) => (
                  <Link
                    key={relation.patient_id}
                    href={`/therapist/patients/${relation.patient_id}`}
                    className="block"
                  >
                    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-sage-50 transition-colors border border-transparent hover:border-sage-200">
                      <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sage-700 font-medium">
                          {(relation.patient?.full_name || 'P').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-therapy-text">
                          {relation.patient?.full_name || 'Patient'}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-therapy-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-therapy-muted text-sm">No patients assigned</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Shared Entries */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Shared Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEntries && recentEntries.length > 0 ? (
              <div className="space-y-2">
                {recentEntries.slice(0, 5).map((entry) => {
                  const extraction = getExtraction(entry)
                  return (
                    <Link
                      key={entry.id}
                      href={`/therapist/patients/${entry.patient?.id}`}
                      className="block"
                    >
                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-sage-50 transition-colors border border-transparent hover:border-sage-200">
                        {extraction?.mood_score && (
                          <div className="flex-shrink-0">
                            <MoodBadge value={extraction.mood_score} size="sm" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-therapy-text">
                              {entry.patient?.full_name}
                            </p>
                            {extraction?.crisis_detected && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                                Alert
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-therapy-muted truncate">
                            {entry.content.substring(0, 60)}...
                          </p>
                          <p className="text-xs text-therapy-muted mt-1">
                            {new Date(entry.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-therapy-muted text-sm">No shared entries yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

