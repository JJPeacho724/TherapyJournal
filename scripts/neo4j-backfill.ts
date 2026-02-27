/**
 * Neo4j Full Backfill Script
 *
 * Re-creates the full Neo4j graph from Supabase data for entries that
 * are missing in Neo4j (e.g. due to an Aura instance being paused).
 *
 * Pipeline per entry:
 *   1. User + Entry node  (from journal_entries + entry_embeddings)
 *   2. SelfReport node    (from structured_logs, if present)
 *   3. AffectPoint + Feature nodes (from ai_extractions, if present)
 *
 * Usage:
 *   npx tsx scripts/neo4j-backfill.ts            # backfill missing entries
 *   npx tsx scripts/neo4j-backfill.ts --force     # re-ingest ALL entries
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import neo4j, { Driver } from 'neo4j-driver'

dotenv.config({ path: '.env.local' })
dotenv.config()

const BATCH_SIZE = 50
const AFFECT_MODEL_VERSION = 'ai_extraction_mood_anxiety_v1'
const EXTRACTOR_VERSION = 'symptom_extraction_v1'

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── Types ───────────────────────────────────────────────────────

interface JournalRow {
  id: string
  patient_id: string | null
  synthetic_patient_id: string | null
  content: string
  created_at: string
}

interface EmbeddingRow {
  entry_id: string
  embedding: number[] | string
}

interface StructuredLogRow {
  entry_id: string
  sleep_hours: number | null
  sleep_quality: number | null
  medication_taken: boolean | null
  medication_notes: string | null
  energy_level: number | null
}

interface ExtractionRow {
  entry_id: string
  mood_score: number | null
  anxiety_score: number | null
  phq9_estimate: number | null
  gad7_estimate: number | null
  mood_z_score: number | null
  anxiety_z_score: number | null
  mood_pop_z: number | null
  anxiety_pop_z: number | null
  emotions: string[] | null
  symptoms: string[] | null
  triggers: string[] | null
  confidence: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  orderCol = 'created_at'
): Promise<T[]> {
  let all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 999)
      .order(orderCol, { ascending: true })
    if (error) {
      console.error(`Supabase query on ${table} failed:`, error)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    all = all.concat(data as T[])
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const forceAll = process.argv.includes('--force')

  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const neo4jUri = requiredEnv('NEO4J_URI')
  const neo4jUser = requiredEnv('NEO4J_USER')
  const neo4jPassword = requiredEnv('NEO4J_PASSWORD')
  const neo4jDatabase = process.env.NEO4J_DATABASE

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const driver: Driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword))
  const sessionOpts = neo4jDatabase ? { database: neo4jDatabase } : undefined

  try {
    const serverInfo = await driver.getServerInfo()
    console.log(`Connected to Neo4j ${serverInfo.protocolVersion} at ${neo4jUri}`)
  } catch (e) {
    console.error('Failed to connect to Neo4j:', e)
    process.exit(1)
  }

  // ── 1. Fetch data from Supabase ──

  console.log('\nFetching journal entries...')
  const entries = await fetchAll<JournalRow>(
    supabase,
    'journal_entries',
    'id, patient_id, synthetic_patient_id, content, created_at'
  )
  console.log(`  ${entries.length} journal entries`)

  console.log('Fetching embeddings...')
  const embeddingsRaw = await fetchAll<EmbeddingRow>(
    supabase,
    'entry_embeddings',
    'entry_id, embedding',
    'created_at'
  )
  const embeddingsByEntry = new Map<string, number[]>()
  for (const e of embeddingsRaw) {
    if (!embeddingsByEntry.has(e.entry_id)) {
      const vec = typeof e.embedding === 'string' ? JSON.parse(e.embedding) : e.embedding
      embeddingsByEntry.set(e.entry_id, vec)
    }
  }
  console.log(`  ${embeddingsByEntry.size} entries with embeddings`)

  console.log('Fetching structured logs...')
  const logs = await fetchAll<StructuredLogRow>(
    supabase,
    'structured_logs',
    'entry_id, sleep_hours, sleep_quality, medication_taken, medication_notes, energy_level',
    'created_at'
  )
  const logsByEntry = new Map<string, StructuredLogRow>()
  for (const l of logs) logsByEntry.set(l.entry_id, l)
  console.log(`  ${logs.length} structured logs`)

  console.log('Fetching AI extractions...')
  const extractions = await fetchAll<ExtractionRow>(
    supabase,
    'ai_extractions',
    'entry_id, mood_score, anxiety_score, phq9_estimate, gad7_estimate, mood_z_score, anxiety_z_score, mood_pop_z, anxiety_pop_z, emotions, symptoms, triggers, confidence',
    'created_at'
  )
  const extractionsByEntry = new Map<string, ExtractionRow>()
  for (const x of extractions) extractionsByEntry.set(x.entry_id, x)
  console.log(`  ${extractions.length} AI extractions`)

  // ── 2. Determine which entries need backfill ──

  let toProcess = entries

  if (!forceAll) {
    console.log('\nChecking Neo4j for existing Entry nodes...')
    const session = driver.session(sessionOpts)
    try {
      const entryIds = entries.map((e) => e.id)
      // Query in chunks to avoid huge param lists
      const existingSet = new Set<string>()
      for (let i = 0; i < entryIds.length; i += 500) {
        const chunk = entryIds.slice(i, i + 500)
        const result = await session.run(
          `UNWIND $ids AS eid MATCH (e:Entry {entryId: eid}) RETURN e.entryId AS entryId`,
          { ids: chunk }
        )
        for (const r of result.records) existingSet.add(r.get('entryId') as string)
      }
      toProcess = entries.filter((e) => !existingSet.has(e.id))
      console.log(`  ${existingSet.size} already in Neo4j, ${toProcess.length} need backfill.`)
    } finally {
      await session.close()
    }
  }

  if (toProcess.length === 0) {
    console.log('\nAll entries are already in Neo4j. Nothing to do.')
    await driver.close()
    return
  }

  // ── 3. Backfill ──

  const stats = { entries: 0, selfReports: 0, affects: 0, skippedEmbed: 0, failed: 0 }

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const total = Math.ceil(toProcess.length / BATCH_SIZE)
    console.log(`\nBatch ${batchNum}/${total}: entries ${i + 1}–${i + batch.length}`)

    for (const entry of batch) {
      const session = driver.session(sessionOpts)
      try {
        // 3a. User + Entry node
        const userId = entry.patient_id ?? entry.synthetic_patient_id
        if (!userId) {
          stats.failed++
          if (stats.failed <= 3) console.error(`\n  Skipped ${entry.id}: no patient_id or synthetic_patient_id`)
          continue
        }

        const embedding = embeddingsByEntry.get(entry.id) ?? []
        if (embedding.length === 0) stats.skippedEmbed++

        await session.run(
          `
          MERGE (u:User {userId: $userId})
          ON CREATE SET u.createdAt = datetime()
          MERGE (e:Entry {entryId: $entryId})
          SET
            e.timestamp = datetime($timestamp),
            e.text = $text,
            e.source = 'journal',
            e.embedding = $embedding,
            e.ingestedAt = datetime()
          MERGE (u)-[:WROTE]->(e)

          WITH u, e
          OPTIONAL MATCH (u)-[:WROTE]->(prev:Entry)
          WHERE prev.timestamp < e.timestamp AND prev.entryId <> e.entryId
          WITH u, e, prev ORDER BY prev.timestamp DESC LIMIT 1
          OPTIONAL MATCH (u)-[:WROTE]->(next:Entry)
          WHERE next.timestamp > e.timestamp AND next.entryId <> e.entryId
          WITH e, prev, next ORDER BY next.timestamp ASC LIMIT 1

          FOREACH (_ IN CASE WHEN prev IS NOT NULL AND next IS NOT NULL THEN [1] ELSE [] END |
            MERGE (prev)-[old:NEXT]->(next) DELETE old
          )
          FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
            MERGE (prev)-[:NEXT]->(e)
          )
          FOREACH (_ IN CASE WHEN next IS NOT NULL THEN [1] ELSE [] END |
            MERGE (e)-[:NEXT]->(next)
          )
          RETURN e.entryId AS entryId
          `,
          {
            userId,
            entryId: entry.id,
            timestamp: entry.created_at,
            text: entry.content,
            embedding,
          }
        )
        stats.entries++

        // 3b. SelfReport from structured log (mood approximated from extraction if available)
        const log = logsByEntry.get(entry.id)
        const ext = extractionsByEntry.get(entry.id)

        if (log || ext) {
          const mood = ext?.mood_score ?? 5
          await session.run(
            `
            MATCH (e:Entry {entryId: $entryId})
            MERGE (sr:SelfReport {reportId: $reportId})
            SET sr.timestamp = datetime($timestamp), sr.mood = $mood
            MERGE (e)-[:HAS_SELF_REPORT]->(sr)
            RETURN sr.reportId AS reportId
            `,
            {
              entryId: entry.id,
              reportId: `sr:${entry.id}`,
              timestamp: entry.created_at,
              mood: neo4j.int(mood),
            }
          )
          stats.selfReports++
        }

        if (log) {
          await session.run(
            `
            MATCH (e:Entry {entryId: $entryId})
            MERGE (c:ContextPoint {contextId: $contextId})
            SET
              c.timestamp = datetime($timestamp),
              c.sleep_hours = $sleep_hours,
              c.sleep_quality = $sleep_quality,
              c.medication_taken = $medication_taken,
              c.medication_notes = $medication_notes,
              c.energy_level = $energy_level
            MERGE (e)-[:HAS_CONTEXT]->(c)
            RETURN c.contextId AS contextId
            `,
            {
              entryId: entry.id,
              contextId: `ctx:${entry.id}`,
              timestamp: entry.created_at,
              sleep_hours: log.sleep_hours ?? null,
              sleep_quality: log.sleep_quality != null ? neo4j.int(log.sleep_quality) : null,
              medication_taken: log.medication_taken ?? null,
              medication_notes: log.medication_notes ?? null,
              energy_level: log.energy_level != null ? neo4j.int(log.energy_level) : null,
            }
          )
        }

        // 3c. AffectPoint + Features from AI extraction
        if (ext) {
          const moodScore = ext.mood_score ?? null
          const anxietyScore = ext.anxiety_score ?? null
          const valence =
            typeof moodScore === 'number' ? Math.min(1, Math.max(0, (moodScore - 1) / 9)) : null
          const arousal =
            typeof anxietyScore === 'number'
              ? Math.min(1, Math.max(0, (anxietyScore - 1) / 9))
              : null

          const emotions = (ext.emotions ?? []).filter(Boolean).map(normalizeName)
          const symptoms = (ext.symptoms ?? []).filter(Boolean).map(normalizeName)
          const triggers = (ext.triggers ?? []).filter(Boolean).map(normalizeName)

          const affectId = `aff:${entry.id}:${AFFECT_MODEL_VERSION}`

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
              SET m.confidence = $confidence, m.extractorVersion = $extractorVersion, m.timestamp = datetime($timestamp)
            )
            FOREACH (name IN $symptoms |
              MERGE (f:Feature {featureId: 'Symptom:' + name})
              ON CREATE SET f.type = 'Symptom', f.name = name
              MERGE (e)-[m:MENTIONS]->(f)
              SET m.confidence = $confidence, m.extractorVersion = $extractorVersion, m.timestamp = datetime($timestamp)
            )
            FOREACH (name IN $triggers |
              MERGE (f:Feature {featureId: 'Stressor:' + name})
              ON CREATE SET f.type = 'Stressor', f.name = name
              MERGE (e)-[m:MENTIONS]->(f)
              SET m.confidence = $confidence, m.extractorVersion = $extractorVersion, m.timestamp = datetime($timestamp)
            )
            RETURN e.entryId AS entryId
            `,
            {
              entryId: entry.id,
              timestamp: entry.created_at,
              affectId,
              affectModelVersion: AFFECT_MODEL_VERSION,
              valence,
              arousal,
              phq9_estimate: ext.phq9_estimate ?? null,
              gad7_estimate: ext.gad7_estimate ?? null,
              mood_z_score: ext.mood_z_score != null ? Number(ext.mood_z_score) : null,
              anxiety_z_score: ext.anxiety_z_score != null ? Number(ext.anxiety_z_score) : null,
              mood_pop_z: ext.mood_pop_z != null ? Number(ext.mood_pop_z) : null,
              anxiety_pop_z: ext.anxiety_pop_z != null ? Number(ext.anxiety_pop_z) : null,
              confidence: ext.confidence != null ? Number(ext.confidence) : null,
              extractorVersion: EXTRACTOR_VERSION,
              emotions,
              symptoms,
              triggers,
            }
          )
          stats.affects++
        }

        process.stdout.write('.')
      } catch (e: any) {
        stats.failed++
        if (stats.failed <= 5) {
          console.error(`\n  Failed ${entry.id}: ${e.message}`)
        } else if (stats.failed === 6) {
          console.error(`\n  (suppressing further error details...)`)
        }
      } finally {
        await session.close()
      }
    }
  }

  console.log(`\n\nBackfill complete:`)
  console.log(`  Entry nodes created:   ${stats.entries}`)
  console.log(`  SelfReport nodes:      ${stats.selfReports}`)
  console.log(`  AffectPoint nodes:     ${stats.affects}`)
  console.log(`  No embedding (empty):  ${stats.skippedEmbed}`)
  console.log(`  Failed:                ${stats.failed}`)

  await driver.close()
}

main().catch((e) => {
  console.error('Backfill script failed:', e)
  process.exitCode = 1
})
