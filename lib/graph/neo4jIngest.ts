import { getNeo4jConfig, getNeo4jDriver } from '@/lib/neo4j'

export type EntrySource = 'journal' | 'checkin' | 'import'

export interface UpsertEntryInput {
  userId: string
  entryId: string
  timestamp: string // ISO
  text: string
  source: EntrySource
  embedding: number[]
  language?: string | null
}

export interface UpsertSelfReportInput {
  userId: string
  entryId: string
  timestamp: string // ISO
  mood: number // 1-10
  valence?: number | null // 0-1
  arousal?: number | null // 0-1
  confidence?: number | null // 0-1
}

export interface UpsertContextInput {
  entryId: string
  timestamp: string // ISO
  sleep_hours?: number | null
  sleep_quality?: number | null
  medication_taken?: boolean | null
  medication_notes?: string | null
  energy_level?: number | null
}

export interface UpsertAIExtractionInput {
  entryId: string
  timestamp: string // ISO (entry timestamp)
  mood_score?: number | null // 1-10
  anxiety_score?: number | null // 1-10
  phq9_estimate?: number | null // 0-27 (AI-derived estimate)
  gad7_estimate?: number | null // 0-21 (AI-derived estimate)
  mood_z_score?: number | null
  anxiety_z_score?: number | null
  mood_pop_z?: number | null
  anxiety_pop_z?: number | null
  emotions?: string[] | null
  symptoms?: string[] | null
  triggers?: string[] | null
  confidence?: number | null // 0-1
  extractorVersion: string
  affectModelVersion: string
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function featureId(type: string, name: string): string {
  return `${type}:${normalizeName(name)}`
}

export async function upsertEntryToNeo4j(input: UpsertEntryInput) {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  try {
    await session.run(
      `
      MERGE (u:User {userId: $userId})
      ON CREATE SET u.createdAt = datetime()

      MERGE (e:Entry {entryId: $entryId})
      SET
        e.timestamp = datetime($timestamp),
        e.text = $text,
        e.source = $source,
        e.embedding = $embedding,
        e.language = $language,
        e.ingestedAt = datetime()

      MERGE (u)-[:WROTE]->(e)

      WITH u, e
      OPTIONAL MATCH (p:Entry)-[inRel:NEXT]->(e)
      DELETE inRel
      WITH u, e
      OPTIONAL MATCH (e)-[outRel:NEXT]->(n:Entry)
      DELETE outRel

      WITH u, e
      OPTIONAL MATCH (u)-[:WROTE]->(prev:Entry)
      WHERE prev.timestamp < e.timestamp AND prev.entryId <> e.entryId
      WITH u, e, prev
      ORDER BY prev.timestamp DESC
      LIMIT 1

      OPTIONAL MATCH (u)-[:WROTE]->(next:Entry)
      WHERE next.timestamp > e.timestamp AND next.entryId <> e.entryId
      WITH e, prev, next
      ORDER BY next.timestamp ASC
      LIMIT 1

      FOREACH (_ IN CASE WHEN prev IS NOT NULL AND next IS NOT NULL THEN [1] ELSE [] END |
        OPTIONAL MATCH (prev)-[old:NEXT]->(next) DELETE old
      )

      FOREACH (_ IN CASE WHEN prev IS NOT NULL THEN [1] ELSE [] END |
        MERGE (prev)-[r:NEXT]->(e)
        SET r.deltaMinutes = toInteger(duration.inSeconds(prev.timestamp, e.timestamp).seconds / 60)
      )

      FOREACH (_ IN CASE WHEN next IS NOT NULL THEN [1] ELSE [] END |
        MERGE (e)-[r2:NEXT]->(next)
        SET r2.deltaMinutes = toInteger(duration.inSeconds(e.timestamp, next.timestamp).seconds / 60)
      )

      RETURN e.entryId AS entryId
      `,
      {
        userId: input.userId,
        entryId: input.entryId,
        timestamp: input.timestamp,
        text: input.text,
        source: input.source,
        embedding: input.embedding,
        language: input.language ?? null,
      }
    )
  } finally {
    await session.close()
  }
}

export async function upsertSelfReportToNeo4j(input: UpsertSelfReportInput) {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  const reportId = `sr:${input.entryId}`

  try {
    await session.run(
      `
      MATCH (e:Entry {entryId: $entryId})
      MERGE (sr:SelfReport {reportId: $reportId})
      SET
        sr.timestamp = datetime($timestamp),
        sr.mood = $mood,
        sr.valence = $valence,
        sr.arousal = $arousal,
        sr.confidence = $confidence
      MERGE (e)-[r:HAS_SELF_REPORT]->(sr)
      SET r.collectedAt = datetime()
      RETURN sr.reportId AS reportId
      `,
      {
        entryId: input.entryId,
        reportId,
        timestamp: input.timestamp,
        mood: input.mood,
        valence: input.valence ?? null,
        arousal: input.arousal ?? null,
        confidence: input.confidence ?? null,
      }
    )
  } finally {
    await session.close()
  }
}

export async function upsertContextToNeo4j(input: UpsertContextInput) {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  const contextId = `ctx:${input.entryId}`

  try {
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
      MERGE (e)-[r:HAS_CONTEXT]->(c)
      SET r.recordedAt = datetime()
      RETURN c.contextId AS contextId
      `,
      {
        entryId: input.entryId,
        contextId,
        timestamp: input.timestamp,
        sleep_hours: input.sleep_hours ?? null,
        sleep_quality: input.sleep_quality ?? null,
        medication_taken: input.medication_taken ?? null,
        medication_notes: input.medication_notes ?? null,
        energy_level: input.energy_level ?? null,
      }
    )
  } finally {
    await session.close()
  }
}

export async function upsertAIExtractionToNeo4j(input: UpsertAIExtractionInput) {
  const driver = getNeo4jDriver()
  const { database } = getNeo4jConfig()
  const session = driver.session(database ? { database } : undefined)

  const affectId = `aff:${input.entryId}:${input.affectModelVersion}`

  const moodScore = input.mood_score ?? null
  const anxietyScore = input.anxiety_score ?? null

  // Map 1-10 into 0-1 for valence/arousal. This is a pragmatic v1 mapping.
  // (We treat these as model-derived affect predictors, not self-report labels.)
  const valence =
    typeof moodScore === 'number' ? Math.min(1, Math.max(0, (moodScore - 1) / 9)) : null
  const arousal =
    typeof anxietyScore === 'number' ? Math.min(1, Math.max(0, (anxietyScore - 1) / 9)) : null

  const emotions = (input.emotions ?? []).filter(Boolean)
  const symptoms = (input.symptoms ?? []).filter(Boolean)
  const triggers = (input.triggers ?? []).filter(Boolean)

  try {
    await session.run(
      `
      MATCH (e:Entry {entryId: $entryId})

      // AffectPoint (model-derived)
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
      MERGE (e)-[har:HAS_AFFECT]->(a)
      SET har.computedAt = datetime()

      WITH e

      // Features (lightweight; no evidence spans in current extractor output)
      FOREACH (name IN $emotions |
        MERGE (f:Feature {featureId: $emotionPrefix + name})
        ON CREATE SET f.type = 'Theme', f.name = name
        MERGE (e)-[m:MENTIONS]->(f)
        SET m.confidence = $confidence, m.extractorVersion = $extractorVersion, m.timestamp = datetime($timestamp)
      )
      FOREACH (name IN $symptoms |
        MERGE (f:Feature {featureId: $symptomPrefix + name})
        ON CREATE SET f.type = 'Symptom', f.name = name
        MERGE (e)-[m:MENTIONS]->(f)
        SET m.confidence = $confidence, m.extractorVersion = $extractorVersion, m.timestamp = datetime($timestamp)
      )
      FOREACH (name IN $triggers |
        MERGE (f:Feature {featureId: $triggerPrefix + name})
        ON CREATE SET f.type = 'Stressor', f.name = name
        MERGE (e)-[m:MENTIONS]->(f)
        SET m.confidence = $confidence, m.extractorVersion = $extractorVersion, m.timestamp = datetime($timestamp)
      )
      RETURN e.entryId AS entryId
      `,
      {
        entryId: input.entryId,
        timestamp: input.timestamp,
        affectId,
        affectModelVersion: input.affectModelVersion,
        valence,
        arousal,
        phq9_estimate: input.phq9_estimate ?? null,
        gad7_estimate: input.gad7_estimate ?? null,
        mood_z_score: input.mood_z_score ?? null,
        anxiety_z_score: input.anxiety_z_score ?? null,
        mood_pop_z: input.mood_pop_z ?? null,
        anxiety_pop_z: input.anxiety_pop_z ?? null,
        confidence: input.confidence ?? null,
        extractorVersion: input.extractorVersion,
        emotions: emotions.map((n) => normalizeName(n)),
        symptoms: symptoms.map((n) => normalizeName(n)),
        triggers: triggers.map((n) => normalizeName(n)),
        emotionPrefix: 'Theme:',
        symptomPrefix: 'Symptom:',
        triggerPrefix: 'Stressor:',
      }
    )
  } finally {
    await session.close()
  }
}



