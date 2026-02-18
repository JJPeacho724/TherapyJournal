'use client'

import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { FEEDBACK_COMPONENT_LABELS, type FeedbackComponent } from '@/types/synthetic'

interface FeedbackAggregate {
  component: string
  avgUseful: number | null
  avgClear: number | null
  avgRisky: number | null
  count: number
}

interface FeedbackRow {
  id: string
  component: FeedbackComponent
  rating_useful: number | null
  rating_clear: number | null
  rating_risky: number | null
  notes: string | null
  created_at: string
  synthetic_patients: { archetype: string } | null
}

export default function FeedbackDashboardPage() {
  const [aggregates, setAggregates] = useState<FeedbackAggregate[]>([])
  const [recentFeedback, setRecentFeedback] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/demo/synthetic/feedback')
        const data = await res.json()
        setAggregates(data.aggregates ?? [])
        setRecentFeedback(data.recentFeedback ?? [])
      } catch (e) {
        console.error('Failed to load feedback:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading feedback...
      </div>
    )
  }

  const chartData = aggregates.map((a) => ({
    component: FEEDBACK_COMPONENT_LABELS[a.component as FeedbackComponent] ?? a.component,
    Useful: a.avgUseful ?? 0,
    Clear: a.avgClear ?? 0,
    Risky: a.avgRisky ?? 0,
    count: a.count,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feedback Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Aggregated clinician feedback on synthetic demo components.
        </p>
      </div>

      {/* Aggregated bar chart */}
      {chartData.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Average Ratings by Component
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="component"
                  tick={{ fontSize: 10 }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="top" height={28} />
                <Bar dataKey="Useful" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Clear" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Risky" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No feedback submitted yet. Visit a clinician view and rate the
          components to see aggregated results here.
        </div>
      )}

      {/* Recent feedback table */}
      {recentFeedback.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">
              Recent Feedback ({recentFeedback.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Component</th>
                  <th className="px-4 py-2 text-left">Archetype</th>
                  <th className="px-4 py-2 text-center">Useful</th>
                  <th className="px-4 py-2 text-center">Clear</th>
                  <th className="px-4 py-2 text-center">Risky</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                  <th className="px-4 py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentFeedback.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">
                      {FEEDBACK_COMPONENT_LABELS[f.component] ?? f.component}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {(f.synthetic_patients as any)?.archetype?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-center">{f.rating_useful ?? '—'}</td>
                    <td className="px-4 py-2 text-center">{f.rating_clear ?? '—'}</td>
                    <td className="px-4 py-2 text-center">{f.rating_risky ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 max-w-xs truncate">
                      {f.notes || '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
