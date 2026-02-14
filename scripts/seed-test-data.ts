/**
 * Seed Demo Data Script
 * 
 * This script populates the Supabase database with realistic test data
 * for DEMO patient and therapist accounts so you can showcase the platform.
 * 
 * Each journal entry is run through the REAL OpenAI extraction pipeline
 * (same prompt + model as the app) so mood scores, PHQ-9/GAD-7 estimates,
 * emotions, symptoms, and crisis flags are all genuine AI output.
 * 
 * Usage:
 *   npm run seed:demo          # create/refresh demo data
 *   npx tsx scripts/seed-test-data.ts
 * 
 * Requires:
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase Dashboard → Settings → API
 *   OPENAI_API_KEY              — for running the extraction pipeline
 * 
 * Demo Credentials:
 *   Patient  — test.patient@therapyjournal.local  / TestPatient123!
 *   Therapist — test.therapist@therapyjournal.local / TestTherapist123!
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'
import { promises as fs } from 'fs'
import path from 'path'

dotenv.config({ path: '.env.local' })
dotenv.config() // fallback to .env

// ============================================
// ENV VALIDATION
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY

if (!supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL. Check your .env.local file.')
  process.exit(1)
}

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY — this is required for the demo seeder.')
  console.error('   Get it from: Supabase Dashboard → Settings → API → service_role')
  process.exit(1)
}

if (!openaiApiKey) {
  console.error('❌ Missing OPENAI_API_KEY — this is required to run the AI extraction pipeline.')
  console.error('   Add it to your .env.local file.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const openai = new OpenAI({ apiKey: openaiApiKey })

// ============================================
// DEMO USER CREDENTIALS (hard-coded & safe)
// ============================================

const DEMO_PATIENT_EMAIL    = 'test.patient@therapyjournal.local'
const DEMO_PATIENT_PASSWORD = 'TestPatient123!'
const DEMO_PATIENT_NAME     = 'Alex Thompson'

const DEMO_THERAPIST_EMAIL    = 'test.therapist@therapyjournal.local'
const DEMO_THERAPIST_PASSWORD = 'TestTherapist123!'
const DEMO_THERAPIST_NAME     = 'Dr. Sarah Chen'

// Same model + temperature as lib/openai.ts
const AI_MODEL = 'gpt-4-turbo-preview'
const EXTRACTION_TEMPERATURE = 0.3
const EXTRACTION_MAX_TOKENS = 1000

// ============================================
// NORMALIZATION HELPERS (mirror lib/normalization.ts)
// ============================================

const LN2 = Math.log(2)

function calculateZScore(
  rawScore: number,
  baseline: { mean: number; std: number; count: number }
): number {
  if (!Number.isFinite(rawScore)) return 0
  if (!baseline || baseline.count < 2) return 0
  const std = baseline.std
  if (!Number.isFinite(std) || std <= 0) return 0
  return (rawScore - baseline.mean) / std
}

type EwmaStats = {
  mean: number
  std: number
  count: number
  lastUpdatedAt: string | null
}

function updateEwmaStats(
  current: EwmaStats,
  newValue: number,
  opts: { now?: Date; halfLifeDays?: number } = {}
): EwmaStats {
  const now = opts.now ?? new Date()
  const halfLifeDays = opts.halfLifeDays ?? 45
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000

  const prevMean = Number.isFinite(current?.mean) ? current.mean : newValue
  const prevStd = Number.isFinite(current?.std) ? current.std : 0
  const prevVar = prevStd * prevStd
  const prevCount = Math.max(0, current?.count ?? 0)
  const prevUpdatedAt = current?.lastUpdatedAt ? new Date(current.lastUpdatedAt) : null

  const dt = prevUpdatedAt ? Math.max(0, now.getTime() - prevUpdatedAt.getTime()) : 0
  const decay = prevUpdatedAt ? Math.exp((-LN2 * dt) / Math.max(1, halfLifeMs)) : 0
  const oneMinus = 1 - decay

  const mean = decay * prevMean + oneMinus * newValue
  const varNew = decay * prevVar + oneMinus * (newValue - prevMean) * (newValue - mean)
  const std = Math.sqrt(Math.max(0, varNew))

  return {
    mean,
    std,
    count: prevCount + 1,
    lastUpdatedAt: now.toISOString(),
  }
}

function anxietyToCalmness(anxietyScore: number): number {
  return 11 - anxietyScore
}

// ============================================
// JOURNAL ENTRY DATA (content + structured self-reports only)
// ============================================

interface EntryData {
  content: string
  structured: {
    sleep_hours: number
    sleep_quality: number
    medication_taken: boolean
    medication_notes?: string
    energy_level: number
  }
  daysAgo: number
}

const JOURNAL_ENTRIES: EntryData[] = [
  {
    content: `Today was rough. Woke up feeling heavy, like there was a weight on my chest. I couldn't get out of bed until 11am even though I'd been awake since 8. Work deadlines are piling up and I keep avoiding looking at my email. 

Made myself go for a short walk around the block. It helped a little - the sun felt nice on my face. But then I came home and just scrolled my phone for two hours. Why do I do that?

My therapist says I should be kinder to myself. Trying.`,
    structured: { sleep_hours: 5.5, sleep_quality: 4, medication_taken: true, energy_level: 3 },
    daysAgo: 0,
  },
  {
    content: `Better day today! Slept almost 7 hours which is huge for me lately. Had coffee with Sarah and we talked for like 2 hours. I forgot how much I missed actually seeing friends in person.

She noticed I seemed different - asked if I was okay. I told her about the anxiety stuff and she was so understanding. She deals with similar things. Felt less alone.

Still didn't tackle the work stuff but I'll try tomorrow. Baby steps.`,
    structured: { sleep_hours: 6.8, sleep_quality: 6, medication_taken: true, energy_level: 6 },
    daysAgo: 1,
  },
  {
    content: `Anxiety through the roof today. Had a meeting at work and I could barely speak - my heart was racing the whole time. I think people noticed I was being weird. 

Left early saying I had a headache (kind of true - I get them when I'm really stressed). Came home and just cried for like an hour. I hate that I can't handle normal things that other people do every day.

Took an extra anxiety med which helped take the edge off. Now I'm just exhausted.`,
    structured: { sleep_hours: 7, sleep_quality: 5, medication_taken: true, medication_notes: 'Took extra PRN dose', energy_level: 3 },
    daysAgo: 2,
  },
  {
    content: `Quiet day. Worked from home which was a relief. Got through a few of those emails I've been avoiding - they weren't even that bad. Why do I build things up so much in my head?

Tried that meditation app my therapist recommended. Did a 10 minute session. It was okay - hard to quiet my mind but I stuck with it.

Made actual dinner instead of just snacking. Small wins.`,
    structured: { sleep_hours: 6.5, sleep_quality: 6, medication_taken: true, energy_level: 5 },
    daysAgo: 3,
  },
  {
    content: `Mom called today. As always, she managed to make me feel like crap without even trying. Asking about when I'm going to "get my life together" and comparing me to my sister.

I know she doesn't mean to hurt me but it does. Every time. I'm 28 and I still let her get under my skin.

Couldn't eat much after the call. Just felt this knot in my stomach. Went to bed early just to escape.`,
    structured: { sleep_hours: 8, sleep_quality: 4, medication_taken: true, energy_level: 4 },
    daysAgo: 4,
  },
  {
    content: `Actually had a really good therapy session today. We talked about the stuff with my mom and Dr. Chen helped me see that her comments say more about her anxiety than about me.

I've been carrying around her expectations my whole life like they're facts. They're not. I get to decide what success looks like for me.

Feeling lighter. Still processing but... hopeful?`,
    structured: { sleep_hours: 7, sleep_quality: 7, medication_taken: true, energy_level: 6 },
    daysAgo: 5,
  },
  {
    content: `Weekend. Forced myself to go to the gym even though I didn't want to. Did 30 minutes on the treadmill and some light weights. Body feels good.

Then spent the afternoon reading at the coffee shop. Just enjoying being out in the world without having to interact much.

This is a version of okay I can live with.`,
    structured: { sleep_hours: 8, sleep_quality: 7, medication_taken: true, energy_level: 7 },
    daysAgo: 6,
  },
  {
    content: `Sunday scaries hitting hard. Tomorrow is Monday and I can already feel my chest tightening. The work week stretching out ahead feels impossible.

Called Sarah to distract myself. She suggested maybe I should talk to my boss about my workload. The thought makes me want to throw up but maybe she's right.

Going to try to sleep early. Tomorrow is just one day. I can handle one day.`,
    structured: { sleep_hours: 5, sleep_quality: 3, medication_taken: true, energy_level: 4 },
    daysAgo: 7,
  },
  {
    content: `Survived the meeting. Actually spoke up about needing more time on the project and my manager was fine with it. All that worry for nothing.

Why is it so hard to remember that things usually work out? My brain loves to imagine worst case scenarios.

Treated myself to Thai food for dinner. The small victories matter.`,
    structured: { sleep_hours: 6, sleep_quality: 5, medication_taken: true, energy_level: 5 },
    daysAgo: 8,
  },
  {
    content: `Tough night. Couldn't sleep until 3am, brain just wouldn't shut off. Kept replaying old embarrassing memories - stuff from years ago that doesn't even matter.

Dragged myself through work. Made mistakes because I was so tired. Just want to feel normal.

Is this going to be my life forever?`,
    structured: { sleep_hours: 4, sleep_quality: 2, medication_taken: true, energy_level: 2 },
    daysAgo: 9,
  },
  {
    content: `Decided to take a mental health day. Called in sick to work. Slept until noon and honestly it helped.

I always feel guilty about doing this but my therapist says rest is productive too. 

Spent the afternoon watching comfort TV and eating soup. Sometimes you just need to hit pause.`,
    structured: { sleep_hours: 10, sleep_quality: 7, medication_taken: true, energy_level: 5 },
    daysAgo: 10,
  },
  {
    content: `Back at work. Feeling more human after yesterday's rest. Got through the day without any major anxiety episodes.

Had lunch with a coworker I don't usually talk to. She's nice. Maybe I should try to socialize more at work.

Ordered groceries online - trying to eat better this week.`,
    structured: { sleep_hours: 7, sleep_quality: 6, medication_taken: true, energy_level: 6 },
    daysAgo: 11,
  },
  {
    content: `Really bad day. Got some critical feedback at work and I completely spiraled. Spent an hour in the bathroom trying not to cry.

I know logically it wasn't that harsh but my brain interpreted it as "you're a complete failure." The inner critic is so loud sometimes.

Just want to disappear. Not like... in a scary way. Just want to not exist for a while.`,
    structured: { sleep_hours: 6, sleep_quality: 5, medication_taken: true, energy_level: 3 },
    daysAgo: 12,
  },
  {
    content: `Feeling better today after yesterday's meltdown. Texted my therapist and she squeezed me in for an emergency session.

We talked about rejection sensitivity and how my brain is wired to take criticism really hard. It's not a character flaw - it's just something I need to work around.

Made a plan for how to handle feedback in the future. Writing down the facts separate from my feelings.`,
    structured: { sleep_hours: 6.5, sleep_quality: 5, medication_taken: true, energy_level: 5 },
    daysAgo: 13,
  },
  {
    content: `Friday! Made it through another week. That feels like an accomplishment right now.

Going to Sarah's for wine and movies tonight. Trying not to cancel like I usually want to.

Maybe I'll try that thing where I just commit to 30 minutes and can leave after if I want. Usually once I'm there, I'm glad I went.`,
    structured: { sleep_hours: 7, sleep_quality: 6, medication_taken: true, energy_level: 6 },
    daysAgo: 14,
  },
  {
    content: `Had such a fun night at Sarah's! We laughed so much. I forgot what it feels like to just be silly and light.

Stayed until midnight which is late for me. Worth it though.

Woke up actually looking forward to the weekend. When did that stop being normal?`,
    structured: { sleep_hours: 6, sleep_quality: 7, medication_taken: true, energy_level: 7 },
    daysAgo: 15,
  },
  {
    content: `Lazy Saturday. Did some cleaning, watched a movie, took a nap. Nothing special but nothing bad either.

Sometimes okay is enough. I'm trying to appreciate the neutral days instead of always waiting for something to go wrong.

Made my favorite pasta for dinner.`,
    structured: { sleep_hours: 8, sleep_quality: 7, medication_taken: true, energy_level: 6 },
    daysAgo: 16,
  },
  {
    content: `Went to a farmer's market this morning. It was crowded which usually stresses me out but I managed. Bought some flowers for my apartment - felt fancy.

Thinking about maybe signing up for that pottery class I've been considering. Scary to try something new but also... maybe exciting?

Journaling has helped me notice when I'm doing better. That's something.`,
    structured: { sleep_hours: 7.5, sleep_quality: 7, medication_taken: true, energy_level: 7 },
    daysAgo: 17,
  },
  {
    content: `Signed up for pottery! Class starts next month. Already nervous about it but also proud I actually did it.

Called mom to tell her. She was... actually supportive? Said it sounds like a nice hobby. Maybe she's trying too.

Good day. Feeling like maybe I'm moving forward, even if it's slowly.`,
    structured: { sleep_hours: 7, sleep_quality: 7, medication_taken: true, energy_level: 7 },
    daysAgo: 18,
  },
  {
    content: `One of those in-between days. Not good, not bad. Just existing.

Work was fine. Came home, made dinner, watched TV. Went through the motions.

I guess I should be grateful these are the hard days now instead of the crushing ones. Progress isn't linear but it's happening.`,
    structured: { sleep_hours: 7, sleep_quality: 6, medication_taken: true, energy_level: 5 },
    daysAgo: 19,
  },
]

// ============================================
// AI EXTRACTION PIPELINE (mirrors /api/ai/extract)
// ============================================

interface ExtractionResult {
  mood_score: number
  anxiety_score: number
  phq9_indicators: Record<string, number> | null
  gad7_indicators: Record<string, number> | null
  phq9_estimate: number
  gad7_estimate: number
  emotions: string[]
  symptoms: string[]
  triggers: string[]
  confidence: number
  crisis_detected: boolean
  crisis_severity: string | null
  summary: string
}

let _promptTemplate: string | null = null

async function loadPromptTemplate(): Promise<string> {
  if (_promptTemplate) return _promptTemplate
  const promptPath = path.join(process.cwd(), 'prompts', 'symptom_extraction.txt')
  _promptTemplate = await fs.readFile(promptPath, 'utf-8')
  return _promptTemplate
}

async function runExtraction(content: string): Promise<ExtractionResult | null> {
  const promptTemplate = await loadPromptTemplate()

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: promptTemplate },
      { role: 'user', content },
    ],
    max_tokens: EXTRACTION_MAX_TOKENS,
    temperature: EXTRACTION_TEMPERATURE,
  })

  const raw = response.choices[0]?.message?.content ?? ''

  // Parse the JSON response (strip markdown fences if present)
  let parsed: any
  try {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('    ⚠️  Failed to parse AI response, skipping extraction')
    return null
  }

  // Compute PHQ-9 / GAD-7 estimates from indicator checklists (same logic as route.ts)
  const clampItem = (x: unknown) => {
    const n = typeof x === 'number' ? x : Number(x)
    if (!Number.isFinite(n)) return 0
    return Math.min(3, Math.max(0, Math.round(n)))
  }

  const phq9 = parsed.phq9_indicators ?? {}
  const gad7 = parsed.gad7_indicators ?? {}

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
  const crisis_detected = Boolean(parsed.crisis_detected || selfHarmFlag)

  return {
    mood_score: parsed.mood_score,
    anxiety_score: parsed.anxiety_score,
    phq9_indicators: parsed.phq9_indicators ?? null,
    gad7_indicators: parsed.gad7_indicators ?? null,
    phq9_estimate,
    gad7_estimate,
    emotions: parsed.emotions ?? [],
    symptoms: parsed.symptoms ?? [],
    triggers: parsed.triggers ?? [],
    confidence: parsed.confidence ?? 0.8,
    crisis_detected,
    crisis_severity: parsed.crisis_severity ?? (crisis_detected ? 'medium' : null),
    summary: parsed.summary ?? '',
  }
}

// ============================================
// USER HELPERS — always target by email
// ============================================

async function getOrCreateUser(
  email: string,
  password: string,
  fullName: string,
  role: 'patient' | 'therapist',
): Promise<string | null> {
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (existingUser) {
    console.log(`  ✅ Auth user exists: ${email} (${existingUser.id.substring(0, 8)}…)`)
    return existingUser.id
  }

  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })

  if (error) {
    console.error(`  ❌ Failed to create user ${email}: ${error.message}`)
    return null
  }

  console.log(`  ✅ Created auth user: ${email}`)
  await new Promise(resolve => setTimeout(resolve, 1000))
  return newUser.user.id
}

async function ensureProfile(
  userId: string,
  role: 'patient' | 'therapist',
  fullName: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (profile) return true

  console.log(`  📝 Creating ${role} profile for ${userId.substring(0, 8)}…`)
  const { error } = await supabase
    .from('profiles')
    .insert({ id: userId, role, full_name: fullName })

  if (error) {
    console.error(`  ❌ Failed to create profile: ${error.message}`)
    return false
  }
  return true
}

async function ensureTherapistLink(patientId: string, therapistId: string) {
  const { data: existing } = await supabase
    .from('patient_therapist')
    .select('patient_id')
    .eq('patient_id', patientId)
    .eq('therapist_id', therapistId)
    .maybeSingle()

  if (existing) {
    console.log('  ✅ Therapist ↔ patient link already exists')
    return
  }

  const { error } = await supabase
    .from('patient_therapist')
    .insert({ patient_id: patientId, therapist_id: therapistId })

  if (error) {
    console.error(`  ❌ Failed to link therapist → patient: ${error.message}`)
  } else {
    console.log('  ✅ Linked therapist → patient')
  }
}

// ============================================
// DATA CLEAR / SEED
// ============================================

async function clearExistingData(patientId: string) {
  console.log('🧹 Clearing existing demo data…')

  await supabase.from('crisis_alerts').delete().eq('patient_id', patientId)
  await supabase.from('chat_messages').delete().eq('patient_id', patientId)

  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('patient_id', patientId)

  if (entries && entries.length > 0) {
    const entryIds = entries.map(e => e.id)
    await supabase.from('entry_embeddings').delete().in('entry_id', entryIds)
    await supabase.from('ai_extractions').delete().in('entry_id', entryIds)
    await supabase.from('structured_logs').delete().in('entry_id', entryIds)
  }

  await supabase.from('journal_entries').delete().eq('patient_id', patientId)
  await supabase.from('patient_baselines').delete().eq('patient_id', patientId)

  // Also reset population stats so they rebuild from the demo data
  await supabase.from('population_stats').delete().in('metric_name', ['mood', 'anxiety'])

  console.log('✅ Cleared existing demo data')
}

async function seedJournalEntries(patientId: string) {
  console.log('📝 Creating journal entries…')

  const createdEntries: { id: string; data: EntryData; createdAt: Date }[] = []

  for (const entry of JOURNAL_ENTRIES) {
    const createdAt = new Date()
    createdAt.setDate(createdAt.getDate() - entry.daysAgo)
    createdAt.setHours(Math.floor(Math.random() * 12) + 8)

    const { data, error } = await supabase
      .from('journal_entries')
      .insert({
        patient_id: patientId,
        content: entry.content,
        is_draft: false,
        shared_with_therapist: true,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error(`❌ Failed to create entry: ${error.message}`)
      continue
    }

    createdEntries.push({ id: data.id, data: entry, createdAt })
    process.stdout.write('.')
  }

  console.log(`\n✅ Created ${createdEntries.length} journal entries`)
  return createdEntries
}

async function seedStructuredLogs(entries: { id: string; data: EntryData }[]) {
  console.log('📊 Creating structured logs…')

  for (const entry of entries) {
    const { error } = await supabase
      .from('structured_logs')
      .insert({
        entry_id: entry.id,
        sleep_hours: entry.data.structured.sleep_hours,
        sleep_quality: entry.data.structured.sleep_quality,
        medication_taken: entry.data.structured.medication_taken,
        medication_notes: entry.data.structured.medication_notes || null,
        energy_level: entry.data.structured.energy_level,
      })

    if (error) {
      console.error(`❌ Failed to create structured log: ${error.message}`)
      continue
    }

    process.stdout.write('.')
  }

  console.log(`\n✅ Created ${entries.length} structured logs`)
}

/**
 * Run the real AI extraction pipeline for each entry.
 * Entries are processed in chronological order (oldest first) so that
 * patient baselines build up naturally.
 */
