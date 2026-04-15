/**
 * Patient Longitudinal Profile — structured, quantified summary
 *
 * Computes defensible metrics from journal entry extractions.
 * No interpretive language — just infrastructure and numbers.
 */

import { getExtraction } from './dashboard-utils'

// ─── Types ───────────────────────────────────────────────────

export interface BaselineMetrics {
  meanMood: number | null
  moodStd: number | null
  meanAnxiety: number | null
  anxietyStd: number | null
  meanPhq9: number | null
  meanGad7: number | null
  volatilityIndex: number | null // mean absolute successive difference
  sampleCount: number
}

export interface TrendIndicators {
  slope7d: number | null   // mood slope over last 7 days
  slope14d: number | null  // mood slope over last 14 days
  latestZScore: number | null
  anxietySlope7d: number | null
  anxietySlope14d: number | null
  latestAnxietyZScore: number | null
}

export interface RankedItem {
  label: string
  count: number
  percentage: number // of total entries
}

export interface RecurrentThemes {
  triggers: RankedItem[]
  symptomClusters: RankedItem[]
  sentimentTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data'
  sentimentSlope: number | null
  ruminationCount: number
  ruminationRate: number | null // per entry
  hopelessnessCount: number
  hopelessnessRate: number | null
}

export interface EvidenceSnippet {
  excerpt: string
  date: string
  signal: string // what this excerpt evidences
  moodScore: number | null
}

export interface LongitudinalProfile {
  baseline: BaselineMetrics
  trends: TrendIndicators
  themes: RecurrentThemes
  evidence: EvidenceSnippet[]
  generatedAt: string
  dataRange: { earliest: string | null; latest: string | null }
}

// ─── Computation ─────────────────────────────────────────────

/**
 * Compute the full longitudinal profile from a set of journal entries
 * with their AI extractions. Entries should be ordered newest-first.
 */
export function computeLongitudinalProfile(entries: any[]): LongitudinalProfile {
  const now = new Date().toISOString()
  const withExtractions = entries
    .filter(e => getExtraction(e)?.mood_score != null)
    .map(e => ({
      entry: e,
      extraction: getExtraction(e)!,
      date: new Date(e.created_at),
    }))

  // Sort oldest-first for time-series analysis
  const sorted = [...withExtractions].sort((a, b) => a.date.getTime() - b.date.getTime())

  const baseline = computeBaseline(sorted)
  const trends = computeTrends(sorted, baseline)
  const themes = computeThemes(sorted)
  const evidence = extractEvidence(sorted)

  return {
    baseline,
    trends,
    themes,
    evidence,
    generatedAt: now,
    dataRange: {
      earliest: sorted.length > 0 ? sorted[0].entry.created_at : null,
      latest: sorted.length > 0 ? sorted[sorted.length - 1].entry.created_at : null,
    },
  }
}

// ─── Section 1: Baseline Metrics ─────────────────────────────

interface SortedEntry {
  entry: any
  extraction: any
  date: Date
}

function computeBaseline(sorted: SortedEntry[]): BaselineMetrics {
  if (sorted.length === 0) {
    return {
      meanMood: null, moodStd: null,
      meanAnxiety: null, anxietyStd: null,
      meanPhq9: null, meanGad7: null,
      volatilityIndex: null, sampleCount: 0,
    }
  }

  const moods = sorted.map(s => s.extraction.mood_score as number)
  const anxieties = sorted.map(s => (s.extraction.anxiety_score ?? 5) as number)
  const phq9s = sorted.map(s => s.extraction.phq9_estimate).filter((v): v is number => v != null)
  const gad7s = sorted.map(s => s.extraction.gad7_estimate).filter((v): v is number => v != null)

  const moodStats = descriptiveStats(moods)
  const anxietyStats = descriptiveStats(anxieties)

  // Volatility: Mean Absolute Successive Difference (MASD)
  let volatility: number | null = null
  if (moods.length >= 2) {
    let sumAbsDiff = 0
    for (let i = 1; i < moods.length; i++) {
      sumAbsDiff += Math.abs(moods[i] - moods[i - 1])
    }
    volatility = round2(sumAbsDiff / (moods.length - 1))
  }

  return {
    meanMood: round2(moodStats.mean),
    moodStd: round2(moodStats.std),
    meanAnxiety: round2(anxietyStats.mean),
    anxietyStd: round2(anxietyStats.std),
    meanPhq9: phq9s.length > 0 ? round1(mean(phq9s)) : null,
    meanGad7: gad7s.length > 0 ? round1(mean(gad7s)) : null,
    volatilityIndex: volatility,
    sampleCount: sorted.length,
  }
}

// ─── Section 2: Trend Indicators ─────────────────────────────

