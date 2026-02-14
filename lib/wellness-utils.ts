/**
 * Utility functions for wellness-style narrative generation
 * Transforms clinical data into human-friendly language
 */

import { getExtraction, getStructuredLog, type TimeOfDay, type MoodDataPoint } from './dashboard-utils'

export interface WeeklyNarrative {
  headline: string
  subtext?: string
}

export interface ThemeItem {
  theme: string
}

export interface WhenFeltBetter {
  timeDescription: string
  sleepDescription: string | null
}

export interface RecentThought {
  snippet: string
  date: Date
}

// Generate a narrative headline from mood trends
export function generateWeeklyNarrative(entries: any[], moodData: MoodDataPoint[]): WeeklyNarrative {
  if (moodData.length === 0) {
    return {
      headline: "Start journaling to see how your week unfolds.",
      subtext: "Your story begins with your first entry."
    }
  }

  // Get last 7 days of mood data
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const recentMoods = moodData.filter(d => new Date(d.date) >= oneWeekAgo)

  if (recentMoods.length === 0) {
    return {
      headline: "It's been a little while since your last check-in.",
      subtext: "When you're ready, we're here."
    }
  }

  const avgMood = recentMoods.reduce((sum, d) => sum + d.mood, 0) / recentMoods.length
  const avgAnxiety = recentMoods.reduce((sum, d) => sum + d.anxiety, 0) / recentMoods.length

  // Get emotions from recent entries for context
  const recentEntries = entries.filter(e => new Date(e.created_at) >= oneWeekAgo)
  const emotions: string[] = []
  recentEntries.forEach(e => {
    const extraction = getExtraction(e)
    if (extraction?.emotions) {
      emotions.push(...extraction.emotions)
    }
  })

  // Determine mood trend
  const moodTrend = recentMoods.length >= 2
    ? recentMoods[recentMoods.length - 1].mood - recentMoods[0].mood
    : 0

  // Generate narrative based on patterns
  let headline = ""

  if (avgMood >= 7) {
    if (moodTrend > 0) {
      headline = "This week felt lighter, with more moments of ease and calm."
    } else if (moodTrend < -1) {
      headline = "You started strong this week, though things felt heavier toward the end."
    } else {
      headline = "This week had a steady, grounded feeling overall."
    }
  } else if (avgMood >= 5) {
    if (avgAnxiety > 6) {
      headline = "This week felt mixed, with some moments of unease beneath the surface."
    } else if (moodTrend > 1) {
      headline = "Things started slowly, but this week has been moving in a good direction."
    } else if (moodTrend < -1) {
      headline = "The week started okay but felt heavier as the days went on."
    } else {
      headline = "This week had its ups and downs, like most weeks do."
    }
  } else {
    if (avgAnxiety > 6) {
      headline = "This week felt mentally heavier, with more worry than usual."
    } else if (moodTrend > 0) {
      headline = "It's been a tough week, but things seem to be slowly lifting."
    } else {
      headline = "This week has been harder than usual. Be gentle with yourself."
    }
  }

  // Add contextual subtext based on common emotions
  let subtext: string | undefined
  const emotionCounts = new Map<string, number>()
  emotions.forEach(e => emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1))
  const topEmotion = Array.from(emotionCounts.entries()).sort((a, b) => b[1] - a[1])[0]

  if (topEmotion) {
    const emotionDescriptors: Record<string, string> = {
      'anxious': 'Worry came up often.',
      'stressed': 'Stress was a common thread.',
      'sad': 'Sadness was present.',
      'happy': 'Joy showed up in your days.',
      'calm': 'You found moments of peace.',
      'tired': 'Fatigue was noticeable.',
      'frustrated': 'Frustration surfaced at times.',
      'hopeful': 'Hope flickered through.',
      'overwhelmed': 'Things felt like a lot.',
      'grateful': 'Gratitude made appearances.',
    }
    subtext = emotionDescriptors[topEmotion[0].toLowerCase()] || undefined
  }

  return { headline, subtext }
}

// Extract top themes (symptoms/topics without counts)
export function extractWeeklyThemes(entries: any[]): ThemeItem[] {
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const recentEntries = entries.filter(e => new Date(e.created_at) >= oneWeekAgo)

  // Collect all symptoms/themes
  const themeMap = new Map<string, number>()

  recentEntries.forEach(e => {
    const extraction = getExtraction(e)
    const symptoms = extraction?.symptoms || []
    const emotions = extraction?.emotions || []

    // Combine symptoms and strong emotions as themes
    ;[...symptoms, ...emotions].forEach((item: string) => {
      // Convert clinical terms to friendlier language
      const friendlyTerm = humanizeTerm(item)
      themeMap.set(friendlyTerm, (themeMap.get(friendlyTerm) || 0) + 1)
    })
  })

  // Get top 3 themes
  return Array.from(themeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme]) => ({ theme }))
}