async function seedAIExtractions(
  patientId: string,
  entries: { id: string; data: EntryData; createdAt: Date }[],
) {
  console.log('🤖 Running AI extraction pipeline (calling OpenAI for each entry)…')
  console.log(`   This will make ${entries.length} API calls — may take 1-2 minutes.\n`)

  // Process oldest-first so baselines build correctly
  const chronological = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  // In-memory baseline accumulators (mirrors what the route does via DB)
  let moodBase: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
  let anxBase: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
  let moodPop: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
  let anxPop: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }

  let crisisCount = 0
  let extractionCount = 0

  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i]
    const entryLabel = `[${i + 1}/${chronological.length}] day -${entry.data.daysAgo}`

    process.stdout.write(`   ${entryLabel}: calling OpenAI… `)

    const extraction = await runExtraction(entry.data.content)

    if (!extraction) {
      console.log('SKIPPED (parse error)')
      continue
    }

    const moodRaw = extraction.mood_score
    const calmnessRaw = anxietyToCalmness(extraction.anxiety_score)
    const now = entry.createdAt

    // --- Compute z-scores from accumulated baselines ---
    let mood_z_score: number | null = null
    let anxiety_z_score: number | null = null
    let mood_pop_z: number | null = null
    let anxiety_pop_z: number | null = null

    if (moodBase.count >= 5) {
      const z = calculateZScore(moodRaw, moodBase)
      mood_z_score = Number.isFinite(z) ? z : null
    }
    if (anxBase.count >= 5) {
      const z = calculateZScore(calmnessRaw, anxBase)
      anxiety_z_score = Number.isFinite(z) ? z : null
    }
    if (moodPop.count >= 5) {
      const z = calculateZScore(moodRaw, moodPop)
      mood_pop_z = Number.isFinite(z) ? z : null
    }
    if (anxPop.count >= 5) {
      const z = calculateZScore(calmnessRaw, anxPop)
      anxiety_pop_z = Number.isFinite(z) ? z : null
    }

    // Update accumulators for next entry
    if (moodBase.count === 0) {
      moodBase = { mean: moodRaw, std: 0, count: 1, lastUpdatedAt: now.toISOString() }
    } else {
      moodBase = updateEwmaStats(moodBase, moodRaw, { now, halfLifeDays: 45 })
    }
    if (anxBase.count === 0) {
      anxBase = { mean: calmnessRaw, std: 0, count: 1, lastUpdatedAt: now.toISOString() }
    } else {
      anxBase = updateEwmaStats(anxBase, calmnessRaw, { now, halfLifeDays: 45 })
    }
    if (moodPop.count === 0) {
      moodPop = { mean: moodRaw, std: 0, count: 1, lastUpdatedAt: now.toISOString() }
    } else {
      moodPop = updateEwmaStats(moodPop, moodRaw, { now, halfLifeDays: 45 })
    }
    if (anxPop.count === 0) {
      anxPop = { mean: calmnessRaw, std: 0, count: 1, lastUpdatedAt: now.toISOString() }
    } else {
      anxPop = updateEwmaStats(anxPop, calmnessRaw, { now, halfLifeDays: 45 })
    }

    // --- Insert extraction ---
    const { error: insertError } = await supabase
      .from('ai_extractions')
      .insert({
        entry_id: entry.id,
        mood_score: extraction.mood_score,
        anxiety_score: extraction.anxiety_score,
        phq9_indicators: extraction.phq9_indicators,
        gad7_indicators: extraction.gad7_indicators,
        phq9_estimate: extraction.phq9_estimate,
        gad7_estimate: extraction.gad7_estimate,
        mood_z_score,
        anxiety_z_score,
        mood_pop_z,
        anxiety_pop_z,
        emotions: extraction.emotions,
        symptoms: extraction.symptoms,
        triggers: extraction.triggers,
        confidence: extraction.confidence,
        crisis_detected: extraction.crisis_detected,
        summary: extraction.summary,
      })

    if (insertError) {
      console.log(`FAILED (${insertError.message})`)
      continue
    }

    extractionCount++

    // --- Crisis alert ---
    if (extraction.crisis_detected) {
      const { error: alertError } = await supabase
        .from('crisis_alerts')
        .insert({
          patient_id: patientId,
          entry_id: entry.id,
          severity: extraction.crisis_severity || 'medium',
          therapist_notified: false,
          resolved: false,
          created_at: now.toISOString(),
        })

      if (!alertError) crisisCount++
      console.log(`mood=${extraction.mood_score} anx=${extraction.anxiety_score} PHQ9=${extraction.phq9_estimate} GAD7=${extraction.gad7_estimate} 🚨 CRISIS`)
    } else {
      console.log(`mood=${extraction.mood_score} anx=${extraction.anxiety_score} PHQ9=${extraction.phq9_estimate} GAD7=${extraction.gad7_estimate}`)
    }
  }

  // --- Persist final baselines to DB ---
  const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('patient_baselines')
    .upsert([
      {
        patient_id: patientId,
        metric_name: 'mood',
        baseline_mean: moodBase.mean,
        baseline_std: moodBase.std,
        sample_count: moodBase.count,
        window_start: windowStart,
        last_updated: moodBase.lastUpdatedAt,
      },
      {
        patient_id: patientId,
        metric_name: 'anxiety',
        baseline_mean: anxBase.mean,
        baseline_std: anxBase.std,
        sample_count: anxBase.count,
        window_start: windowStart,
        last_updated: anxBase.lastUpdatedAt,
      },
    ], { onConflict: 'patient_id,metric_name' })

  await supabase
    .from('population_stats')
    .upsert([
      {
        metric_name: 'mood',
        population_mean: moodPop.mean,
        population_std: moodPop.std,
        sample_count: moodPop.count,
        last_updated: moodPop.lastUpdatedAt,
      },
      {
        metric_name: 'anxiety',
        population_mean: anxPop.mean,
        population_std: anxPop.std,
        sample_count: anxPop.count,
        last_updated: anxPop.lastUpdatedAt,
      },
    ], { onConflict: 'metric_name' })

  console.log(`\n✅ Completed ${extractionCount} AI extractions`)
  console.log(`   🚨 ${crisisCount} crisis alerts generated from AI results`)

  return { extractionCount, crisisCount }
}

