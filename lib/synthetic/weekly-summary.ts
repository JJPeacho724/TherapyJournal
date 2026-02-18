/**
 * Deterministic weekly summary generator for synthetic data.
 *
 * Produces structured weekly summaries from daily metrics
 * without calling any AI/LLM — purely rule-based.
 */

import type {
  MetricsTimePoint,
  WeeklySummary,
  EvidenceSnippetItem,
} from '@/types/synthetic'

/**
 * Generate weekly summaries from a time series of metrics.
 *
 * Groups data into 7-day weeks, then produces a deterministic
 * summary for each complete or partial week.
 */
export function generateWeeklySummaries(
  metrics: MetricsTimePoint[],
  evidenceByDay: Map<number, EvidenceSnippetItem[]>,
  startDate: string
): WeeklySummary[] {
  if (metrics.length === 0) return []

  const sorted = [...metrics].sort((a, b) => a.dayIndex - b.dayIndex)
  const summaries: WeeklySummary[] = []

  // Group into weeks of 7 days
  const weeks: MetricsTimePoint[][] = []
  let currentWeek: MetricsTimePoint[] = []

  for (const point of sorted) {
    const weekIndex = Math.floor(point.dayIndex / 7)
    if (weekIndex !== weeks.length + (currentWeek.length > 0 ? 0 : -1) && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentWeek.push(point)
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }

  for (let weekNum = 0; weekNum < weeks.length; weekNum++) {
    const weekData = weeks[weekNum]
    if (weekData.length === 0) continue

    const start = new Date(startDate)
    start.setDate(start.getDate() + weekNum * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)

    const avgMood =
      Math.round(
        (weekData.reduce((s, d) => s + d.moodScore, 0) / weekData.length) * 10
      ) / 10
    const avgAnxiety =
      Math.round(
        (weekData.reduce((s, d) => s + d.anxietyScore, 0) / weekData.length) *
          10
      ) / 10
    const avgComposite =
      Math.round(
        (weekData.reduce((s, d) => s + d.composite, 0) / weekData.length) * 100
      ) / 100

    // Last available slope in the week
    const lastPoint = weekData[weekData.length - 1]
    const slope7d = lastPoint.slope7d

    // Overall trend from slope
    const overallTrend = determineTrend(slope7d, avgComposite, weekNum)

    // Notable themes: gather from evidence snippets
    const themeCounts = new Map<string, number>()
    for (const point of weekData) {
      const snippets = evidenceByDay.get(point.dayIndex) ?? []
      for (const s of snippets) {
        themeCounts.set(s.theme, (themeCounts.get(s.theme) ?? 0) + 1)
      }
    }
    const notableThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme]) => theme)

    // Evidence snippets: pick from days with strongest deviation
    const withZ = weekData.filter((d) => d.zScore != null)
    const topDeviations = withZ
      .sort((a, b) => Math.abs(b.zScore!) - Math.abs(a.zScore!))
      .slice(0, 2)
    const weekEvidence: EvidenceSnippetItem[] = []
    for (const d of topDeviations) {
      const daySnippets = evidenceByDay.get(d.dayIndex)
      if (daySnippets && daySnippets.length > 0) {
        weekEvidence.push(daySnippets[0])
      }
    }

    // Volatility notes
    const avgVol = weekData.filter((d) => d.volatility7d != null)
    const meanVol =
      avgVol.length > 0
        ? avgVol.reduce((s, d) => s + d.volatility7d!, 0) / avgVol.length
        : null
    const volatilityNotes = determineVolatilityNote(meanVol)

    summaries.push({
      weekNumber: weekNum + 1,
      weekStart: start.toISOString().split('T')[0],
      weekEnd: end.toISOString().split('T')[0],
      overallTrend,
      notableThemes,
      evidenceSnippets: weekEvidence,
      volatilityNotes,
      avgMood,
      avgAnxiety,
      avgComposite,
      slope7d,
    })
  }

  return summaries
}

function determineTrend(
  slope: number | null,
  avgComposite: number,
  weekNum: number
): string {
  if (slope == null || weekNum === 0) {
    return `Week ${weekNum + 1}: Establishing baseline patterns. Average composite index: ${avgComposite.toFixed(1)}.`
  }

  if (slope > 0.15) {
    return `Signals show an upward trend this week (slope: +${slope.toFixed(2)}/day). Average composite: ${avgComposite.toFixed(1)}.`
  }
  if (slope < -0.15) {
    return `Signals show a downward trend this week (slope: ${slope.toFixed(2)}/day). Average composite: ${avgComposite.toFixed(1)}.`
  }
  return `Signals remained relatively stable this week (slope: ${slope.toFixed(2)}/day). Average composite: ${avgComposite.toFixed(1)}.`
}

function determineVolatilityNote(meanVol: number | null): string {
  if (meanVol == null) return 'Insufficient data for variability assessment.'
  if (meanVol > 1.5) return 'Elevated variability detected - scores fluctuated significantly this week.'
  if (meanVol > 0.8) return 'Moderate variability in daily scores.'
  return 'Low variability - scores were relatively consistent this week.'
}
