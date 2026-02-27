import { describe, it, expect } from 'vitest'
import {
  computeLongitudinalProfile,
  linearSlope,
} from '@/lib/longitudinal-profile'

function makeSortedEntry(
  daysAgo: number,
  overrides: { mood_score?: number; anxiety_score?: number; symptoms?: string[]; triggers?: string[]; emotions?: string[]; crisis_detected?: boolean; phq9_indicators?: Record<string, number>; phq9_estimate?: number; gad7_estimate?: number; mood_z_score?: number | null } = {}
) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(10, 0, 0, 0)
  return {
    id: `entry-${daysAgo}`,
    created_at: date.toISOString(),
    content: `Journal entry from ${daysAgo} days ago. I felt okay today.`,
    ai_extraction: {
      mood_score: overrides.mood_score ?? 6,
      anxiety_score: overrides.anxiety_score ?? 4,
      symptoms: overrides.symptoms ?? [],
      triggers: overrides.triggers ?? [],
      emotions: overrides.emotions ?? [],
      confidence: 0.9,
      crisis_detected: overrides.crisis_detected ?? false,
      summary: 'test',
      phq9_indicators: overrides.phq9_indicators ?? null,
      phq9_estimate: overrides.phq9_estimate ?? null,
      gad7_estimate: overrides.gad7_estimate ?? null,
      mood_z_score: overrides.mood_z_score ?? null,
    },
  }
}

describe('linearSlope', () => {
  it('returns null for fewer than 2 points', () => {
    expect(linearSlope([{ t: 0, v: 5 }])).toBeNull()
    expect(linearSlope([])).toBeNull()
  })

  it('computes positive slope for increasing data', () => {
    const points = [
      { t: 0, v: 1 },
      { t: 1, v: 2 },
      { t: 2, v: 3 },
    ]
    expect(linearSlope(points)).toBeCloseTo(1, 5)
  })

  it('computes negative slope for decreasing data', () => {
    const points = [
      { t: 0, v: 10 },
      { t: 1, v: 8 },
      { t: 2, v: 6 },
    ]
    expect(linearSlope(points)).toBeCloseTo(-2, 5)
  })

  it('computes zero slope for flat data', () => {
    const points = [
      { t: 0, v: 5 },
      { t: 1, v: 5 },
      { t: 2, v: 5 },
    ]
    expect(linearSlope(points)).toBeCloseTo(0, 5)
  })

  it('returns null when all timestamps are identical', () => {
    const points = [
      { t: 100, v: 5 },
      { t: 100, v: 7 },
    ]
    expect(linearSlope(points)).toBeNull()
  })
})

