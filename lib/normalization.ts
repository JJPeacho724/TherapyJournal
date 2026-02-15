import { STD_FLOOR, Z_SCORE_CLAMP } from '@/lib/constants'

export type RunningStats = {
  mean: number
  std: number
  count: number
}

export type EwmaStats = {
  mean: number
  std: number
  count: number
  lastUpdatedAt: string | null
}

const LN2 = Math.log(2)

/** Clamp a number to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Calculate a z-score from a raw value and a baseline.
 *
 * Hardening:
 *  - A std floor of {@link STD_FLOOR} prevents division-by-near-zero.
 *  - The result is clamped to ±{@link Z_SCORE_CLAMP}.
 *  - Returns 0 when baseline has fewer than 2 observations (cold-start).
 */
export function calculateZScore(
  rawScore: number,
  baseline: { mean: number; std: number; count: number }
): number {
  if (!Number.isFinite(rawScore)) return 0
  if (!baseline || baseline.count < 2) return 0
  // Apply std floor to prevent explosion when std ≈ 0
  const std = Math.max(baseline.std, STD_FLOOR)
  if (!Number.isFinite(std)) return 0
  const z = (rawScore - baseline.mean) / std
  // Clamp z-score magnitude
  return clamp(z, -Z_SCORE_CLAMP, Z_SCORE_CLAMP)
}

/**
 * Update running mean/std using Welford's algorithm.
 * We reconstruct M2 from (std, count) assuming std came from sample variance: var = M2 / (n-1).
 */
export function updateRunningStats(current: RunningStats, newValue: number): RunningStats {
  const prevCount = Math.max(0, current?.count ?? 0)
  const prevMean = Number.isFinite(current?.mean) ? current.mean : 0
  const prevStd = Number.isFinite(current?.std) ? current.std : 0
  const prevVar = prevCount >= 2 ? prevStd * prevStd : 0
  let m2 = prevCount >= 2 ? prevVar * (prevCount - 1) : 0

  const count = prevCount + 1
  const delta = newValue - prevMean
  const mean = prevMean + delta / count
  const delta2 = newValue - mean
  m2 += delta * delta2

  const variance = count >= 2 ? m2 / (count - 1) : 0
  const std = Math.sqrt(Math.max(0, variance))

  return { mean, std, count }
}

export type EwmaUpdateOptions = {
  now?: Date
  halfLifeDays?: number
}

/**
 * Approximate rolling-window baseline using time-decayed EWMA mean and EW variance.
 *
 * We store only (mean, std, count, lastUpdatedAt). Decay is computed from time since last update.
 * halfLifeDays controls how quickly older samples fade; larger = slower change.
 */
export function updateEwmaStats(
  current: EwmaStats,
  newValue: number,
  opts: EwmaUpdateOptions = {}
): EwmaStats {
  const now = opts.now ?? new Date()
  const halfLifeDays = opts.halfLifeDays ?? 45
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000

  const prevMean = Number.isFinite(current?.mean) ? current.mean : newValue
  const prevStd = Number.isFinite(current?.std) ? current.std : 0
  const prevVar = prevStd * prevStd
  const prevCount = Math.max(0, current?.count ?? 0)
  const prevUpdatedAt = current?.lastUpdatedAt ? new Date(current.lastUpdatedAt) : null

  const dt = prevUpdatedAt ? Math.max(0, now.getTime() - prevUpdatedAt.getTime()) : 0
  const decay = prevUpdatedAt ? Math.exp((-LN2 * dt) / Math.max(1, halfLifeMs)) : 0
  const oneMinus = 1 - decay

  // EWMA mean
  const mean = decay * prevMean + oneMinus * newValue

  // EW variance update (numerically stable form)
  const varNew = decay * prevVar + oneMinus * (newValue - prevMean) * (newValue - mean)
  const std = Math.sqrt(Math.max(0, varNew))

  return {
    mean,
    std,
    count: prevCount + 1,
    lastUpdatedAt: now.toISOString(),
  }
}

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26).
 */
function erf(x: number): number {
  // Save the sign of x
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)

  // Coefficients
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const t = 1 / (1 + p * ax)
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax)
  return sign * y
}

/**
 * Convert a z-score to a percentile (0..1) using a normal CDF approximation.
 */
export function zToPercentile(z: number): number {
  if (!Number.isFinite(z)) return 0.5
  const cdf = 0.5 * (1 + erf(z / Math.SQRT2))
  return Math.min(1, Math.max(0, cdf))
}

function clampInt(x: number, lo: number, hi: number): number {
  const v = Math.round(x)
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Map z-scores (higher = better) into bounded clinical scale estimates.
 * These are AI-derived equivalents for trend/normalization, not formal instrument administration.
 */
export function mapToValidatedScale(zScore: number, targetScale: 'phq9' | 'gad7'): number {
  // We use a bounded logistic mapping: score = max * sigmoid(k*(z - b)),
  // where higher z => lower symptom score.
  if (!Number.isFinite(zScore)) zScore = 0

  if (targetScale === 'phq9') {
    const max = 27
    const k = 0.9
    const b = -0.6
    const s = 1 / (1 + Math.exp(k * (zScore - b)))
    return clampInt(max * s, 0, 27)
  }

  // gad7
  const max = 21
  const k = 1.0
  const b = -0.4
  const s = 1 / (1 + Math.exp(k * (zScore - b)))
  return clampInt(max * s, 0, 21)
}

/**
 * Reverse-code anxiety (1-10, higher = more anxious) into calmness
 * (1-10, higher = calmer) so that z-score direction is consistent:
 * positive z = "better than baseline" for both mood and calmness.
 *
 * Note: DB columns still use "anxiety_z_score" for backward compatibility,
 * but they store calmness-direction z-scores.
 */
export function anxietyToCalmness(anxietyScore: number): number {
  return 11 - anxietyScore
}





