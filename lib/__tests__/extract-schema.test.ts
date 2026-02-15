import { describe, it, expect } from 'vitest'
import type {
  AIExtractionResponse,
  AIExtractionResponseV2,
  ExtractionEvidence,
  AIExtraction,
  EvidenceSpan,
  PHQ9Item,
  GAD7Item,
} from '@/types'

/**
 * Schema/shape tests verifying backward compatibility:
 * - AIExtractionResponseV2 extends AIExtractionResponse
 * - New fields are optional (existing clients unaffected)
 * - AIExtraction DB type includes evidence fields
 */

function makeSampleV1Response(): AIExtractionResponse {
  return {
    mood_score: 6,
    anxiety_score: 3,
    phq9_indicators: {
      anhedonia: 1,
      depressed_mood: 0,
      sleep_issues: 2,
      fatigue: 1,
      appetite_changes: 0,
      worthlessness: 0,
      concentration: 1,
      psychomotor: 0,
      self_harm_thoughts: 0,
    },
    gad7_indicators: {
      nervous: 1,
      uncontrollable_worry: 0,
      excessive_worry: 1,
      trouble_relaxing: 0,
      restless: 0,
      irritable: 1,
      afraid: 0,
    },
    emotions: ['anxious', 'tired'],
    symptoms: ['insomnia', 'fatigue'],
    triggers: ['work stress'],
    confidence: 0.85,
    crisis_detected: false,
    summary: 'The user reports moderate anxiety and tiredness related to work stress.',
  }
}

describe('AIExtractionResponse (V1) shape', () => {
  it('should have all required original fields', () => {
    const resp = makeSampleV1Response()

    expect(resp).toHaveProperty('mood_score')
    expect(resp).toHaveProperty('anxiety_score')
    expect(resp).toHaveProperty('phq9_indicators')
    expect(resp).toHaveProperty('gad7_indicators')
    expect(resp).toHaveProperty('emotions')
    expect(resp).toHaveProperty('symptoms')
    expect(resp).toHaveProperty('triggers')
    expect(resp).toHaveProperty('confidence')
    expect(resp).toHaveProperty('crisis_detected')
    expect(resp).toHaveProperty('summary')
  })

  it('should have correct PHQ-9 indicator keys', () => {
    const resp = makeSampleV1Response()
    const phq9Keys: PHQ9Item[] = [
      'anhedonia', 'depressed_mood', 'sleep_issues', 'fatigue',
      'appetite_changes', 'worthlessness', 'concentration', 'psychomotor', 'self_harm_thoughts',
    ]
    for (const key of phq9Keys) {
      expect(resp.phq9_indicators).toHaveProperty(key)
    }
  })

  it('should have correct GAD-7 indicator keys', () => {
    const resp = makeSampleV1Response()
    const gad7Keys: GAD7Item[] = [
      'nervous', 'uncontrollable_worry', 'excessive_worry', 'trouble_relaxing',
      'restless', 'irritable', 'afraid',
    ]
    for (const key of gad7Keys) {
      expect(resp.gad7_indicators).toHaveProperty(key)
    }
  })
})

describe('AIExtractionResponseV2 shape (backward-compatible)', () => {
  it('should accept V1 data without evidence fields (optional)', () => {
    const v1 = makeSampleV1Response()
    // V2 extends V1 — a V1 object should type-check as V2
    const v2: AIExtractionResponseV2 = { ...v1 }

    expect(v2.evidence).toBeUndefined()
    expect(v2.evidence_valid).toBeUndefined()
    // All V1 fields should still be present
    expect(v2.mood_score).toBe(6)
    expect(v2.crisis_detected).toBe(false)
  })

  it('should accept V2 data with evidence fields', () => {
    const v1 = makeSampleV1Response()
    const evidence: ExtractionEvidence = {
      mood_score: [{ quote: 'test', start_char: 0, end_char: 4, rationale: 'test' }],
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

    const v2: AIExtractionResponseV2 = { ...v1, evidence, evidence_valid: true }

    expect(v2.evidence).toBeDefined()
    expect(v2.evidence_valid).toBe(true)
    expect(v2.mood_score).toBe(6)
  })
})

describe('AIExtraction DB type shape', () => {
  it('should have optional evidence fields', () => {
    // Simulate a DB row without evidence (pre-migration data)
    const dbRow: Partial<AIExtraction> = {
      id: 'test-id',
      entry_id: 'entry-1',
      mood_score: 6,
      anxiety_score: 3,
      crisis_detected: false,
      summary: 'test',
    }

    expect(dbRow.evidence).toBeUndefined()
    expect(dbRow.evidence_valid).toBeUndefined()
  })

  it('should accept evidence fields when present', () => {
    const dbRow: Partial<AIExtraction> = {
      id: 'test-id',
      entry_id: 'entry-1',
      mood_score: 6,
      anxiety_score: 3,
      crisis_detected: false,
      summary: 'test',
      evidence: null,
      evidence_valid: false,
    }

    expect(dbRow.evidence).toBeNull()
    expect(dbRow.evidence_valid).toBe(false)
  })
})

describe('EvidenceSpan type shape', () => {
  it('should have all required fields', () => {
    const span: EvidenceSpan = {
      quote: 'I feel sad',
      start_char: 0,
      end_char: 10,
      rationale: 'expresses sadness',
    }

    expect(span).toHaveProperty('quote')
    expect(span).toHaveProperty('start_char')
    expect(span).toHaveProperty('end_char')
    expect(span).toHaveProperty('rationale')
  })
})
