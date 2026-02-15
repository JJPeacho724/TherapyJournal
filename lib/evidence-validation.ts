/**
 * Evidence span validation and auto-repair for GPT extraction evidence.
 *
 * Each EvidenceSpan must be an exact substring of the original journal text
 * at the specified character offsets. This module validates that invariant
 * and attempts lightweight repairs when offsets are wrong but the quote
 * does exist in the text.
 */

import type { ExtractionEvidence, EvidenceSpan } from '@/types'

export interface ValidationResult {
  valid: boolean
  /** Human-readable descriptions of every failed span. */
  errors: string[]
  /** Evidence object with auto-repaired offsets where possible. */
  repaired: ExtractionEvidence
}

/**
 * Validate all evidence spans against the original text.
 *
 * For each span the function checks that
 *   `originalText.substring(span.start_char, span.end_char) === span.quote`
 *
 * If the offsets are wrong but the quote *does* exist in the text, the
 * offsets are auto-repaired in the returned `repaired` object.
 *
 * If the quote is not a substring of the text at all, the span is marked
 * invalid (recorded in `errors`) and left unchanged in `repaired`.
 */
export function validateEvidenceSpans(
  evidence: ExtractionEvidence,
  originalText: string,
): ValidationResult {
  const errors: string[] = []

  // Deep clone so we can mutate offsets for repair
  const repaired: ExtractionEvidence = JSON.parse(JSON.stringify(evidence))

  const validateSpanArray = (
    spans: EvidenceSpan[],
    repairedSpans: EvidenceSpan[],
    label: string,
  ) => {
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i]
      const rSpan = repairedSpans[i]

      // Check if the quote matches at the declared offsets
      const sliced = originalText.substring(span.start_char, span.end_char)
      if (sliced === span.quote) continue // valid ✓

      // Attempt auto-repair: find the quote elsewhere in the text
      const idx = originalText.indexOf(span.quote)
      if (idx !== -1) {
        rSpan.start_char = idx
        rSpan.end_char = idx + span.quote.length
        // Repaired — not an error
        continue
      }

      // Quote not found at all — invalid
      errors.push(
        `[${label}][${i}] quote not found in text: "${span.quote.slice(0, 60)}${span.quote.length > 60 ? '…' : ''}"`,
      )
    }
  }

  // Top-level arrays
  validateSpanArray(evidence.mood_score ?? [], repaired.mood_score ?? [], 'mood_score')
  validateSpanArray(evidence.anxiety_score ?? [], repaired.anxiety_score ?? [], 'anxiety_score')
  validateSpanArray(evidence.crisis_detected ?? [], repaired.crisis_detected ?? [], 'crisis_detected')

  // PHQ-9 indicator evidence (Record<string, EvidenceSpan[]>)
  if (evidence.phq9_indicators) {
    for (const key of Object.keys(evidence.phq9_indicators)) {
      const spans = (evidence.phq9_indicators as Record<string, EvidenceSpan[]>)[key] ?? []
      const rSpans = (repaired.phq9_indicators as Record<string, EvidenceSpan[]>)[key] ?? []
      validateSpanArray(spans, rSpans, `phq9.${key}`)
    }
  }

  // GAD-7 indicator evidence (Record<string, EvidenceSpan[]>)
  if (evidence.gad7_indicators) {
    for (const key of Object.keys(evidence.gad7_indicators)) {
      const spans = (evidence.gad7_indicators as Record<string, EvidenceSpan[]>)[key] ?? []
      const rSpans = (repaired.gad7_indicators as Record<string, EvidenceSpan[]>)[key] ?? []
      validateSpanArray(spans, rSpans, `gad7.${key}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    repaired,
  }
}
