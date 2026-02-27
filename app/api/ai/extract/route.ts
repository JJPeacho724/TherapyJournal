import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { createChatCompletion, TEMPERATURE, MAX_TOKENS } from '@/lib/openai'
import { upsertAIExtractionToNeo4j } from '@/lib/graph/neo4jIngest'
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import type { AIExtractionResponseV2, ExtractionEvidence } from '@/types'
import { anxietyToCalmness, calculateZScore, updateEwmaStats } from '@/lib/normalization'
import { validateEvidenceSpans } from '@/lib/evidence-validation'
import { MIN_ENTRIES_FOR_Z } from '@/lib/constants'
import { aiExtractionLimiter, getClientIdentifier } from '@/lib/rate-limit'
import { sanitizeText, MAX_JOURNAL_CONTENT_LENGTH } from '@/lib/sanitize'
import { logAccess } from '@/lib/access-log'
import { withRetry, ApiTimeoutError } from '@/lib/api-helpers'

// POST /api/ai/extract - Extract mood/symptoms from journal entry
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIdentifier(request)
    const { allowed, retryAfterMs } = aiExtractionLimiter.check(clientIp)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const supabase = await createServerSupabaseClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entry_id, content: rawContent } = await request.json()

    if (!rawContent || String(rawContent).trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    if (String(rawContent).length > MAX_JOURNAL_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content exceeds maximum length of ${MAX_JOURNAL_CONTENT_LENGTH} characters` },
        { status: 400 }
      )
    }

    const content = sanitizeText(String(rawContent))

    logAccess({ userId: user.id, action: 'ran_ai_extraction', route: '/api/ai/extract', metadata: { entry_id } })

    // Load the prompt template
    const promptPath = path.join(process.cwd(), 'prompts', 'symptom_extraction.txt')
    const promptTemplate = await fs.readFile(promptPath, 'utf-8')

    // Call OpenAI with timeout and retry
    let response: string
    try {
      response = await withRetry(
        () => createChatCompletion(
          [
            { role: 'system', content: promptTemplate },
            { role: 'user', content: content },
          ],
          { temperature: TEMPERATURE.extraction, maxTokens: MAX_TOKENS.extraction }
        ),
        { maxRetries: 1, baseDelayMs: 2000, timeoutMs: 30000 }
      )
    } catch (err) {
      if (err instanceof ApiTimeoutError) {
        console.error('AI extraction timed out after retries')
        return NextResponse.json(
          { error: 'AI analysis is taking longer than expected. Your entry has been saved — analysis will complete shortly.' },
          { status: 504 }
        )
      }
      throw err
    }

    // Parse the JSON response
    let extraction: AIExtractionResponseV2
    try {
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      extraction = JSON.parse(cleanedResponse)
    } catch (parseError) {
      console.error('Failed to parse AI response:', response)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // ── Evidence validation & auto-repair ──────────────────────
    let evidence: ExtractionEvidence | null = extraction.evidence ?? null
    let evidence_valid: boolean | null = null

    if (evidence) {
      const result = validateEvidenceSpans(evidence, content)
      if (result.valid) {
        evidence = result.repaired
        evidence_valid = true
      } else {
        // Auto-repair attempt: re-prompt GPT once with targeted fix instructions
        try {
          const repairPrompt = [
            'Fix the following JSON evidence alignment issues. The `quote` fields must be exact substrings of the original text, and start_char/end_char must be correct 0-indexed offsets.',
            '',
            'Errors:',
            ...result.errors,
            '',
            'Original text (for reference):',
            content,
            '',
            'Current evidence JSON:',
            JSON.stringify(evidence, null, 2),
            '',
            'Return ONLY the corrected evidence JSON object (no other fields).',
          ].join('\n')

          const repairResponse = await createChatCompletion(
            [
              { role: 'system', content: repairPrompt },
              { role: 'user', content: 'Fix the evidence alignment.' },
            ],
            { temperature: 0.1, maxTokens: 1500 },
          )

          const cleanedRepair = repairResponse
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim()
          const repairedEvidence: ExtractionEvidence = JSON.parse(cleanedRepair)
          const retryResult = validateEvidenceSpans(repairedEvidence, content)

          if (retryResult.valid) {
            evidence = retryResult.repaired
            evidence_valid = true
          } else {
            // Still invalid after repair — drop evidence, keep scores
            console.warn('Evidence repair failed, dropping evidence spans')
            evidence = null
            evidence_valid = false
          }
        } catch (repairError) {
          console.warn('Evidence repair call failed:', repairError)
          evidence = null
          evidence_valid = false
        }
      }
    }
    // Attach validated evidence back onto extraction for the response
    extraction.evidence = evidence
    extraction.evidence_valid = evidence_valid ?? undefined

    // If entry_id provided, save to database
    if (entry_id) {
      const svc = await createServiceRoleClient()

      const clampItem = (x: unknown) => {
        const n = typeof x === 'number' ? x : Number(x)
        if (!Number.isFinite(n)) return 0
        return Math.min(3, Math.max(0, Math.round(n)))
      }

      const phq9 = extraction.phq9_indicators ?? ({} as any)
      const gad7 = extraction.gad7_indicators ?? ({} as any)

      const phq9_estimate =
        clampItem(phq9.anhedonia) +
        clampItem(phq9.depressed_mood) +
        clampItem(phq9.sleep_issues) +
        clampItem(phq9.fatigue) +
        clampItem(phq9.appetite_changes) +
        clampItem(phq9.worthlessness) +
        clampItem(phq9.concentration) +
        clampItem(phq9.psychomotor) +
        clampItem(phq9.self_harm_thoughts)

      const gad7_estimate =
        clampItem(gad7.nervous) +
        clampItem(gad7.uncontrollable_worry) +
        clampItem(gad7.excessive_worry) +
        clampItem(gad7.trouble_relaxing) +
        clampItem(gad7.restless) +
        clampItem(gad7.irritable) +
        clampItem(gad7.afraid)

      const selfHarmFlag = clampItem(phq9.self_harm_thoughts) >= 2
      const crisis_detected = Boolean(extraction.crisis_detected || selfHarmFlag)

      const moodRaw = extraction.mood_score
      const calmnessRaw = anxietyToCalmness(extraction.anxiety_score)

      // --- Fetch baselines/population stats (best-effort; keep extraction working even if stats fail) ---
      // anxiety_z_score is actually calmness_z_score (anxiety reverse-coded to 1-10 calmness).
      // Positive z = calmer than baseline. Kept as "anxiety_z_score" for DB backward compat.
      let mood_z_score: number | null = null
      let anxiety_z_score: number | null = null
      let mood_pop_z: number | null = null
      let anxiety_pop_z: number | null = null

      try {
        const now = new Date()
        const windowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

        // Patient baselines
        const { data: patientBaselines } = await svc
          .from('patient_baselines')
          .select('metric_name, baseline_mean, baseline_std, sample_count, last_updated, window_start')
          .eq('patient_id', user.id)
          .in('metric_name', ['mood', 'anxiety'])

        const byMetric = new Map<string, any>()
        for (const r of patientBaselines ?? []) byMetric.set(r.metric_name, r)

        const moodBase = byMetric.get('mood') ?? null
        const anxBase = byMetric.get('anxiety') ?? null

        // Z-scores are null until MIN_ENTRIES_FOR_Z entries ("collecting baseline")
        if (moodBase && (moodBase.sample_count ?? 0) >= MIN_ENTRIES_FOR_Z) {
          const z = calculateZScore(moodRaw, {
            mean: Number(moodBase.baseline_mean ?? 0),
            std: Number(moodBase.baseline_std ?? 0),
            count: Number(moodBase.sample_count ?? 0),
          })
          mood_z_score = Number.isFinite(z) ? z : null
        }

        if (anxBase && (anxBase.sample_count ?? 0) >= MIN_ENTRIES_FOR_Z) {
          const z = calculateZScore(calmnessRaw, {
            mean: Number(anxBase.baseline_mean ?? 0),
            std: Number(anxBase.baseline_std ?? 0),
            count: Number(anxBase.sample_count ?? 0),
          })
          anxiety_z_score = Number.isFinite(z) ? z : null
        }

        // Update patient baselines with new observation (EMA rolling approximation)
        const moodUpdated = updateEwmaStats(
          {
            mean: Number(moodBase?.baseline_mean ?? moodRaw),
            std: Number(moodBase?.baseline_std ?? 0),
            count: Number(moodBase?.sample_count ?? 0),
            lastUpdatedAt: moodBase?.last_updated ?? null,
          },
          moodRaw,
          { now, halfLifeDays: 45 }
        )

        const anxUpdated = updateEwmaStats(
          {
            mean: Number(anxBase?.baseline_mean ?? calmnessRaw),
            std: Number(anxBase?.baseline_std ?? 0),
            count: Number(anxBase?.sample_count ?? 0),
            lastUpdatedAt: anxBase?.last_updated ?? null,
          },
          calmnessRaw,
          { now, halfLifeDays: 45 }
        )

        await svc
          .from('patient_baselines')
          .upsert(
            [
              {
                patient_id: user.id,
                metric_name: 'mood',
                baseline_mean: moodUpdated.mean,
                baseline_std: moodUpdated.std,
                sample_count: moodUpdated.count,
                window_start: moodBase?.window_start ?? windowStart,
                last_updated: moodUpdated.lastUpdatedAt,
              },
              {
                patient_id: user.id,
                metric_name: 'anxiety',
                baseline_mean: anxUpdated.mean,
                baseline_std: anxUpdated.std,
                sample_count: anxUpdated.count,
                window_start: anxBase?.window_start ?? windowStart,
                last_updated: anxUpdated.lastUpdatedAt,
              },
            ],
            { onConflict: 'patient_id,metric_name' }
          )

        // Population stats
        const { data: popStats } = await svc
          .from('population_stats')
          .select('metric_name, population_mean, population_std, sample_count, last_updated')
          .in('metric_name', ['mood', 'anxiety'])

        const popByMetric = new Map<string, any>()
        for (const r of popStats ?? []) popByMetric.set(r.metric_name, r)

        const moodPop = popByMetric.get('mood') ?? null
        const anxPop = popByMetric.get('anxiety') ?? null

        if (moodPop && (moodPop.sample_count ?? 0) >= MIN_ENTRIES_FOR_Z) {
          const z = calculateZScore(moodRaw, {
            mean: Number(moodPop.population_mean ?? 0),
            std: Number(moodPop.population_std ?? 0),
            count: Number(moodPop.sample_count ?? 0),
          })
          mood_pop_z = Number.isFinite(z) ? z : null
        }

        if (anxPop && (anxPop.sample_count ?? 0) >= MIN_ENTRIES_FOR_Z) {
          const z = calculateZScore(calmnessRaw, {
            mean: Number(anxPop.population_mean ?? 0),
            std: Number(anxPop.population_std ?? 0),
            count: Number(anxPop.sample_count ?? 0),
          })
          anxiety_pop_z = Number.isFinite(z) ? z : null
        }

        const moodPopUpdated = updateEwmaStats(
          {
            mean: Number(moodPop?.population_mean ?? moodRaw),
            std: Number(moodPop?.population_std ?? 0),
            count: Number(moodPop?.sample_count ?? 0),
            lastUpdatedAt: moodPop?.last_updated ?? null,
          },
          moodRaw,
          { now, halfLifeDays: 45 }
        )

        const anxPopUpdated = updateEwmaStats(
          {
            mean: Number(anxPop?.population_mean ?? calmnessRaw),
            std: Number(anxPop?.population_std ?? 0),
            count: Number(anxPop?.sample_count ?? 0),
            lastUpdatedAt: anxPop?.last_updated ?? null,
          },
          calmnessRaw,
          { now, halfLifeDays: 45 }
        )

        await svc
          .from('population_stats')
          .upsert(
            [
              {
                metric_name: 'mood',
                population_mean: moodPopUpdated.mean,
                population_std: moodPopUpdated.std,
                sample_count: moodPopUpdated.count,
                last_updated: moodPopUpdated.lastUpdatedAt,
              },
              {
                metric_name: 'anxiety',
                population_mean: anxPopUpdated.mean,
                population_std: anxPopUpdated.std,
                sample_count: anxPopUpdated.count,
                last_updated: anxPopUpdated.lastUpdatedAt,
              },
            ],
            { onConflict: 'metric_name' }
          )
      } catch (e) {
        console.error('Baseline/population stats update failed (non-fatal):', e)
      }

      // First check if extraction already exists
      const { data: existing } = await svc
        .from('ai_extractions')
        .select('id')
        .eq('entry_id', entry_id)
        .single()

      // Common payload for both insert and update (includes evidence columns)
      const extractionPayload = {
        mood_score: extraction.mood_score,
        anxiety_score: extraction.anxiety_score,
        phq9_indicators: extraction.phq9_indicators,
        gad7_indicators: extraction.gad7_indicators,
        phq9_estimate,
        gad7_estimate,
        mood_z_score,
        anxiety_z_score, // actually calmness z-score, see comment above
        mood_pop_z,
        anxiety_pop_z,   // actually calmness pop z-score
        emotions: extraction.emotions,
        symptoms: extraction.symptoms,
        triggers: extraction.triggers,
        confidence: extraction.confidence,
        crisis_detected,
        summary: extraction.summary,
        evidence,        // ExtractionEvidence | null — jsonb column
        evidence_valid,  // boolean | null
      }

      if (existing) {
        // Update existing
        await svc
          .from('ai_extractions')
          .update(extractionPayload)
          .eq('entry_id', entry_id)
      } else {
        // Insert new
        await svc
          .from('ai_extractions')
          .insert({ entry_id, ...extractionPayload })
      }

      // If crisis detected, create alert
      if (crisis_detected) {
        await svc.from('crisis_alerts').insert({
          patient_id: user.id,
          entry_id,
          severity: extraction.crisis_severity || 'medium',
          therapist_notified: false,
          resolved: false,
        })
      }

      // --- Neo4j graph write (best-effort) ---
      // Attach model-derived affect + extracted features to the Entry node.
      ;(async () => {
        try {
          await upsertAIExtractionToNeo4j({
            entryId: entry_id,
            timestamp: new Date().toISOString(),
            mood_score: extraction.mood_score,
            anxiety_score: extraction.anxiety_score,
            phq9_estimate,
            gad7_estimate,
            mood_z_score,
            anxiety_z_score,
            mood_pop_z,
            anxiety_pop_z,
            emotions: extraction.emotions,
            symptoms: extraction.symptoms,
            triggers: extraction.triggers,
            confidence: extraction.confidence,
            extractorVersion: 'symptom_extraction_v1',
            affectModelVersion: 'ai_extraction_mood_anxiety_v1',
          })
        } catch (e) {
          console.error('Neo4j ingest (ai extract) failed:', e)
        }
      })()
    }

    return NextResponse.json({ extraction })
  } catch (error) {
    console.error('AI extraction error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

