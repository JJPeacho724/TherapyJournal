'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { SymptomFrequency } from '@/types'

interface SymptomChartProps {
  data: SymptomFrequency[]
  maxItems?: number
}

export function SymptomChart({ data, maxItems = 8 }: SymptomChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-therapy-muted">
        Nothing to show yet
      </div>
    )
  }

  const sortedData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxItems)

  // Map intensity: highest count = darkest
  const maxCount = sortedData[0]?.count || 1

  const CustomTooltip = ({ active, payload }: {
    active?: boolean
    payload?: Array<{ payload: SymptomFrequency }>
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-white/95 backdrop-blur-sm border border-sage-200 rounded-xl shadow-lg px-3 py-2">
          <p className="text-sm font-medium text-therapy-text">{d.symptom}</p>
          <p className="text-xs text-therapy-muted">Came up {d.count} {d.count === 1 ? 'time' : 'times'}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          barCategoryGap="25%"
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="symptom"
            tick={{ fontSize: 12, fill: '#3d3d3d' }}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]}>
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill="#6b8f71"
                opacity={0.3 + (entry.count / maxCount) * 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
