/**
 * Integration tests for Journal API routes.
 *
 * These tests use the Supabase service role client to verify CRUD operations
 * and AI extraction linking. They require SUPABASE_SERVICE_ROLE_KEY and run
 * against the live Supabase instance.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const SKIP = !supabaseUrl || !serviceKey

let svc: SupabaseClient
let testPatientId: string
const createdEntryIds: string[] = []

describe.skipIf(SKIP)('Journal API Integration', () => {
  beforeAll(async () => {
    svc = createClient(supabaseUrl!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Find the first patient profile
    const { data: profile } = await svc
      .from('profiles')
      .select('id')
      .eq('role', 'patient')
      .limit(1)
      .single()

    if (!profile) {
      throw new Error('No patient profile found — run npm run seed:cohort first')
    }
    testPatientId = profile.id
  })

  afterAll(async () => {
    // Clean up created test entries
    for (const id of createdEntryIds) {
      await svc.from('ai_extractions').delete().eq('entry_id', id)
      await svc.from('structured_logs').delete().eq('entry_id', id)
      await svc.from('journal_entries').delete().eq('id', id)
    }
  })

  it('creates a journal entry', async () => {
    const { data, error } = await svc
      .from('journal_entries')
      .insert({
        patient_id: testPatientId,
        content: 'Integration test entry — please disregard.',
        is_draft: false,
        shared_with_therapist: false,
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data!.content).toContain('Integration test')
    expect(data!.patient_id).toBe(testPatientId)
    createdEntryIds.push(data!.id)
  })

  it('reads back the created entry', async () => {
    const { data, error } = await svc
      .from('journal_entries')
      .select('*')
      .eq('id', createdEntryIds[0])
      .single()

    expect(error).toBeNull()
    expect(data!.content).toContain('Integration test')
  })

  it('updates the entry content', async () => {
    const { data, error } = await svc
      .from('journal_entries')
      .update({ content: 'Integration test entry — updated.' })
      .eq('id', createdEntryIds[0])
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.content).toContain('updated')
  })

  it('creates a linked AI extraction', async () => {
    const { data, error } = await svc
      .from('ai_extractions')
      .insert({
        entry_id: createdEntryIds[0],
        mood_score: 6,
        anxiety_score: 4,
        emotions: ['calm'],
        symptoms: [],
        confidence: 0.85,
        crisis_detected: false,
        summary: 'Test extraction',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.entry_id).toBe(createdEntryIds[0])
    expect(data!.mood_score).toBe(6)
  })

  it('fetches entry with linked extraction', async () => {
    const { data, error } = await svc
      .from('journal_entries')
      .select('*, ai_extraction:ai_extractions(*)')
      .eq('id', createdEntryIds[0])
      .single()

    expect(error).toBeNull()
    const extraction = Array.isArray(data!.ai_extraction)
      ? data!.ai_extraction[0]
      : data!.ai_extraction
    expect(extraction).toBeDefined()
    expect(extraction.mood_score).toBe(6)
  })

  it('creates a structured log for the entry', async () => {
    const { data, error } = await svc
      .from('structured_logs')
      .insert({
        entry_id: createdEntryIds[0],
        sleep_hours: 7.5,
        sleep_quality: 6,
        medication_taken: true,
        energy_level: 5,
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.sleep_hours).toBe(7.5)
  })

  it('deletes the entry', async () => {
    const entryId = createdEntryIds[0]

    await svc.from('ai_extractions').delete().eq('entry_id', entryId)
    await svc.from('structured_logs').delete().eq('entry_id', entryId)

    const { error } = await svc
      .from('journal_entries')
      .delete()
      .eq('id', entryId)

    expect(error).toBeNull()

    const { data: check } = await svc
      .from('journal_entries')
      .select('id')
      .eq('id', entryId)
      .maybeSingle()

    expect(check).toBeNull()
    createdEntryIds.splice(0, 1)
  })

  it('handles baseline upsert correctly', async () => {
    const now = new Date().toISOString()
    const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await svc.from('patient_baselines').upsert({
      patient_id: testPatientId,
      metric_name: 'mood',
      baseline_mean: 6.5,
      baseline_std: 1.2,
      sample_count: 10,
      window_start: windowStart,
      last_updated: now,
    }, { onConflict: 'patient_id,metric_name' })

    expect(error).toBeNull()

    const { data } = await svc
      .from('patient_baselines')
      .select('*')
      .eq('patient_id', testPatientId)
      .eq('metric_name', 'mood')
      .single()

    expect(data!.baseline_mean).toBe(6.5)
  })
})
