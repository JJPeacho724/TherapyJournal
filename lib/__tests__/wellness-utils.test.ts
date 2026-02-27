import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateWeeklyNarrative,
  extractWeeklyThemes,
  describeWhenFeltBetter,
  getRecentThoughts,
  formatRelativeDate,
} from '@/lib/wellness-utils'

function makeEntry(daysAgo: number, overrides: Record<string, any> = {}) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return {
    id: `e-${daysAgo}`,
    created_at: date.toISOString(),
    content: overrides.content ?? `Entry from ${daysAgo} days ago with some meaningful text.`,
    ai_extraction: {
      mood_score: 6,
      anxiety_score: 4,
      emotions: ['calm'],
      symptoms: ['fatigue'],
      triggers: ['work'],
      ...(overrides.ai_extraction ?? {}),
    },
    structured_log: {
      sleep_hours: 7,
      sleep_quality: 6,
      ...(overrides.structured_log ?? {}),
    },
    ...overrides,
  }
}

describe('generateWeeklyNarrative', () => {
  it('returns starter message when no mood data', () => {
    const result = generateWeeklyNarrative([], [])
    expect(result.headline).toContain('Start journaling')
  })

  it('returns "been a while" message when no recent data within 7 days', () => {
    const oldMoodData = [
      { date: new Date(Date.now() - 15 * 86400000).toISOString(), mood: 5, anxiety: 5 },
    ]
    const result = generateWeeklyNarrative([], oldMoodData)
    expect(result.headline).toContain('little while')
  })

  it('generates positive narrative for high mood with upward trend', () => {
    const moodData = [
      { date: new Date(Date.now() - 3 * 86400000).toISOString(), mood: 6, anxiety: 3 },
      { date: new Date(Date.now() - 1 * 86400000).toISOString(), mood: 8, anxiety: 2 },
    ]
    const result = generateWeeklyNarrative([], moodData)
    expect(result.headline).toContain('lighter')
  })

  it('generates mixed narrative for mid-range mood with high anxiety', () => {
    const moodData = [
      { date: new Date(Date.now() - 3 * 86400000).toISOString(), mood: 5, anxiety: 7 },
      { date: new Date(Date.now() - 1 * 86400000).toISOString(), mood: 6, anxiety: 7 },
    ]
    const result = generateWeeklyNarrative([], moodData)
    expect(result.headline).toContain('unease')
  })

  it('generates supportive narrative for low mood', () => {
    const moodData = [
      { date: new Date(Date.now() - 3 * 86400000).toISOString(), mood: 3, anxiety: 7 },
      { date: new Date(Date.now() - 1 * 86400000).toISOString(), mood: 3, anxiety: 8 },
    ]
    const result = generateWeeklyNarrative([], moodData)
    expect(result.headline).toContain('heavier')
  })

  it('includes subtext based on top emotion', () => {
    const entries = [
      makeEntry(1, { ai_extraction: { mood_score: 5, anxiety_score: 7, emotions: ['anxious', 'anxious'] } }),
    ]
    const moodData = [
      { date: new Date(Date.now() - 1 * 86400000).toISOString(), mood: 5, anxiety: 7 },
    ]
    const result = generateWeeklyNarrative(entries, moodData)
    expect(result.subtext).toBe('Worry came up often.')
  })
})

describe('extractWeeklyThemes', () => {
  it('returns top 3 themes from recent entries', () => {
    const entries = [
      makeEntry(1, { ai_extraction: { mood_score: 5, symptoms: ['insomnia', 'fatigue'], emotions: ['anxious'] } }),
      makeEntry(2, { ai_extraction: { mood_score: 5, symptoms: ['insomnia'], emotions: ['stressed'] } }),
      makeEntry(3, { ai_extraction: { mood_score: 5, symptoms: ['headache'], emotions: ['anxious'] } }),
    ]
    const result = extractWeeklyThemes(entries)
    expect(result.length).toBeLessThanOrEqual(3)
    expect(result[0].theme).toBeDefined()
  })

  it('converts clinical terms to friendly language', () => {
    const entries = [
      makeEntry(1, { ai_extraction: { mood_score: 5, symptoms: ['insomnia'], emotions: [] } }),
    ]
    const result = extractWeeklyThemes(entries)
    const themes = result.map(t => t.theme)
    expect(themes).toContain('Sleep troubles')
  })

  it('returns empty array when no recent entries', () => {
    const entries = [makeEntry(14)]
    const result = extractWeeklyThemes(entries)
    expect(result).toEqual([])
  })
})

describe('describeWhenFeltBetter', () => {
  it('identifies best time of day', () => {
    const entries = [
      makeEntry(1, {
        created_at: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
        ai_extraction: { mood_score: 8, anxiety_score: 2 },
        structured_log: { sleep_hours: 8 },
      }),
      makeEntry(2, {
        created_at: new Date(new Date().setHours(20, 0, 0, 0)).toISOString(),
        ai_extraction: { mood_score: 4, anxiety_score: 6 },
        structured_log: { sleep_hours: 5 },
      }),
    ]

    // Adjust dates to be within last 7 days
    const d1 = new Date(); d1.setDate(d1.getDate() - 1); d1.setHours(8, 0, 0, 0)
    const d2 = new Date(); d2.setDate(d2.getDate() - 2); d2.setHours(20, 0, 0, 0)
    entries[0].created_at = d1.toISOString()
    entries[1].created_at = d2.toISOString()

    const result = describeWhenFeltBetter(entries)
    expect(result.timeDescription).toContain('Mornings')
  })

  it('returns "No clear pattern" when no recent entries', () => {
    const result = describeWhenFeltBetter([])
    expect(result.timeDescription).toBe('No clear pattern yet')
    expect(result.sleepDescription).toBeNull()
  })
})

describe('getRecentThoughts', () => {
  it('returns up to 2 recent snippets', () => {
    const entries = [
      makeEntry(0, { content: 'First entry with some text here' }),
      makeEntry(1, { content: 'Second entry with some text here' }),
      makeEntry(2, { content: 'Third entry should not appear' }),
    ]
    const result = getRecentThoughts(entries)
    expect(result).toHaveLength(2)
  })

  it('truncates long content with ellipsis', () => {
    const longContent = 'A'.repeat(150) + ' end of sentence here.'
    const entries = [makeEntry(0, { content: longContent })]
    const result = getRecentThoughts(entries)
    expect(result[0].snippet.length).toBeLessThanOrEqual(104)
    expect(result[0].snippet).toContain('...')
  })

  it('does not add ellipsis for short content', () => {
    const entries = [makeEntry(0, { content: 'Short entry' })]
    const result = getRecentThoughts(entries)
    expect(result[0].snippet).toBe('Short entry')
  })

  it('returns empty array for no entries', () => {
    expect(getRecentThoughts([])).toEqual([])
  })
})

describe('formatRelativeDate', () => {
  it('returns "Today" for today', () => {
    expect(formatRelativeDate(new Date())).toBe('Today')
  })

  it('returns "Yesterday" for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatRelativeDate(yesterday)).toBe('Yesterday')
  })

  it('returns weekday name for 2-6 days ago', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const result = formatRelativeDate(threeDaysAgo)
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    expect(weekdays).toContain(result)
  })

  it('returns "Mon DD" format for 7+ days ago', () => {
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const result = formatRelativeDate(twoWeeksAgo)
    expect(result).toMatch(/[A-Z][a-z]{2} \d{1,2}/)
  })
})
