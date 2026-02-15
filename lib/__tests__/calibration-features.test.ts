import { describe, it, expect } from 'vitest'
import {
  CALIBRATION_DEFAULT_MAX_FEATURES,
  CALIBRATION_MIN_FEATURE_SUPPORT,
  CALIBRATION_MIN_FEATURES_TO_USE,
} from '@/lib/constants'

/**
 * These tests exercise the feature selection logic from calibration.ts
 * in isolation (without requiring Neo4j connections).
 *
 * The logic is extracted here to mirror the actual implementation:
 *   1) dynamicMaxFeatures = min(maxFeatures, floor(N/2))
 *   2) filter by min_support >= CALIBRATION_MIN_FEATURE_SUPPORT
 *   3) if < CALIBRATION_MIN_FEATURES_TO_USE survive, fallback to base-only
 */

function selectFeatures(
  rows: Array<{ featureIds: string[] }>,
  maxFeaturesOpt?: number,
): { effectiveFeatureIds: string[]; useFeatures: boolean; dynamicMaxFeatures: number } {
  const N = rows.length
  const dynamicMaxFeatures = Math.min(
    maxFeaturesOpt ?? CALIBRATION_DEFAULT_MAX_FEATURES,
    Math.floor(N / 2),
  )

  const freq = new Map<string, number>()
  for (const r of rows) {
    for (const fid of r.featureIds) freq.set(fid, (freq.get(fid) ?? 0) + 1)
  }

  const topFeatureIds = Array.from(freq.entries())
    .filter(([, count]) => count >= CALIBRATION_MIN_FEATURE_SUPPORT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, dynamicMaxFeatures)
    .map(([fid]) => fid)

  const useFeatures = topFeatureIds.length >= CALIBRATION_MIN_FEATURES_TO_USE
  const effectiveFeatureIds = useFeatures ? topFeatureIds : []

  return { effectiveFeatureIds, useFeatures, dynamicMaxFeatures }
}

describe('calibration feature selection', () => {
  it('with N=10: max features = min(30, 5) = 5', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      featureIds: [`f${i % 8}`], // 8 unique features, freq varies
    }))

    const result = selectFeatures(rows)
    expect(result.dynamicMaxFeatures).toBe(5) // floor(10/2) = 5
  })

  it('with N=20: max features = min(30, 10) = 10', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      featureIds: [`f${i % 15}`],
    }))

    const result = selectFeatures(rows)
    expect(result.dynamicMaxFeatures).toBe(10) // floor(20/2) = 10
  })

  it('with N=100: max features = min(30, 50) = 30', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      featureIds: [`f${i % 40}`],
    }))

    const result = selectFeatures(rows)
    expect(result.dynamicMaxFeatures).toBe(30) // capped at 30
  })

  it('features appearing only once are excluded (min_support = 2)', () => {
    // 20 rows so dynamicMaxFeatures = floor(20/2) = 10
    // f0 appears 6 times, f1 appears 1 time, f2-f6 appear 2+ times, f7 appears 1 time
    const rows = [
      { featureIds: ['f0', 'f1'] },
      { featureIds: ['f0', 'f2'] },
      { featureIds: ['f0', 'f3'] },
      { featureIds: ['f0', 'f4'] },
      { featureIds: ['f0', 'f5'] },
      { featureIds: ['f0', 'f6'] },
      { featureIds: ['f2', 'f3'] },
      { featureIds: ['f4', 'f5'] },
      { featureIds: ['f6', 'f7'] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
    ]

    const result = selectFeatures(rows)
    // f1 and f7 appear only once => excluded
    expect(result.effectiveFeatureIds).not.toContain('f1')
    expect(result.effectiveFeatureIds).not.toContain('f7')
    // f0, f2, f3, f4, f5, f6 appear >= 2 times => included
    expect(result.effectiveFeatureIds).toContain('f0')
    expect(result.effectiveFeatureIds).toContain('f2')
    expect(result.effectiveFeatureIds).toContain('f3')
    expect(result.effectiveFeatureIds).toContain('f4')
    expect(result.effectiveFeatureIds).toContain('f5')
    expect(result.effectiveFeatureIds).toContain('f6')
  })

  it('when < 5 features survive, falls back to base predictors only', () => {
    // 10 rows, only 3 features each appearing twice => 3 < 5
    const rows = [
      { featureIds: ['f0'] },
      { featureIds: ['f0'] },
      { featureIds: ['f1'] },
      { featureIds: ['f1'] },
      { featureIds: ['f2'] },
      { featureIds: ['f2'] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
      { featureIds: [] },
    ]

    const result = selectFeatures(rows)
    expect(result.useFeatures).toBe(false)
    expect(result.effectiveFeatureIds).toHaveLength(0)
  })

  it('when >= 5 features survive, uses feature indicators', () => {
    // 20 rows, 6 features each appearing >= 2 times
    const rows = Array.from({ length: 20 }, (_, i) => ({
      featureIds: [`f${i % 6}`],
    }))

    const result = selectFeatures(rows)
    expect(result.useFeatures).toBe(true)
    expect(result.effectiveFeatureIds.length).toBeGreaterThanOrEqual(5)
  })
})
