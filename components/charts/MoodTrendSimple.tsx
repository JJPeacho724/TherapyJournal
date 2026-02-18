'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MetricsTimePoint } from '@/types/synthetic'

interface MoodTrendSimpleProps {
  data: MetricsTimePoint[]
}

export function MoodTrendSimple({ data }: MoodTrendSimpleProps) {
  const chartData = data.map((d) => ({
    day: d.dayIndex + 1,
    date: new Date(d.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    mood: d.moodScore,
    composite: d.composite,
  }))

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No data available yet.
      </div>
    )
  }

  const avgMood =
    Math.round((chartData.reduce((s, d) => s + d.mood, 0) / chartData.length) * 10) / 10

  return (
    <div>
      <div className="px-4 pb-2 flex items-baseline gap-2">
        <span className="text-lg font-medium text-gray-800">
          Average mood: {avgMood}/10
        </span>
        <span className="text-xs text-gray-500">
          {chartData.length} days recorded
        </span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="moodSimpleGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6b8f71" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6b8f71" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-sm">
                    <p className="text-gray-500">{d.date}</p>
                    <p className="font-medium">Mood: {d.mood}/10</p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="mood"
              stroke="#6b8f71"
              strokeWidth={2}
              fill="url(#moodSimpleGrad)"
              dot={false}
              activeDot={{ r: 5, fill: '#6b8f71', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
