'use client'

import { useState, useEffect } from 'react'
import type { SyntheticPatient, MetricsTimePoint, WeeklySummary } from '@/types/synthetic'
import { ARCHETYPE_LABELS, type Archetype } from '@/types/synthetic'
import { ZScoreTimeline } from '@/components/charts/ZScoreTimeline'
import { VolatilityChart } from '@/components/charts/VolatilityChart'
import { SlopeChart } from '@/components/charts/SlopeChart'
import { FeedbackPanel } from '@/components/synthetic/FeedbackPanel'

export default function ClinicianPatientPage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const [patient, setPatient] = useState<SyntheticPatient | null>(null)
  const [metrics, setMetrics] = useState<MetricsTimePoint[]>([])
  const [summaries, setSummaries] = useState<WeeklySummary[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'charts' | 'summaries' | 'evidence' | 'feedback'>('charts')

  useEffect(() => {
    async function load() {
      try {
        const [patientRes, metricsRes, summariesRes] = await Promise.all([
          fetch(`/api/demo/synthetic/patients/${id}`),
          fetch(`/api/demo/synthetic/patients/${id}/metrics`),
          fetch(`/api/demo/synthetic/patients/${id}/summaries`),
        ])
        const patientData = await patientRes.json()
        const metricsData = await metricsRes.json()
        const summariesData = await summariesRes.json()

        setPatient(patientData.patient ?? null)
        setEntries(patientData.entries ?? [])
        setMetrics(metricsData.metrics ?? [])
        setSummaries(summariesData.summaries ?? [])
      } catch (e) {
        console.error('Failed to load patient data:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading patient data...
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500">
        Patient not found.
      </div>
    )
  }

  // Extract evidence snippets from entries
  const evidenceSnippets = entries
    .filter((e: any) => {
      const ext = Array.isArray(e.ai_extractions) ? e.ai_extractions[0] : e.ai_extractions
      return ext?.evidence?.mood_score?.length > 0
    })
    .slice(-20)
    .map((e: any) => {
      const ext = Array.isArray(e.ai_extractions) ? e.ai_extractions[0] : e.ai_extractions
      return {
        date: e.created_at,
        dayIndex: e.synthetic_day_index,
        mood: ext.mood_score,
        snippets: ext.evidence.mood_score,
      }
    })

  const tabs = [
    { key: 'charts' as const, label: 'Signal Charts' },
    { key: 'summaries' as const, label: 'Weekly Summaries' },
    { key: 'evidence' as const, label: 'Evidence Snippets' },
    { key: 'feedback' as const, label: 'Feedback' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <a
          href="/demo/admin/synthetic"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          &larr; Back to cohort
        </a>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Archetype: {ARCHETYPE_LABELS[patient.archetype as Archetype]}
          </span>
          <span className="text-sm text-gray-400">
            {patient.days_generated} days | Started{' '}
            {new Date(patient.start_date).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'charts' && (
        <div className="space-y-6">
          <ChartSection title="Baseline-Normalized Index (Z-Score)">
            <ZScoreTimeline data={metrics} />
          </ChartSection>
          <ChartSection title="Variability Index (7-Day Rolling Std Dev)">
            <VolatilityChart data={metrics} />
          </ChartSection>
          <ChartSection title="Trend Slopes (7-Day and 14-Day)">
            <SlopeChart data={metrics} />
          </ChartSection>
        </div>
      )}

      {activeTab === 'summaries' && (
        <div className="space-y-4">
          {summaries.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">
              No weekly summaries available.
            </p>
          ) : (
            summaries.map((s) => (
              <div
                key={s.weekNumber}
                className="bg-white border border-gray-200 rounded-lg p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-800">
                    Week {s.weekNumber}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {s.weekStart} — {s.weekEnd}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-3">{s.overallTrend}</p>
                {s.notableThemes.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      Notable themes:{' '}
                    </span>
                    {s.notableThemes.map((t) => (
                      <span
                        key={t}
                        className="inline-block text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 mr-1"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">{s.volatilityNotes}</p>
                <div className="mt-2 flex gap-4 text-xs text-gray-400">
                  <span>Avg mood: {s.avgMood}</span>
                  <span>Avg anxiety: {s.avgAnxiety}</span>
                  <span>Composite: {s.avgComposite}</span>
                  {s.slope7d != null && <span>Slope: {s.slope7d.toFixed(3)}/day</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="space-y-3">
          {evidenceSnippets.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">
              No evidence snippets available.
            </p>
          ) : (
            evidenceSnippets.reverse().map((e: any, i: number) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-gray-400">
                    Day {e.dayIndex + 1} |{' '}
                    {new Date(e.date).toLocaleDateString()}
                  </span>
                  <span className="text-xs font-medium text-gray-600">
                    Mood: {e.mood}/10
                  </span>
                </div>
                {e.snippets.map((s: any, j: number) => (
                  <div
                    key={j}
                    className="ml-3 border-l-2 border-indigo-200 pl-3 mb-2"
                  >
                    <p className="text-sm text-gray-700 italic">
                      &ldquo;{s.quote}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.rationale}</p>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'feedback' && <FeedbackPanel patientId={id} />}
    </div>
  )
}

function ChartSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}
