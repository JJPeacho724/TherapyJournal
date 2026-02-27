import { describe, it, expect } from 'vitest'
import {
  getExtraction,
  getStructuredLog,
  processMoodData,
  aggregateSymptoms,
  processSleepMoodCorrelation,
  getTimeOfDay,
  processTimeOfDayPatterns,
  calculateStats,
  getTimeOfDayInsights,
  calculateAveragePatientMood,
} from '@/lib/dashboard-utils'

function makeEntry(overrides: Record<string, any> = {}) {
  return {
    id: 'e1',
    created_at: '2026-02-20T10:00:00Z',
    content: 'test entry',
    ai_extraction: {
      mood_score: 6,
      anxiety_score: 4,
      emotions: ['calm'],
      symptoms: ['fatigue'],
      triggers: ['work'],
      confidence: 0.9,
      crisis_detected: false,
      summary: 'test',
    },
    structured_log: {
      sleep_hours: 7,
      sleep_quality: 6,
      medication_taken: true,
      energy_level: 5,
    },
    ...overrides,
  }
}

describe('getExtraction', () => {
  it('returns object when ai_extraction is an object', () => {
    const entry = makeEntry()
    expect(getExtraction(entry)).toEqual(entry.ai_extraction)
  })

  it('returns first element when ai_extraction is an array', () => {
    const extraction = { mood_score: 7 }
    const entry = makeEntry({ ai_extraction: [extraction] })
    expect(getExtraction(entry)).toEqual(extraction)
  })

  it('returns null when ai_extraction is null', () => {
    expect(getExtraction({ ai_extraction: null })).toBeNull()
  })

  it('returns null when ai_extraction is undefined', () => {
    expect(getExtraction({})).toBeNull()
  })
})

describe('getStructuredLog', () => {
  it('returns object when structured_log is an object', () => {
    const entry = makeEntry()
    expect(getStructuredLog(entry)).toEqual(entry.structured_log)
  })

  it('returns first element when structured_log is an array', () => {
    const log = { sleep_hours: 8 }
    const entry = makeEntry({ structured_log: [log] })
    expect(getStructuredLog(entry)).toEqual(log)
  })

  it('returns null when structured_log is missing', () => {
    expect(getStructuredLog({})).toBeNull()
  })
})

describe('processMoodData', () => {
  it('extracts mood data from entries with extractions', () => {
    const entries = [
      makeEntry({ created_at: '2026-02-21T10:00:00Z' }),
      makeEntry({ created_at: '2026-02-20T10:00:00Z' }),
    ]
    const result = processMoodData(entries)
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2026-02-20T10:00:00Z')
    expect(result[1].date).toBe('2026-02-21T10:00:00Z')
  })

  it('filters out entries without mood_score', () => {
    const entries = [
      makeEntry(),
      makeEntry({ ai_extraction: { mood_score: null } }),
    ]
    const result = processMoodData(entries)
    expect(result).toHaveLength(1)
  })

  it('defaults anxiety to 5 when missing', () => {
    const entries = [makeEntry({ ai_extraction: { mood_score: 7, anxiety_score: null } })]
    const result = processMoodData(entries)
    expect(result[0].anxiety).toBe(5)
  })

  it('returns empty array for no entries', () => {
    expect(processMoodData([])).toEqual([])
  })
})

describe('aggregateSymptoms', () => {
  it('counts symptom frequencies across entries', () => {
    const entries = [
      makeEntry({ ai_extraction: { mood_score: 5, symptoms: ['fatigue', 'insomnia'] } }),
      makeEntry({ ai_extraction: { mood_score: 6, symptoms: ['fatigue', 'headache'] } }),
      makeEntry({ ai_extraction: { mood_score: 4, symptoms: ['fatigue'] } }),
    ]
    const result = aggregateSymptoms(entries)
    expect(result[0]).toEqual({ symptom: 'fatigue', count: 3 })
    expect(result).toHaveLength(3)
  })

  it('sorts by frequency descending', () => {
    const entries = [
      makeEntry({ ai_extraction: { mood_score: 5, symptoms: ['a', 'b'] } }),
      makeEntry({ ai_extraction: { mood_score: 5, symptoms: ['b', 'c'] } }),
    ]
    const result = aggregateSymptoms(entries)
    expect(result[0].symptom).toBe('b')
    expect(result[0].count).toBe(2)
  })

  it('handles entries without symptoms', () => {
    const entries = [makeEntry({ ai_extraction: { mood_score: 5 } })]
    expect(aggregateSymptoms(entries)).toEqual([])
  })

  it('returns empty for empty entries', () => {
    expect(aggregateSymptoms([])).toEqual([])
  })
})

describe('processSleepMoodCorrelation', () => {
  it('pairs sleep hours with mood scores', () => {
    const entries = [makeEntry()]
    const result = processSleepMoodCorrelation(entries)
    expect(result).toEqual([{ sleep_hours: 7, mood: 6 }])
  })

  it('filters entries missing sleep or mood data', () => {
    const entries = [
      makeEntry(),
      makeEntry({ structured_log: null }),
      makeEntry({ ai_extraction: null }),
    ]
    const result = processSleepMoodCorrelation(entries)
    expect(result).toHaveLength(1)
  })
})