describe('computeLongitudinalProfile — baseline metrics', () => {
  it('computes mean mood and std for multiple entries', () => {
    const entries = [
      makeSortedEntry(5, { mood_score: 4 }),
      makeSortedEntry(4, { mood_score: 6 }),
      makeSortedEntry(3, { mood_score: 8 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.baseline.sampleCount).toBe(3)
    expect(profile.baseline.meanMood).toBe(6)
    expect(profile.baseline.moodStd).toBeGreaterThan(0)
  })

  it('returns null metrics for empty entries', () => {
    const profile = computeLongitudinalProfile([])
    expect(profile.baseline.meanMood).toBeNull()
    expect(profile.baseline.moodStd).toBeNull()
    expect(profile.baseline.sampleCount).toBe(0)
  })

  it('computes volatility index (mean absolute successive difference)', () => {
    const entries = [
      makeSortedEntry(3, { mood_score: 3 }),
      makeSortedEntry(2, { mood_score: 7 }),
      makeSortedEntry(1, { mood_score: 3 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    // |7-3| + |3-7| = 4 + 4 = 8, / 2 = 4
    expect(profile.baseline.volatilityIndex).toBe(4)
  })

  it('sets volatility to null for single entry', () => {
    const entries = [makeSortedEntry(1, { mood_score: 5 })]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.baseline.volatilityIndex).toBeNull()
  })

  it('computes PHQ-9 and GAD-7 means when present', () => {
    const entries = [
      makeSortedEntry(3, { phq9_estimate: 10, gad7_estimate: 8 }),
      makeSortedEntry(2, { phq9_estimate: 14, gad7_estimate: 12 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.baseline.meanPhq9).toBe(12)
    expect(profile.baseline.meanGad7).toBe(10)
  })
})

describe('computeLongitudinalProfile — symptom clusters', () => {
  it('ranks symptoms by frequency with percentage', () => {
    const entries = [
      makeSortedEntry(5, { symptoms: ['fatigue', 'insomnia'] }),
      makeSortedEntry(4, { symptoms: ['fatigue', 'headache'] }),
      makeSortedEntry(3, { symptoms: ['fatigue'] }),
      makeSortedEntry(2, { symptoms: ['insomnia'] }),
    ]
    const profile = computeLongitudinalProfile(entries)
    const clusters = profile.themes.symptomClusters
    expect(clusters[0].label).toBe('Fatigue')
    expect(clusters[0].count).toBe(3)
    expect(clusters[0].percentage).toBe(75) // 3/4 * 100
  })

  it('normalizes symptom keys (lowercase, trimmed)', () => {
    const entries = [
      makeSortedEntry(3, { symptoms: ['Fatigue '] }),
      makeSortedEntry(2, { symptoms: ['fatigue'] }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.symptomClusters).toHaveLength(1)
    expect(profile.themes.symptomClusters[0].count).toBe(2)
  })

  it('limits to top 8 symptom clusters', () => {
    const manySymptoms = Array.from({ length: 12 }, (_, i) => `symptom_${i}`)
    const entries = [makeSortedEntry(1, { symptoms: manySymptoms })]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.symptomClusters.length).toBeLessThanOrEqual(8)
  })

  it('returns empty clusters for entries with no symptoms', () => {
    const entries = [makeSortedEntry(1, { symptoms: [] })]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.symptomClusters).toEqual([])
  })
})

describe('computeLongitudinalProfile — trigger frequency', () => {
  it('ranks triggers by frequency', () => {
    const entries = [
      makeSortedEntry(3, { triggers: ['work stress', 'family'] }),
      makeSortedEntry(2, { triggers: ['work stress'] }),
      makeSortedEntry(1, { triggers: ['family', 'finances'] }),
    ]
    const profile = computeLongitudinalProfile(entries)
    const triggers = profile.themes.triggers
    expect(triggers[0].label).toBe('Work stress')
    expect(triggers[0].count).toBe(2)
    expect(triggers[1].label).toBe('Family')
    expect(triggers[1].count).toBe(2)
  })
})

describe('computeLongitudinalProfile — sentiment trend', () => {
  it('detects improving sentiment when mood slope is positive', () => {
    const entries = [
      makeSortedEntry(6, { mood_score: 3 }),
      makeSortedEntry(5, { mood_score: 4 }),
      makeSortedEntry(4, { mood_score: 5 }),
      makeSortedEntry(3, { mood_score: 6 }),
      makeSortedEntry(2, { mood_score: 7 }),
      makeSortedEntry(1, { mood_score: 8 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.sentimentTrend).toBe('improving')
    expect(profile.themes.sentimentSlope).toBeGreaterThan(0)
  })

  it('detects declining sentiment when mood slope is negative', () => {
    const entries = [
      makeSortedEntry(6, { mood_score: 8 }),
      makeSortedEntry(5, { mood_score: 7 }),
      makeSortedEntry(4, { mood_score: 6 }),
      makeSortedEntry(3, { mood_score: 5 }),
      makeSortedEntry(2, { mood_score: 4 }),
      makeSortedEntry(1, { mood_score: 3 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.sentimentTrend).toBe('declining')
    expect(profile.themes.sentimentSlope).toBeLessThan(0)
  })

  it('returns insufficient_data for empty entries', () => {
    const profile = computeLongitudinalProfile([])
    expect(profile.themes.sentimentTrend).toBe('insufficient_data')
  })
})

describe('computeLongitudinalProfile — rumination and hopelessness', () => {
  it('counts rumination from symptoms', () => {
    const entries = [
      makeSortedEntry(3, { symptoms: ['rumination'] }),
      makeSortedEntry(2, { symptoms: ['overthinking'] }),
      makeSortedEntry(1, { symptoms: ['fatigue'] }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.ruminationCount).toBe(2)
    expect(profile.themes.ruminationRate).toBeCloseTo(2 / 3, 2)
  })

  it('counts hopelessness from PHQ-9 worthlessness indicator', () => {
    const entries = [
      makeSortedEntry(2, { phq9_indicators: { worthlessness: 2 } }),
      makeSortedEntry(1, { phq9_indicators: { worthlessness: 0 } }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.hopelessnessCount).toBe(1)
  })

  it('detects rumination terms in content text', () => {
    const entries = [{
      ...makeSortedEntry(1),
      content: "I can't stop thinking about what happened. Dwelling on it all day.",
    }]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.themes.ruminationCount).toBe(1)
  })
})

describe('computeLongitudinalProfile — evidence snippets', () => {
  it('includes most recent entry as evidence', () => {
    const entries = [
      makeSortedEntry(3, { mood_score: 5 }),
      makeSortedEntry(2, { mood_score: 6 }),
      makeSortedEntry(1, { mood_score: 7 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.evidence.length).toBeGreaterThan(0)
    expect(profile.evidence.some(e => e.signal === 'Most recent entry')).toBe(true)
  })

  it('includes crisis entry when detected', () => {
    const entries = [
      makeSortedEntry(3, { mood_score: 5 }),
      makeSortedEntry(2, { mood_score: 3, crisis_detected: true }),
      makeSortedEntry(1, { mood_score: 6 }),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.evidence.some(e => e.signal === 'Crisis language detected')).toBe(true)
  })

  it('limits to 3 snippets', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeSortedEntry(i + 1, { mood_score: 3 + (i % 5), mood_z_score: i % 2 === 0 ? 2.5 : -1.5 })
    )
    const profile = computeLongitudinalProfile(entries)
    expect(profile.evidence.length).toBeLessThanOrEqual(3)
  })
})

describe('computeLongitudinalProfile — data range', () => {
  it('captures earliest and latest entry dates', () => {
    const entries = [
      makeSortedEntry(5),
      makeSortedEntry(3),
      makeSortedEntry(1),
    ]
    const profile = computeLongitudinalProfile(entries)
    expect(profile.dataRange.earliest).toBeDefined()
    expect(profile.dataRange.latest).toBeDefined()
    expect(new Date(profile.dataRange.earliest!).getTime())
      .toBeLessThan(new Date(profile.dataRange.latest!).getTime())
  })

  it('returns null range for empty entries', () => {
    const profile = computeLongitudinalProfile([])
    expect(profile.dataRange.earliest).toBeNull()
    expect(profile.dataRange.latest).toBeNull()
  })
})
