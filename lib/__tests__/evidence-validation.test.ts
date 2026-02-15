import { describe, it, expect } from 'vitest'
import { validateEvidenceSpans } from '@/lib/evidence-validation'
import type { ExtractionEvidence, EvidenceSpan } from '@/types'

const SAMPLE_TEXT = 'I feel really sad today and I could not sleep at all last night. My energy is so low.'

function makeEmptyEvidence(): ExtractionEvidence {
  return {
    mood_score: [],
    anxiety_score: [],
    phq9_indicators: {
      anhedonia: [],
      depressed_mood: [],
      sleep_issues: [],
      fatigue: [],
      appetite_changes: [],
      worthlessness: [],
      concentration: [],
      psychomotor: [],
      self_harm_thoughts: [],
    },
    gad7_indicators: {
      nervous: [],
      uncontrollable_worry: [],
      excessive_worry: [],
      trouble_relaxing: [],
      restless: [],
      irritable: [],
      afraid: [],
    },
    crisis_detected: [],
  }
}

describe('validateEvidenceSpans', () => {
  it('should accept valid spans with correct offsets', () => {
    const evidence = makeEmptyEvidence()
    const quote = 'really sad today'
    const start = SAMPLE_TEXT.indexOf(quote)
    evidence.mood_score = [
      { quote, start_char: start, end_char: start + quote.length, rationale: 'expresses sadness' },
    ]

    const result = validateEvidenceSpans(evidence, SAMPLE_TEXT)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should auto-repair when quote exists but offsets are wrong', () => {
    const evidence = makeEmptyEvidence()
    const quote = 'could not sleep'
    const correctStart = SAMPLE_TEXT.indexOf(quote)
    evidence.phq9_indicators.sleep_issues = [
      { quote, start_char: 0, end_char: quote.length, rationale: 'sleep difficulty' },
    ]

    const result = validateEvidenceSpans(evidence, SAMPLE_TEXT)
    // After auto-repair, should be valid
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.repaired.phq9_indicators.sleep_issues[0].start_char).toBe(correctStart)
    expect(result.repaired.phq9_indicators.sleep_issues[0].end_char).toBe(correctStart + quote.length)
  })

  it('should report invalid when quote is not a substring of the text at all', () => {
    const evidence = makeEmptyEvidence()
    evidence.mood_score = [
      { quote: 'this text does not exist', start_char: 0, end_char: 24, rationale: 'fabricated' },
    ]

    const result = validateEvidenceSpans(evidence, SAMPLE_TEXT)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('quote not found in text')
  })

  it('should pass validation for empty evidence arrays (all items scored 0)', () => {
    const evidence = makeEmptyEvidence()

    const result = validateEvidenceSpans(evidence, SAMPLE_TEXT)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should handle multiple spans across different fields', () => {
    const evidence = makeEmptyEvidence()
    const sadQuote = 'really sad today'
    const sleepQuote = 'could not sleep at all'
    const energyQuote = 'energy is so low'

    evidence.mood_score = [
      {
        quote: sadQuote,
        start_char: SAMPLE_TEXT.indexOf(sadQuote),
        end_char: SAMPLE_TEXT.indexOf(sadQuote) + sadQuote.length,
        rationale: 'sad',
      },
    ]
    evidence.phq9_indicators.sleep_issues = [
      {
        quote: sleepQuote,
        start_char: SAMPLE_TEXT.indexOf(sleepQuote),
        end_char: SAMPLE_TEXT.indexOf(sleepQuote) + sleepQuote.length,
        rationale: 'insomnia',
      },
    ]
    evidence.phq9_indicators.fatigue = [
      {
        quote: energyQuote,
        start_char: SAMPLE_TEXT.indexOf(energyQuote),
        end_char: SAMPLE_TEXT.indexOf(energyQuote) + energyQuote.length,
        rationale: 'low energy',
      },
    ]

    const result = validateEvidenceSpans(evidence, SAMPLE_TEXT)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should report multiple invalid spans independently', () => {
    const evidence = makeEmptyEvidence()
    evidence.mood_score = [
      { quote: 'nonexistent quote 1', start_char: 0, end_char: 19, rationale: 'bad' },
    ]
    evidence.crisis_detected = [
      { quote: 'nonexistent quote 2', start_char: 0, end_char: 19, rationale: 'bad' },
    ]

    const result = validateEvidenceSpans(evidence, SAMPLE_TEXT)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
  })
})