function computeTrends(sorted: SortedEntry[], baseline: BaselineMetrics): TrendIndicators {
  if (sorted.length < 2) {
    return {
      slope7d: null, slope14d: null, latestZScore: null,
      anxietySlope7d: null, anxietySlope14d: null, latestAnxietyZScore: null,
    }
  }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const last7d = sorted.filter(s => s.date >= sevenDaysAgo)
  const last14d = sorted.filter(s => s.date >= fourteenDaysAgo)

  const slope7d = linearSlope(last7d.map(s => ({ t: s.date.getTime(), v: s.extraction.mood_score })))
  const slope14d = linearSlope(last14d.map(s => ({ t: s.date.getTime(), v: s.extraction.mood_score })))
  const anxietySlope7d = linearSlope(last7d.map(s => ({ t: s.date.getTime(), v: s.extraction.anxiety_score ?? 5 })))
  const anxietySlope14d = linearSlope(last14d.map(s => ({ t: s.date.getTime(), v: s.extraction.anxiety_score ?? 5 })))

  // Z-score of latest mood relative to patient baseline
  const latest = sorted[sorted.length - 1]
  let latestZScore: number | null = null
  let latestAnxietyZScore: number | null = null

  if (baseline.meanMood != null && baseline.moodStd != null && baseline.moodStd > 0) {
    latestZScore = round2((latest.extraction.mood_score - baseline.meanMood) / baseline.moodStd)
  }
  if (baseline.meanAnxiety != null && baseline.anxietyStd != null && baseline.anxietyStd > 0) {
    latestAnxietyZScore = round2(((latest.extraction.anxiety_score ?? 5) - baseline.meanAnxiety) / baseline.anxietyStd)
  }

  // Slopes are per-day (convert from per-ms)
  const msPerDay = 24 * 60 * 60 * 1000

  return {
    slope7d: slope7d != null ? round3(slope7d * msPerDay) : null,
    slope14d: slope14d != null ? round3(slope14d * msPerDay) : null,
    latestZScore,
    anxietySlope7d: anxietySlope7d != null ? round3(anxietySlope7d * msPerDay) : null,
    anxietySlope14d: anxietySlope14d != null ? round3(anxietySlope14d * msPerDay) : null,
    latestAnxietyZScore,
  }
}

// ─── Section 3: Recurrent Themes ─────────────────────────────

const RUMINATION_TERMS: string[] = [
  'rumination', 'overthinking', 'ruminating', 'obsessive thoughts',
  'can\'t stop thinking', 'dwelling', 'repetitive thoughts',
]

const HOPELESSNESS_TERMS: string[] = [
  'hopelessness', 'hopeless', 'worthlessness', 'worthless',
  'no point', 'giving up', 'despair', 'helpless', 'helplessness',
]

function computeThemes(sorted: SortedEntry[]): RecurrentThemes {
  const totalEntries = sorted.length

  if (totalEntries === 0) {
    return {
      triggers: [], symptomClusters: [],
      sentimentTrend: 'insufficient_data', sentimentSlope: null,
      ruminationCount: 0, ruminationRate: null,
      hopelessnessCount: 0, hopelessnessRate: null,
    }
  }

  // Triggers
  const triggerMap = new Map<string, number>()
  sorted.forEach(s => {
    const triggers = s.extraction.triggers || []
    triggers.forEach((t: string) => {
      const key = t.toLowerCase().trim()
      triggerMap.set(key, (triggerMap.get(key) || 0) + 1)
    })
  })
  const triggers: RankedItem[] = Array.from(triggerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      label: capitalize(label),
      count,
      percentage: round1((count / totalEntries) * 100),
    }))

  // Symptom clusters
  const symptomMap = new Map<string, number>()
  sorted.forEach(s => {
    const symptoms = s.extraction.symptoms || []
    symptoms.forEach((sym: string) => {
      const key = sym.toLowerCase().trim()
      symptomMap.set(key, (symptomMap.get(key) || 0) + 1)
    })
  })
  const symptomClusters: RankedItem[] = Array.from(symptomMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      label: capitalize(label),
      count,
      percentage: round1((count / totalEntries) * 100),
    }))

  // Sentiment polarity trend (slope of mood over all data)
  const moodPoints = sorted.map(s => ({ t: s.date.getTime(), v: s.extraction.mood_score as number }))
  const sentimentSlope = linearSlope(moodPoints)
  const msPerDay = 24 * 60 * 60 * 1000
  const dailySlope = sentimentSlope != null ? sentimentSlope * msPerDay : null

  let sentimentTrend: RecurrentThemes['sentimentTrend'] = 'insufficient_data'
  if (dailySlope != null && sorted.length >= 3) {
    if (dailySlope > 0.05) sentimentTrend = 'improving'
    else if (dailySlope < -0.05) sentimentTrend = 'declining'
    else sentimentTrend = 'stable'
  }

  // Rumination frequency — check symptoms, emotions, and content
  let ruminationCount = 0
  let hopelessnessCount = 0

  sorted.forEach(s => {
    const allTerms = [
      ...(s.extraction.symptoms || []),
      ...(s.extraction.emotions || []),
      ...(s.extraction.triggers || []),
    ].map((t: string) => t.toLowerCase())

    const contentLower = (s.entry.content || '').toLowerCase()

    const hasRumination = allTerms.some(t => RUMINATION_TERMS.includes(t)) ||
      RUMINATION_TERMS.some(term => contentLower.includes(term))
    if (hasRumination) ruminationCount++

    // Hopelessness: check terms + PHQ-9 worthlessness indicator
    const phq9 = s.extraction.phq9_indicators
    const hasHopelessness =
      allTerms.some(t => HOPELESSNESS_TERMS.includes(t)) ||
      HOPELESSNESS_TERMS.some(term => contentLower.includes(term)) ||
      (phq9?.worthlessness != null && phq9.worthlessness >= 2)
    if (hasHopelessness) hopelessnessCount++
  })

  return {
    triggers,
    symptomClusters,
    sentimentTrend,
    sentimentSlope: dailySlope != null ? round3(dailySlope) : null,
    ruminationCount,
    ruminationRate: totalEntries > 0 ? round2(ruminationCount / totalEntries) : null,
    hopelessnessCount,
    hopelessnessRate: totalEntries > 0 ? round2(hopelessnessCount / totalEntries) : null,
  }
}

