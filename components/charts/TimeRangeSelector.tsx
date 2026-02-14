'use client'

import { useState } from 'react'

export type TimeRange = '1W' | '1M' | '3M' | 'All'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

const ranges: { key: TimeRange; label: string }[] = [
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: 'All', label: 'All' },
]

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-sage-50 rounded-lg p-0.5">
      {ranges.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`
            px-3 py-1 rounded-md text-xs font-medium transition-all duration-200
            ${value === key
              ? 'bg-white text-therapy-text shadow-sm'
              : 'text-therapy-muted hover:text-therapy-text'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Helper: filter data points by time range
export function filterByTimeRange<T extends { date: string }>(data: T[], range: TimeRange): T[] {
  if (range === 'All') return data

  const now = new Date()
  let cutoff: Date

  switch (range) {
    case '1W':
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '1M':
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case '3M':
      cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
  }

  return data.filter(d => new Date(d.date) >= cutoff)
}
