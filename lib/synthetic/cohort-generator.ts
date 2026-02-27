/**
 * Cohort generator orchestrator.
 *
 * Generates synthetic patients across all 6 archetypes and inserts
 * data into existing tables (journal_entries, ai_extractions) with
 * is_synthetic=true. Uses Supabase service-role client for writes.
 *
 * This module runs SERVER-SIDE ONLY (API routes or seed scripts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Archetype, GenerateCohortResponse } from '@/types/synthetic'
import {
  ARCHETYPE_CONFIGS,
  seededRandom,
  generateDayScores,
  pickThemes,
} from './archetypes'
import { generateJournalEntry } from './journal-generator'
import { compositeScore } from './metrics-engine'
import { mapToValidatedScale } from '@/lib/normalization'
import { ARCHETYPE_LABELS } from '@/types/synthetic'

const ANXIETY_EVIDENCE_THEMES = new Set([
  'worry', 'physical_anxiety', 'avoidance', 'hypervigilance', 'panic', 'rumination',
])

const ALL_ARCHETYPES: Archetype[] = [
  'gradual_improver',
  'volatile_stabilizer',
  'hidden_deteriorator',
  'flat_non_responder',
  'early_dropout',
  'relapse_then_recover',
]

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey',
  'Riley', 'Quinn', 'Avery', 'Drew', 'Sage',
  'Robin', 'Skyler', 'Charlie', 'Dakota', 'Hayden',
  'Emerson', 'Finley', 'Harper', 'Kendall', 'Lane',
  'Marley', 'Oakley', 'Parker', 'Reese', 'Shawn',
  'Tatum', 'Val', 'Winter', 'Blair', 'Ellis',
]

/**
 * Generate a full synthetic cohort and insert into Supabase.
 *
 * @param supabase - Supabase client with service-role key
 * @param patientsPerArchetype - Number of patients per archetype (1-5)
 * @param days - Number of days of data per patient (30-60)
 */