// Convert clinical terms to human-friendly language
function humanizeTerm(term: string): string {
  const termMap: Record<string, string> = {
    'insomnia': 'Sleep troubles',
    'fatigue': 'Feeling tired',
    'anxiety': 'Worry',
    'depression': 'Low mood',
    'irritability': 'Feeling on edge',
    'headache': 'Headaches',
    'concentration': 'Hard to focus',
    'appetite': 'Appetite changes',
    'isolation': 'Wanting to be alone',
    'rumination': 'Overthinking',
    'panic': 'Feeling overwhelmed',
    'stress': 'Stress',
    'sadness': 'Sadness',
    'anger': 'Frustration',
    'fear': 'Worry',
    'loneliness': 'Loneliness',
  }

  const lowerTerm = term.toLowerCase()
  return termMap[lowerTerm] || term.charAt(0).toUpperCase() + term.slice(1).toLowerCase()
}

// Describe when the user felt better (time of day, sleep patterns)
export function describeWhenFeltBetter(entries: any[]): WhenFeltBetter {
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const recentEntries = entries.filter(e => new Date(e.created_at) >= oneWeekAgo)

  // Track mood by time of day
  const timeOfDayMoods: Record<TimeOfDay, { total: number; count: number }> = {
    morning: { total: 0, count: 0 },
    afternoon: { total: 0, count: 0 },
    evening: { total: 0, count: 0 },
    night: { total: 0, count: 0 },
  }

  // Track sleep correlation
  const sleepMoods: { hours: number; mood: number }[] = []

  recentEntries.forEach(e => {
    const extraction = getExtraction(e)
    if (!extraction?.mood_score) return

    // Time of day analysis
    const hour = new Date(e.created_at).getHours()
    let timeOfDay: TimeOfDay
    if (hour >= 5 && hour < 12) timeOfDay = 'morning'
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening'
    else timeOfDay = 'night'

    timeOfDayMoods[timeOfDay].total += extraction.mood_score
    timeOfDayMoods[timeOfDay].count += 1

    // Sleep analysis
    const log = getStructuredLog(e)
    if (log?.sleep_hours) {
      sleepMoods.push({ hours: log.sleep_hours, mood: extraction.mood_score })
    }
  })

  // Find best time of day
  let bestTime: TimeOfDay | null = null
  let bestAvg = 0

  for (const [time, data] of Object.entries(timeOfDayMoods)) {
    if (data.count > 0) {
      const avg = data.total / data.count
      if (avg > bestAvg) {
        bestAvg = avg
        bestTime = time as TimeOfDay
      }
    }
  }

  const timeDescriptions: Record<TimeOfDay, string> = {
    morning: 'Mornings often felt brighter',
    afternoon: 'Afternoons tended to feel best',
    evening: 'Evenings brought more ease',
    night: 'Nighttime felt most peaceful',
  }

  const timeDescription = bestTime
    ? timeDescriptions[bestTime]
    : 'No clear pattern yet'

  // Analyze sleep patterns
  let sleepDescription: string | null = null
  if (sleepMoods.length >= 3) {
    const goodSleep = sleepMoods.filter(s => s.hours >= 7)
    const poorSleep = sleepMoods.filter(s => s.hours < 6)

    if (goodSleep.length > 0 && poorSleep.length > 0) {
      const goodAvg = goodSleep.reduce((s, d) => s + d.mood, 0) / goodSleep.length
      const poorAvg = poorSleep.reduce((s, d) => s + d.mood, 0) / poorSleep.length

      if (goodAvg - poorAvg > 1.5) {
        sleepDescription = 'More sleep seemed to help your mood'
      } else if (poorAvg - goodAvg > 1.5) {
        sleepDescription = 'Sleep and mood didn\'t follow the usual pattern'
      }
    } else if (goodSleep.length >= 3) {
      sleepDescription = 'You\'ve been getting decent rest lately'
    } else if (poorSleep.length >= 3) {
      sleepDescription = 'Sleep has been harder to come by'
    }
  }

  return { timeDescription, sleepDescription }
}

// Get recent journal snippets without scores
export function getRecentThoughts(entries: any[]): RecentThought[] {
  return entries
    .slice(0, 2)
    .map(e => {
      // Get first ~80 chars, ending at word boundary
      let snippet = e.content.substring(0, 100)
      const lastSpace = snippet.lastIndexOf(' ')
      if (lastSpace > 60) {
        snippet = snippet.substring(0, lastSpace)
      }
      snippet = snippet.trim()
      if (e.content.length > snippet.length) {
        snippet += '...'
      }

      return {
        snippet,
        date: new Date(e.created_at)
      }
    })
}

// Format relative date in friendly way
export function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' })
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}
