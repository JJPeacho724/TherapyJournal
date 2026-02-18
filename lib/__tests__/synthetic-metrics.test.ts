import { describe, it, expect } from 'vitest'
import {
  compositeScore,
  rollingVolatility,
  computeSlope,
  computeMetricsTimeSeries,
} from '../synthetic/metrics-engine'
import { updateEwmaStats, calculateZScore } from '../normalization'
import type { EwmaStats } from '../normalization'

describe('compositeScore', () => {
  it('returns correct composite from mood and anxiety', () => {
    // mood=6, anxiety=4 => calmness = 11-4 = 7, composite = 0.5*6 + 0.5*7 = 6.5
    expect(compositeScore(6, 4)).toBe(6.5)
  })

  it('handles boundary values', () => {
    // mood=10, anxiety=1 => calmness=10, composite=10
    expect(compositeScore(10, 1)).toBe(10)
    // mood=1, anxiety=10 => calmness=1, composite=1
    expect(compositeScore(1, 10)).toBe(1)
  })

  it('returns midpoint for equal mood and calmness', () => {
    // mood=5, anxiety=6 => calmness=5, composite=5
    expect(compositeScore(5, 6)).toBe(5)
  })
})

describe('rollingVolatility', () => {
  it('returns null for fewer than 2 values', () => {
    expect(rollingVolatility([5], 0, 7)).toBeNull()
  })

  it('returns 0 for constant values', () => {
    const vals = [5, 5, 5, 5, 5, 5, 5]
    expect(rollingVolatility(vals, 6, 7)).toBe(0)
  })

  it('computes correct std dev for known data', () => {
    // Values: [2, 4, 4, 4, 5, 5, 7] => mean=4.43, sample std ≈ 1.512
    const vals = [2, 4, 4, 4, 5, 5, 7]
    const vol = rollingVolatility(vals, 6, 7)
    expect(vol).not.toBeNull()
    expect(vol!).toBeCloseTo(1.512, 2)
  })

  it('uses correct window size', () => {
    const vals = [1, 1, 1, 1, 1, 10, 10]
    // Window of 3: last 3 values = [1, 10, 10], mean=7, std ≈ 5.196
    const vol = rollingVolatility(vals, 6, 3)
    expect(vol).not.toBeNull()
    expect(vol!).toBeCloseTo(5.196, 2)
  })
})

describe('computeSlope', () => {
  it('returns null for fewer than 2 points', () => {
    const points = [{ dayIndex: 0, value: 5 }]
    expect(computeSlope(points, 0, 7)).toBeNull()
  })

  it('returns correct slope for linear data', () => {
    // Perfect line: y = 2 + 0.5x
    const points = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      value: 2 + 0.5 * i,
    }))
    const slope = computeSlope(points, 6, 7)
    expect(slope).not.toBeNull()
    expect(slope!).toBeCloseTo(0.5, 2)
  })

  it('returns 0 for flat data', () => {
    const points = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      value: 5,
    }))
    const slope = computeSlope(points, 6, 7)
    expect(slope).not.toBeNull()
    expect(slope!).toBeCloseTo(0, 5)
  })

  it('returns negative slope for declining data', () => {
    const points = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      value: 8 - i,
    }))
    const slope = computeSlope(points, 6, 7)
    expect(slope).not.toBeNull()
    expect(slope!).toBeCloseTo(-1, 2)
  })
})

describe('EWMA baseline update', () => {
  it('converges toward repeated values', () => {
    let ewma: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
    const baseDate = new Date('2025-01-01')

    // Feed 20 values of 5
    for (let i = 0; i < 20; i++) {
      const date = new Date(baseDate)
      date.setDate(date.getDate() + i)
      ewma = updateEwmaStats(ewma, 5, { now: date, halfLifeDays: 45 })
    }

    expect(ewma.mean).toBeCloseTo(5, 1)
    expect(ewma.std).toBeLessThan(0.5)
    expect(ewma.count).toBe(20)
  })

  it('tracks changing values', () => {
    let ewma: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
    const baseDate = new Date('2025-01-01')

    // Feed increasing values 1..10
    for (let i = 1; i <= 10; i++) {
      const date = new Date(baseDate)
      date.setDate(date.getDate() + i)
      ewma = updateEwmaStats(ewma, i, { now: date, halfLifeDays: 45 })
    }

    // Mean should be above initial (0) and below max (10)
    // With 45-day half-life and daily increments, EWMA adapts slowly
    expect(ewma.mean).toBeGreaterThan(1)
    expect(ewma.mean).toBeLessThan(10)
    expect(ewma.std).toBeGreaterThan(0)
  })
})

describe('calculateZScore', () => {
  it('returns 0 for count < 2', () => {
    expect(calculateZScore(5, { mean: 5, std: 1, count: 1 })).toBe(0)
  })

  it('returns 0 for value equal to mean', () => {
    expect(calculateZScore(5, { mean: 5, std: 1, count: 10 })).toBe(0)
  })

  it('returns positive z for value above mean', () => {
    const z = calculateZScore(7, { mean: 5, std: 1, count: 10 })
    expect(z).toBeGreaterThan(0)
    expect(z).toBeCloseTo(2, 1)
  })

  it('returns negative z for value below mean', () => {
    const z = calculateZScore(3, { mean: 5, std: 1, count: 10 })
    expect(z).toBeLessThan(0)
    expect(z).toBeCloseTo(-2, 1)
  })

  it('clamps extreme z-scores', () => {
    const z = calculateZScore(100, { mean: 5, std: 0.75, count: 10 })
    expect(z).toBeLessThanOrEqual(5)
  })
})

describe('computeMetricsTimeSeries', () => {
  it('returns empty array for empty input', () => {
    expect(computeMetricsTimeSeries([])).toEqual([])
  })

  it('computes full metrics for a series', () => {
    const entries = Array.from({ length: 14 }, (_, i) => ({
      dayIndex: i,
      date: new Date(2025, 0, i + 1).toISOString(),
      moodScore: 5 + (i * 0.2),
      anxietyScore: 5 - (i * 0.1),
    }))

    const metrics = computeMetricsTimeSeries(entries)

    expect(metrics).toHaveLength(14)

    // First few points should have null z-scores (cold start)
    expect(metrics[0].zScore).toBeNull()
    expect(metrics[3].zScore).toBeNull()

    // After 5 entries, z-scores should be populated
    expect(metrics[5].zScore).not.toBeNull()

    // Volatility should be populated after 2 entries
    expect(metrics[1].volatility7d).not.toBeNull()

    // Slopes should be populated after 7 entries
    expect(metrics[7].slope7d).not.toBeNull()

    // All composites should be computed
    for (const m of metrics) {
      expect(m.composite).toBeGreaterThan(0)
      expect(m.composite).toBeLessThanOrEqual(10)
    }
  })
})
