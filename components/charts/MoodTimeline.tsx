'use client'

import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { MoodDataPoint } from '@/types'
import { TimeRangeSelector, filterByTimeRange, type TimeRange } from './TimeRangeSelector'

interface MoodTimelineProps {
  data: MoodDataPoint[]
  showAnxiety?: boolean
}

export function MoodTimeline({ data, showAnxiety = true }: MoodTimelineProps) {
  const [range, setRange] = useState<TimeRange>('1M')

  if (data.length === 0) {
    return (
      <div className="h-52 sm:h-64 flex items-center justify-center text-therapy-muted">
        No mood data available yet
      </div>
    )
  }

  const filtered = filterByTimeRange(data, range)

  const formattedData = filtered.map((d) => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }),
  }))

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: Array<{ value: number; dataKey: string; color: string }>
    label?: string
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-sm border border-sage-200 rounded-xl shadow-lg px-3 py-2 max-w-[200px]">
          <p className="text-xs text-therapy-muted mb-1">{label}</p>
          {payload.map((p) => (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-sm text-therapy-text">
                {p.dataKey === 'mood' ? 'Mood' : 'Anxiety'}: {p.value}/10
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div>
      {/* Time range selector */}
      <div className="flex justify-end mb-4">
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {formattedData.length === 0 ? (
        <div className="h-52 sm:h-64 flex items-center justify-center text-therapy-muted/60">
          <p className="text-sm">No entries in this time period</p>
        </div>
      ) : (
        <div className="h-52 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedData} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
              <defs>
                <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6b8f71" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6b8f71" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="anxietyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d4a373" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#d4a373" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0eeeb" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 10, fill: '#8a8a8a' }}
                tickLine={false}
                axisLine={false}
                dy={4}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[1, 10]}
                ticks={[2, 4, 6, 8, 10]}
                tick={{ fontSize: 10, fill: '#b0b0b0' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e8e5e0', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="mood"
                stroke="#6b8f71"
                strokeWidth={2}
                fill="url(#moodFill)"
                dot={false}
                activeDot={{ r: 5, fill: '#6b8f71', stroke: '#fff', strokeWidth: 2 }}
              />
              {showAnxiety && (
                <Area
                  type="monotone"
                  dataKey="anxiety"
                  stroke="#d4a373"
                  strokeWidth={1.5}
                  fill="url(#anxietyFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#d4a373', stroke: '#fff', strokeWidth: 2 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      {showAnxiety && formattedData.length > 0 && (
        <div className="flex items-center justify-center gap-5 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-sage-500" />
            <span className="text-xs text-therapy-muted">Mood</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-warm-400" />
            <span className="text-xs text-therapy-muted">Anxiety</span>
          </div>
        </div>
      )}
    </div>
  )
}