describe('getTimeOfDay', () => {
  it('classifies hours correctly', () => {
    expect(getTimeOfDay(5)).toBe('morning')
    expect(getTimeOfDay(11)).toBe('morning')
    expect(getTimeOfDay(12)).toBe('afternoon')
    expect(getTimeOfDay(16)).toBe('afternoon')
    expect(getTimeOfDay(17)).toBe('evening')
    expect(getTimeOfDay(20)).toBe('evening')
    expect(getTimeOfDay(21)).toBe('night')
    expect(getTimeOfDay(3)).toBe('night')
    expect(getTimeOfDay(0)).toBe('night')
  })
})

describe('processTimeOfDayPatterns', () => {
  it('groups mood by time of day', () => {
    const morningDate1 = new Date(2026, 1, 20, 8, 0, 0)
    const morningDate2 = new Date(2026, 1, 20, 9, 0, 0)
    const afternoonDate = new Date(2026, 1, 20, 14, 0, 0)
    const entries = [
      makeEntry({ created_at: morningDate1.toISOString(), ai_extraction: { mood_score: 7, anxiety_score: 3 } }),
      makeEntry({ created_at: morningDate2.toISOString(), ai_extraction: { mood_score: 5, anxiety_score: 5 } }),
      makeEntry({ created_at: afternoonDate.toISOString(), ai_extraction: { mood_score: 4, anxiety_score: 6 } }),
    ]
    const result = processTimeOfDayPatterns(entries)
    const morning = result.find(r => r.timeOfDay === 'morning')!
    expect(morning.entryCount).toBe(2)
    expect(morning.avgMood).toBe(6)
    const afternoon = result.find(r => r.timeOfDay === 'afternoon')!
    expect(afternoon.entryCount).toBe(1)
    expect(afternoon.avgMood).toBe(4)
  })

  it('returns zero averages for time slots with no entries', () => {
    const result = processTimeOfDayPatterns([])
    result.forEach(slot => {
      expect(slot.avgMood).toBe(0)
      expect(slot.entryCount).toBe(0)
    })
  })

  it('returns all four time slots', () => {
    const result = processTimeOfDayPatterns([])
    expect(result).toHaveLength(4)
    expect(result.map(r => r.timeOfDay)).toEqual(['morning', 'afternoon', 'evening', 'night'])
  })
})

describe('calculateStats', () => {
  it('computes totalEntries and avgMood', () => {
    const entries = [makeEntry(), makeEntry()]
    const moodData = [
      { date: '2026-02-20T10:00:00Z', mood: 6, anxiety: 4 },
      { date: '2026-02-21T10:00:00Z', mood: 8, anxiety: 3 },
    ]
    const result = calculateStats(entries, moodData)
    expect(result.totalEntries).toBe(2)
    expect(result.avgMood).toBe(7)
    expect(result.latestMood).toBe(8)
  })

  it('returns null mood stats for empty data', () => {
    const result = calculateStats([], [])
    expect(result.totalEntries).toBe(0)
    expect(result.avgMood).toBeNull()
    expect(result.latestMood).toBeNull()
    expect(result.streak).toBe(0)
  })
})

describe('getTimeOfDayInsights', () => {
  it('finds best and worst time of day', () => {
    const data = [
      { timeOfDay: 'morning' as const, label: 'Morning', hourRange: '', avgMood: 7, avgAnxiety: 3, entryCount: 5 },
      { timeOfDay: 'afternoon' as const, label: 'Afternoon', hourRange: '', avgMood: 4, avgAnxiety: 6, entryCount: 3 },
      { timeOfDay: 'evening' as const, label: 'Evening', hourRange: '', avgMood: 6, avgAnxiety: 4, entryCount: 4 },
      { timeOfDay: 'night' as const, label: 'Night', hourRange: '', avgMood: 0, avgAnxiety: 0, entryCount: 0 },
    ]
    const { bestTimeOfDay, worstTimeOfDay } = getTimeOfDayInsights(data)
    expect(bestTimeOfDay!.timeOfDay).toBe('morning')
    expect(worstTimeOfDay!.timeOfDay).toBe('afternoon')
  })

  it('returns null when no entries in any time slot', () => {
    const data = [
      { timeOfDay: 'morning' as const, label: 'Morning', hourRange: '', avgMood: 0, avgAnxiety: 0, entryCount: 0 },
      { timeOfDay: 'afternoon' as const, label: 'Afternoon', hourRange: '', avgMood: 0, avgAnxiety: 0, entryCount: 0 },
      { timeOfDay: 'evening' as const, label: 'Evening', hourRange: '', avgMood: 0, avgAnxiety: 0, entryCount: 0 },
      { timeOfDay: 'night' as const, label: 'Night', hourRange: '', avgMood: 0, avgAnxiety: 0, entryCount: 0 },
    ]
    const { bestTimeOfDay, worstTimeOfDay } = getTimeOfDayInsights(data)
    expect(bestTimeOfDay).toBeNull()
    expect(worstTimeOfDay).toBeNull()
  })
})

describe('calculateAveragePatientMood', () => {
  it('computes average across multiple patients', () => {
    const map = new Map<string, any[]>()
    map.set('p1', [makeEntry({ ai_extraction: { mood_score: 6 } })])
    map.set('p2', [makeEntry({ ai_extraction: { mood_score: 8 } })])
    expect(calculateAveragePatientMood(map)).toBe(7)
  })

  it('returns null when no mood data', () => {
    const map = new Map<string, any[]>()
    map.set('p1', [makeEntry({ ai_extraction: null })])
    expect(calculateAveragePatientMood(map)).toBeNull()
  })

  it('returns null for empty map', () => {
    expect(calculateAveragePatientMood(new Map())).toBeNull()
  })
})
