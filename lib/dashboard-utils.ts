/**
 * Utility functions for dashboard data transformation
 * Extracts and processes journal entries for visualization
 */

// Type definitions
export interface MoodDataPoint {
  date: string
  mood: number
  anxiety: number
}

export interface SymptomFrequency {
  symptom: string
  count: number
}

export interface SleepMoodCorrelation {
  sleep_hours: number
  mood: number
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export interface TimeOfDayMoodSummary {
  timeOfDay: TimeOfDay
  label: string
  hourRange: string
  avgMood: number
  avgAnxiety: number
  entryCount: number
}

export interface DashboardStats {
  totalEntries: number
  avgMood: number | null
  latestMood: number | null
  streak: number
}

// Helper functions to handle Supabase array/object returns
export function getExtraction(entry: any): any | null {
  if (!entry.ai_extraction) return null
  return Array.isArray(entry.ai_extraction) ? entry.ai_extraction[0] : entry.ai_extraction
}

export function getStructuredLog(entry: any): any | null {
  if (!entry.structured_log) return null
  return Array.isArray(entry.structured_log) ? entry.structured_log[0] : entry.structured_log
}

// Process mood timeline data
export function processMoodData(entries: any[]): MoodDataPoint[] {
  return entries
    .filter(e => getExtraction(e)?.mood_score)
    .map(e => {
      const extraction = getExtraction(e)!
      return {
        date: e.created_at,
        mood: extraction.mood_score!,
        anxiety: extraction.anxiety_score || 5,
      }
    })
    .reverse()
}

// Aggregate symptom frequencies
export function aggregateSymptoms(entries: any[]): SymptomFrequency[] {
  const symptomMap = new Map<string, number>()

  entries.forEach(e => {
    const extraction = getExtraction(e)
    const symptoms = extraction?.symptoms || []
    symptoms.forEach((s: string) => {
      symptomMap.set(s, (symptomMap.get(s) || 0) + 1)
    })
  })

  return Array.from(symptomMap.entries())
    .map(([symptom, count]) => ({ symptom, count }))
    .sort((a, b) => b.count - a.count) // Sort by frequency, highest first
}

// Process sleep-mood correlation
export function processSleepMoodCorrelation(entries: any[]): SleepMoodCorrelation[] {
  return entries
    .filter(e => getExtraction(e)?.mood_score && getStructuredLog(e)?.sleep_hours)
    .map(e => {
      const extraction = getExtraction(e)!
      const log = getStructuredLog(e)!
      return {
        sleep_hours: log.sleep_hours!,
        mood: extraction.mood_score!,
      }
    })
}

// Helper to determine time of day from hour
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

// Process time-of-day mood patterns
export function processTimeOfDayPatterns(entries: any[]): TimeOfDayMoodSummary[] {
  const timeOfDayAccumulator = {
    morning: { totalMood: 0, totalAnxiety: 0, count: 0 },
    afternoon: { totalMood: 0, totalAnxiety: 0, count: 0 },
    evening: { totalMood: 0, totalAnxiety: 0, count: 0 },
    night: { totalMood: 0, totalAnxiety: 0, count: 0 },
  }

  entries.forEach(e => {
    const extraction = getExtraction(e)
    if (!extraction?.mood_score) return

    const entryDate = new Date(e.created_at)
    const hour = entryDate.getHours()
    const timeOfDay = getTimeOfDay(hour)

    timeOfDayAccumulator[timeOfDay].totalMood += extraction.mood_score
    timeOfDayAccumulator[timeOfDay].totalAnxiety += extraction.anxiety_score || 5
    timeOfDayAccumulator[timeOfDay].count += 1
  })

  const timeOfDayLabels: Record<TimeOfDay, { label: string; hourRange: string }> = {
    morning: { label: 'Morning', hourRange: '5:00 AM - 12:00 PM' },
    afternoon: { label: 'Afternoon', hourRange: '12:00 PM - 5:00 PM' },
    evening: { label: 'Evening', hourRange: '5:00 PM - 9:00 PM' },
    night: { label: 'Night', hourRange: '9:00 PM - 5:00 AM' },
  }

  return (['morning', 'afternoon', 'evening', 'night'] as TimeOfDay[]).map(timeOfDay => {
    const acc = timeOfDayAccumulator[timeOfDay]
    return {
      timeOfDay,
      label: timeOfDayLabels[timeOfDay].label,
      hourRange: timeOfDayLabels[timeOfDay].hourRange,
      avgMood: acc.count > 0 ? Math.round((acc.totalMood / acc.count) * 10) / 10 : 0,
      avgAnxiety: acc.count > 0 ? Math.round((acc.totalAnxiety / acc.count) * 10) / 10 : 0,
      entryCount: acc.count,
    }
  })
}

// Calculate dashboard stats
export function calculateStats(entries: any[], moodData: MoodDataPoint[]): DashboardStats {
  const totalEntries = entries?.length || 0
  const avgMood = moodData.length > 0
    ? Math.round(moodData.reduce((sum, d) => sum + d.mood, 0) / moodData.length * 10) / 10
    : null
  const latestMood = moodData.length > 0 ? moodData[moodData.length - 1].mood : null

  // Streak calculation
  let streak = 0
  if (entries && entries.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < entries.length; i++) {
      const entryDate = new Date(entries[i].created_at)
      entryDate.setHours(0, 0, 0, 0)

      const expectedDate = new Date(today)
      expectedDate.setDate(expectedDate.getDate() - i)

      if (entryDate.getTime() === expectedDate.getTime()) {
        streak++
      } else {
        break
      }
    }
  }

  return { totalEntries, avgMood, latestMood, streak }
}

// Find best/worst time of day for insights
export function getTimeOfDayInsights(timeOfDayData: TimeOfDayMoodSummary[]): {
  bestTimeOfDay: TimeOfDayMoodSummary | null
  worstTimeOfDay: TimeOfDayMoodSummary | null
} {
  const timePeriodsWithData = timeOfDayData.filter(t => t.entryCount > 0)

  const bestTimeOfDay = timePeriodsWithData.length > 0
    ? timePeriodsWithData.reduce((best, curr) => curr.avgMood > best.avgMood ? curr : best)
    : null

  const worstTimeOfDay = timePeriodsWithData.length > 0
    ? timePeriodsWithData.reduce((worst, curr) => curr.avgMood < worst.avgMood ? curr : worst)
    : null

  return { bestTimeOfDay, worstTimeOfDay }
}

// Calculate average mood across multiple patients (for therapist dashboard)
export function calculateAveragePatientMood(patientEntries: Map<string, any[]>): number | null {
  let totalMood = 0
  let totalCount = 0

  for (const [_patientId, entries] of Array.from(patientEntries.entries())) {
    entries.forEach(e => {
      const extraction = getExtraction(e)
      if (extraction?.mood_score) {
        totalMood += extraction.mood_score
        totalCount++
      }
    })
  }

  return totalCount > 0 ? Math.round((totalMood / totalCount) * 10) / 10 : null
}