export async function generateCohort(
  supabase: SupabaseClient,
  patientsPerArchetype: number,
  days: number
): Promise<GenerateCohortResponse> {
  const clampedPatients = Math.max(1, Math.min(5, patientsPerArchetype))
  const clampedDays = Math.max(30, Math.min(60, days))

  let totalPatients = 0
  let totalEntries = 0
  let nameIndex = 0

  for (const archetype of ALL_ARCHETYPES) {
    const config = ARCHETYPE_CONFIGS[archetype]

    for (let p = 0; p < clampedPatients; p++) {
      const patientSeed = hashCode(`${archetype}-${p}`)
      const rng = seededRandom(patientSeed)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - clampedDays)

      const name = `${FIRST_NAMES[nameIndex % FIRST_NAMES.length]} (${ARCHETYPE_LABELS[archetype]})`
      nameIndex++

      const effectiveDays = config.dropoutDay
        ? Math.min(config.dropoutDay(clampedDays), clampedDays)
        : clampedDays

      // Insert synthetic patient record
      const { data: patient, error: patientError } = await supabase
        .from('synthetic_patients')
        .insert({
          name,
          archetype,
          start_date: startDate.toISOString().split('T')[0],
          days_generated: effectiveDays,
        })
        .select('id')
        .single()

      if (patientError || !patient) {
        console.error(`Failed to create synthetic patient: ${patientError?.message}`)
        continue
      }

      totalPatients++

      // Generate daily entries in batches
      const journalRows: any[] = []
      const extractionPairs: { journalIdx: number; extraction: any }[] = []

      for (let day = 0; day < effectiveDays; day++) {
        const entryDate = new Date(startDate)
        entryDate.setDate(entryDate.getDate() + day)
        // Set a plausible time of day
        entryDate.setHours(8 + Math.floor(rng() * 12), Math.floor(rng() * 60))

        const { mood, anxiety } = generateDayScores(config, day, clampedDays, rng)
        const themes = pickThemes(config, mood, anxiety, rng)
        const { text, evidenceSnippets } = generateJournalEntry(mood, anxiety, themes, rng)

        // PHQ-9 and GAD-7 on every 7th day
        const comp = compositeScore(mood, anxiety)
        const isWeeklySnapshot = day % 7 === 6
        const phq9Total = isWeeklySnapshot ? mapToValidatedScale(-comp + 5.5, 'phq9') : null
        const gad7Total = isWeeklySnapshot ? mapToValidatedScale(-comp + 5.5, 'gad7') : null

        journalRows.push({
          content: text,
          is_draft: false,
          shared_with_therapist: true,
          is_synthetic: true,
          synthetic_patient_id: patient.id,
          synthetic_day_index: day,
          patient_id: null,
          created_at: entryDate.toISOString(),
          updated_at: entryDate.toISOString(),
        })

        extractionPairs.push({
          journalIdx: journalRows.length - 1,
          extraction: {
            mood_score: Math.round(mood),
            anxiety_score: Math.round(anxiety),
            emotions: themes.slice(0, 2),
            symptoms: themes.filter((t) =>
              ['rumination', 'panic', 'irritability', 'social_withdrawal'].includes(t)
            ),
            triggers: themes.filter((t) =>
              ['work_stress', 'substance_use', 'sleep'].includes(t)
            ),
            confidence: 0.85 + rng() * 0.1,
            crisis_detected: false,
            summary: `Synthetic entry day ${day + 1}: ${themes.join(', ')}`,
            phq9_estimate: phq9Total,
            gad7_estimate: gad7Total,
            evidence: evidenceSnippets.length > 0
              ? {
                  mood_score: evidenceSnippets
                    .filter((s) => !ANXIETY_EVIDENCE_THEMES.has(s.theme))
                    .map((s) => ({
                      quote: s.quote,
                      start_char: text.indexOf(s.quote),
                      end_char: text.indexOf(s.quote) + s.quote.length,
                      rationale: `Supports ${s.theme} theme`,
                    })),
                  anxiety_score: evidenceSnippets
                    .filter((s) => ANXIETY_EVIDENCE_THEMES.has(s.theme))
                    .map((s) => ({
                      quote: s.quote,
                      start_char: text.indexOf(s.quote),
                      end_char: text.indexOf(s.quote) + s.quote.length,
                      rationale: `Supports ${s.theme} theme (anxiety indicator)`,
                    })),
                  phq9_indicators: {},
                  gad7_indicators: {},
                  crisis_detected: [],
                }
              : null,
            evidence_valid: evidenceSnippets.length > 0,
          },
        })
      }

      // Batch insert journal entries
      const { data: insertedEntries, error: journalError } = await supabase
        .from('journal_entries')
        .insert(journalRows)
        .select('id')

      if (journalError || !insertedEntries) {
        console.error(`Failed to insert journal entries: ${journalError?.message}`)
        continue
      }

      // Now insert ai_extractions linked to the journal entries
      const extractionRows = extractionPairs.map((pair) => ({
        entry_id: insertedEntries[pair.journalIdx].id,
        ...pair.extraction,
      }))

      const { error: extractionError } = await supabase
        .from('ai_extractions')
        .insert(extractionRows)

      if (extractionError) {
        console.error(`Failed to insert extractions: ${extractionError.message}`)
      }

      totalEntries += insertedEntries.length
    }
  }

  return {
    success: true,
    patientsCreated: totalPatients,
    entriesCreated: totalEntries,
  }
}

/**
 * Delete all synthetic data: synthetic_patients (cascades to
 * clinician_feedback), and journal_entries where is_synthetic=true
 * (cascades to ai_extractions via entry_id FK).
 */
export async function resetSyntheticData(
  supabase: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  // Delete synthetic journal entries (cascades to ai_extractions, structured_logs)
  const { error: journalError } = await supabase
    .from('journal_entries')
    .delete()
    .eq('is_synthetic', true)

  if (journalError) {
    return { success: false, error: `Journal cleanup: ${journalError.message}` }
  }

  // Delete synthetic patients (cascades to clinician_feedback)
  const { error: patientError } = await supabase
    .from('synthetic_patients')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all

  if (patientError) {
    return { success: false, error: `Patient cleanup: ${patientError.message}` }
  }

  return { success: true }
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash
}
