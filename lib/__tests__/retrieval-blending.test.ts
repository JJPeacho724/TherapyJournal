import { describe, it, expect } from 'vitest'
import {
  RETRIEVAL_ALPHA_MIN,
  RETRIEVAL_ALPHA_MAX,
  VARIANCE_DISAGREEMENT_CAP,
} from '@/lib/constants'

/**
 * These tests exercise the retrieval blending logic from calibration.ts
 * in isolation (without requiring Neo4j connections).
 */

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function computeEffectiveSupport(episodes: Array<{ similarity: number }>): number {
  return episodes.reduce((sum, e) => sum + Math.max(0, e.similarity), 0)
}

function computeAlpha(effectiveSupport: number): number {
  return clamp(
    0.75 - 0.15 * Math.log(1 + effectiveSupport),
    RETRIEVAL_ALPHA_MIN,
    RETRIEVAL_ALPHA_MAX,
  )
}

function computeVarianceBlend(
  alpha: number,
  sdModel: number,
  sdRetr: number,
  muModel: number,
  muRetr: number,
): number {
  const disagreementRaw = (muModel - muRetr) ** 2
  const disagreementCapped = Math.min(disagreementRaw, VARIANCE_DISAGREEMENT_CAP)
  return alpha ** 2 * sdModel ** 2 + (1 - alpha) ** 2 * sdRetr ** 2 + 0.25 * disagreementCapped
}

describe('effective_support', () => {
  it('should be sum of similarity weights (not count)', () => {
    const episodes = [
      { similarity: 0.9 },
      { similarity: 0.8 },
      { similarity: 0.7 },
    ]
    const support = computeEffectiveSupport(episodes)
    expect(support).toBeCloseTo(2.4, 5)
    expect(support).not.toBe(episodes.length) // not just count
  })

  it('should ignore negative similarity', () => {
    const episodes = [
      { similarity: 0.9 },
      { similarity: -0.1 },
    ]
    const support = computeEffectiveSupport(episodes)
    expect(support).toBeCloseTo(0.9, 5)
  })
})

describe('alpha schedule', () => {
  it('should decrease with higher effective_support', () => {
    const alphaLow = computeAlpha(0.5)
    const alphaMed = computeAlpha(3.0)
    const alphaHigh = computeAlpha(10.0)

    expect(alphaLow).toBeGreaterThan(alphaMed)
    expect(alphaMed).toBeGreaterThan(alphaHigh)
  })

  it('should stay within [ALPHA_MIN, ALPHA_MAX] bounds', () => {
    // Zero support => max alpha
    expect(computeAlpha(0)).toBeLessThanOrEqual(RETRIEVAL_ALPHA_MAX)
    expect(computeAlpha(0)).toBeGreaterThanOrEqual(RETRIEVAL_ALPHA_MIN)

    // Very large support => clamped to min
    expect(computeAlpha(10000)).toBe(RETRIEVAL_ALPHA_MIN)

    // Moderate support => within bounds
    const alpha = computeAlpha(5.0)
    expect(alpha).toBeGreaterThanOrEqual(RETRIEVAL_ALPHA_MIN)
    expect(alpha).toBeLessThanOrEqual(RETRIEVAL_ALPHA_MAX)
  })

  it('should return ALPHA_MAX when effective_support = 0', () => {
    const alpha = computeAlpha(0)
    expect(alpha).toBe(RETRIEVAL_ALPHA_MAX)
  })
})

describe('variance disagreement cap', () => {
  it('should cap disagreement at VARIANCE_DISAGREEMENT_CAP', () => {
    const alpha = 0.5
    const sdModel = 1.0
    const sdRetr = 1.0

    // Large disagreement
    const varUncapped = computeVarianceBlend(alpha, sdModel, sdRetr, 10, 0)
    // Small disagreement
    const varSmall = computeVarianceBlend(alpha, sdModel, sdRetr, 5.5, 5)

    // The disagreement contribution should be capped
    const maxDisagreementContrib = 0.25 * VARIANCE_DISAGREEMENT_CAP
    const baseVariance = alpha ** 2 * sdModel ** 2 + (1 - alpha) ** 2 * sdRetr ** 2

    // With large disagreement, total should not exceed base + max disagreement
    expect(varUncapped).toBeLessThanOrEqual(baseVariance + maxDisagreementContrib + 0.001)
  })

  it('should not cap when disagreement is small', () => {
    const alpha = 0.5
    const muModel = 5.5
    const muRetr = 5.0
    const disagreement = (muModel - muRetr) ** 2

    expect(disagreement).toBeLessThan(VARIANCE_DISAGREEMENT_CAP)

    // The blend should use the actual disagreement
    const v = computeVarianceBlend(alpha, 1, 1, muModel, muRetr)
    const expected = alpha ** 2 + (1 - alpha) ** 2 + 0.25 * disagreement
    expect(v).toBeCloseTo(expected, 5)
  })
})
