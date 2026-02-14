'use client'

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import type { SleepMoodCorrelation } from '@/types'

interface SleepCorrelationProps {
  data: SleepMoodCorrelation[]
}

export function SleepCorrelation({ data }: SleepCorrelationProps) {
  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-therapy-muted">
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
        <div className="bg-white/95 backdrop-blur-sm border border-sage-200 rounded-xl shadow-lg px-3 py-2">
          <p className="text-sm text-therapy-text">{d.sleep_hours}h sleep</p>
          <p className="text-xs text-therapy-muted">Felt {moodDesc.toLowerCase()}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
            <XAxis
              type="number"
              dataKey="sleep_hours"
              domain={[0, 12]}
              tick={{ fontSize: 11, fill: '#b0b0b0' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="number"
              dataKey="mood"
              domain={[1, 10]}
              tick={{ fontSize: 11, fill: '#b0b0b0' }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <ZAxis range={[50, 50]} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Scatter data={data} fill="#56809c" fillOpacity={0.5} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Axis labels */}
      <div className="flex justify-between px-5 mt-1">
        <span className="text-xs text-therapy-muted/60">Hours of sleep</span>
        <span className="text-xs text-therapy-muted/60">Better mood ↑</span>
      </div>
    </div>
  )
}
