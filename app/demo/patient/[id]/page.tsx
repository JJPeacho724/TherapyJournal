'use client'

import { useState, useEffect } from 'react'
import type { SyntheticPatient, MetricsTimePoint, WeeklySummary } from '@/types/synthetic'
import { MoodTrendSimple } from '@/components/charts/MoodTrendSimple'

export default function PatientViewPage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const [patient, setPatient] = useState<SyntheticPatient | null>(null)
  const [metrics, setMetrics] = useState<MetricsTimePoint[]>([])
  const [summaries, setSummaries] = useState<WeeklySummary[]>([])
  const [loading, setLoading] = useState(true)

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
        setMetrics(metricsData.metrics ?? [])
        setSummaries(summariesData.summaries ?? [])
      } catch (e) {
        console.error('Failed to load data:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading...
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500">
        Not found.
      </div>
    )
  }

  // Simplified trend description
  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null
  const trendDescription = latestMetrics?.slope7d
    ? latestMetrics.slope7d > 0.1
      ? 'Your patterns show a positive direction recently.'
      : latestMetrics.slope7d < -0.1
        ? 'Things may feel a bit harder right now. That is okay — patterns shift over time.'
        : 'Your patterns have been steady recently.'
    : 'We are still gathering enough data to identify patterns.'

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <a
          href="/demo/admin/synthetic"
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          &larr; Back
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Your Wellness Journey
        </h1>
        <p className="text-sm text-gray-500 mt-1">{trendDescription}</p>
      </div>

      {/* Mood trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Mood Over Time
        </h2>
        <MoodTrendSimple data={metrics} />
      </div>

      {/* Weekly summaries in plain language */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Weekly Reflections
        </h2>
        {summaries.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Weekly reflections will appear as more data is recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => (
              <div
                key={s.weekNumber}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-700">
                    Week {s.weekNumber}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {s.weekStart} — {s.weekEnd}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{simplifyTrend(s.overallTrend)}</p>
                {s.notableThemes.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-500">
                      Themes noticed:{' '}
                    </span>
                    {s.notableThemes.map((t) => (
                      <span
                        key={t}
                        className="inline-block text-xs bg-green-50 text-green-700 rounded-full px-2 py-0.5 mr-1"
                      >
                        {t.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Convert technical trend text to patient-friendly language */
function simplifyTrend(trend: string): string {
  if (trend.includes('upward')) {
    return 'Things have been moving in a positive direction this week. Keep it up!'
  }
  if (trend.includes('downward')) {
    return 'This week may have felt harder. Remember, ups and downs are part of the journey.'
  }
  if (trend.includes('stable')) {
    return 'Your patterns have been steady this week. Consistency can be a strength.'
  }
  if (trend.includes('Establishing')) {
    return 'We are getting to know your patterns. Keep journaling!'
  }
  return trend
}
