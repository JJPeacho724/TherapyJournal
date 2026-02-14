import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui'

export default async function PatientsListPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createServerSupabaseClient()

  // Get patients assigned to this therapist with stats
  const { data: patientRelationsRaw } = await supabase
    .from('patient_therapist')
    .select(`
      patient_id,
      created_at,
      patient:profiles!patient_therapist_patient_id_fkey(id, full_name, created_at)
    `)
    .eq('therapist_id', profile.id)

  // Transform patient data (Supabase returns array for joins)
  const patientRelations = (patientRelationsRaw || []).map(r => ({
    ...r,
    patient: Array.isArray(r.patient) ? r.patient[0] : r.patient,
  }))

  // Get additional stats for each patient
  const patientStats = await Promise.all(
    patientRelations.map(async (relation) => {
      // Get entry count and latest entry
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, created_at, ai_extraction:ai_extractions(mood_score)')
        .eq('patient_id', relation.patient_id)
        .eq('shared_with_therapist', true)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(5)

      // Get unresolved crisis alerts
      const { data: alerts } = await supabase
        .from('crisis_alerts')
        .select('id')
        .eq('patient_id', relation.patient_id)
        .eq('resolved', false)

      const latestEntry = entries?.[0]
      const entryCount = entries?.length || 0
      const getExtraction = (e: NonNullable<typeof entries>[number]) => 
        Array.isArray(e.ai_extraction) ? e.ai_extraction[0] : e.ai_extraction
      const entriesWithMood = entries?.filter(e => getExtraction(e)?.mood_score) || []
      const avgMood = entriesWithMood.length > 0
        ? entriesWithMood.reduce((sum, e) => sum + (getExtraction(e)!.mood_score || 0), 0) / entriesWithMood.length
        : null

      return {
        ...relation,
        entryCount,
        latestEntry: latestEntry?.created_at,
        avgMood: avgMood ? Math.round(avgMood * 10) / 10 : null,
        hasCrisisAlert: (alerts?.length || 0) > 0,
      }
    })
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-therapy-text">Patients</h1>
          <p className="text-therapy-muted mt-1">
            {patientStats.length} {patientStats.length === 1 ? 'patient' : 'patients'} under your care
          </p>
        </div>
      </div>

      {/* Patients List */}
      {patientStats.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-sage-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-therapy-text mb-2">No Patients Yet</h3>
          <p className="text-therapy-muted mb-6 max-w-sm mx-auto">
            Patients will appear here once they connect with you through the platform.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {patientStats.map((patient) => (
            <Link key={patient.patient_id} href={`/therapist/patients/${patient.patient_id}`}>
              <Card hover className="flex items-center gap-4 cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sage-700 font-semibold text-lg">
                    {(patient.patient?.full_name || 'P').charAt(0).toUpperCase()}
                  </span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-therapy-text">
                      {patient.patient?.full_name || 'Patient'}
                    </h3>
                    {patient.hasCrisisAlert && (
                      <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                        Crisis Alert
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-therapy-muted mt-0.5">
                    {patient.entryCount} shared {patient.entryCount === 1 ? 'entry' : 'entries'}
                    {patient.latestEntry && (
                      <>
                        {' · '}
                        Last entry {new Date(patient.latestEntry).toLocaleDateString()}
                      </>
                    )}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  {patient.avgMood !== null && (
                    <div className="text-lg font-semibold text-therapy-text">
                      {patient.avgMood}/10
                    </div>
                  )}
                  <div className="text-xs text-therapy-muted">Avg Mood</div>
                </div>

                <svg className="w-5 h-5 text-therapy-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

