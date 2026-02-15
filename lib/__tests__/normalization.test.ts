import { describe, it, expect } from 'vitest'
import { calculateZScore, updateEwmaStats, anxietyToCalmness } from '@/lib/normalization'
import { STD_FLOOR, Z_SCORE_CLAMP, MIN_ENTRIES_FOR_Z } from '@/lib/constants'

describe('calculateZScore', () => {
  it('should use STD_FLOOR when baseline std is near zero', () => {
    const z = calculateZScore(7, { mean: 5, std: 0.001, count: 10 })
    // With STD_FLOOR = 0.75: z = (7 - 5) / 0.75 = 2.667
    expect(z).toBeCloseTo(2 / STD_FLOOR, 2)
    expect(Number.isFinite(z)).toBe(true)
  })

  it('should use STD_FLOOR when baseline std is exactly zero', () => {
    const z = calculateZScore(6, { mean: 5, std: 0, count: 10 })
    expect(z).toBeCloseTo(1 / STD_FLOOR, 2)
    expect(Number.isFinite(z)).toBe(true)
  })

  it('should clamp z-scores to ±Z_SCORE_CLAMP', () => {
    // Very extreme deviation
    const z = calculateZScore(100, { mean: 5, std: 1, count: 10 })
    expect(z).toBe(Z_SCORE_CLAMP)

    const zNeg = calculateZScore(-100, { mean: 5, std: 1, count: 10 })
    expect(zNeg).toBe(-Z_SCORE_CLAMP)
  })

  it('should return 0 for cold-start (count < 2)', () => {
    expect(calculateZScore(7, { mean: 5, std: 1, count: 0 })).toBe(0)
    expect(calculateZScore(7, { mean: 5, std: 1, count: 1 })).toBe(0)
  })

  it('should return 0 for non-finite raw score', () => {
    expect(calculateZScore(NaN, { mean: 5, std: 1, count: 10 })).toBe(0)
    expect(calculateZScore(Infinity, { mean: 5, std: 1, count: 10 })).toBe(0)
  })

  it('should compute normal z-scores for valid inputs', () => {
    const z = calculateZScore(7, { mean: 5, std: 2, count: 10 })
    expect(z).toBeCloseTo(1.0, 5)
  })

  it('should not clamp z-scores within normal range', () => {
    const z = calculateZScore(6, { mean: 5, std: 1, count: 10 })
    expect(z).toBeCloseTo(1.0, 5)
    expect(Math.abs(z)).toBeLessThan(Z_SCORE_CLAMP)
  })
})

describe('updateEwmaStats', () => {
  it('should increase count on each update', () => {
    const initial = { mean: 5, std: 0, count: 0, lastUpdatedAt: null }
    const updated = updateEwmaStats(initial, 6)
    expect(updated.count).toBe(1)

    const updated2 = updateEwmaStats(updated, 7)
    expect(updated2.count).toBe(2)
  })

  it('should update mean toward new values', () => {
    // Need a time gap so decay < 1 and the new value shifts the mean
    const past = new Date('2026-01-01T00:00:00Z')
    const now = new Date('2026-01-10T00:00:00Z') // 9 days later
    const initial = { mean: 5, std: 1, count: 10, lastUpdatedAt: past.toISOString() }
    const updated = updateEwmaStats(initial, 8, { now })
    // Mean should move toward 8
    expect(updated.mean).toBeGreaterThan(5)
    expect(updated.mean).toBeLessThan(8)
  })

  it('should set lastUpdatedAt timestamp', () => {
    const now = new Date('2026-01-15T12:00:00Z')
    const initial = { mean: 5, std: 0, count: 0, lastUpdatedAt: null }
    const updated = updateEwmaStats(initial, 5, { now })
    expect(updated.lastUpdatedAt).toBe(now.toISOString())
  })
})

describe('anxietyToCalmness', () => {
  it('should reverse-code anxiety 1-10 to calmness 1-10', () => {
    expect(anxietyToCalmness(1)).toBe(10)
    expect(anxietyToCalmness(10)).toBe(1)
    expect(anxietyToCalmness(5)).toBe(6)
    expect(anxietyToCalmness(6)).toBe(5)
  })
})

describe('MIN_ENTRIES_FOR_Z constant', () => {
  it('should be 5 (pipeline requirement)', () => {
    expect(MIN_ENTRIES_FOR_Z).toBe(5)
  })
})
