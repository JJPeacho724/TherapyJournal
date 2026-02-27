'use client'

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ZAxis, CartesianGrid } from 'recharts'
import type { SleepMoodCorrelation } from '@/types'

interface SleepCorrelationProps {
  data: SleepMoodCorrelation[]
}

export function SleepCorrelation({ data }: SleepCorrelationProps) {
  if (data.length === 0) {
    return (
      <div className="h-52 sm:h-56 flex items-center justify-center text-therapy-muted">
        Not enough sleep data yet
      </div>
    )
  }

  const CustomTooltip = ({ active, payload }: {
    active?: boolean
    payload?: Array<{ payload: SleepMoodCorrelation }>
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      const moodDesc = [
        'Very difficult', 'Difficult', 'Challenging', 'Below average',
        'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Wonderful'
      ][Math.min(Math.max(Math.round(d.mood) - 1, 0), 9)]

      return (
        <div className="bg-white/95 backdrop-blur-sm border border-sage-200 rounded-xl shadow-lg px-3 py-2 max-w-[200px]">
          <p className="text-sm text-therapy-text">Sleep: {d.sleep_hours}h</p>
          <p className="text-sm text-therapy-text">Mood: {d.mood}/10</p>
          <p className="text-xs text-therapy-muted">Felt {moodDesc.toLowerCase()}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div>
      <div className="h-52 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0eeeb" />
            <XAxis
              type="number"
              dataKey="sleep_hours"
              domain={[0, 12]}
              ticks={[0, 2, 4, 6, 8, 10, 12]}
              tick={{ fontSize: 10, fill: '#b0b0b0' }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Sleep (hours)', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#8a8a8a' }}
            />
            <YAxis
              type="number"
              dataKey="mood"
              domain={[1, 10]}
              ticks={[2, 4, 6, 8, 10]}
              tick={{ fontSize: 10, fill: '#b0b0b0' }}
              tickLine={false}
              axisLine={false}
              width={32}
              label={{ value: 'Mood (1-10)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#8a8a8a' }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Scatter data={data} fill="#56809c" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
