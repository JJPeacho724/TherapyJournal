'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import type { MetricsTimePoint } from '@/types/synthetic'

interface ZScoreTimelineProps {
  data: MetricsTimePoint[]
}

export function ZScoreTimeline({ data }: ZScoreTimelineProps) {
  const chartData = data
    .filter((d) => d.zScore != null)
    .map((d) => ({
      day: d.dayIndex + 1,
      date: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      zScore: d.zScore,
    }))

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Collecting baseline data (minimum 5 entries)...
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11 }}
            label={{ value: 'Day', position: 'insideBottom', offset: -2, fontSize: 11 }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={[-3, 3]}
            label={{ value: 'Z-Score', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-sm">
                  <p className="text-gray-500">{d.date} (Day {d.day})</p>
                  <p className="font-medium">
                    Z-Score: <span className={d.zScore > 0 ? 'text-green-600' : 'text-red-600'}>
                      {d.zScore > 0 ? '+' : ''}{d.zScore?.toFixed(2)}
                    </span>
                  </p>
                </div>
              )
            }}
          />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          <ReferenceLine y={1} stroke="#22c55e" strokeDasharray="2 4" strokeOpacity={0.4} />
          <ReferenceLine y={-1} stroke="#ef4444" strokeDasharray="2 4" strokeOpacity={0.4} />
          <Line
            type="monotone"
            dataKey="zScore"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
