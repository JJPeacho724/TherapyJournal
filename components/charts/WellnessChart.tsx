'use client'

import { useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import type { MoodDataPoint } from '@/lib/dashboard-utils'
import { TimeRangeSelector, filterByTimeRange, type TimeRange } from './TimeRangeSelector'

interface WellnessChartProps {
  data: MoodDataPoint[]
}

const moodDescriptions = [
  'Very difficult', 'Difficult', 'Challenging', 'Below average',
  'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Wonderful'
]

export function WellnessChart({ data }: WellnessChartProps) {
  const [range, setRange] = useState<TimeRange>('1M')

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-therapy-muted/60">
        <p className="text-sm">Your mood journey will appear here</p>
      </div>
    )
  }

  const filtered = filterByTimeRange(data, range)

  const formattedData = filtered.map((d) => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }),
  }))

  // Summary for selected range
  const avg = filtered.length > 0
    ? filtered.reduce((s, d) => s + d.mood, 0) / filtered.length
    : 0
  const avgDesc = moodDescriptions[Math.min(Math.max(Math.round(avg) - 1, 0), 9)]
  const delta = filtered.length >= 2
    ? filtered[filtered.length - 1].mood - filtered[0].mood
    : 0

  const CustomTooltip = ({ active, payload }: {
    active?: boolean
    payload?: Array<{ payload: typeof formattedData[0] }>
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      const desc = moodDescriptions[Math.min(Math.max(Math.round(d.mood) - 1, 0), 9)]
      return (
        <div className="bg-white/95 backdrop-blur-sm border border-sage-200 rounded-xl shadow-lg px-3 py-2">
          <p className="text-xs text-therapy-muted">{d.displayDate}</p>
          <p className="text-sm font-medium text-therapy-text">{desc}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div>
      {/* Header row: range selector + summary */}
      <div className="flex items-center justify-between px-5 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-medium text-therapy-text">{avgDesc}</span>
          {delta !== 0 && (
            <span className={`text-xs font-medium ${delta > 0 ? 'text-sage-600' : 'text-warm-600'}`}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}
            </span>
          )}
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {/* Chart */}
      {formattedData.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-therapy-muted/60">
          <p className="text-sm">No entries in this time period</p>
        </div>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="wellnessGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6b8f71" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#6b8f71" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis domain={[1, 10]} hide />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Area
                type="monotone"
                dataKey="mood"
                stroke="#6b8f71"
                strokeWidth={2}
                fill="url(#wellnessGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: '#6b8f71',
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
