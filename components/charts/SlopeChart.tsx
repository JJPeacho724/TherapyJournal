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
  Legend,
} from 'recharts'
import type { MetricsTimePoint } from '@/types/synthetic'

interface SlopeChartProps {
  data: MetricsTimePoint[]
}

export function SlopeChart({ data }: SlopeChartProps) {
  const chartData = data
    .filter((d) => d.slope7d != null || d.slope14d != null)
    .map((d) => ({
      day: d.dayIndex + 1,
      date: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      slope7d: d.slope7d,
      slope14d: d.slope14d,
    }))

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Calculating trend slopes (need 7+ days)...
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
            label={{ value: 'Slope (units/day)', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-sm">
                  <p className="text-gray-500">{d.date} (Day {d.day})</p>
                  {d.slope7d != null && (
                    <p>7-day slope: <span className={d.slope7d > 0 ? 'text-green-600' : 'text-red-600'}>
                      {d.slope7d > 0 ? '+' : ''}{d.slope7d?.toFixed(3)}
                    </span></p>
                  )}
                  {d.slope14d != null && (
                    <p>14-day slope: <span className={d.slope14d > 0 ? 'text-green-600' : 'text-red-600'}>
                      {d.slope14d > 0 ? '+' : ''}{d.slope14d?.toFixed(3)}
                    </span></p>
                  )}
                </div>
              )
            }}
          />
          <Legend verticalAlign="top" height={28} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="slope7d"
            name="7-Day Slope"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="slope14d"
            name="14-Day Slope"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
