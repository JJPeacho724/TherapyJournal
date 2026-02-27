/**
 * Public Dataset Ingestion Script
 *
 * Loads a public mental health dataset (Kaggle or GoEmotions), maps it to
 * the pipeline's expected format, runs each entry through the real GPT-4
 * extraction + embedding pipeline, and ingests into Supabase + Neo4j.
 *
 * Usage:
 *   npx tsx scripts/ingest-public-data.ts --dataset kaggle --file data/mental_health.csv
 *   npx tsx scripts/ingest-public-data.ts --dataset goemotions --file data/goemotions.tsv --limit 500
 *   npx tsx scripts/ingest-public-data.ts --dataset kaggle --file data/mental_health.csv --dry-run
 *   npx tsx scripts/ingest-public-data.ts --dataset kaggle --file data/mental_health.csv --skip-extraction
 *
 * Flags:
 *   --dataset    kaggle | goemotions               (required)
 *   --file       path to the downloaded CSV/TSV     (required)
 *   --limit      max entries to ingest              (default 200)
 *   --concurrency  parallel API calls               (default 5)
 *   --dry-run    preview mappings without API calls
 *   --skip-extraction  skip GPT-4 extraction (only embed + ingest skeleton)
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 *   NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD  (optional; skips Neo4j if missing)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

import { kaggleMentalHealthAdapter } from './adapters/kaggle-mental-health'
import { goEmotionsAdapter } from './adapters/goemotions'
import { generateStructuredLog } from './adapters/synthetic-structured'
import type { DatasetAdapter, NormalizedEntry } from './adapters/types'

// Load env
dotenv.config({ path: '.env.local' })
dotenv.config()

// ============================================================
// ENV VALIDATION
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`❌ Missing ${name}. Check your .env.local file.`)
    process.exit(1)
  }
  return value
}

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

interface CLIArgs {
  dataset: 'kaggle' | 'goemotions'
  file: string
  limit: number
  concurrency: number
  dryRun: boolean
  skipExtraction: boolean
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') {
      flags['dry-run'] = 'true'
    } else if (arg === '--skip-extraction') {
      flags['skip-extraction'] = 'true'
    } else if (arg.startsWith('--') && i + 1 < args.length) {
      flags[arg.slice(2)] = args[++i]
    }
  }

  const dataset = flags['dataset'] as 'kaggle' | 'goemotions' | undefined
  const file = flags['file']

  if (!dataset || !['kaggle', 'goemotions'].includes(dataset)) {
    console.error('❌ --dataset is required. Use: kaggle | goemotions')
    process.exit(1)
  }
  if (!file) {
    console.error('❌ --file is required. Point it at your downloaded CSV/TSV.')
    process.exit(1)
  }

  return {
    dataset,
    file,
    limit: parseInt(flags['limit'] ?? '200', 10),
    concurrency: parseInt(flags['concurrency'] ?? '5', 10),
    dryRun: flags['dry-run'] === 'true',
    skipExtraction: flags['skip-extraction'] === 'true',
  }
}

// ============================================================
// RATE-LIMITED CONCURRENCY POOL
// ============================================================

/**
 * Simple concurrency limiter.
 * Runs up to `concurrency` promises at a time. Returns results in order.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ============================================================
// AI EXTRACTION PIPELINE  (mirrors seed-test-data.ts / /api/ai/extract)
// ============================================================

const AI_MODEL = 'gpt-4-turbo-preview'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EXTRACTION_TEMPERATURE = 0.3
const EXTRACTION_MAX_TOKENS = 1000

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

async function runExtraction(openai: OpenAI, content: string): Promise<ExtractionResult | null> {
  const promptTemplate = await loadPromptTemplate()

  let response: OpenAI.Chat.Completions.ChatCompletion
  try {
    response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: promptTemplate },
        { role: 'user', content },
      ],
      max_tokens: EXTRACTION_MAX_TOKENS,
      temperature: EXTRACTION_TEMPERATURE,
    })
  } catch (err: any) {
    if (err?.status === 429) {
      // Rate limited — wait and retry once
      console.warn('\n    ⏳ Rate limited — waiting 30s…')
      await sleep(30_000)
      response = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: promptTemplate },
          { role: 'user', content },
        ],
        max_tokens: EXTRACTION_MAX_TOKENS,
        temperature: EXTRACTION_TEMPERATURE,
      })
    } else {
      throw err
    }
  }

  const raw = response.choices[0]?.message?.content ?? ''
  let parsed: any
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }

  const clampItem = (x: unknown) => {
    const n = typeof x === 'number' ? x : Number(x)
    if (!Number.isFinite(n)) return 0
    return Math.min(3, Math.max(0, Math.round(n)))
  }

  const phq9 = parsed.phq9_indicators ?? {}
  const gad7 = parsed.gad7_indicators ?? {}

  const phq9_estimate =
    clampItem(phq9.anhedonia) + clampItem(phq9.depressed_mood) + clampItem(phq9.sleep_issues) +
    clampItem(phq9.fatigue) + clampItem(phq9.appetite_changes) + clampItem(phq9.worthlessness) +
    clampItem(phq9.concentration) + clampItem(phq9.psychomotor) + clampItem(phq9.self_harm_thoughts)

  const gad7_estimate =
    clampItem(gad7.nervous) + clampItem(gad7.uncontrollable_worry) + clampItem(gad7.excessive_worry) +
    clampItem(gad7.trouble_relaxing) + clampItem(gad7.restless) + clampItem(gad7.irritable) +
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

async function createEmbedding(openai: OpenAI, text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    })
    return response.data[0].embedding
  } catch (err: any) {
    if (err?.status === 429) {
      console.warn('\n    ⏳ Embedding rate limit — waiting 10s…')
      await sleep(10_000)
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      })
      return response.data[0].embedding
    }
    throw err
  }
}

// ============================================================
// NORMALIZATION HELPERS  (mirror lib/normalization.ts)
// ============================================================

const LN2 = Math.log(2)

type EwmaStats = { mean: number; std: number; count: number; lastUpdatedAt: string | null }

function calculateZScore(rawScore: number, baseline: { mean: number; std: number; count: number }): number {
  if (!Number.isFinite(rawScore)) return 0
  if (!baseline || baseline.count < 2) return 0
  if (!Number.isFinite(baseline.std) || baseline.std <= 0) return 0
  return (rawScore - baseline.mean) / baseline.std
}

function updateEwmaStats(
  current: EwmaStats,
  newValue: number,
  opts: { now?: Date; halfLifeDays?: number } = {},
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

  return { mean, std, count: prevCount + 1, lastUpdatedAt: now.toISOString() }
}

function anxietyToCalmness(anxietyScore: number): number {
  return 11 - anxietyScore
}

// ============================================================
// NEO4J INGEST (optional — graceful skip if env vars missing)
// ============================================================

let _neo4jAvailable: boolean | null = null
let _neo4jDriver: any = null

async function getNeo4jDriverLazy() {
  if (_neo4jAvailable === false) return null
  if (_neo4jDriver) return _neo4jDriver

  const uri = process.env.NEO4J_URI
  const user = process.env.NEO4J_USER
  const password = process.env.NEO4J_PASSWORD

  if (!uri || !user || !password) {
    console.log('⚠️  Neo4j env vars not set — skipping graph ingestion.')
    _neo4jAvailable = false
    return null
  }

  try {
    const neo4j = await import('neo4j-driver')
    _neo4jDriver = neo4j.default.driver(uri, neo4j.default.auth.basic(user, password))
    await _neo4jDriver.verifyConnectivity()
    _neo4jAvailable = true
    console.log('✅ Connected to Neo4j')
    return _neo4jDriver
  } catch (err) {
    console.warn('⚠️  Could not connect to Neo4j — skipping graph ingestion.', err)
    _neo4jAvailable = false
    return null
  }
}

function getNeo4jDatabase(): string | undefined {
  return process.env.NEO4J_DATABASE || undefined
}

async function neo4jIngestEntry(params: {
  userId: string
  entryId: string
  timestamp: string
  text: string
  embedding: number[]
}) {
  const driver = await getNeo4jDriverLazy()
  if (!driver) return
  const session = driver.session(getNeo4jDatabase() ? { database: getNeo4jDatabase() } : undefined)
  try {
    await session.run(
      `
      MERGE (u:User {userId: $userId})
      ON CREATE SET u.createdAt = datetime()
      MERGE (e:Entry {entryId: $entryId})
      SET
        e.timestamp = datetime($timestamp),
        e.text = $text,
        e.source = 'import',
        e.embedding = $embedding,
        e.ingestedAt = datetime()
      MERGE (u)-[:WROTE]->(e)
      RETURN e.entryId AS entryId
      `,
      params,
    )
  } finally {
    await session.close()
  }
}

async function neo4jIngestSelfReport(params: {
  entryId: string
  timestamp: string
  mood: number
}) {
  const driver = await getNeo4jDriverLazy()
  if (!driver) return
  const reportId = `sr:${params.entryId}`
  const session = driver.session(getNeo4jDatabase() ? { database: getNeo4jDatabase() } : undefined)
  try {
    await session.run(
      `
      MATCH (e:Entry {entryId: $entryId})
      MERGE (sr:SelfReport {reportId: $reportId})
      SET sr.timestamp = datetime($timestamp), sr.mood = $mood
      MERGE (e)-[:HAS_SELF_REPORT]->(sr)
      RETURN sr.reportId AS reportId
      `,
      { ...params, reportId },
    )
  } finally {
    await session.close()
  }
}

async function neo4jIngestContext(params: {
  entryId: string
  timestamp: string
  sleep_hours: number
  sleep_quality: number
  energy_level: number
  medication_taken: boolean
}) {
  const driver = await getNeo4jDriverLazy()
  if (!driver) return
  const contextId = `ctx:${params.entryId}`
  const session = driver.session(getNeo4jDatabase() ? { database: getNeo4jDatabase() } : undefined)
  try {
    await session.run(
      `
      MATCH (e:Entry {entryId: $entryId})
      MERGE (c:ContextPoint {contextId: $contextId})
      SET
        c.timestamp = datetime($timestamp),
        c.sleep_hours = $sleep_hours,
        c.sleep_quality = $sleep_quality,
        c.energy_level = $energy_level,
        c.medication_taken = $medication_taken
      MERGE (e)-[:HAS_CONTEXT]->(c)
      RETURN c.contextId AS contextId
      `,
      { ...params, contextId },
    )
  } finally {
    await session.close()
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function neo4jIngestExtraction(params: {
  entryId: string
  timestamp: string
  mood_score: number | null
  anxiety_score: number | null
  phq9_estimate: number | null
  gad7_estimate: number | null
  mood_z_score: number | null
  anxiety_z_score: number | null
  mood_pop_z: number | null
  anxiety_pop_z: number | null
  emotions: string[]
  symptoms: string[]
  triggers: string[]
  confidence: number | null
}) {
  const driver = await getNeo4jDriverLazy()
  if (!driver) return

  const affectModelVersion = 'public_ingest_v1'
  const affectId = `aff:${params.entryId}:${affectModelVersion}`

  const moodScore = params.mood_score ?? null
  const anxietyScore = params.anxiety_score ?? null
  const valence = typeof moodScore === 'number' ? Math.min(1, Math.max(0, (moodScore - 1) / 9)) : null
  const arousal = typeof anxietyScore === 'number' ? Math.min(1, Math.max(0, (anxietyScore - 1) / 9)) : null

  const emotions = (params.emotions ?? []).filter(Boolean).map(normalizeName)
  const symptoms = (params.symptoms ?? []).filter(Boolean).map(normalizeName)
  const triggers = (params.triggers ?? []).filter(Boolean).map(normalizeName)

  const session = driver.session(getNeo4jDatabase() ? { database: getNeo4jDatabase() } : undefined)
  try {
    await session.run(
      `
      MATCH (e:Entry {entryId: $entryId})
      MERGE (a:AffectPoint {affectId: $affectId})
      SET
        a.timestamp = datetime($timestamp),
        a.valence = $valence,
        a.arousal = $arousal,
        a.phq9_estimate = $phq9_estimate,
        a.gad7_estimate = $gad7_estimate,
        a.mood_z_score = $mood_z_score,
        a.anxiety_z_score = $anxiety_z_score,
        a.mood_pop_z = $mood_pop_z,
        a.anxiety_pop_z = $anxiety_pop_z,
        a.modelVersion = $affectModelVersion,
        a.computedAt = datetime()
      MERGE (e)-[:HAS_AFFECT]->(a)

      WITH e

      FOREACH (name IN $emotions |
        MERGE (f:Feature {featureId: 'Theme:' + name})
        ON CREATE SET f.type = 'Theme', f.name = name
        MERGE (e)-[m:MENTIONS]->(f)
        SET m.confidence = $confidence, m.extractorVersion = $affectModelVersion, m.timestamp = datetime($timestamp)
      )
      FOREACH (name IN $symptoms |
        MERGE (f:Feature {featureId: 'Symptom:' + name})
        ON CREATE SET f.type = 'Symptom', f.name = name
        MERGE (e)-[m:MENTIONS]->(f)
        SET m.confidence = $confidence, m.extractorVersion = $affectModelVersion, m.timestamp = datetime($timestamp)
      )
      FOREACH (name IN $triggers |
        MERGE (f:Feature {featureId: 'Stressor:' + name})
        ON CREATE SET f.type = 'Stressor', f.name = name
        MERGE (e)-[m:MENTIONS]->(f)
        SET m.confidence = $confidence, m.extractorVersion = $affectModelVersion, m.timestamp = datetime($timestamp)
      )
      RETURN e.entryId AS entryId
      `,
      {
        entryId: params.entryId,
        timestamp: params.timestamp,
        affectId,
        affectModelVersion,
        valence,
        arousal,
        phq9_estimate: params.phq9_estimate ?? null,
        gad7_estimate: params.gad7_estimate ?? null,
        mood_z_score: params.mood_z_score ?? null,
        anxiety_z_score: params.anxiety_z_score ?? null,
        mood_pop_z: params.mood_pop_z ?? null,
        anxiety_pop_z: params.anxiety_pop_z ?? null,
        confidence: params.confidence ?? null,
        emotions,
        symptoms,
        triggers,
      },
    )
  } finally {
    await session.close()
  }
}

// ============================================================
// HELPERS
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function deterministicEntryId(syntheticUserId: string, index: number): string {
  const hash = crypto.createHash('sha256').update(`${syntheticUserId}:${index}`).digest('hex')
  // UUID-like format so it fits where UUIDs are expected
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-')
}

// ============================================================
// SUPABASE HELPERS
// ============================================================

async function getOrCreateSyntheticUser(
  supabase: SupabaseClient,
  syntheticUserId: string,
): Promise<string | null> {
  const email = `${syntheticUserId}@public-dataset.local`
  const password = 'PublicDataset_Synthetic_2026!'

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existing = existingUsers?.users?.find((u) => u.email === email)
  if (existing) return existing.id

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: syntheticUserId, role: 'patient' },
  })

  if (error) {
    console.error(`  ❌ Failed to create user ${email}: ${error.message}`)
    return null
  }

  // Create profile
  await supabase.from('profiles').insert({
    id: data.user.id,
    role: 'patient',
    full_name: `Synthetic: ${syntheticUserId}`,
  })

  return data.user.id
}

// ============================================================
// MAIN INGESTION LOOP
// ============================================================

async function main() {
  const args = parseArgs()

  console.log('🔬 Public Dataset Ingestion Pipeline')
  console.log('====================================')
  console.log(`  Dataset:     ${args.dataset}`)
  console.log(`  File:        ${args.file}`)
  console.log(`  Limit:       ${args.limit}`)
  console.log(`  Concurrency: ${args.concurrency}`)
  console.log(`  Dry run:     ${args.dryRun}`)
  console.log(`  Skip extraction: ${args.skipExtraction}`)
  console.log('')

  // Resolve file path
  const filePath = path.resolve(args.file)
  try {
    await fs.access(filePath)
  } catch {
    console.error(`❌ File not found: ${filePath}`)
    console.error('   Download the dataset and place it in the data/ directory.')
    process.exit(1)
  }

  // Select adapter
  const adapters: Record<string, DatasetAdapter> = {
    kaggle: kaggleMentalHealthAdapter,
    goemotions: goEmotionsAdapter,
  }
  const adapter = adapters[args.dataset]
  if (!adapter) {
    console.error(`❌ Unknown dataset: ${args.dataset}`)
    process.exit(1)
  }

  console.log(`📂 Loading from: ${adapter.name}`)

  // ---- Collect entries up to limit ----
  const entries: (NormalizedEntry & { index: number })[] = []
  let totalSeen = 0
  for await (const entry of adapter.load(filePath)) {
    totalSeen++
    if (entries.length >= args.limit) continue // keep counting total
    entries.push({ ...entry, index: entries.length })
  }

  console.log(`   Scanned ${totalSeen} rows, selected ${entries.length} (limit ${args.limit})`)

  // ---- Dry run: show summary and exit ----
  if (args.dryRun) {
    console.log('\n📊 Dry-run summary:')

    const userCounts = new Map<string, number>()
    const catCounts = new Map<string, number>()
    let moodSum = 0

    for (const e of entries) {
      userCounts.set(e.syntheticUserId, (userCounts.get(e.syntheticUserId) ?? 0) + 1)
      catCounts.set(e.diagnosticCategory, (catCounts.get(e.diagnosticCategory) ?? 0) + 1)
      moodSum += e.moodProxy
    }

    console.log(`\n  Synthetic users (${userCounts.size}):`)
    for (const [u, n] of Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`    ${u}: ${n} entries`)
    }

    console.log(`\n  Categories:`)
    for (const [c, n] of Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`    ${c}: ${n}`)
    }

    console.log(`\n  Average mood proxy: ${(moodSum / entries.length).toFixed(2)}`)
    console.log(`\n  Sample entry text (first 200 chars):`)
    console.log(`    "${entries[0]?.text.slice(0, 200)}…"`)

    console.log('\n  Estimated API cost:')
    console.log(`    GPT-4 extractions: ~$${(entries.length * 0.02).toFixed(2)}`)
    console.log(`    Embeddings:        ~$${(entries.length * 0.0001).toFixed(4)}`)
    console.log(`    Total:             ~$${(entries.length * 0.0201).toFixed(2)}`)

    console.log('\n✅ Dry run complete. Remove --dry-run to ingest.\n')
    return
  }

  // ---- Initialize clients ----
  const supabaseUrlVal = requireEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl)
  const supabaseKeyVal = requireEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceKey)
  const openaiKeyVal = requireEnv('OPENAI_API_KEY', openaiApiKey)

  const supabase = createClient(supabaseUrlVal, supabaseKeyVal, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const openai = new OpenAI({ apiKey: openaiKeyVal })

  // Pre-initialize Neo4j (optional)
  await getNeo4jDriverLazy()

  // ---- Resolve synthetic user IDs to Supabase auth UUIDs ----
  console.log('\n👤 Creating synthetic users…')

  const uniqueUsers = Array.from(new Set(entries.map((e) => e.syntheticUserId)))
  const userIdMap = new Map<string, string>() // syntheticUserId → supabase uuid

  for (const synUser of uniqueUsers) {
    const uuid = await getOrCreateSyntheticUser(supabase, synUser)
    if (uuid) {
      userIdMap.set(synUser, uuid)
      console.log(`  ✅ ${synUser} → ${uuid.substring(0, 8)}…`)
    }
  }

  console.log(`  Created/found ${userIdMap.size} users`)

  // ---- Per-user EWMA accumulators ----
  const moodBases = new Map<string, EwmaStats>()
  const anxBases = new Map<string, EwmaStats>()
  // Global population accumulators
  let moodPop: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
  let anxPop: EwmaStats = { mean: 0, std: 0, count: 0, lastUpdatedAt: null }

  // ---- Process entries ----
  console.log(`\n🤖 Processing ${entries.length} entries (concurrency=${args.concurrency})…\n`)

  let successCount = 0
  let failCount = 0
  let crisisCount = 0
  const startTime = Date.now()

  // Process in sequential batches to respect ordering for baselines,
  // but within each batch we parallelize the expensive API calls.
  const batchSize = args.concurrency
  for (let batchStart = 0; batchStart < entries.length; batchStart += batchSize) {
    const batch = entries.slice(batchStart, batchStart + batchSize)

    // Pre-compute timestamps: spread entries across last 90 days
    const batchWithMeta = batch.map((entry) => {
      const userId = userIdMap.get(entry.syntheticUserId)
      if (!userId) return null

      const daysAgo = Math.floor(90 * (1 - entry.index / entries.length))
      const timestamp = new Date()
      timestamp.setDate(timestamp.getDate() - daysAgo)
      timestamp.setHours(8 + Math.floor(Math.random() * 12))
      timestamp.setMinutes(Math.floor(Math.random() * 60))

      const entryId = deterministicEntryId(entry.syntheticUserId, entry.index)
      const structured = generateStructuredLog(entry.moodProxy, entry.diagnosticCategory)

      return { ...entry, userId, entryId, timestamp, structured }
    }).filter(Boolean) as Array<{
      text: string
      moodProxy: number
      diagnosticCategory: string
      syntheticUserId: string
      index: number
      userId: string
      entryId: string
      timestamp: Date
      structured: ReturnType<typeof generateStructuredLog>
    }>

    // Parallel: extraction + embedding
    await mapWithConcurrency(batchWithMeta, args.concurrency, async (item, _batchIdx) => {
      const globalIdx = batchStart + _batchIdx + 1
      const label = `[${globalIdx}/${entries.length}]`

      try {
        // 1) Embedding
        process.stdout.write(`  ${label} embedding… `)
        const embedding = await createEmbedding(openai, item.text)

        // 2) Extraction
        let extraction: ExtractionResult | null = null
        if (!args.skipExtraction) {
          process.stdout.write('extracting… ')
          extraction = await runExtraction(openai, item.text)
        }

        // 3) Insert journal entry into Supabase
        const { data: entryData, error: entryError } = await supabase
          .from('journal_entries')
          .insert({
            id: item.entryId,
            patient_id: item.userId,
            content: item.text,
            is_draft: false,
            shared_with_therapist: false,
            created_at: item.timestamp.toISOString(),
            updated_at: item.timestamp.toISOString(),
          })
          .select('id')
          .single()

        if (entryError) {
          // May already exist from a previous run
          if (entryError.code === '23505') {
            process.stdout.write('(exists) ')
          } else {
            console.log(`FAILED (entry: ${entryError.message})`)
            failCount++
            return
          }
        }

        // 4) Structured log
        await supabase.from('structured_logs').upsert({
          entry_id: item.entryId,
          sleep_hours: item.structured.sleep_hours,
          sleep_quality: item.structured.sleep_quality,
          medication_taken: item.structured.medication_taken,
          medication_notes: item.structured.medication_notes,
          energy_level: item.structured.energy_level,
        }, { onConflict: 'entry_id' })

        // 5) Embedding in Supabase
        await supabase.from('entry_embeddings').upsert({
          entry_id: item.entryId,
          embedding,
        }, { onConflict: 'entry_id' })

        // 6) AI extraction in Supabase (if we have it)
        let mood_z_score: number | null = null
        let anxiety_z_score: number | null = null
        let mood_pop_z: number | null = null
        let anxiety_pop_z: number | null = null

        if (extraction) {
          const moodRaw = extraction.mood_score
          const calmnessRaw = anxietyToCalmness(extraction.anxiety_score)
          const now = item.timestamp

          // Per-user baselines
          let moodBase = moodBases.get(item.userId) ?? { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
          let anxBase = anxBases.get(item.userId) ?? { mean: 0, std: 0, count: 0, lastUpdatedAt: null }

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

          // Update accumulators
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

          moodBases.set(item.userId, moodBase)
          anxBases.set(item.userId, anxBase)

          await supabase.from('ai_extractions').upsert({
            entry_id: item.entryId,
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
          }, { onConflict: 'entry_id' })

          if (extraction.crisis_detected) crisisCount++
        }

        // 7) Neo4j ingestion
        await neo4jIngestEntry({
          userId: item.userId,
          entryId: item.entryId,
          timestamp: item.timestamp.toISOString(),
          text: item.text,
          embedding,
        })

        // Self-report (simulated from mood proxy)
        await neo4jIngestSelfReport({
          entryId: item.entryId,
          timestamp: item.timestamp.toISOString(),
          mood: item.moodProxy,
        })

        // Context
        await neo4jIngestContext({
          entryId: item.entryId,
          timestamp: item.timestamp.toISOString(),
          sleep_hours: item.structured.sleep_hours,
          sleep_quality: item.structured.sleep_quality,
          energy_level: item.structured.energy_level,
          medication_taken: item.structured.medication_taken,
        })

        // Extraction features in Neo4j
        if (extraction) {
          await neo4jIngestExtraction({
            entryId: item.entryId,
            timestamp: item.timestamp.toISOString(),
            mood_score: extraction.mood_score,
            anxiety_score: extraction.anxiety_score,
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
          })
        }

        successCount++

        if (extraction) {
          const crisis = extraction.crisis_detected ? ' 🚨 CRISIS' : ''
          console.log(
            `mood=${extraction.mood_score} anx=${extraction.anxiety_score} ` +
            `PHQ9=${extraction.phq9_estimate} GAD7=${extraction.gad7_estimate}${crisis}`,
          )
        } else {
          console.log('done (skip-extraction)')
        }
      } catch (err: any) {
        console.log(`ERROR: ${err.message ?? err}`)
        failCount++
      }
    })

    // Small delay between batches to be kind to APIs
    if (batchStart + batchSize < entries.length) {
      await sleep(500)
    }
  }

  // ---- Persist population stats ----
  if (!args.skipExtraction && moodPop.count > 0) {
    await supabase.from('population_stats').upsert([
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
  }

  // Persist per-user baselines
  for (const [userId, moodBase] of Array.from(moodBases.entries())) {
    const anxBase = anxBases.get(userId) ?? { mean: 0, std: 0, count: 0, lastUpdatedAt: null }
    const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('patient_baselines').upsert([
      {
        patient_id: userId,
        metric_name: 'mood',
        baseline_mean: moodBase.mean,
        baseline_std: moodBase.std,
        sample_count: moodBase.count,
        window_start: windowStart,
        last_updated: moodBase.lastUpdatedAt,
      },
      {
        patient_id: userId,
        metric_name: 'anxiety',
        baseline_mean: anxBase.mean,
        baseline_std: anxBase.std,
        sample_count: anxBase.count,
        window_start: windowStart,
        last_updated: anxBase.lastUpdatedAt,
      },
    ], { onConflict: 'patient_id,metric_name' })
  }

  // ---- Close Neo4j ----
  if (_neo4jDriver) {
    await _neo4jDriver.close()
  }

  // ---- Summary ----
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n====================================')
  console.log('✅ Ingestion complete!')
  console.log(`   ⏱  ${elapsed}s elapsed`)
  console.log(`   ✅ ${successCount} entries ingested`)
  console.log(`   ❌ ${failCount} failures`)
  console.log(`   🚨 ${crisisCount} crisis detections`)
  console.log(`   👤 ${userIdMap.size} synthetic users`)
  console.log(`   📊 Neo4j: ${_neo4jAvailable ? 'ingested' : 'skipped'}`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Train calibration models:  POST /api/graph/train  for each user')
  console.log('  2. Evaluate:                  npm run neo4j:eval')
  console.log('')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