// ─── Section 4: Evidence Snippets ────────────────────────────

function extractEvidence(sorted: SortedEntry[]): EvidenceSnippet[] {
  if (sorted.length === 0) return []

  const snippets: EvidenceSnippet[] = []
  const recent = [...sorted].reverse() // newest first

  // 1. Entry with highest absolute z-score (strongest deviation from baseline)
  const withZ = sorted.filter(s => s.extraction.mood_z_score != null)
  if (withZ.length > 0) {
    const extreme = withZ.reduce((max, curr) =>
      Math.abs(curr.extraction.mood_z_score) > Math.abs(max.extraction.mood_z_score) ? curr : max
    )
    snippets.push({
      excerpt: truncateExcerpt(extreme.entry.content),
      date: extreme.entry.created_at,
      signal: `Mood z-score: ${round2(extreme.extraction.mood_z_score)} (strongest deviation)`,
      moodScore: extreme.extraction.mood_score,
    })
  }

  // 2. Most recent entry with crisis-relevant content or lowest mood
  const crisisEntry = recent.find(s => s.extraction.crisis_detected)
  if (crisisEntry) {
    snippets.push({
      excerpt: truncateExcerpt(crisisEntry.entry.content),
      date: crisisEntry.entry.created_at,
      signal: 'Crisis language detected',
      moodScore: crisisEntry.extraction.mood_score,
    })
  } else {
    // Fallback: lowest mood entry from recent 10
    const recentTen = recent.slice(0, 10)
    if (recentTen.length > 0) {
      const lowest = recentTen.reduce((min, curr) =>
        curr.extraction.mood_score < min.extraction.mood_score ? curr : min
      )
      if (lowest.extraction.mood_score <= 4) {
        snippets.push({
          excerpt: truncateExcerpt(lowest.entry.content),
          date: lowest.entry.created_at,
          signal: `Low mood entry (${lowest.extraction.mood_score}/10)`,
          moodScore: lowest.extraction.mood_score,
        })
      }
    }
  }

  // 3. Most recent entry (for current state)
  if (recent.length > 0 && !snippets.some(s => s.date === recent[0].entry.created_at)) {
    snippets.push({
      excerpt: truncateExcerpt(recent[0].entry.content),
      date: recent[0].entry.created_at,
      signal: 'Most recent entry',
      moodScore: recent[0].extraction.mood_score,
    })
  }

  return snippets.slice(0, 3)
}

// ─── Math Helpers ────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function descriptiveStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 }
  const m = mean(values)
  if (values.length < 2) return { mean: m, std: 0 }
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)
  return { mean: m, std: Math.sqrt(variance) }
}

/**
 * Simple linear regression slope. Returns null if < 2 points.
 * Input: array of { t: timestamp_ms, v: value }
 */
function linearSlope(points: { t: number; v: number }[]): number | null {
  if (points.length < 2) return null
  const n = points.length
  let sumT = 0, sumV = 0, sumTV = 0, sumTT = 0
  for (const p of points) {
    sumT += p.t
    sumV += p.v
    sumTV += p.t * p.v
    sumTT += p.t * p.t
  }
  const denom = n * sumTT - sumT * sumT
  if (denom === 0) return null
  return (n * sumTV - sumT * sumV) / denom
}

function truncateExcerpt(content: string, maxLen = 180): string {
  if (!content) return ''
  if (content.length <= maxLen) return content
  const truncated = content.substring(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > maxLen * 0.6 ? truncated.substring(0, lastSpace) : truncated) + '...'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }
