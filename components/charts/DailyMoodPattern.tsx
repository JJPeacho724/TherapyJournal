'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import type { TimeOfDayMoodSummary } from '@/types'

interface DailyMoodPatternProps {
  data: TimeOfDayMoodSummary[]
}

const TIME_COLORS: Record<string, string> = {
  morning: '#f4a261',
  afternoon: '#e9c46a',
  evening: '#2a9d8f',
  night: '#264653',
}

const TIME_ICONS: Record<string, string> = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌆',
  night: '🌙',
}

export function DailyMoodPattern({ data }: DailyMoodPatternProps) {
  if (data.length === 0 || data.every(d => d.entryCount === 0)) {
    return (
      <div className="h-52 sm:h-56 flex items-center justify-center text-therapy-muted">
        <div className="text-center">
          <p>Not enough data yet</p>
          <p className="text-sm mt-1">Journal at different times to see patterns</p>
        </div>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload }: {
    active?: boolean
    payload?: Array<{ payload: TimeOfDayMoodSummary }>
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      if (d.entryCount === 0) return null

      const moodDesc = [
        'Very difficult', 'Difficult', 'Challenging', 'Below average',
        'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Wonderful'
      ][Math.min(Math.max(Math.round(d.avgMood) - 1, 0), 9)]

      return (
        <div className="bg-white/95 backdrop-blur-sm border border-sage-200 rounded-xl shadow-lg px-3 py-2 max-w-[200px]">
          <p className="text-sm font-medium text-therapy-text">
            {TIME_ICONS[d.timeOfDay]} {d.label}
          </p>
          <p className="text-xs text-therapy-muted">{d.hourRange}</p>
          <p className="text-xs text-therapy-text mt-1">
            Mood: {d.avgMood.toFixed(1)}/10 &mdash; {moodDesc}
          </p>
          <p className="text-xs text-therapy-muted">
            From {d.entryCount} {d.entryCount === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="h-52 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, left: -10, bottom: 4 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0eeeb" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#3d3d3d' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={{ fontSize: 10, fill: '#b0b0b0' }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Bar dataKey="avgMood" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.timeOfDay}
                fill={TIME_COLORS[entry.timeOfDay]}
                opacity={entry.entryCount > 0 ? 0.85 : 0.15}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Detailed hourly view component (kept for potential use)
interface HourlyMoodViewProps {
  data: Array<{
    hour: number
    displayHour: string
    mood: number | null
    anxiety: number | null
    entryCount: number
  }>
}

export function HourlyMoodView({ data }: HourlyMoodViewProps) {
  const hoursWithData = data.filter(d => d.entryCount > 0)

  if (hoursWithData.length === 0) {
    return (
      <div className="h-44 sm:h-48 flex items-center justify-center text-therapy-muted">
        No hourly data available yet
      </div>
    )
  }

  const getTimeColor = (hour: number) => {
    if (hour >= 5 && hour < 12) return TIME_COLORS.morning
    if (hour >= 12 && hour < 17) return TIME_COLORS.afternoon
    if (hour >= 17 && hour < 21) return TIME_COLORS.evening
    return TIME_COLORS.night
  }

  return (
    <div className="h-44 sm:h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={hoursWithData}
          margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
        >
          <XAxis
            dataKey="displayHour"
            tick={{ fontSize: 10, fill: '#b0b0b0' }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: '#b0b0b0' }}
            tickLine={false}
            axisLine={false}
            width={35}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(4px)',
              border: '1px solid #e3e7e3',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [
              value?.toFixed(1) || '—',
              name === 'mood' ? 'Mood' : 'Anxiety'
            ]}
          />
          <Bar dataKey="mood" radius={[4, 4, 0, 0]}>
            {hoursWithData.map((entry) => (
              <Cell key={entry.hour} fill={getTimeColor(entry.hour)} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}



