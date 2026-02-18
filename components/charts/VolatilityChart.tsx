'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { MetricsTimePoint } from '@/types/synthetic'

interface VolatilityChartProps {
  data: MetricsTimePoint[]
}

export function VolatilityChart({ data }: VolatilityChartProps) {
  const chartData = data
    .filter((d) => d.volatility7d != null)
    .map((d) => ({
      day: d.dayIndex + 1,
      date: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      volatility: d.volatility7d,
    }))

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Calculating variability (need 2+ entries)...
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11 }}
            label={{ value: 'Day', position: 'insideBottom', offset: -2, fontSize: 11 }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{ value: 'Variability (7d StdDev)', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-sm">
                  <p className="text-gray-500">{d.date} (Day {d.day})</p>
                  <p className="font-medium">
                    Variability: <span className="text-amber-600">{d.volatility?.toFixed(3)}</span>
                  </p>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="volatility"
            stroke="#f59e0b"
            strokeWidth={2}
            fill="url(#volGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#f59e0b' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