async function seedChatMessages(patientId: string) {
  console.log('💬 Creating sample chat messages…')

  const chatMessages = [
    { role: 'user', content: "I've been feeling really anxious about work lately", daysAgo: 5 },
    { role: 'assistant', content: "I hear that work has been causing you significant anxiety. That sounds really challenging. Can you tell me more about what specifically at work is triggering these feelings?", daysAgo: 5 },
    { role: 'user', content: "It's mostly the meetings. I freeze up and can't think straight", daysAgo: 5 },
    { role: 'assistant', content: "Meeting anxiety is very common, and it's brave of you to acknowledge how it affects you. Your journal entries show you've had some success recently - like when you spoke up about needing more time on a project. What was different about that situation?", daysAgo: 5 },
    { role: 'user', content: "I guess I prepared what I was going to say beforehand. Maybe that helped?", daysAgo: 5 },
    { role: 'assistant', content: "That's a wonderful observation! Preparation can be a powerful tool for managing anxiety. Would you like to explore some strategies for preparing before meetings that might help reduce that freezing sensation?", daysAgo: 5 },
  ]

  for (const msg of chatMessages) {
    const createdAt = new Date()
    createdAt.setDate(createdAt.getDate() - msg.daysAgo)

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        patient_id: patientId,
        role: msg.role,
        content: msg.content,
        created_at: createdAt.toISOString(),
      })

    if (error) {
      console.error(`❌ Failed to create chat message: ${error.message}`)
    } else {
      process.stdout.write('.')
    }
  }

  console.log(`\n✅ Created ${chatMessages.length} chat messages`)
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('🌱 AI Therapy Journal — Demo Data Seeder')
  console.log('==========================================\n')

  // ---- 1. Demo Patient ----
  console.log('👤 Setting up demo PATIENT…')
  const patientId = await getOrCreateUser(
    DEMO_PATIENT_EMAIL,
    DEMO_PATIENT_PASSWORD,
    DEMO_PATIENT_NAME,
    'patient',
  )
  if (!patientId) {
    console.error('\n❌ Could not create demo patient. Aborting.')
    process.exit(1)
  }
  await ensureProfile(patientId, 'patient', DEMO_PATIENT_NAME)

  // ---- 2. Demo Therapist ----
  console.log('\n🩺 Setting up demo THERAPIST…')
  const therapistId = await getOrCreateUser(
    DEMO_THERAPIST_EMAIL,
    DEMO_THERAPIST_PASSWORD,
    DEMO_THERAPIST_NAME,
    'therapist',
  )
  if (!therapistId) {
    console.error('\n❌ Could not create demo therapist. Aborting.')
    process.exit(1)
  }
  await ensureProfile(therapistId, 'therapist', DEMO_THERAPIST_NAME)

  // ---- 3. Link therapist → patient ----
  console.log('\n🔗 Linking therapist → patient…')
  await ensureTherapistLink(patientId, therapistId)

  // ---- 4. Clear & reseed demo patient data ----
  console.log('')
  await clearExistingData(patientId)

  const entries = await seedJournalEntries(patientId)
  await seedStructuredLogs(entries)
  const { extractionCount, crisisCount } = await seedAIExtractions(patientId, entries)
  await seedChatMessages(patientId)

  // ---- 5. Summary ----
  console.log('\n==========================================')
  console.log('✅ Demo data seeded successfully!')
  console.log(`   📝 ${entries.length} journal entries`)
  console.log(`   📊 ${entries.length} structured logs`)
  console.log(`   🤖 ${extractionCount} AI extractions (real OpenAI pipeline)`)
  console.log(`   🚨 ${crisisCount} crisis alerts (AI-detected)`)
  console.log(`   💬 6 chat messages`)

  console.log('\n🔑 Demo credentials:')
  console.log(`   Patient   — ${DEMO_PATIENT_EMAIL} / ${DEMO_PATIENT_PASSWORD}`)
  console.log(`              → http://localhost:3000/login  (redirects to /dashboard)`)
  console.log(`   Therapist — ${DEMO_THERAPIST_EMAIL} / ${DEMO_THERAPIST_PASSWORD}`)
  console.log(`              → http://localhost:3000/login  (redirects to /therapist/dashboard)`)

  console.log('\n💡 To refresh for another demo, just run:  npm run seed:demo\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
