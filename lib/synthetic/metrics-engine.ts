/**
 * Metrics engine for synthetic demo data.
 *
 * Computes composite score, EWMA baselines, z-scores,
 * rolling 7-day volatility (std dev), and 7d/14d slopes.
 *
 * Reuses existing normalization functions for consistency
 * with the production pipeline.
 */

import { updateEwmaStats, calculateZScore, anxietyToCalmness } from '@/lib/normalization'
import type { EwmaStats } from '@/lib/normalization'
import { linearSlope } from '@/lib/longitudinal-profile'
import type { MetricsTimePoint } from '@/types/synthetic'

/**
 * Composite wellness score.
 * Uses anxietyToCalmness() to reverse-code anxiety (1-10 scale)
 * so higher = better for both dimensions.
 *
 * composite = 0.5 * mood + 0.5 * calmness
 * where calmness = 11 - anxiety (range 1-10)
 */
export function compositeScore(mood: number, anxiety: number): number {
  const calmness = anxietyToCalmness(anxiety)
  return Math.round((0.5 * mood + 0.5 * calmness) * 100) / 100
}

/**
 * Compute rolling 7-day standard deviation of composite scores.
 * Returns null if fewer than 2 values in the window.
 */
export function rollingVolatility(
  composites: number[],
  currentIndex: number,
  windowSize: number = 7
): number | null {
  const start = Math.max(0, currentIndex - windowSize + 1)
  const window = composites.slice(start, currentIndex + 1)
  if (window.length < 2) return null

  const mean = window.reduce((s, v) => s + v, 0) / window.length
  const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / (window.length - 1)
  return Math.round(Math.sqrt(variance) * 1000) / 1000
}

/**
 * Compute slope over the last N days of composite scores.
 * Uses the exported linearSlope from longitudinal-profile.ts.
 * Returns slope in units per day, or null if not enough data.
 */
export function computeSlope(
  composites: { dayIndex: number; value: number }[],
  currentIndex: number,
  windowDays: number
): number | null {
  const startDay = Math.max(0, currentIndex - windowDays + 1)
  const window = composites.filter(
    (p) => p.dayIndex >= startDay && p.dayIndex <= currentIndex
  )
  if (window.length < 2) return null

  const msPerDay = 24 * 60 * 60 * 1000
  const points = window.map((p) => ({
    t: p.dayIndex * msPerDay,
    v: p.value,
  }))

  const slopePerMs = linearSlope(points)
  if (slopePerMs == null) return null
  return Math.round(slopePerMs * msPerDay * 1000) / 1000
}

/**
 * Compute full metrics time series for a synthetic patient
 * from their raw daily scores.
 *
 * Processes entries oldest-first, maintaining an EWMA baseline
 * and computing z-scores, volatility, and slopes incrementally.
 */
export function computeMetricsTimeSeries(
  entries: {
    dayIndex: number
    date: string
    moodScore: number
    anxietyScore: number
  }[]
): MetricsTimePoint[] {
  if (entries.length === 0) return []

  const sorted = [...entries].sort((a, b) => a.dayIndex - b.dayIndex)

  let ewma: EwmaStats = {
    mean: 0,
    std: 0,
    count: 0,
    lastUpdatedAt: null,
  }

  const composites: number[] = []
  const compositePoints: { dayIndex: number; value: number }[] = []
  const results: MetricsTimePoint[] = []

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]
    const comp = compositeScore(entry.moodScore, entry.anxietyScore)
    composites.push(comp)
    compositePoints.push({ dayIndex: entry.dayIndex, value: comp })

    // Update EWMA baseline with this day's composite
    const entryDate = new Date(entry.date)
    ewma = updateEwmaStats(ewma, comp, { now: entryDate, halfLifeDays: 45 })

    // Z-score: only after at least 5 observations
    const zScore =
      ewma.count >= 5
        ? calculateZScore(comp, {
            mean: ewma.mean,
            std: ewma.std,
            count: ewma.count,
          })
        : null

    // Rolling 7-day volatility (std dev)
    const vol = rollingVolatility(composites, i, 7)

    // Slopes
    const s7 = computeSlope(compositePoints, entry.dayIndex, 7)
    const s14 = computeSlope(compositePoints, entry.dayIndex, 14)

    results.push({
      date: entry.date,
      dayIndex: entry.dayIndex,
      moodScore: entry.moodScore,
      anxietyScore: entry.anxietyScore,
      composite: comp,
      zScore: zScore != null ? Math.round(zScore * 100) / 100 : null,
      volatility7d: vol,
      slope7d: s7,
      slope14d: s14,
    })
  }

  return results
}
