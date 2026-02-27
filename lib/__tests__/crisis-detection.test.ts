import { describe, it, expect } from 'vitest'

/**
 * Crisis detection logic extracted from app/api/ai/extract/route.ts
 * Tests the self-harm flag threshold, OR logic, and severity assignment.
 */

function clampItem(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x)
  if (!Number.isFinite(n)) return 0
  return Math.min(3, Math.max(0, Math.round(n)))
}

function detectCrisis(extraction: {
  crisis_detected?: boolean
  crisis_severity?: string | null
  phq9_indicators?: Record<string, unknown>
}): { crisis_detected: boolean; severity: string | null } {
  const phq9 = extraction.phq9_indicators ?? {}
  const selfHarmFlag = clampItem(phq9.self_harm_thoughts) >= 2
  const crisis_detected = Boolean(extraction.crisis_detected || selfHarmFlag)
  const severity = extraction.crisis_severity ?? (crisis_detected ? 'medium' : null)
  return { crisis_detected, severity }
}

describe('clampItem', () => {
  it('clamps values to [0, 3] range', () => {
    expect(clampItem(0)).toBe(0)
    expect(clampItem(3)).toBe(3)
    expect(clampItem(-1)).toBe(0)
    expect(clampItem(5)).toBe(3)
  })

  it('rounds to nearest integer', () => {
    expect(clampItem(1.4)).toBe(1)
    expect(clampItem(1.6)).toBe(2)
    expect(clampItem(2.5)).toBe(3)
  })

  it('handles non-numeric inputs', () => {
    expect(clampItem('2')).toBe(2)
    expect(clampItem(null)).toBe(0)
    expect(clampItem(undefined)).toBe(0)
    expect(clampItem(NaN)).toBe(0)
    expect(clampItem('abc')).toBe(0)
  })
})

describe('crisis detection logic', () => {
  it('detects crisis when AI extraction flags crisis_detected', () => {
    const result = detectCrisis({
      crisis_detected: true,
      phq9_indicators: { self_harm_thoughts: 0 },
    })
    expect(result.crisis_detected).toBe(true)
  })

  it('detects crisis when self_harm_thoughts >= 2', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { self_harm_thoughts: 2 },
    })
    expect(result.crisis_detected).toBe(true)
  })

  it('detects crisis at self_harm_thoughts = 3 (max)', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { self_harm_thoughts: 3 },
    })
    expect(result.crisis_detected).toBe(true)
  })

  it('does NOT flag crisis when self_harm_thoughts = 1', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { self_harm_thoughts: 1 },
    })
    expect(result.crisis_detected).toBe(false)
  })

  it('does NOT flag crisis when both signals are absent', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { self_harm_thoughts: 0 },
    })
    expect(result.crisis_detected).toBe(false)
  })

  it('detects crisis via OR logic (both flags true)', () => {
    const result = detectCrisis({
      crisis_detected: true,
      phq9_indicators: { self_harm_thoughts: 3 },
    })
    expect(result.crisis_detected).toBe(true)
  })

  it('handles missing phq9_indicators gracefully', () => {
    const result = detectCrisis({ crisis_detected: false })
    expect(result.crisis_detected).toBe(false)
  })

  it('handles missing self_harm_thoughts key gracefully', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { anhedonia: 1 },
    })
    expect(result.crisis_detected).toBe(false)
  })
})

describe('crisis severity assignment', () => {
  it('uses AI-provided severity when present', () => {
    const result = detectCrisis({
      crisis_detected: true,
      crisis_severity: 'high',
      phq9_indicators: { self_harm_thoughts: 0 },
    })
    expect(result.severity).toBe('high')
  })

  it('defaults to medium when crisis detected but no severity provided', () => {
    const result = detectCrisis({
      crisis_detected: true,
      phq9_indicators: { self_harm_thoughts: 0 },
    })
    expect(result.severity).toBe('medium')
  })

  it('defaults to medium for self-harm flag triggered crisis', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { self_harm_thoughts: 2 },
    })
    expect(result.severity).toBe('medium')
  })

  it('returns null severity when no crisis', () => {
    const result = detectCrisis({
      crisis_detected: false,
      phq9_indicators: { self_harm_thoughts: 0 },
    })
    expect(result.severity).toBeNull()
  })
})

describe('PHQ-9 / GAD-7 estimate computation', () => {
  it('sums clamped PHQ-9 indicator values', () => {
    const phq9 = {
      anhedonia: 1, depressed_mood: 2, sleep_issues: 1,
      fatigue: 1, appetite_changes: 0, worthlessness: 2,
      concentration: 1, psychomotor: 0, self_harm_thoughts: 0,
    }
    const estimate = Object.values(phq9).reduce((sum, v) => sum + clampItem(v), 0)
    expect(estimate).toBe(8)
  })

  it('sums clamped GAD-7 indicator values', () => {
    const gad7 = {
      nervous: 2, uncontrollable_worry: 1, excessive_worry: 2,
      trouble_relaxing: 1, restless: 0, irritable: 1, afraid: 0,
    }
    const estimate = Object.values(gad7).reduce((sum, v) => sum + clampItem(v), 0)
    expect(estimate).toBe(7)
  })

  it('clamps out-of-range indicators before summing', () => {
    const phq9 = {
      anhedonia: 5, depressed_mood: -1, sleep_issues: 3,
      fatigue: 3, appetite_changes: 3, worthlessness: 3,
      concentration: 3, psychomotor: 3, self_harm_thoughts: 3,
    }
    const estimate = Object.values(phq9).reduce((sum, v) => sum + clampItem(v), 0)
    expect(estimate).toBe(24) // 3*8 + 0 for the -1 clamped to 0, but 5->3
  })

  it('PHQ-9 max possible is 27 (9 items * 3)', () => {
    const allMax = {
      anhedonia: 3, depressed_mood: 3, sleep_issues: 3,
      fatigue: 3, appetite_changes: 3, worthlessness: 3,
      concentration: 3, psychomotor: 3, self_harm_thoughts: 3,
    }
    const estimate = Object.values(allMax).reduce((sum, v) => sum + clampItem(v), 0)
    expect(estimate).toBe(27)
  })

  it('GAD-7 max possible is 21 (7 items * 3)', () => {
    const allMax = {
      nervous: 3, uncontrollable_worry: 3, excessive_worry: 3,
      trouble_relaxing: 3, restless: 3, irritable: 3, afraid: 3,
    }
    const estimate = Object.values(allMax).reduce((sum, v) => sum + clampItem(v), 0)
    expect(estimate).toBe(21)
  })
})
